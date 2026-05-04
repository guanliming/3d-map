from contextlib import contextmanager
from datetime import datetime
from typing import Any
import logging
import uuid

import psycopg
from psycopg.rows import dict_row
from psycopg import sql

from backend.config import settings
from backend.utils import FOG_H3_RESOLUTION, H3_RESOLUTION, get_h3_cell_boundary, get_h3_disk, get_h3_index

logger = logging.getLogger(__name__)


TOPICS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS topics (
    id UUID PRIMARY KEY,
    user_name VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    image VARCHAR(1024),
    scenic_spot_name VARCHAR(255),
    scenic_spot_distance_m DOUBLE PRECISION,
    h3_index VARCHAR(32),
    clicks INTEGER NOT NULL DEFAULT 0,
    weight DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""


TOPIC_REPLIES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS topic_replies (
    id UUID PRIMARY KEY,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    user_name VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    user_id UUID,
    image_url VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""


UNLOCKED_H3_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS unlocked_h3_cells (
    user_id VARCHAR(128) NOT NULL,
    h3_index VARCHAR(32) NOT NULL,
    resolution INTEGER NOT NULL,
    first_lat DOUBLE PRECISION,
    first_lon DOUBLE PRECISION,
    unlock_type VARCHAR(32) NOT NULL DEFAULT 'gps',
    unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, h3_index)
)
"""


USERS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL,
    real_name VARCHAR(100),
    id_card VARCHAR(18),
    phone VARCHAR(20) NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
"""

USERS_INDEX_SQL = [
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users (phone)",
]

UNLOCKED_H3_INDEX_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_unlocked_h3_user ON unlocked_h3_cells (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_unlocked_h3_index ON unlocked_h3_cells (h3_index)",
]


TOPICS_INDEX_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_topics_location ON topics (lat, lon)",
    "CREATE INDEX IF NOT EXISTS idx_topics_h3_index ON topics (h3_index)",
    "CREATE INDEX IF NOT EXISTS idx_topics_created_at ON topics (created_at)",
    "CREATE INDEX IF NOT EXISTS idx_topics_scenic_spot_name ON topics (scenic_spot_name)",
    "CREATE INDEX IF NOT EXISTS idx_topics_user_id ON topics (user_id)",
]


TOPIC_REPLIES_INDEX_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_topic_replies_topic_id ON topic_replies (topic_id)",
    "CREATE INDEX IF NOT EXISTS idx_topic_replies_created_at ON topic_replies (created_at)",
]


SCHEMA_MIGRATION_SQL = [
    "ALTER TABLE topics ADD COLUMN IF NOT EXISTS h3_index VARCHAR(32)",
    "ALTER TABLE topics ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE topics ADD COLUMN IF NOT EXISTS weight DOUBLE PRECISION NOT NULL DEFAULT 1.0",
    "ALTER TABLE topics ADD COLUMN IF NOT EXISTS user_id UUID",
]


UPDATED_AT_TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_topics_updated_at ON topics;
CREATE TRIGGER trg_topics_updated_at
BEFORE UPDATE ON topics
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_unlocked_h3_cells_updated_at ON unlocked_h3_cells;
CREATE TRIGGER trg_unlocked_h3_cells_updated_at
BEFORE UPDATE ON unlocked_h3_cells
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_topic_replies_updated_at ON topic_replies;
CREATE TRIGGER trg_topic_replies_updated_at
BEFORE UPDATE ON topic_replies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
"""


def _connection_kwargs(database: str | None = None) -> dict[str, Any]:
    return {
        "host": settings.postgres_host,
        "port": settings.postgres_port,
        "user": settings.postgres_user,
        "password": settings.postgres_password,
        "dbname": database or settings.postgres_database,
        "row_factory": dict_row,
        "connect_timeout": 5,
    }


@contextmanager
def postgres_connection(database: str | None = None, autocommit: bool = False):
    conn = psycopg.connect(**_connection_kwargs(database=database), autocommit=autocommit)
    try:
        yield conn
    finally:
        conn.close()


def init_postgres_schema() -> None:
    database = settings.postgres_database
    with postgres_connection(database="postgres", autocommit=True) as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (database,))
            if cursor.fetchone() is None:
                cursor.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
                logger.info("PostgreSQL 数据库已创建: %s", database)
            else:
                logger.info("PostgreSQL 数据库已就绪: %s", database)

    with postgres_connection(database=database) as conn:
        with conn.cursor() as cursor:
            cursor.execute(TOPICS_TABLE_SQL)
            cursor.execute(TOPIC_REPLIES_TABLE_SQL)
            cursor.execute(UNLOCKED_H3_TABLE_SQL)
            cursor.execute(USERS_TABLE_SQL)
            for migration_sql in SCHEMA_MIGRATION_SQL:
                cursor.execute(migration_sql)
            for index_sql in TOPICS_INDEX_SQL:
                cursor.execute(index_sql)
            for index_sql in TOPIC_REPLIES_INDEX_SQL:
                cursor.execute(index_sql)
            for index_sql in UNLOCKED_H3_INDEX_SQL:
                cursor.execute(index_sql)
            for index_sql in USERS_INDEX_SQL:
                cursor.execute(index_sql)
            cursor.execute(UPDATED_AT_TRIGGER_SQL)
        conn.commit()
        _backfill_missing_h3_indexes()
        _migrate_unlocked_h3_resolution()
        logger.info("PostgreSQL 话题表已就绪: %s.topics", database)


def _backfill_missing_h3_indexes() -> None:
    with postgres_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, lat, lon FROM topics WHERE h3_index IS NULL")
            rows = cursor.fetchall()
            for row in rows:
                cursor.execute(
                    "UPDATE topics SET h3_index = %s WHERE id = %s",
                    (get_h3_index(row["lat"], row["lon"]), row["id"]),
                )
        conn.commit()


def _migrate_unlocked_h3_resolution() -> None:
    with postgres_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT user_id, first_lat, first_lon, unlock_type, unlocked_at
                FROM unlocked_h3_cells
                WHERE resolution <> %s AND first_lat IS NOT NULL AND first_lon IS NOT NULL
                """,
                (FOG_H3_RESOLUTION,),
            )
            rows = cursor.fetchall()
            if not rows:
                return
            cursor.execute("DELETE FROM unlocked_h3_cells WHERE resolution <> %s", (FOG_H3_RESOLUTION,))
            for row in rows:
                h3_index = get_h3_index(row["first_lat"], row["first_lon"], FOG_H3_RESOLUTION)
                cursor.execute(
                    """
                    INSERT INTO unlocked_h3_cells (user_id, h3_index, resolution, first_lat, first_lon, unlock_type, unlocked_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, h3_index) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
                    """,
                    (
                        row["user_id"],
                        h3_index,
                        FOG_H3_RESOLUTION,
                        row["first_lat"],
                        row["first_lon"],
                        row["unlock_type"],
                        row["unlocked_at"],
                    ),
                )
        conn.commit()


def _normalize_topic_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    topic = dict(row)
    topic["id"] = str(topic["id"])
    return topic


def _format_unlocked_cell(row: dict[str, Any]) -> dict[str, Any]:
    h3_index = row["h3_index"]
    return {
        "h3_index": h3_index,
        "resolution": row["resolution"],
        "unlock_type": row["unlock_type"],
        "unlocked_at": row["unlocked_at"].isoformat() if row.get("unlocked_at") else None,
        "boundary": get_h3_cell_boundary(h3_index),
    }


def unlock_h3_cells_for_location(user_id: str, lat: float, lon: float, disk_radius: int = 1) -> dict[str, Any]:
    center_h3 = get_h3_index(lat, lon, FOG_H3_RESOLUTION)
    h3_indexes = get_h3_disk(center_h3, disk_radius)
    with postgres_connection() as conn:
        with conn.cursor() as cursor:
            for h3_index in h3_indexes:
                unlock_type = "gps_center" if h3_index == center_h3 else "gps_adjacent"
                cursor.execute(
                    """
                    INSERT INTO unlocked_h3_cells (user_id, h3_index, resolution, first_lat, first_lon, unlock_type)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, h3_index) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
                    """,
                    (user_id, h3_index, FOG_H3_RESOLUTION, lat, lon, unlock_type),
                )
        conn.commit()
    return {"center_h3": center_h3, "unlocked_h3_indexes": h3_indexes}


def get_unlocked_h3_cells(user_id: str) -> list[dict[str, Any]]:
    with postgres_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT h3_index, resolution, unlock_type, unlocked_at
                FROM unlocked_h3_cells
                WHERE user_id = %s
                ORDER BY unlocked_at ASC
                """,
                (user_id,),
            )
            return [_format_unlocked_cell(row) for row in cursor.fetchall()]


def create_user(nickname: str, real_name: str | None, id_card: str | None,
                phone: str, password_hash: str) -> dict[str, Any]:
    user_id = str(uuid.uuid4())
    with postgres_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (id, nickname, real_name, id_card, phone, password_hash)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, nickname, real_name, phone, created_at
                """,
                (user_id, nickname, real_name, id_card, phone, password_hash),
            )
            row = cursor.fetchone()
        conn.commit()
    return dict(row)


def get_user_by_phone(phone: str) -> dict[str, Any] | None:
    with postgres_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM users WHERE phone = %s", (phone,))
            row = cursor.fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    with postgres_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, nickname, real_name, phone, created_at FROM users WHERE id = %s",
                (user_id,),
            )
            row = cursor.fetchone()
    return dict(row) if row else None


class PostgresTopicStore:
    def create_topic(
        self,
        user_name: str,
        content: str,
        lat: float,
        lon: float,
        image: str | None = None,
        scenic_spot_name: str | None = None,
        scenic_spot_distance_m: float | None = None,
        user_id: str | None = None,
    ) -> str:
        topic_id = str(uuid.uuid4())
        with postgres_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO topics (
                        id, user_name, content, lat, lon, image,
                        scenic_spot_name, scenic_spot_distance_m, h3_index, clicks, weight, likes, comments, created_at, user_id
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 0, 1.0, 0, 0, %s, %s)
                    """,
                    (
                        topic_id,
                        user_name,
                        content,
                        lat,
                        lon,
                        image,
                        scenic_spot_name,
                        scenic_spot_distance_m,
                        get_h3_index(lat, lon),
                        datetime.now(),
                        user_id,
                    ),
                )
            conn.commit()
        return topic_id

    def insert_topic(self, topic: dict[str, Any]) -> str:
        topic_id = topic.get("id") or str(uuid.uuid4())
        with postgres_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO topics (
                        id, user_name, content, lat, lon, image,
                        scenic_spot_name, scenic_spot_distance_m, h3_index, clicks, weight, likes, comments, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (
                        topic_id,
                        topic["user_name"],
                        topic["content"],
                        topic["lat"],
                        topic["lon"],
                        topic.get("image"),
                        topic.get("scenic_spot_name"),
                        topic.get("scenic_spot_distance_m"),
                        topic.get("h3_index") or get_h3_index(topic["lat"], topic["lon"]),
                        topic.get("clicks", 0),
                        topic.get("weight", 1.0),
                        topic.get("likes", 0),
                        topic.get("comments", 0),
                        topic.get("created_at") or datetime.now(),
                    ),
                )
            conn.commit()
        return topic_id

    def get_topic(self, topic_id: str) -> dict[str, Any] | None:
        with postgres_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT * FROM topics WHERE id = %s", (topic_id,))
                row = cursor.fetchone()
                topic = _normalize_topic_row(row)
                if topic:
                    topic["replies"] = self.get_topic_replies(topic_id, limit=50)
                return topic

    def create_topic_reply(self, topic_id: str, user_name: str, content: str, user_id: str | None = None, image_url: str | None = None) -> dict[str, Any] | None:
        reply_id = str(uuid.uuid4())
        with postgres_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1 FROM topics WHERE id = %s", (topic_id,))
                if cursor.fetchone() is None:
                    return None
                cursor.execute(
                    """
                    INSERT INTO topic_replies (id, topic_id, user_name, content, user_id, image_url)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id, topic_id, user_name, content, image_url, created_at
                    """,
                    (reply_id, topic_id, user_name, content, user_id, image_url),
                )
                row = cursor.fetchone()
                cursor.execute("UPDATE topics SET comments = comments + 1 WHERE id = %s", (topic_id,))
            conn.commit()
        reply = dict(row)
        reply["id"] = str(reply["id"])
        reply["topic_id"] = str(reply["topic_id"])
        return reply

    def get_topic_replies(self, topic_id: str, limit: int = 20) -> list[dict[str, Any]]:
        with postgres_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, topic_id, user_name, content, image_url, created_at
                    FROM topic_replies
                    WHERE topic_id = %s
                    ORDER BY created_at ASC
                    LIMIT %s
                    """,
                    (topic_id, limit),
                )
                rows = cursor.fetchall()
            replies = []
            for row in rows:
                reply = dict(row)
                reply["id"] = str(reply["id"])
                reply["topic_id"] = str(reply["topic_id"])
                replies.append(reply)
            return replies

    def get_replies_for_topics(self, topic_ids: list[str], limit_per_topic: int = 6) -> dict[str, list[dict[str, Any]]]:
        if not topic_ids:
            return {}
        result: dict[str, list[dict[str, Any]]] = {}
        with postgres_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, topic_id, user_name, content, image_url, created_at
                    FROM (
                        SELECT id, topic_id, user_name, content, image_url, created_at,
                               ROW_NUMBER() OVER (PARTITION BY topic_id ORDER BY created_at ASC) AS rn
                        FROM topic_replies
                        WHERE topic_id = ANY(%s::uuid[])
                    ) ranked
                    WHERE rn <= %s
                    ORDER BY topic_id, created_at ASC
                    """,
                    (topic_ids, limit_per_topic),
                )
                rows = cursor.fetchall()
            for row in rows:
                reply = dict(row)
                reply["id"] = str(reply["id"])
                reply["topic_id"] = str(reply["topic_id"])
                result.setdefault(reply["topic_id"], []).append(reply)
        return result

    def get_all_topics(self) -> list[dict[str, Any]]:
        with postgres_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT * FROM topics ORDER BY created_at DESC LIMIT 2000")
                return [_normalize_topic_row(row) for row in cursor.fetchall() if row]

    def like_topic(self, topic_id: str) -> int | None:
        with postgres_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE topics SET likes = likes + 1 WHERE id = %s RETURNING likes",
                    (topic_id,),
                )
                row = cursor.fetchone()
            conn.commit()
        return int(row["likes"]) if row else None

    def click_topic(self, topic_id: str) -> int | None:
        with postgres_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE topics SET clicks = clicks + 1 WHERE id = %s RETURNING clicks",
                    (topic_id,),
                )
                row = cursor.fetchone()
            conn.commit()
        return int(row["clicks"]) if row else None

    def count_topics(self) -> int:
        with postgres_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) AS total FROM topics")
                row = cursor.fetchone()
                return int(row["total"]) if row else 0
