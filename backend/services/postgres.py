from contextlib import contextmanager
from datetime import datetime
from typing import Any
import logging
import uuid

import psycopg
from psycopg.rows import dict_row
from psycopg import sql

from backend.config import settings
from backend.utils import get_h3_index

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


TOPICS_INDEX_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_topics_location ON topics (lat, lon)",
    "CREATE INDEX IF NOT EXISTS idx_topics_h3_index ON topics (h3_index)",
    "CREATE INDEX IF NOT EXISTS idx_topics_created_at ON topics (created_at)",
    "CREATE INDEX IF NOT EXISTS idx_topics_scenic_spot_name ON topics (scenic_spot_name)",
]


SCHEMA_MIGRATION_SQL = [
    "ALTER TABLE topics ADD COLUMN IF NOT EXISTS h3_index VARCHAR(32)",
    "ALTER TABLE topics ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE topics ADD COLUMN IF NOT EXISTS weight DOUBLE PRECISION NOT NULL DEFAULT 1.0",
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
            for migration_sql in SCHEMA_MIGRATION_SQL:
                cursor.execute(migration_sql)
            for index_sql in TOPICS_INDEX_SQL:
                cursor.execute(index_sql)
            cursor.execute(UPDATED_AT_TRIGGER_SQL)
        conn.commit()
        _backfill_missing_h3_indexes()
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


def _normalize_topic_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    topic = dict(row)
    topic["id"] = str(topic["id"])
    return topic


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
    ) -> str:
        topic_id = str(uuid.uuid4())
        with postgres_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO topics (
                        id, user_name, content, lat, lon, image,
                        scenic_spot_name, scenic_spot_distance_m, h3_index, clicks, weight, likes, comments, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 0, 1.0, 0, 0, %s)
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
                return _normalize_topic_row(row)

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
