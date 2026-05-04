let map;
        let markers = [];
        let currentPanorama = null;
        let currentZoomHintTimeout = null;
        let debugMode = false;
        let debugLogsEnabled = false;
        let mapTilerKey = '';
        let mapSourcePreference = 'auto';
        let activeMapSource = 'osm';
        let currentRadius = 0;
        let is3DMode = false;
        let spotData = [];
        let lastPitch = 0;
        let lastBearing = 0;
        let buildingLayerAdded = false;
        let pendingBuildingLayer = false;
        
        let weatherDebounceTimer = null;
        let lastWeatherLocation = {
            province: null,
            city: null,
            district: null
        };
        let isWeatherLoading = false;
        let currentWeatherData = null;

        const WEATHER_MIN_ZOOM = 12;
        const WEATHER_DEBOUNCE_DELAY = 1000;

        let isExploreMode = true;
        let scenicLayerVisible = true;
        let topicMarkers = [];
        let beaconMarkers = [];
        let topicData = [];
        let topicsDebounceTimer = null;
        let fogUserId = null;
        let unlockedFogCells = [];
        let fogWatchId = null;
        let lastUnlockedH3 = null;
        let lastUnlockLocation = null;
        let fogRenderer = null;
        let pendingFogRender = false;
        let pendingImmediateFogRender = false;
        let lastFogRenderAt = 0;
        let mapInitialLoadComplete = false;
        let mapTilerFallbackTriggered = false;

        const AUTH_TOKEN_KEY = 'map3d_auth_token';
        const AUTH_USER_KEY = 'map3d_auth_user';
        let authToken = null;
        let authUser = null;
        let authMode = 'login';

        const FOG_MASK_SIZE = 512;
        const FOG_UPDATE_INTERVAL = 200;

        const TOPICS_HEAT_MIN_ZOOM = 12;
        const TOPICS_BUBBLE_MIN_ZOOM = 15;
        const TOPICS_DEBOUNCE_DELAY = 500;

        const SHANGHAI_CENTER = [121.4737, 31.2304];
        const BEIJING_CENTER = [116.4074, 39.9042];

        const WEATHER_ICONS = {
            '晴': '☀️',
            '多云': '⛅',
            '阴': '☁️',
            '阵雨': '🌦️',
            '雷阵雨': '⛈️',
            '雷阵雨并伴有冰雹': '⛈️',
            '雨夹雪': '🌨️',
            '小雨': '🌧️',
            '中雨': '🌧️',
            '大雨': '🌧️',
            '暴雨': '🌧️',
            '大暴雨': '🌧️',
            '特大暴雨': '🌧️',
            '阵雪': '🌨️',
            '小雪': '❄️',
            '中雪': '❄️',
            '大雪': '❄️',
            '暴雪': '❄️',
            '雾': '🌫️',
            '冻雨': '🌧️',
            '沙尘暴': '🌪️',
            '小雨-中雨': '🌧️',
            '中雨-大雨': '🌧️',
            '大雨-暴雨': '🌧️',
            '暴雨-大暴雨': '🌧️',
            '大暴雨-特大暴雨': '🌧️',
            '小雪-中雪': '❄️',
            '中雪-大雪': '❄️',
            '大雪-暴雪': '❄️',
            '浮尘': '🌫️',
            '扬沙': '🌫️',
            '强沙尘暴': '🌪️',
            '霾': '🌫️'
        };

        function isRainWeather(weather) {
            if (!weather) return false;
            const rainPatterns = ['雨', '阵雨', '雷阵雨', '小雨', '中雨', '大雨', '暴雨', '冻雨'];
            return rainPatterns.some(pattern => weather.includes(pattern));
        }

        function getRainIntensity(weather) {
            if (!weather) return null;
            
            const heavyRainPatterns = ['暴雨', '大暴雨', '特大暴雨', '大雨-暴雨', '暴雨-大暴雨', '大暴雨-特大暴雨'];
            for (const pattern of heavyRainPatterns) {
                if (weather.includes(pattern)) {
                    return 'heavy';
                }
            }
            
            const mediumRainPatterns = ['大雨', '中雨-大雨', '雷阵雨', '雷阵雨并伴有冰雹', '冻雨'];
            for (const pattern of mediumRainPatterns) {
                if (weather.includes(pattern)) {
                    return 'medium';
                }
            }
            
            const lightRainPatterns = ['小雨', '阵雨', '小雨-中雨', '雨夹雪'];
            for (const pattern of lightRainPatterns) {
                if (weather.includes(pattern)) {
                    return 'light';
                }
            }
            
            if (weather.includes('雨')) {
                return 'medium';
            }
            
            return null;
        }

        function isSnowWeather(weather) {
            if (!weather) return false;
            const snowPatterns = ['雪', '阵雪', '小雪', '中雪', '大雪', '暴雪', '雨夹雪'];
            return snowPatterns.some(pattern => weather.includes(pattern));
        }

        function isCloudWeather(weather) {
            if (!weather) return false;
            const cloudPatterns = ['多云', '阴'];
            return cloudPatterns.some(pattern => weather.includes(pattern));
        }

        class WeatherEffectManager {
            constructor() {
                this.canvas = null;
                this.ctx = null;
                this.width = 0;
                this.height = 0;
                this.animationId = null;
                this.currentEffect = null;
                this.currentRainIntensity = null;
                
                this.rainDrops = [];
                this.snowFlakes = [];
                this.clouds = [];
                
                this.rainConfig = {
                    light: { count: 150, speed: 8, opacity: 0.6, width: 1, length: 15 },
                    medium: { count: 300, speed: 12, opacity: 0.8, width: 2, length: 20 },
                    heavy: { count: 500, speed: 18, opacity: 1, width: 3, length: 30 }
                };
                
                this.snowConfig = {
                    count: 200,
                    speedRange: [1, 3],
                    sizeRange: [2, 8],
                    opacityRange: [0.6, 0.9]
                };
                
                this.cloudConfig = {
                    count: 5,
                    speed: 0.3,
                    opacity: 0.3
                };
            }
            
            init() {
                this.canvas = document.getElementById('weatherCanvas');
                if (!this.canvas) {
                    log('天气Canvas元素未找到');
                    return false;
                }
                
                this.ctx = this.canvas.getContext('2d');
                this.resize();
                
                window.addEventListener('resize', () => this.resize());
                
                log('天气效果管理器初始化完成');
                return true;
            }
            
            resize() {
                if (!this.canvas) return;
                
                this.width = window.innerWidth;
                this.height = window.innerHeight;
                
                this.canvas.width = this.width;
                this.canvas.height = this.height;
                
                log('天气Canvas尺寸更新:', this.width, 'x', this.height);
            }
            
            startEffect(effect, rainIntensity = null) {
                if (this.currentEffect === effect && 
                    (effect !== 'rain' || this.currentRainIntensity === rainIntensity)) {
                    return;
                }
                
                this.stopEffect();
                
                this.currentEffect = effect;
                this.currentRainIntensity = rainIntensity;
                
                switch (effect) {
                    case 'rain':
                        this.initRain(rainIntensity);
                        break;
                    case 'snow':
                        this.initSnow();
                        break;
                    case 'clouds':
                        this.initClouds();
                        break;
                }
                
                this.startAnimation();
                
                const weatherEffects = document.getElementById('weatherEffects');
                if (weatherEffects) {
                    weatherEffects.classList.add('show');
                }
                
                log('天气效果已启动:', effect, rainIntensity ? `(${rainIntensity})` : '');
            }
            
            stopEffect() {
                if (this.animationId) {
                    cancelAnimationFrame(this.animationId);
                    this.animationId = null;
                }
                
                this.rainDrops = [];
                this.snowFlakes = [];
                this.clouds = [];
                
                if (this.ctx) {
                    this.ctx.clearRect(0, 0, this.width, this.height);
                }
                
                const weatherEffects = document.getElementById('weatherEffects');
                if (weatherEffects) {
                    weatherEffects.classList.remove('show');
                }
                
                this.currentEffect = null;
                this.currentRainIntensity = null;
            }
            
            initRain(intensity) {
                const config = this.rainConfig[intensity] || this.rainConfig.medium;
                this.rainDrops = [];
                
                for (let i = 0; i < config.count; i++) {
                    this.rainDrops.push({
                        x: Math.random() * this.width,
                        y: Math.random() * this.height,
                        speed: config.speed + Math.random() * 2,
                        opacity: config.opacity * (0.7 + Math.random() * 0.3),
                        width: config.width + Math.random(),
                        length: config.length + Math.random() * 10
                    });
                }
            }
            
            initSnow() {
                const config = this.snowConfig;
                this.snowFlakes = [];
                
                for (let i = 0; i < config.count; i++) {
                    this.snowFlakes.push({
                        x: Math.random() * this.width,
                        y: Math.random() * this.height,
                        speed: config.speedRange[0] + Math.random() * (config.speedRange[1] - config.speedRange[0]),
                        size: config.sizeRange[0] + Math.random() * (config.sizeRange[1] - config.sizeRange[0]),
                        opacity: config.opacityRange[0] + Math.random() * (config.opacityRange[1] - config.opacityRange[0]),
                        drift: Math.random() * 2 - 1,
                        rotation: Math.random() * Math.PI * 2,
                        rotationSpeed: (Math.random() - 0.5) * 0.05
                    });
                }
            }
            
            initClouds() {
                const config = this.cloudConfig;
                this.clouds = [];
                
                for (let i = 0; i < config.count; i++) {
                    const cloudWidth = 150 + Math.random() * 200;
                    const cloudHeight = 60 + Math.random() * 80;
                    
                    const circles = [];
                    for (let j = 0; j < 5; j++) {
                        circles.push({
                            offsetX: Math.random() * cloudWidth,
                            offsetY: Math.random() * cloudHeight,
                            radius: 30 + Math.random() * 50
                        });
                    }
                    
                    this.clouds.push({
                        x: Math.random() * (this.width + 400) - 200,
                        y: Math.random() * (this.height * 0.4),
                        width: cloudWidth,
                        height: cloudHeight,
                        speed: config.speed * (0.5 + Math.random()),
                        opacity: config.opacity * (0.6 + Math.random() * 0.4),
                        circles: circles
                    });
                }
            }
            
            startAnimation() {
                const animate = () => {
                    if (!this.ctx) return;
                    
                    this.ctx.clearRect(0, 0, this.width, this.height);
                    
                    switch (this.currentEffect) {
                        case 'rain':
                            this.drawRain();
                            break;
                        case 'snow':
                            this.drawSnow();
                            break;
                        case 'clouds':
                            this.drawClouds();
                            break;
                    }
                    
                    this.animationId = requestAnimationFrame(animate);
                };
                
                animate();
            }
            
            drawRain() {
                const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
                gradient.addColorStop(0, 'rgba(147, 197, 253, 0)');
                gradient.addColorStop(1, 'rgba(100, 149, 237, 0.9)');
                
                this.rainDrops.forEach(drop => {
                    this.ctx.beginPath();
                    this.ctx.moveTo(drop.x, drop.y);
                    this.ctx.lineTo(drop.x, drop.y + drop.length);
                    this.ctx.strokeStyle = `rgba(147, 197, 253, ${drop.opacity})`;
                    this.ctx.lineWidth = drop.width;
                    this.ctx.lineCap = 'round';
                    this.ctx.stroke();
                    
                    drop.y += drop.speed;
                    
                    if (drop.y > this.height) {
                        drop.y = -drop.length;
                        drop.x = Math.random() * this.width;
                    }
                });
            }
            
            drawSnow() {
                this.snowFlakes.forEach(flake => {
                    this.ctx.save();
                    this.ctx.translate(flake.x, flake.y);
                    this.ctx.rotate(flake.rotation);
                    
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, flake.size / 2, 0, Math.PI * 2);
                    this.ctx.fillStyle = `rgba(255, 255, 255, ${flake.opacity})`;
                    this.ctx.fill();
                    
                    this.ctx.restore();
                    
                    flake.y += flake.speed;
                    flake.x += Math.sin(flake.y * 0.01) * flake.drift;
                    flake.rotation += flake.rotationSpeed;
                    
                    if (flake.y > this.height) {
                        flake.y = -flake.size;
                        flake.x = Math.random() * this.width;
                    }
                    
                    if (flake.x < -flake.size) {
                        flake.x = this.width + flake.size;
                    } else if (flake.x > this.width + flake.size) {
                        flake.x = -flake.size;
                    }
                });
            }
            
            drawClouds() {
                this.clouds.forEach(cloud => {
                    this.ctx.save();
                    
                    const gradient = this.ctx.createRadialGradient(
                        cloud.x + cloud.width / 2,
                        cloud.y + cloud.height / 2,
                        0,
                        cloud.x + cloud.width / 2,
                        cloud.y + cloud.height / 2,
                        cloud.width / 2
                    );
                    gradient.addColorStop(0, `rgba(255, 255, 255, ${cloud.opacity})`);
                    gradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
                    
                    this.ctx.fillStyle = gradient;
                    this.ctx.beginPath();
                    
                    cloud.circles.forEach(circle => {
                        const cx = cloud.x + circle.offsetX;
                        const cy = cloud.y + circle.offsetY;
                        this.ctx.arc(cx, cy, circle.radius, 0, Math.PI * 2);
                    });
                    
                    this.ctx.fill();
                    this.ctx.restore();
                    
                    cloud.x += cloud.speed;
                    
                    if (cloud.x > this.width + cloud.width) {
                        cloud.x = -cloud.width;
                        cloud.y = Math.random() * (this.height * 0.4);
                    }
                });
            }
        }
        
        let weatherEffectManager = null;
        
        function initWeatherEffectManager() {
            if (!weatherEffectManager) {
                weatherEffectManager = new WeatherEffectManager();
                weatherEffectManager.init();
            }
            return weatherEffectManager;
        }
        
        let currentWeatherEffect = null;
        let currentRainIntensity = null;

        function updateWeatherEffects(weather) {
            const manager = initWeatherEffectManager();
            if (!manager) {
                log('天气效果管理器未初始化');
                return;
            }
            
            let newEffect = null;
            let newRainIntensity = null;
            
            if (isSnowWeather(weather)) {
                newEffect = 'snow';
                log('显示下雪效果');
            } else if (isRainWeather(weather)) {
                const intensity = getRainIntensity(weather);
                newRainIntensity = intensity;
                newEffect = 'rain';
                
                if (intensity === 'heavy') {
                    log('显示大雨效果');
                } else if (intensity === 'medium') {
                    log('显示中雨效果');
                } else {
                    log('显示小雨效果');
                }
            } else if (isCloudWeather(weather)) {
                newEffect = 'clouds';
                log('显示多云效果');
            }
            
            const effectChanged = currentWeatherEffect !== newEffect;
            const intensityChanged = newEffect === 'rain' && currentRainIntensity !== newRainIntensity;
            
            if (effectChanged || intensityChanged) {
                currentWeatherEffect = newEffect;
                currentRainIntensity = newRainIntensity;
                
                if (newEffect) {
                    manager.startEffect(newEffect, newRainIntensity);
                } else {
                    manager.stopEffect();
                }
                
                log('天气效果已切换:', newEffect || '无', newRainIntensity ? `(${newRainIntensity})` : '');
            }
        }

        function clearWeatherEffects() {
            const manager = weatherEffectManager;
            if (manager) {
                manager.stopEffect();
            }
            
            currentWeatherEffect = null;
            log('已清除所有天气效果');
        }

        const MIN_ZOOM = 6;
        const MAX_ZOOM = 12;
        const MAP_MAX_ZOOM = 17.5;
        const DEFAULT_3D_PITCH = 45;
        const DEFAULT_3D_BEARING = 0;

        const OSM_STYLE = {
            version: 8,
            sources: {
                'osm': {
                    type: 'raster',
                    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                    tileSize: 256,
                    attribution: '&copy; OpenStreetMap contributors'
                }
            },
            layers: [{
                id: 'osm',
                type: 'raster',
                source: 'osm',
                minzoom: 0,
                maxzoom: 19
            }]
        };

        const AMAP_RASTER_STYLE = {
            version: 8,
            sources: {
                'amap': {
                    type: 'raster',
                    tiles: [
                        'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
                        'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
                        'https://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
                        'https://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
                    ],
                    tileSize: 256,
                    attribution: '&copy; AutoNavi'
                }
            },
            layers: [{
                id: 'amap',
                type: 'raster',
                source: 'amap',
                minzoom: 0,
                maxzoom: 18
            }]
        };

        function resolveMapStyle(config) {
            const preference = (config.map_source || 'auto').toLowerCase();
            mapSourcePreference = preference;

            if (preference === 'amap') {
                activeMapSource = 'amap';
                return { style: AMAP_RASTER_STYLE, styleName: '高德栅格' };
            }

            if (preference === 'osm') {
                activeMapSource = 'osm';
                return { style: OSM_STYLE, styleName: 'OpenStreetMap' };
            }

            if (preference === 'maptiler' && mapTilerKey) {
                activeMapSource = 'maptiler';
                return { style: `https://api.maptiler.com/maps/basic-v2/style.json?key=${mapTilerKey}`, styleName: 'MapTiler' };
            }

            if (mapTilerKey) {
                activeMapSource = 'maptiler';
                return { style: `https://api.maptiler.com/maps/basic-v2/style.json?key=${mapTilerKey}`, styleName: 'MapTiler' };
            }

            activeMapSource = 'amap';
            return { style: AMAP_RASTER_STYLE, styleName: '高德栅格' };
        }

        function log(message, ...args) {
            if (!debugLogsEnabled) return;
            const timestamp = new Date().toISOString().substr(11, 12);
            console.log(`[${timestamp}] ${message}`, ...args);
        }

        function calculateRadiusByZoom(zoom) {
            if (zoom < MIN_ZOOM) return 0;
            if (zoom >= MAX_ZOOM) return 10;

            const RADIUS_CONFIG = [
                { zoom: 6, minRadius: 500, maxRadius: 800 },
                { zoom: 7, minRadius: 300, maxRadius: 500 },
                { zoom: 8, minRadius: 150, maxRadius: 300 },
                { zoom: 9, minRadius: 80, maxRadius: 150 },
                { zoom: 10, minRadius: 40, maxRadius: 80 },
                { zoom: 11, minRadius: 20, maxRadius: 40 },
                { zoom: 12, minRadius: 10, maxRadius: 20 },
            ];

            let radius;
            if (zoom <= 6) {
                radius = 800;
            } else if (zoom >= 12) {
                radius = 10;
            } else {
                const zoomFloor = Math.floor(zoom);
                const zoomCeil = zoomFloor + 1;
                
                const configFloor = RADIUS_CONFIG.find(c => c.zoom === zoomFloor);
                const configCeil = RADIUS_CONFIG.find(c => c.zoom === zoomCeil);
                
                if (configFloor && configCeil) {
                    const t = (zoom - zoomFloor) / (zoomCeil - zoomFloor);
                    const minRadius = configFloor.minRadius + t * (configCeil.minRadius - configFloor.minRadius);
                    const maxRadius = configFloor.maxRadius + t * (configCeil.maxRadius - configFloor.maxRadius);
                    radius = (minRadius + maxRadius) / 2;
                } else {
                    radius = 100;
                }
            }

            return Math.round(radius);
        }

        function getRadiusInfo(zoom) {
            const radius = calculateRadiusByZoom(zoom);
            
            let description;
            if (radius >= 500) {
                description = '省级范围';
            } else if (radius >= 200) {
                description = '大城市圈';
            } else if (radius >= 100) {
                description = '城市范围';
            } else if (radius >= 50) {
                description = '市区范围';
            } else if (radius >= 20) {
                description = '区域范围';
            } else {
                description = '街区范围';
            }
            
            return { radius, description };
        }

        function updateDebugPanel() {
            if (!debugMode) return;
            
            const mapStatusEl = document.getElementById('mapStatus');
            const zoomLevelEl = document.getElementById('zoomLevel');
            const zoomStatusEl = document.getElementById('zoomStatus');
            const centerCoordsEl = document.getElementById('centerCoords');
            const markerCountEl = document.getElementById('markerCount');
            const mapSourceEl = document.getElementById('mapSource');
            const mapTilerKeyStatusEl = document.getElementById('mapTilerKeyStatus');
            const searchRadiusEl = document.getElementById('searchRadius');
            const viewModeEl = document.getElementById('viewMode');
            const pitchAngleEl = document.getElementById('pitchAngle');
            const bearingAngleEl = document.getElementById('bearingAngle');
            const visibleMarkerCountEl = document.getElementById('visibleMarkerCount');
            const viewportBoundsEl = document.getElementById('viewportBounds');

            log(`updateDebugPanel() 被调用 - mapTilerKey='${mapTilerKey ? mapTilerKey.substring(0, 10) + '...' : '(空)'}', map=${!!map}`);

            if (map) {
                const zoom = map.getZoom();
                const center = map.getCenter();
                const radiusInfo = getRadiusInfo(zoom);
                const pitch = map.getPitch();
                const bearing = map.getBearing();
                
                zoomLevelEl.textContent = zoom.toFixed(2);
                zoomLevelEl.className = (zoom >= MIN_ZOOM && zoom <= MAX_ZOOM) ? 'value ok' : 'value warning';
                
                if (zoom < MIN_ZOOM) {
                    zoomStatusEl.textContent = `过低 (<${MIN_ZOOM})`;
                    zoomStatusEl.className = 'value warning';
                } else if (zoom > MAX_ZOOM) {
                    zoomStatusEl.textContent = `过高 (>${MAX_ZOOM})`;
                    zoomStatusEl.className = 'value warning';
                } else {
                    zoomStatusEl.textContent = `正常 (${MIN_ZOOM}-${MAX_ZOOM})`;
                    zoomStatusEl.className = 'value ok';
                }
                
                if (radiusInfo.radius > 0) {
                    searchRadiusEl.textContent = `${radiusInfo.radius} 公里 (${radiusInfo.description})`;
                    searchRadiusEl.className = 'value ok';
                } else {
                    searchRadiusEl.textContent = '范围外';
                    searchRadiusEl.className = 'value warning';
                }
                
                centerCoordsEl.textContent = `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
                centerCoordsEl.className = 'value';

                viewModeEl.textContent = is3DMode ? '3D 视图' : '2D 视图';
                viewModeEl.className = is3DMode ? 'value ok' : 'value';
                
                pitchAngleEl.textContent = `${pitch.toFixed(1)}°`;
                pitchAngleEl.className = pitch > 0 ? 'value ok' : 'value';
                
                bearingAngleEl.textContent = `${bearing.toFixed(1)}°`;
                bearingAngleEl.className = Math.abs(bearing) > 0 ? 'value ok' : 'value';

                const bounds = map.getBounds();
                if (bounds) {
                    const sw = bounds.getSouthWest();
                    const ne = bounds.getNorthEast();
                    viewportBoundsEl.textContent = `${sw.lat.toFixed(2)},${sw.lng.toFixed(2)} - ${ne.lat.toFixed(2)},${ne.lng.toFixed(2)}`;
                }
            }
            
            markerCountEl.textContent = markers.length;
            markerCountEl.className = markers.length > 0 ? 'value ok' : 'value';
            
            visibleMarkerCountEl.textContent = markers.length;
            visibleMarkerCountEl.className = markers.length > 0 ? 'value ok' : 'value';
            
            mapSourceEl.textContent = `${activeMapSource} (${mapSourcePreference})`;
            mapSourceEl.className = activeMapSource === 'maptiler' ? 'value ok' : 'value';
            mapTilerKeyStatusEl.textContent = mapTilerKey ? '已配置' : '未配置';
            mapTilerKeyStatusEl.className = mapTilerKey ? 'value ok' : 'value warning';
        }

        function setMapStatus(status, type = 'ok') {
            const mapStatusEl = document.getElementById('mapStatus');
            mapStatusEl.textContent = status;
            if (type === 'error') {
                mapStatusEl.className = 'value error';
            } else if (type === 'warning') {
                mapStatusEl.className = 'value warning';
            } else {
                mapStatusEl.className = 'value ok';
            }
        }

        function toggleDebug() {
            debugMode = !debugMode;
            debugLogsEnabled = debugMode;
            const panel = document.getElementById('debugPanel');
            const btn = document.getElementById('toggleDebugBtn');
            if (debugMode) {
                panel.style.display = 'block';
                btn.textContent = '🔧 隐藏调试';
                updateDebugPanel();
            } else {
                panel.style.display = 'none';
                btn.textContent = '🔧 调试';
            }
        }

        function toggleViewMode() {
            if (!map) {
                log('地图尚未初始化，无法切换视图模式');
                return;
            }

            is3DMode = !is3DMode;
            log('切换视图模式:', is3DMode ? '3D 视图' : '2D 视图');

            const toggleBtn = document.getElementById('modeToggleBtn');
            const modeLabel = document.getElementById('modeLabel');
            const viewControls = document.getElementById('viewControls');
            const pitchHint = document.getElementById('pitchHint');

            if (is3DMode) {
                toggleBtn.classList.add('mode-3d');
                modeLabel.textContent = '3D 视图';
                viewControls.classList.add('show');

                lastPitch = map.getPitch();
                lastBearing = map.getBearing();

                map.easeTo({
                    pitch: DEFAULT_3D_PITCH,
                    bearing: DEFAULT_3D_BEARING,
                    duration: 800,
                    essential: true
                });

                setTimeout(() => {
                    if (activeMapSource === 'maptiler' && !buildingLayerAdded) {
                        pendingBuildingLayer = true;
                        tryAddBuildingLayer();
                    }

                    setTimeout(() => toggleBuildingLayer(true), buildingLayerAdded ? 0 : 500);
                    
                    const zoom = map.getZoom();
                    if (zoom < 14) {
                        showZoomHintForBuildings();
                    }
                }, 400);

                setTimeout(() => {
                    pitchHint.classList.add('show');
                    setTimeout(() => {
                        pitchHint.classList.remove('show');
                    }, 5000);
                }, 1000);

                refreshVisibleMarkers();
            } else {
                toggleBtn.classList.remove('mode-3d');
                modeLabel.textContent = '2D 视图';
                viewControls.classList.remove('show');

                toggleBuildingLayer(false);

                map.easeTo({
                    pitch: 0,
                    bearing: 0,
                    duration: 800,
                    essential: true
                });

                refreshVisibleMarkers();
            }

            updateDebugPanel();
            setMapStatus(is3DMode ? '已切换到 3D 视图' : '已切换到 2D 视图', 'ok');
        }

        function showZoomHintForBuildings() {
            const hint = document.getElementById('zoomHint');
            hint.textContent = '放大地图（缩放级别 >= 14）以查看 3D 建筑';
            hint.classList.remove('hide');
            
            if (currentZoomHintTimeout) {
                clearTimeout(currentZoomHintTimeout);
            }
            
            currentZoomHintTimeout = setTimeout(() => {
                hint.classList.add('hide');
            }, 5000);
        }

        function setPitch(pitch) {
            if (!map) return;
            
            const clampedPitch = Math.max(0, Math.min(60, pitch));
            log('设置俯仰角度:', clampedPitch, '°');
            
            map.easeTo({
                pitch: clampedPitch,
                duration: 500,
                essential: true
            });

            updateControlButtons('pitch', clampedPitch);
            updateDebugPanel();
        }

        function setBearing(bearing) {
            if (!map) return;
            
            log('设置旋转角度:', bearing, '°');
            
            map.easeTo({
                bearing: bearing,
                duration: 500,
                essential: true
            });

            updateDebugPanel();
        }

        function rotateView(degrees) {
            if (!map) return;
            
            const currentBearing = map.getBearing();
            const newBearing = currentBearing + degrees;
            
            log('旋转视图:', degrees, '° -> 新角度:', newBearing, '°');
            
            map.easeTo({
                bearing: newBearing,
                duration: 500,
                essential: true
            });

            updateDebugPanel();
        }

        function updateControlButtons(type, value) {
            if (type === 'pitch') {
                const buttons = document.querySelectorAll('.view-controls .control-btn');
                buttons.forEach(btn => {
                    const text = btn.textContent;
                    let match = false;
                    if (value === 0 && text === '平视') match = true;
                    if (value === 30 && text === '低角度') match = true;
                    if (value === 45 && text === '中角度') match = true;
                    if (value === 60 && text === '高角度') match = true;
                    
                    if (match) {
                        btn.classList.add('active');
                    } else if (['平视', '低角度', '中角度', '高角度'].includes(text)) {
                        btn.classList.remove('active');
                    }
                });
            }
        }

        function refreshVisibleMarkers() {
            if (!map || spotData.length === 0) {
                log('没有数据需要刷新标记');
                return;
            }

            const bounds = map.getBounds();
            if (!bounds) {
                log('无法获取地图边界');
                return;
            }

            log('刷新可见标记, 当前标记数:', markers.length);
            
            clearMarkers();

            let visibleCount = 0;
            spotData.forEach(spot => {
                const lngLat = new maplibregl.LngLat(spot.lon, spot.lat);
                if (bounds.contains(lngLat)) {
                    addMarker(spot);
                    visibleCount++;
                }
            });

            log('刷新完成, 可见标记数:', visibleCount);
        }

        const BUILDING_LAYER_ID = '3d-buildings';
        const BUILDING_SOURCE_LAYER = 'building';

        function addBuildingLayer() {
            if (!map) {
                log('地图尚未初始化，无法添加建筑图层');
                return;
            }

            log('开始添加 3D 建筑图层...');
            
            const style = map.getStyle();
            const sources = style.sources;
            log('地图可用数据源:', Object.keys(sources));

            let sourceId = null;
            let hasBuildingLayer = false;

            for (const [id, source] of Object.entries(sources)) {
                log(`检查数据源: ${id}, 类型: ${source.type}`);
                
                if (source.type === 'vector') {
                    sourceId = id;
                    log(`找到矢量数据源: ${id}`);
                    break;
                }
            }

            if (!sourceId) {
                log('⚠️ 未找到矢量数据源，无法添加 3D 建筑图层');
                log('提示: MapTiler 矢量地图需要使用 vector 类型的样式');
                return;
            }

            if (map.getLayer(BUILDING_LAYER_ID)) {
                log('建筑图层已存在，跳过添加');
                return;
            }

            const layers = style.layers;
            let firstSymbolId = null;

            for (const layer of layers) {
                if (layer.type === 'symbol') {
                    firstSymbolId = layer.id;
                    break;
                }
            }

            try {
                map.addLayer({
                    'id': BUILDING_LAYER_ID,
                    'source': sourceId,
                    'source-layer': BUILDING_SOURCE_LAYER,
                    'type': 'fill-extrusion',
                    'minzoom': 14,
                    'filter': ['==', 'extrude', 'true'],
                    'paint': {
                        'fill-extrusion-color': {
                            'property': 'type',
                            'type': 'categorical',
                            'stops': [
                                ['building', '#e8e4df'],
                                ['apartments', '#d4cfc7'],
                                ['commercial', '#c9c4bc'],
                                ['industrial', '#bfb9b1'],
                                ['residential', '#ddd8d0']
                            ],
                            'default': '#e2ddd6'
                        },
                        'fill-extrusion-height': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            14,
                            0,
                            14.05,
                            ['get', 'render_height']
                        ],
                        'fill-extrusion-base': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            14,
                            0,
                            14.05,
                            ['get', 'render_min_height']
                        ],
                        'fill-extrusion-opacity': {
                            'stops': [
                                [14, 0],
                                [14.5, 0.9],
                                [17, 0.95]
                            ]
                        }
                    }
                }, firstSymbolId);

                log('✓ 3D 建筑图层添加成功!');
                log('  - 图层 ID:', BUILDING_LAYER_ID);
                log('  - 数据源:', sourceId);
                log('  - 源图层:', BUILDING_SOURCE_LAYER);
                log('  - 最小缩放: 14');
                log('  - 高度字段: render_height');

                map.setLayoutProperty(BUILDING_LAYER_ID, 'visibility', 'none');
                log('建筑图层已隐藏（默认 2D 模式）');

            } catch (error) {
                log('✗ 添加 3D 建筑图层失败:', error);
                log('提示: 可能是样式中没有 building 图层');
            }
        }

        function tryAddBuildingLayer() {
            if (buildingLayerAdded || !map) return;
            
            log('尝试添加 3D 建筑图层...');
            
            const style = map.getStyle();
            const sources = style.sources;
            const layers = style.layers;
            
            log('当前数据源:', Object.keys(sources));
            
            let vectorSourceId = null;
            let hasBuildingSourceLayer = false;
            let buildingSource = null;
            
            for (const layer of layers) {
                if (layer['source-layer'] === BUILDING_SOURCE_LAYER) {
                    hasBuildingSourceLayer = true;
                    buildingSource = layer.source;
                    log('找到 building 源图层，数据源:', layer.source);
                    break;
                }
            }
            
            if (buildingSource) {
                vectorSourceId = buildingSource;
                log('使用包含建筑数据的数据源:', vectorSourceId);
            } else {
                for (const [id, source] of Object.entries(sources)) {
                    log(`检查数据源: ${id}, 类型: ${source.type}`);
                    
                    if (source.type === 'vector' && 
                        id !== 'maptiler_attribution' && 
                        id !== 'maptiler_attribution_3_0') {
                        vectorSourceId = id;
                        log(`找到矢量数据源: ${id}`);
                        break;
                    }
                }
            }
            
            if (!vectorSourceId) {
                log('⚠️ 未找到矢量数据源，稍后再试...');
                setTimeout(() => {
                    if (!buildingLayerAdded) {
                        tryAddBuildingLayer();
                    }
                }, 500);
                return;
            }
            
            if (map.getLayer(BUILDING_LAYER_ID)) {
                log('建筑图层已存在');
                buildingLayerAdded = true;
                pendingBuildingLayer = false;
                return;
            }
            
            let firstSymbolId = null;
            
            for (const layer of layers) {
                if (layer.type === 'symbol') {
                    firstSymbolId = layer.id;
                    break;
                }
            }
            
            if (!hasBuildingSourceLayer) {
                log('⚠️ 样式中没有 building 源图层');
                log('可用的 source-layers:');
                const sourceLayers = new Set();
                for (const layer of layers) {
                    if (layer['source-layer']) {
                        sourceLayers.add(layer['source-layer']);
                    }
                }
                log('  -', Array.from(sourceLayers).join(', '));
            }
            
            try {
                log('使用数据源添加建筑图层:', vectorSourceId);
                log('📝 改进配置: 降低 minzoom 到 12, 使用 coalesce 表达式获取高度, 移除 extrude 滤镜');
                
                const layerConfig = {
                    'id': BUILDING_LAYER_ID,
                    'source': vectorSourceId,
                    'source-layer': BUILDING_SOURCE_LAYER,
                    'type': 'fill-extrusion',
                    'minzoom': 12,
                    'paint': {
                        'fill-extrusion-color': [
                            'match',
                            ['get', 'type'],
                            'apartments', '#d4a574',
                            'commercial', '#8b7355',
                            'industrial', '#708090',
                            'residential', '#cd853f',
                            'retail', '#b8860b',
                            'school', '#4682b4',
                            'hospital', '#90ee90',
                            'hotel', '#daa520',
                            '#c9b896'
                        ],
                        'fill-extrusion-height': [
                            'case',
                            ['has', 'render_height'],
                            ['get', 'render_height'],
                            ['has', 'height'],
                            ['to-number', ['get', 'height']],
                            [
                                '+',
                                8,
                                [
                                    '%',
                                    ['abs', ['id']],
                                    22
                                ]
                            ]
                        ],
                        'fill-extrusion-base': [
                            'coalesce',
                            ['get', 'render_min_height'],
                            ['get', 'min_height'],
                            0
                        ],
                        'fill-extrusion-opacity': 0.92
                    }
                };
                
                map.addLayer(layerConfig, firstSymbolId);
                
                buildingLayerAdded = true;
                pendingBuildingLayer = false;
                
                log('✓ 3D 建筑图层添加成功!');
                log('  - 图层 ID:', BUILDING_LAYER_ID);
                log('  - 数据源:', vectorSourceId);
                log('  - 源图层:', BUILDING_SOURCE_LAYER);
                log('  - 最小缩放: 12');
                log('  - 高度字段: coalesce(render_height, to-number(height), 随机高度 7.5-22.5米)');
                log('  - 不使用 extrude 滤镜（显示所有建筑）');
                log('  - 颜色: 根据建筑类型区分颜色');
                
                map.setLayoutProperty(BUILDING_LAYER_ID, 'visibility', 'none');
                log('建筑图层已隐藏（默认 2D 模式）');
                
            } catch (error) {
                log('✗ 添加 3D 建筑图层失败:', error);
                log('尝试使用备用方案...');
                
                try {
                    log('备用方案: 使用随机高度 10-25 米');
                    map.addLayer({
                        'id': BUILDING_LAYER_ID,
                        'source': vectorSourceId,
                        'source-layer': BUILDING_SOURCE_LAYER,
                        'type': 'fill-extrusion',
                        'minzoom': 12,
                        'paint': {
                            'fill-extrusion-color': [
                                'interpolate',
                                ['linear'],
                                ['zoom'],
                                12, '#e2ddd6',
                                16, '#d4cfc7'
                            ],
                            'fill-extrusion-height': 15,
                            'fill-extrusion-opacity': 0.85
                        }
                    }, firstSymbolId);
                    
                    buildingLayerAdded = true;
                    pendingBuildingLayer = false;
                    
                    log('✓ 3D 建筑图层添加成功（使用备用方案）!');
                    log('  - 使用固定高度: 15 米');
                    
                    map.setLayoutProperty(BUILDING_LAYER_ID, 'visibility', 'none');
                    
                } catch (error2) {
                    log('✗ 备用方案也失败:', error2);
                    log('提示: 当前样式可能不支持 3D 建筑图层');
                    log('请确认:');
                    log('  1. 使用的是 MapTiler 矢量地图（不是 raster）');
                    log('  2. 样式中包含 building 源图层');
                    log('  3. 使用的是 outdoor 或基本样式（通常包含建筑数据）');
                    log('  4. 尝试使用 MapTiler Streets 或 Outdoor 样式');
                }
            }
        }

        function toggleBuildingLayer(show) {
            if (!map) return;

            const layer = map.getLayer(BUILDING_LAYER_ID);
            if (!layer) {
                log('建筑图层不存在，无法切换显示状态');
                if (pendingBuildingLayer) {
                    log('建筑图层正在加载中，稍后再试...');
                    setTimeout(() => {
                        toggleBuildingLayer(show);
                    }, 500);
                }
                return;
            }

            const visibility = show ? 'visible' : 'none';
            map.setLayoutProperty(BUILDING_LAYER_ID, 'visibility', visibility);
            log(`3D 建筑图层已${show ? '显示' : '隐藏'}`);

            const buildingLayerNames = ['Building', 'building', 'Building 3D', 'buildings', 'Buildings'];
            let nativeBuildingLayerFound = false;
            
            for (const name of buildingLayerNames) {
                const nativeLayer = map.getLayer(name);
                if (nativeLayer) {
                    nativeBuildingLayerFound = true;
                    const nativeVisibility = show ? 'none' : 'visible';
                    map.setLayoutProperty(name, 'visibility', nativeVisibility);
                    log(`原生建筑图层 "${name}" 已${show ? '隐藏' : '显示'}（避免与 3D 图层重叠）`);
                }
            }

            if (!nativeBuildingLayerFound) {
                log('未检测到原生建筑图层，无需切换');
            }
        }

        function showError(message) {
            log('ERROR:', message);
            setMapStatus('错误', 'error');
            const toast = document.getElementById('errorToast');
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 8000);
        }

        class SourceAwareGeolocateControl {
            onAdd(mapInstance) {
                this.map = mapInstance;
                this.container = document.createElement('div');
                this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'source-aware-geolocate-btn';
                button.title = '定位到当前位置';
                button.setAttribute('aria-label', '定位到当前位置');
                button.innerHTML = '◎';
                button.addEventListener('click', () => this.locate());
                this.container.appendChild(button);
                return this.container;
            }

            onRemove() {
                this.container?.parentNode?.removeChild(this.container);
                this.map = undefined;
            }

            locate() {
                if (!navigator.geolocation || !this.map) return;
                navigator.geolocation.getCurrentPosition(
                    position => {
                        const { latitude, longitude } = position.coords;
                        const projected = getMapCoordinateFromWgs84(latitude, longitude);
                        this.map.easeTo({ center: [projected.lon, projected.lat], zoom: Math.max(this.map.getZoom(), 15), duration: 650, essential: true });
                        unlockFogAtLocation(latitude, longitude);
                    },
                    error => showError(`定位失败：${error.message}`),
                    { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 }
                );
            }
        }

        function getFogUserId() {
            if (authUser && authUser.id) {
                return authUser.id;
            }
            const storageKey = 'map3d_fog_user_id';
            let userId = localStorage.getItem(storageKey);
            if (!userId) {
                userId = `web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                localStorage.setItem(storageKey, userId);
            }
            return userId;
        }

        function initAuth() {
            const stored = localStorage.getItem(AUTH_TOKEN_KEY);
            const userStr = localStorage.getItem(AUTH_USER_KEY);
            if (stored && userStr) {
                try {
                    authToken = stored;
                    authUser = JSON.parse(userStr);
                    updateUserIndicator();
                    fetch('/api/auth/me', {
                        headers: { 'Authorization': `Bearer ${authToken}` }
                    }).then(res => {
                        if (!res.ok) logout();
                    });
                } catch (e) {
                    logout();
                }
            }
        }

        function updateUserIndicator() {
            const textEl = document.getElementById('userIndicatorText');
            if (textEl) {
                textEl.textContent = authUser ? authUser.nickname : '登录';
            }
        }

        function toggleAuthModal() {
            if (authUser) {
                if (confirm(`当前登录: ${authUser.nickname}\n确定要退出登录吗？`)) {
                    logout();
                }
                return;
            }
            openAuthModal('login');
        }

        function openAuthModal(mode) {
            authMode = mode;
            const modal = document.getElementById('authModal');
            const title = document.getElementById('authModalTitle');
            const submitBtn = document.getElementById('authSubmitBtn');
            const registerFields = document.getElementById('authRegisterFields');
            const switchText = document.getElementById('authSwitchText');
            const switchLink = document.getElementById('authSwitchLink');
            const errorEl = document.getElementById('authError');

            errorEl.style.display = 'none';
            errorEl.textContent = '';

            if (mode === 'login') {
                title.textContent = '登录';
                submitBtn.textContent = '登录';
                registerFields.style.display = 'none';
                switchText.textContent = '没有账号？';
                switchLink.textContent = '立即注册';
            } else {
                title.textContent = '注册';
                submitBtn.textContent = '注册';
                registerFields.style.display = 'block';
                switchText.textContent = '已有账号？';
                switchLink.textContent = '去登录';
            }

            document.getElementById('authPhone').value = '';
            document.getElementById('authPassword').value = '';
            if (mode === 'register') {
                document.getElementById('authNickname').value = '';
                document.getElementById('authRealName').value = '';
                document.getElementById('authIdCard').value = '';
            }

            modal.classList.add('show');
        }

        function closeAuthModal() {
            document.getElementById('authModal').classList.remove('show');
        }

        function toggleAuthMode() {
            openAuthModal(authMode === 'login' ? 'register' : 'login');
        }

        async function submitAuth() {
            const phone = document.getElementById('authPhone').value.trim();
            const password = document.getElementById('authPassword').value.trim();
            const submitBtn = document.getElementById('authSubmitBtn');

            if (!phone) { showAuthError('请输入手机号'); return; }
            if (!password) { showAuthError('请输入密码'); return; }

            let body;
            if (authMode === 'register') {
                const nickname = document.getElementById('authNickname').value.trim();
                const realName = document.getElementById('authRealName').value.trim() || null;
                const idCard = document.getElementById('authIdCard').value.trim() || null;
                if (!nickname) { showAuthError('请输入昵称'); return; }
                if (password.length < 6) { showAuthError('密码至少6位'); return; }
                body = {
                    nickname: nickname,
                    real_name: realName,
                    id_card: idCard,
                    phone: phone,
                    password: password
                };
            } else {
                body = { phone: phone, password: password };
            }

            const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
            submitBtn.disabled = true;
            submitBtn.textContent = authMode === 'register' ? '注册中...' : '登录中...';

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    showAuthError(err.detail || '操作失败，请重试');
                    submitBtn.disabled = false;
                    submitBtn.textContent = authMode === 'login' ? '登录' : '注册';
                    return;
                }

                const data = await response.json();
                authToken = data.token;
                authUser = data.user;
                localStorage.setItem(AUTH_TOKEN_KEY, authToken);
                localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authUser));
                updateUserIndicator();
                closeAuthModal();

                showToast(authMode === 'register' ? '注册成功！' : '登录成功！');
            } catch (error) {
                showAuthError('网络错误，请稍后重试');
                submitBtn.disabled = false;
                submitBtn.textContent = authMode === 'login' ? '登录' : '注册';
            }
        }

        function showAuthError(message) {
            const errorEl = document.getElementById('authError');
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }

        function logout() {
            authToken = null;
            authUser = null;
            localStorage.removeItem(AUTH_TOKEN_KEY);
            localStorage.removeItem(AUTH_USER_KEY);
            updateUserIndicator();
        }

        function createShader(gl, type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                const info = gl.getShaderInfoLog(shader);
                gl.deleteShader(shader);
                throw new Error(info || 'Shader compile failed');
            }
            return shader;
        }

        function createProgram(gl, vertexSource, fragmentSource) {
            const program = gl.createProgram();
            gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vertexSource));
            gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                const info = gl.getProgramInfoLog(program);
                gl.deleteProgram(program);
                throw new Error(info || 'Program link failed');
            }
            return program;
        }

        function isGcj02MapSource() {
            return activeMapSource === 'amap';
        }

        function getMapCoordinateFromWgs84(lat, lon) {
            return isGcj02MapSource() ? wgs84ToGcj02(lat, lon) : { lat, lon };
        }

        function getCellBoundaryForMap(cell) {
            if (!cell || !cell.boundary) return [];
            if (!isGcj02MapSource()) return cell.boundary;
            return cell.boundary.map(([lon, lat]) => {
                const converted = wgs84ToGcj02(lat, lon);
                return [converted.lon, converted.lat];
            });
        }

        function getVisibleFogCells() {
            if (!map || !unlockedFogCells.length) return [];
            const bounds = map.getBounds();
            if (!bounds) return [];
            const west = bounds.getWest();
            const east = bounds.getEast();
            const south = bounds.getSouth();
            const north = bounds.getNorth();
            return unlockedFogCells.filter(cell => getCellBoundaryForMap(cell).some(([lon, lat]) => lon >= west && lon <= east && lat >= south && lat <= north));
        }

        function compactFogCellsForRender(cells) {
            if (!window.h3 || typeof window.h3.compactCells !== 'function') return cells;
            try {
                const byIndex = new Map(cells.map(cell => [cell.h3_index, cell]));
                const compactIndexes = window.h3.compactCells(cells.map(cell => cell.h3_index));
                return compactIndexes.map(h3Index => {
                    const existing = byIndex.get(h3Index);
                    if (existing) return existing;
                    if (typeof window.h3.cellToBoundary !== 'function') return null;
                    const boundary = window.h3.cellToBoundary(h3Index).map(([lat, lon]) => [lon, lat]);
                    return { h3_index: h3Index, boundary, unlock_type: 'gps_adjacent' };
                }).filter(Boolean);
            } catch (error) {
                log('h3-js compactCells 不可用，使用原始格子:', error.message);
                return cells;
            }
        }

        class ShaderFogRenderer {
            constructor(canvas) {
                this.canvas = canvas;
                this.maskCanvas = document.createElement('canvas');
                this.maskCanvas.width = FOG_MASK_SIZE;
                this.maskCanvas.height = FOG_MASK_SIZE;
                this.maskCtx = this.maskCanvas.getContext('2d', { alpha: false });
                this.gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
                if (!this.gl) throw new Error('WebGL unavailable');

                const gl = this.gl;
                const vertexSource = `
                    attribute vec2 a_position;
                    varying vec2 v_uv;
                    void main() {
                        v_uv = a_position * 0.5 + 0.5;
                        gl_Position = vec4(a_position, 0.0, 1.0);
                    }
                `;
                const fragmentSource = `
                    precision mediump float;
                    uniform sampler2D u_mask;
                    uniform float u_time;
                    varying vec2 v_uv;
                    void main() {
                        float unlock = texture2D(u_mask, v_uv).r;
                        float soft = smoothstep(0.18, 0.82, unlock);
                        float vignette = smoothstep(0.15, 0.88, distance(v_uv, vec2(0.5)));
                        float gridA = abs(fract((v_uv.x + v_uv.y * 0.58) * 26.0) - 0.5);
                        float gridB = abs(fract((v_uv.x - v_uv.y * 0.58) * 26.0) - 0.5);
                        float grid = 1.0 - smoothstep(0.0, 0.035, min(gridA, gridB));
                        vec3 fogColor = mix(vec3(0.08, 0.12, 0.18), vec3(0.01, 0.03, 0.07), vignette);
                        vec3 revealColor = vec3(0.10, 0.82, 0.92);
                        float fogAlpha = mix(0.82, 0.0, soft);
                        vec3 color = mix(fogColor + grid * 0.08, revealColor, soft * 0.22);
                        float alpha = max(fogAlpha, grid * (1.0 - soft) * 0.16);
                        gl_FragColor = vec4(color, alpha);
                    }
                `;
                this.program = createProgram(gl, vertexSource, fragmentSource);
                this.positionBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
                this.texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
                this.maskLocation = gl.getUniformLocation(this.program, 'u_mask');
                this.timeLocation = gl.getUniformLocation(this.program, 'u_time');
                this.resize();
            }

            resize() {
                const dpr = window.devicePixelRatio || 1;
                const width = window.innerWidth;
                const height = window.innerHeight;
                if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
                    this.canvas.width = width * dpr;
                    this.canvas.height = height * dpr;
                    this.canvas.style.width = `${width}px`;
                    this.canvas.style.height = `${height}px`;
                }
                this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            }

            updateMask(cells) {
                const ctx = this.maskCtx;
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, FOG_MASK_SIZE, FOG_MASK_SIZE);
                if (!map) return;

                const renderCells = compactFogCellsForRender(getVisibleFogCells()).slice(0, 900);
                ctx.fillStyle = 'white';
                ctx.shadowColor = 'white';
                ctx.shadowBlur = 10;
                for (const cell of renderCells) {
                    const points = getCellBoundaryForMap(cell).map(([lon, lat]) => map.project([lon, lat]));
                    if (!points.length) continue;
                    ctx.beginPath();
                    points.forEach((point, index) => {
                        const x = (point.x / window.innerWidth) * FOG_MASK_SIZE;
                        const y = (point.y / window.innerHeight) * FOG_MASK_SIZE;
                        if (index === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    });
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.shadowBlur = 0;

                const gl = this.gl;
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, this.maskCanvas);
            }

            render(cells) {
                this.resize();
                this.updateMask(cells);
                const gl = this.gl;
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.useProgram(this.program);
                gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
                gl.enableVertexAttribArray(this.positionLocation);
                gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.uniform1i(this.maskLocation, 0);
                gl.uniform1f(this.timeLocation, performance.now() * 0.001);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
        }

        class CanvasFogRenderer {
            constructor(canvas) {
                this.canvas = canvas;
                this.ctx = canvas.getContext('2d');
            }

            resize() {
                const dpr = window.devicePixelRatio || 1;
                const width = window.innerWidth;
                const height = window.innerHeight;
                if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
                    this.canvas.width = width * dpr;
                    this.canvas.height = height * dpr;
                    this.canvas.style.width = `${width}px`;
                    this.canvas.style.height = `${height}px`;
                }
                this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                return { width, height };
            }

            render() {
                const { width, height } = this.resize();
                const ctx = this.ctx;
                ctx.clearRect(0, 0, width, height);
                ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
                ctx.fillRect(0, 0, width, height);
                const cells = getVisibleFogCells().slice(0, 900);
                ctx.globalCompositeOperation = 'destination-out';
                ctx.fillStyle = 'rgba(255,255,255,0.82)';
                for (const cell of cells) {
                    const points = getCellBoundaryForMap(cell).map(([lon, lat]) => map.project([lon, lat]));
                    if (!points.length) continue;
                    ctx.beginPath();
                    points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.globalCompositeOperation = 'source-over';
            }
        }

        function createFogRenderer() {
            const canvas = document.getElementById('fogUnlockCanvas');
            if (!canvas) return null;
            const fogLayer = document.getElementById('fogLayer');
            if (fogLayer) fogLayer.classList.add('shader-backdrop');
            try {
                const testCanvas = document.createElement('canvas');
                const testGl = testCanvas.getContext('webgl');
                const supportsShaderPath = !!testGl && !!testGl.getExtension('OES_standard_derivatives');
                if (!supportsShaderPath) throw new Error('缺少复杂 Shader 所需 WebGL 扩展');
                canvas.classList.add('shader-fog');
                log('战争迷雾使用 WebGL mask texture shader 渲染');
                return new ShaderFogRenderer(canvas);
            } catch (error) {
                canvas.classList.add('canvas-fog');
                log('战争迷雾降级为 Canvas/fill 样式:', error.message);
                return new CanvasFogRenderer(canvas);
            }
        }

        function scheduleFogRender(force = false) {
            if (!map) return;
            if (force) {
                if (pendingImmediateFogRender) return;
                pendingImmediateFogRender = true;
                requestAnimationFrame(() => {
                    pendingImmediateFogRender = false;
                    if (!fogRenderer) fogRenderer = createFogRenderer();
                    if (fogRenderer) fogRenderer.render(unlockedFogCells);
                    lastFogRenderAt = performance.now();
                });
                return;
            }
            const now = performance.now();
            const delay = Math.max(0, FOG_UPDATE_INTERVAL - (now - lastFogRenderAt));
            if (pendingFogRender) return;
            pendingFogRender = true;
            setTimeout(() => {
                pendingFogRender = false;
                lastFogRenderAt = performance.now();
                if (!fogRenderer) fogRenderer = createFogRenderer();
                if (fogRenderer) fogRenderer.render(unlockedFogCells);
            }, delay);
        }

        function renderUnlockedFogCells(force = false) {
            scheduleFogRender(force);
        }

        async function loadUnlockedFogCells() {
            if (!fogUserId) fogUserId = getFogUserId();
            try {
                const headers = {};
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                const response = await fetch(`/api/fog/unlocked?user_id=${encodeURIComponent(fogUserId)}`, { headers });
                if (!response.ok) return;
                const data = await response.json();
                unlockedFogCells = data.cells || [];
                renderUnlockedFogCells();
                log('已加载历史点亮迷雾格子:', unlockedFogCells.length);
            } catch (error) {
                log('加载历史迷雾失败:', error);
            }
        }

        async function unlockFogAtLocation(lat, lon) {
            if (!fogUserId) fogUserId = getFogUserId();
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                const response = await fetch('/api/fog/unlock', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ user_id: fogUserId, lat, lon })
                });
                if (!response.ok) return;
                const data = await response.json();
                unlockedFogCells = data.cells || [];
                lastUnlockedH3 = data.center_h3;
                lastUnlockLocation = { lat, lon };
                renderUnlockedFogCells();
                log('当前位置已点亮迷雾:', data.center_h3, '累计:', unlockedFogCells.length);
            } catch (error) {
                log('点亮迷雾失败:', error);
            }
        }

        // WGS-84 转 GCJ-02 (火星坐标系)
        // 浏览器 GPS 返回的是 WGS-84，但国内地图使用 GCJ-02，需要转换
        function wgs84ToGcj02(wgsLat, wgsLon) {
            // 判断是否在中国范围外（粗略边界判断）
            if (wgsLon < 72.004 || wgsLon > 137.8347 || wgsLat < 0.8293 || wgsLat > 55.8271) {
                return { lat: wgsLat, lon: wgsLon };
            }

            // 偏移算法常量
            const a = 6378245.0; // 长半轴
            const ee = 0.00669342162296594323; // 偏心率平方

            let dLat = transformLat(wgsLon - 105.0, wgsLat - 35.0);
            let dLon = transformLon(wgsLon - 105.0, wgsLat - 35.0);

            const radLat = wgsLat / 180.0 * Math.PI;
            let magic = Math.sin(radLat);
            magic = 1 - ee * magic * magic;
            const sqrtMagic = Math.sqrt(magic);

            dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
            dLon = (dLon * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);

            return {
                lat: wgsLat + dLat,
                lon: wgsLon + dLon
            };
        }

        function transformLat(x, y) {
            let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
            ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
            ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
            ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
            return ret;
        }

        function transformLon(x, y) {
            let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
            ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
            ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
            ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
            return ret;
        }

        // 转换 H3 cell 边界坐标从 WGS-84 到 GCJ-02
        function convertCellBoundaryToGcj02(cell) {
            if (!cell || !cell.boundary) return cell;
            return {
                ...cell,
                boundary: cell.boundary.map(([lon, lat]) => {
                    const converted = wgs84ToGcj02(lat, lon);
                    return [converted.lon, converted.lat];
                })
            };
        }

        function startFogLocationUnlock() {
            if (!navigator.geolocation) {
                log('当前浏览器不支持定位，无法自动点亮迷雾');
                return;
            }

            navigator.geolocation.getCurrentPosition(
                position => {
                    const { latitude, longitude, accuracy } = position.coords;
                    if (accuracy && accuracy > 120) {
                        log('定位精度不足，暂不点亮迷雾:', Math.round(accuracy), 'm');
                        return;
                    }
                    log('高精度定位用于点亮迷雾:', latitude.toFixed(6), longitude.toFixed(6), '精度:', Math.round(accuracy || 0), 'm');
                    unlockFogAtLocation(latitude, longitude);
                },
                error => log('获取当前位置点亮迷雾失败:', error.message),
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 }
            );

            if (fogWatchId !== null) return;
            fogWatchId = navigator.geolocation.watchPosition(
                position => {
                    const { latitude, longitude, accuracy } = position.coords;
                    if (accuracy && accuracy > 120) {
                        log('监听定位精度不足，跳过迷雾点亮:', Math.round(accuracy), 'm');
                        return;
                    }
                    if (lastUnlockLocation) {
                        const distance = getDistanceMeters(lastUnlockLocation.lat, lastUnlockLocation.lon, latitude, longitude);
                        if (distance < 100) return;
                    }
                    unlockFogAtLocation(latitude, longitude);
                },
                error => log('监听当前位置点亮迷雾失败:', error.message),
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 }
            );
        }

        function runWhenIdle(callback, timeout = 1500) {
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(callback, { timeout });
                return;
            }
            setTimeout(callback, Math.min(timeout, 800));
        }

        async function loadConfig() {
            try {
                log('正在从 /api/config 加载配置...');
                setMapStatus('加载配置...');
                
                const response = await fetch('/api/config');
                if (!response.ok) {
                    log('配置 API 返回状态:', response.status);
                    setMapStatus('配置加载失败', 'warning');
                    return { maptiler_key: '', map_source: 'auto' };
                }
                
                const config = await response.json();
                mapTilerKey = config.maptiler_key || '';
                
                if (config.debug_info) {
                    log('后端调试信息:', {
                        envFileFound: config.debug_info.env_file_found,
                        maptilerConfigured: config.debug_info.maptiler_key_configured,
                        amapConfigured: config.debug_info.amap_key_configured,
                        mapSource: config.debug_info.map_source,
                        envPath: config.debug_info.env_path
                    });
                }
                
                log('前端配置加载完成:', { 
                    hasKey: !!mapTilerKey, 
                    keyLength: mapTilerKey ? mapTilerKey.length : 0
                });
                
                updateDebugPanel();
                return config;
            } catch (error) {
                log('加载配置失败:', error);
                showError('无法加载配置，将使用默认地图源');
                return { maptiler_key: '', map_source: 'auto' };
            }
        }

        async function initMap() {
            log('='.repeat(50));
            log('开始初始化地图...');
            log('='.repeat(50));
            log(`景点显示范围: 缩放级别 ${MIN_ZOOM} - ${MAX_ZOOM}`);
            log('='.repeat(50));
            
            setMapStatus('正在初始化...');
            
            const config = await loadConfig();
            const { style, styleName } = resolveMapStyle(config);
            setMapStatus(`加载 ${styleName} 地图...`);

            try {
                log('创建地图实例...');
                log('地图初始配置:');
                log('  - 中心: 121.4737, 31.2304 (上海)');
                log('  - 初始缩放: 12');
                log('  - 地图源:', styleName);
                
                const initialCenter = isGcj02MapSource()
                    ? [getMapCoordinateFromWgs84(SHANGHAI_CENTER[1], SHANGHAI_CENTER[0]).lon, getMapCoordinateFromWgs84(SHANGHAI_CENTER[1], SHANGHAI_CENTER[0]).lat]
                    : SHANGHAI_CENTER;

                map = new maplibregl.Map({
                    container: 'map',
                    style: style,
                    center: initialCenter,
                    zoom: 12,
                    maxZoom: MAP_MAX_ZOOM,
                    pitch: 0,
                    bearing: 0,
                    failIfMajorPerformanceCaveat: false,
                    preserveDrawingBuffer: false,
                    refreshExpiredTiles: false,
                    fadeDuration: 0
                });

                map.addControl(new maplibregl.NavigationControl(), 'top-right');
                log('✓ 添加导航控件');
                
                if (isGcj02MapSource()) {
                    map.addControl(new SourceAwareGeolocateControl(), 'top-right');
                    log('✓ 添加高德坐标系定位控件');
                } else {
                    map.addControl(new maplibregl.GeolocateControl({
                        positionOptions: { enableHighAccuracy: true },
                        trackUserLocation: true
                    }), 'top-right');
                    log('✓ 添加定位控件');
                }
                
                map.addControl(new maplibregl.FullscreenControl(), 'top-right');
                log('✓ 添加全屏控件');
                
                map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
                log('✓ 添加比例尺控件');

                map.on('load', () => {
                    mapInitialLoadComplete = true;
                    log('✓ 地图加载完成!');
                    log('  - 当前缩放:', map.getZoom());
                    log('  - 当前中心:', map.getCenter());
                    setMapStatus('已加载', 'ok');
                    updateDebugPanel();

                    runWhenIdle(() => loadUnlockedFogCells(), 600);
                    setTimeout(() => startFogLocationUnlock(), 1200);
                    setTimeout(() => handleTopicsMapMove(), 1600);
                    setTimeout(() => handleWeatherMapMove(), 2200);
                    setTimeout(() => handleMapMoveEnd({ silent: true }), activeMapSource === 'maptiler' ? 2600 : 900);
                    
                    log('🔧 添加建筑点击调试功能: 点击地图上的建筑可查看其属性');
                    map.on('click', async (e) => {
                        if (await openNearestOrFetchSpotPopup(e.lngLat)) {
                            return;
                        }
                        const features = map.queryRenderedFeatures(e.point);
                        if (features && features.length > 0) {
                            let buildingFound = false;
                            for (const feature of features) {
                                const layerId = feature.layer?.id;
                                const sourceLayer = feature.layer?.['source-layer'];
                                
                                if (sourceLayer === BUILDING_SOURCE_LAYER || 
                                    layerId === BUILDING_LAYER_ID ||
                                    (layerId && layerId.toLowerCase().includes('building'))) {
                                    buildingFound = true;
                                    log('==================================================');
                                    log('🏢 点击到建筑!');
                                    log('==================================================');
                                    log('  - 图层 ID:', layerId);
                                    log('  - 源图层:', sourceLayer);
                                    log('  - 要素 ID:', feature.id);
                                    log('  - 要素类型:', feature.type);
                                    log('==================================================');
                                    log('📋 所有属性 (properties):');
                                    log('==================================================');
                                    
                                    if (feature.properties) {
                                        const props = feature.properties;
                                        const keys = Object.keys(props).sort();
                                        
                                        for (const key of keys) {
                                            const value = props[key];
                                            const keyLower = key.toLowerCase();
                                            let highlight = '';
                                            
                                            if (keyLower.includes('height') || 
                                                keyLower.includes('render') ||
                                                keyLower.includes('elevation') ||
                                                keyLower.includes('level') ||
                                                keyLower === 'h' ||
                                                keyLower === 'z') {
                                                highlight = ' ⭐';
                                            }
                                            
                                            log(`  ${key}${highlight}:`, value);
                                        }
                                        
                                        log('==================================================');
                                        log('📊 高度相关字段汇总:');
                                        log('==================================================');
                                        for (const key of keys) {
                                            const keyLower = key.toLowerCase();
                                            if (keyLower.includes('height') || 
                                                keyLower.includes('render') ||
                                                keyLower.includes('elevation') ||
                                                keyLower.includes('min_') ||
                                                keyLower.includes('max_')) {
                                                log(`  ${key}:`, props[key]);
                                            }
                                        }
                                    } else {
                                        log('  ⚠️ 该要素没有 properties 属性');
                                    }
                                    
                                    log('==================================================');
                                    log('💡 提示: 检查上面的 ⭐ 标记字段，这些可能包含高度数据');
                                    log('==================================================');
                                    
                                    break;
                                }
                            }
                            
                            if (!buildingFound) {
                                log('👆 点击位置没有检测到建筑要素，检测到的图层:');
                                for (const feature of features.slice(0, 5)) {
                                    log('  - 图层:', feature.layer?.id, 
                                        '| 源图层:', feature.layer?.['source-layer'],
                                        '| 类型:', feature.layer?.type);
                                }
                                if (features.length > 5) {
                                    log('  - ... 还有', features.length - 5, '个要素');
                                }
                            }
                        } else {
                            log('👆 点击位置没有检测到任何要素');
                            log('   💡 提示: 请放大地图到缩放级别 >= 14，然后点击建筑物');
                        }
                    });
                    
                    if (activeMapSource !== 'maptiler') {
                        log('当前地图源为栅格地图，不初始化 3D 建筑图层');
                    }
                });

                map.on('error', (e) => {
                    log('✗ 地图错误:', e);
                    
                    if (activeMapSource === 'maptiler' && !mapInitialLoadComplete && !mapTilerFallbackTriggered) {
                        mapTilerFallbackTriggered = true;
                        log('MapTiler 首次加载失败，尝试切换到 OpenStreetMap 备用地图...');
                        try {
                            map.setStyle(OSM_STYLE);
                            mapTilerKey = '';
                            activeMapSource = 'osm';
                            setMapStatus('已切换到 OSM', 'warning');
                            updateDebugPanel();
                            showError('MapTiler 加载失败，已切换到 OpenStreetMap 备用地图');
                        } catch (switchError) {
                            log('切换地图失败:', switchError);
                            setMapStatus('地图加载失败', 'error');
                        }
                    } else if (!mapInitialLoadComplete) {
                        setMapStatus('地图错误', 'error');
                        showError('地图加载出错: ' + (e.error ? e.error.message : '未知错误'));
                    } else {
                        log('地图资源加载警告，忽略非阻塞错误:', e.error ? e.error.message : '未知错误');
                    }
                });

                map.on('styledata', () => {
                    log('样式数据已加载');
                    updateDebugPanel();
                    
                    if (is3DMode && activeMapSource === 'maptiler' && !buildingLayerAdded) {
                        log('检测到样式数据加载，尝试添加 3D 建筑图层...');
                        setTimeout(() => {
                            tryAddBuildingLayer();
                        }, 200);
                    }
                });

                map.on('sourcedata', (e) => {
                    if (e.isSourceLoaded) {
                        log('数据源已加载:', e.sourceId);
                    }
                });

                map.on('moveend', debounce(() => {
                    log('地图移动结束');
                    handleMapMoveEnd();
                    handleWeatherMapMove();
                    handleTopicsMapMove();
                    renderUnlockedFogCells();
                }, 300));
                
                map.on('zoom', () => {
                    const zoom = map.getZoom();
                    if (zoom > MAP_MAX_ZOOM) {
                        map.setZoom(MAP_MAX_ZOOM);
                        return;
                    }

                    const radiusInfo = getRadiusInfo(zoom);
                    log('缩放级别改变:', zoom.toFixed(2), `-> 查询半径: ${radiusInfo.radius} 公里`);
                    updateDebugPanel();
                    
                    if (zoom < MIN_ZOOM) {
                        showZoomHint();
                    }
                    
                    const weatherPanel = document.getElementById('weatherPanel');
                    if (zoom <= WEATHER_MIN_ZOOM) {
                        log('缩放级别 <= 12，隐藏天气面板');
                        if (weatherPanel && weatherPanel.classList.contains('show')) {
                            hideWeatherPanel();
                        }
                    } else {
                        log('缩放级别 > 12，天气面板可显示');
                    }
                    
                    if (isExploreMode) {
                        if (zoom <= TOPICS_BUBBLE_MIN_ZOOM) {
                            clearTopicMarkers();
                            const zoomHintTopics = document.getElementById('zoomHintTopics');
                            zoomHintTopics.classList.add('show');
                            setTimeout(() => {
                                zoomHintTopics.classList.remove('show');
                            }, 5000);
                        }
                    }
                });
                
                map.on('pitch', () => {
                    const pitch = map.getPitch();
                    if (Math.abs(pitch - lastPitch) > 0.5) {
                        log('俯仰角度改变:', pitch.toFixed(1), '°');
                        lastPitch = pitch;
                        updateDebugPanel();
                    }
                });
                
                map.on('rotate', () => {
                    const bearing = map.getBearing();
                    if (Math.abs(bearing - lastBearing) > 0.5) {
                        log('旋转角度改变:', bearing.toFixed(1), '°');
                        lastBearing = bearing;
                        updateDebugPanel();
                    }
                });
                
                map.on('move', () => {
                    updateDebugPanel();
                    renderUnlockedFogCells(true);
                });
                
                map.on('idle', () => {
                    if (is3DMode) {
                        refreshVisibleMarkers();
                    }
                });

                updateDebugPanel();

            } catch (error) {
                log('✗ 初始化地图失败:', error);
                setMapStatus('初始化失败', 'error');
                showError('地图初始化失败: ' + error.message);
            }
        }

        function showZoomHint() {
            const hint = document.getElementById('zoomHint');
            hint.classList.remove('hide');
            
            if (currentZoomHintTimeout) {
                clearTimeout(currentZoomHintTimeout);
            }
            
            currentZoomHintTimeout = setTimeout(() => {
                hint.classList.add('hide');
            }, 5000);
        }

        function handleMapMoveEnd(options = {}) {
            if (!map) {
                log('警告: 地图尚未初始化');
                return;
            }
            
            if (!scenicLayerVisible) {
                log('景点图层已关闭，跳过景点加载');
                clearMarkers();
                updateDebugPanel();
                return;
            }
            
            const zoom = map.getZoom();
            log('处理地图移动事件, 缩放级别:', zoom.toFixed(2));
            
            if (zoom < MIN_ZOOM) {
                log(`缩放级别低于显示范围 (${MIN_ZOOM}), 清除标记`);
                clearMarkers();
                showZoomHint();
            } else {
                const center = map.getCenter();
                const radius = calculateRadiusByZoom(zoom);
                
                log(`缩放级别在范围内 (${MIN_ZOOM}-${MAX_ZOOM}), 加载景点`);
                log(`  - 中心坐标: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`);
                log(`  - 查询半径: ${radius} 公里`);
                
                loadScenicSpots(center.lat, center.lng, radius, options);
            }
            
            updateDebugPanel();
        }

        function getWeatherIcon(weather) {
            if (!weather) return '🌤️';
            return WEATHER_ICONS[weather] || '🌤️';
        }

        function hasLocationChanged(newLocation) {
            if (!newLocation) return false;
            
            const provinceChanged = lastWeatherLocation.province !== newLocation.province;
            const cityChanged = lastWeatherLocation.city !== newLocation.city;
            const districtChanged = lastWeatherLocation.district !== newLocation.district;
            
            return provinceChanged || cityChanged || districtChanged;
        }

        function updateLastLocation(location) {
            if (location) {
                lastWeatherLocation = {
                    province: location.province || null,
                    city: location.city || null,
                    district: location.district || null
                };
            }
        }

        function showWeatherLoading() {
            const loadingEl = document.getElementById('weatherLoading');
            const contentEl = document.getElementById('weatherContent');
            if (loadingEl) loadingEl.classList.add('show');
            if (contentEl) contentEl.style.display = 'none';
        }

        function hideWeatherLoading() {
            const loadingEl = document.getElementById('weatherLoading');
            const contentEl = document.getElementById('weatherContent');
            if (loadingEl) loadingEl.classList.remove('show');
            if (contentEl) contentEl.style.display = 'block';
        }

        function showWeatherPanel() {
            const panel = document.getElementById('weatherPanel');
            if (panel && !panel.classList.contains('show')) {
                panel.classList.add('show');
                log('天气面板显示（透明度渐变）');
            }
        }

        function hideWeatherPanel() {
            const panel = document.getElementById('weatherPanel');
            if (panel && panel.classList.contains('show')) {
                panel.classList.remove('show');
                log('天气面板隐藏（透明度渐变）');
            }
            clearWeatherEffects();
        }

        function updateWeatherDisplay(data) {
            if (!data || !data.success) {
                log('天气数据获取失败:', data?.message);
                hideWeatherLoading();
                return;
            }

            const location = data.location;
            const weatherLive = data.weather_live;
            
            if (!location && !weatherLive) {
                log('没有有效的天气数据');
                hideWeatherLoading();
                return;
            }

            let displayLocation = '';
            if (location) {
                const parts = [];
                if (location.province && location.province !== location.city) {
                    parts.push(location.province);
                }
                if (location.city) {
                    parts.push(location.city);
                }
                if (location.district) {
                    parts.push(location.district);
                }
                displayLocation = parts.join(' · ');
            } else if (weatherLive) {
                displayLocation = weatherLive.city || weatherLive.province || '';
            }

            const locationEl = document.getElementById('weatherLocation');
            if (locationEl) locationEl.textContent = displayLocation || '未知位置';

            if (weatherLive) {
                const iconEl = document.getElementById('weatherIcon');
                if (iconEl) iconEl.textContent = getWeatherIcon(weatherLive.weather);
                
                const tempEl = document.getElementById('weatherTemp');
                if (tempEl) tempEl.textContent = `${weatherLive.temperature || '--'}°C`;
                
                const textEl = document.getElementById('weatherText');
                if (textEl) textEl.textContent = weatherLive.weather || '未知';
                
                const windEl = document.getElementById('weatherWind');
                if (windEl) {
                    const windDir = weatherLive.winddirection || '';
                    const windPower = weatherLive.windpower || '';
                    windEl.textContent = `${windDir} ${windPower}级`;
                }
                
                const humidityEl = document.getElementById('weatherHumidity');
                if (humidityEl) humidityEl.textContent = `${weatherLive.humidity || '--'}%`;
                
                const timeEl = document.getElementById('weatherTime');
                if (timeEl && weatherLive.reporttime) {
                    const time = weatherLive.reporttime;
                    timeEl.textContent = time.substring(11, 16) || '--:--';
                }
                
                updateWeatherEffects(weatherLive.weather);
            }

            currentWeatherData = data;
            hideWeatherLoading();
            showWeatherPanel();
            
            log('天气显示已更新:', {
                location: displayLocation,
                weather: weatherLive?.weather,
                temp: weatherLive?.temperature
            });
        }

        async function fetchWeatherData(lat, lon) {
            if (isWeatherLoading) {
                log('天气请求正在进行中，跳过');
                return;
            }

            isWeatherLoading = true;
            showWeatherLoading();
            
            log('请求天气数据:', { lat, lon });

            try {
                const url = `/api/weather?lat=${lat}&lon=${lon}`;
                log('请求 URL:', url);
                
                const response = await fetch(url);
                log('响应状态:', response.status);
                
                if (!response.ok) {
                    throw new Error(`API 请求失败 (状态: ${response.status})`);
                }
                
                const data = await response.json();
                log('天气 API 响应:', data.success, data.message);
                
                if (data.success && data.location) {
                    if (hasLocationChanged(data.location)) {
                        log('位置已变化，更新天气显示');
                        updateLastLocation(data.location);
                        updateWeatherDisplay(data);
                    } else {
                        log('位置未变化，跳过天气更新');
                        hideWeatherLoading();
                    }
                } else {
                    log('天气数据获取失败或无位置信息');
                    hideWeatherLoading();
                }

            } catch (error) {
                log('获取天气失败:', error);
                hideWeatherLoading();
            } finally {
                isWeatherLoading = false;
            }
        }

        function handleWeatherMapMove() {
            if (!map) return;

            const zoom = map.getZoom();
            log('handleWeatherMapMove - 缩放级别:', zoom.toFixed(2));

            if (zoom <= WEATHER_MIN_ZOOM) {
                log('缩放级别 <= 12，隐藏天气面板');
                hideWeatherPanel();
                return;
            }

            if (weatherDebounceTimer) {
                clearTimeout(weatherDebounceTimer);
            }

            weatherDebounceTimer = setTimeout(() => {
                const center = map.getCenter();
                log('防抖延迟结束，获取天气数据:', {
                    lat: center.lat.toFixed(4),
                    lon: center.lng.toFixed(4)
                });
                fetchWeatherData(center.lat, center.lng);
            }, WEATHER_DEBOUNCE_DELAY);
            
            log(`已设置天气防抖定时器 (${WEATHER_DEBOUNCE_DELAY}ms)`);
        }

        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        async function loadScenicSpots(lat, lon, radius, options = {}) {
            log('='.repeat(40));
            log('加载景点数据');
            log('='.repeat(40));
            log('参数:');
            log('  - 纬度:', lat);
            log('  - 经度:', lon);
            log('  - 半径:', radius, '公里');
            
            currentRadius = radius;
            if (!options.silent) showLoading();
            
            try {
                const url = `/api/scenic_spots?lat=${lat}&lon=${lon}&radius=${radius}`;
                log('请求 URL:', url);
                
                const response = await fetch(url);
                log('响应状态:', response.status);
                
                if (!response.ok) {
                    log('✗ API 请求失败, 状态:', response.status);
                    throw new Error(`API 请求失败 (状态: ${response.status})`);
                }
                
                const data = await response.json();
                log('✓ API 响应:');
                log('  - 总数:', data.total);
                log('  - 景点列表:', data.spots ? data.spots.map(s => s.name) : '无数据');
                
                spotData = data.spots || [];
                if (!scenicLayerVisible) {
                    clearMarkers();
                    return;
                }
                clearMarkers();
                
                if (spotData.length > 0) {
                    log('开始添加标记...');
                    const bounds = map.getBounds();
                    let visibleCount = 0;
                    
                    spotData.forEach((spot, index) => {
                        log(`  [${index + 1}] ${spot.name} - (${spot.lat}, ${spot.lon}) - 距离: ${spot.distance} km`);
                        
                        if (bounds) {
                            const lngLat = new maplibregl.LngLat(spot.lon, spot.lat);
                            if (bounds.contains(lngLat)) {
                                addMarker(spot);
                                visibleCount++;
                            }
                        } else {
                            addMarker(spot);
                            visibleCount++;
                        }
                    });
                    
                    log(`✓ 共添加 ${visibleCount} 个可见标记 (总共有 ${spotData.length} 个景点)`);
                    setMapStatus(`已加载 ${spotData.length} 个景点`, 'ok');
                } else {
                    log('当前区域没有找到景点');
                    setMapStatus('当前区域无景点', 'warning');
                }
            } catch (error) {
                log('✗ 加载景点失败:', error);
                if (!options.silent) showError('加载景点失败: ' + error.message);
            } finally {
                if (!options.silent) hideLoading();
                updateDebugPanel();
            }
        }

        function getScenicIconSvg() {
            return `
                <svg class="scenic-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 18.5h16l-4.65-6.2-3.1 4.05-2.4-3.05L4 18.5Z" fill="currentColor" opacity=".96"/>
                    <path d="M14.8 6.25a2.05 2.05 0 1 0 4.1 0 2.05 2.05 0 0 0-4.1 0Z" fill="#fde68a"/>
                    <path d="M6 18.5h12" stroke="white" stroke-width="1.3" stroke-linecap="round" opacity=".65"/>
                </svg>
            `;
        }

        let activeSpotPopup = null;

        function buildSpotPopupContent(spot) {
            const safeName = escapeHtml(spot.name || '未知景点');
            const safeImage = escapeHtml(spot.image || '');
            const safeRating = escapeHtml(spot.rating || '暂无评分');
            const safeDistance = spot.distance !== undefined ? escapeHtml(spot.distance) : '未知';
            const panoramaName = JSON.stringify(spot.name || '未知景点');
            return `
                <div class="popup-content">
                    ${safeImage ? `<img src="${safeImage}" alt="${safeName}" />` : ''}
                    <h3>${safeName}</h3>
                    <div class="rating">
                        <span class="star">★</span>
                        <span>${safeRating}</span>
                        <span style="color: #6b7280;">/ 5.0</span>
                    </div>
                    <div class="distance">距离: ${safeDistance} 公里</div>
                    <div class="spot-topics-section">
                        <div class="spot-topics-title">附近实时话题</div>
                        ${renderSpotTopics(spot)}
                    </div>
                    <button class="view-btn" onclick="openPanorama(${spot.lat}, ${spot.lon}, ${panoramaName})">
                        查看 360° 全景
                    </button>
                </div>
            `;
        }

        function openSpotPopup(spot) {
            if (!map || !spot || !scenicLayerVisible) return;
            if (activeSpotPopup) {
                activeSpotPopup.remove();
            }
            activeSpotPopup = new maplibregl.Popup({
                offset: 28,
                closeButton: true,
                closeOnClick: true
            })
                .setLngLat([spot.lon, spot.lat])
                .setHTML(buildSpotPopupContent(spot))
                .addTo(map);
            map.easeTo({ center: [spot.lon, spot.lat], duration: 350, essential: true });
        }

        function openNearestSpotPopup(lngLat, maxDistanceMeters = 650) {
            if (!scenicLayerVisible || !spotData || spotData.length === 0) return false;
            let nearest = null;
            let minDistance = Infinity;
            for (const spot of spotData) {
                const distance = getDistanceMeters(lngLat.lat, lngLat.lng, spot.lat, spot.lon);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearest = spot;
                }
            }
            if (nearest && minDistance <= maxDistanceMeters) {
                openSpotPopup(nearest);
                log('点击地图后打开最近景点:', nearest.name, Math.round(minDistance), 'm');
                return true;
            }
            return false;
        }

        async function openNearestOrFetchSpotPopup(lngLat, maxDistanceMeters = 650) {
            if (!scenicLayerVisible) return false;
            if (openNearestSpotPopup(lngLat, maxDistanceMeters)) return true;
            try {
                const response = await fetch(`/api/scenic_spots?lat=${lngLat.lat}&lon=${lngLat.lng}&radius=1`);
                if (!response.ok) return false;
                const data = await response.json();
                const spots = data.spots || [];
                if (!spots.length) return false;
                spotData = [...spots, ...spotData.filter(existing => !spots.some(spot => spot.name === existing.name))];
                const nearest = spots[0];
                addMarker(nearest);
                openSpotPopup(nearest);
                log('点击底图后按当前位置加载并打开景点:', nearest.name);
                return true;
            } catch (error) {
                log('点击底图加载景点失败:', error);
                return false;
            }
        }

        function addMarker(spot) {
            const el = document.createElement('div');
            el.className = 'marker';
            
            const markerIcon = document.createElement('div');
            markerIcon.className = 'marker-icon';
            markerIcon.innerHTML = `<span class="inner">${getScenicIconSvg()}</span>`;
            el.appendChild(markerIcon);
            
            const marker = new maplibregl.Marker(el)
                .setLngLat([spot.lon, spot.lat])
                .addTo(map);

            el.addEventListener('click', (event) => {
                event.stopPropagation();
                openSpotPopup(spot);
            });
            
            markers.push(marker);
            log('标记已添加到地图:', spot.name);
            updateDebugPanel();
        }

        function clearMarkers() {
            log('清除标记, 当前数量:', markers.length);
            markers.forEach(marker => marker.remove());
            markers = [];
            updateDebugPanel();
        }

        let pannellumLoadingPromise = null;

        function loadExternalAsset(tagName, attributes) {
            return new Promise((resolve, reject) => {
                const selector = attributes.href ? `${tagName}[href="${attributes.href}"]` : `${tagName}[src="${attributes.src}"]`;
                const existing = document.querySelector(selector);
                if (existing) {
                    resolve();
                    return;
                }

                const element = document.createElement(tagName);
                Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
                element.onload = resolve;
                element.onerror = reject;
                document.head.appendChild(element);
            });
        }

        async function ensurePannellumLoaded() {
            if (window.pannellum) return;
            if (!pannellumLoadingPromise) {
                pannellumLoadingPromise = Promise.all([
                    loadExternalAsset('link', { rel: 'stylesheet', href: 'https://cdn.pannellum.org/2.5/pannellum.css' }),
                    loadExternalAsset('script', { src: 'https://cdn.pannellum.org/2.5/pannellum.js' })
                ]);
            }
            await pannellumLoadingPromise;
        }

        async function openPanorama(lat, lon, name) {
            log('打开全景:', name, '坐标:', lat, lon);
            const modal = document.getElementById('panoramaModal');
            modal.classList.add('show');
            await ensurePannellumLoaded();
            
            if (currentPanorama) {
                currentPanorama.destroy();
            }
            
            currentPanorama = pannellum.viewer('panorama', {
                type: 'equirectangular',
                panorama: `https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=${generatePanoid(lat, lon)}&cb_client=search.revgeo&w=600&h=300&yaw=270&pitch=0&thumbfov=100`,
                autoLoad: true,
                showControls: true,
                compass: true,
                title: name,
                author: '3D Map',
                hotspotDebug: false
            });
        }

        function generatePanoid(lat, lon) {
            return btoa(`${lat.toFixed(4)},${lon.toFixed(4)}`).replace(/=/g, '');
        }

        function closePanorama() {
            log('关闭全景');
            const modal = document.getElementById('panoramaModal');
            modal.classList.remove('show');
            
            if (currentPanorama) {
                currentPanorama.destroy();
                currentPanorama = null;
            }
        }

        function showLoading() {
            document.getElementById('loadingOverlay').classList.add('show');
        }

        function hideLoading() {
            document.getElementById('loadingOverlay').classList.remove('show');
        }

        function toggleScenicLayer(checked) {
            scenicLayerVisible = checked;
            log('景点图层:', checked ? '开启' : '关闭');
            if (checked) {
                handleMapMoveEnd();
            } else {
                clearMarkers();
                if (activeSpotPopup) {
                    activeSpotPopup.remove();
                    activeSpotPopup = null;
                }
            }
            updateDebugPanel();
        }

        function setFogVisible(visible) {
            const fogLayer = document.getElementById('fogLayer');
            if (!fogLayer) return;
            fogLayer.classList.toggle('show', visible);
            fogLayer.classList.toggle('hidden', !visible);
        }

        function toggleTopicLayer(checked) {
            isExploreMode = checked;
            setFogVisible(checked);
            log('实时话题图层:', checked ? '开启' : '关闭');
            const createTopicBtn = document.getElementById('createTopicBtn');
            const zoomHintTopics = document.getElementById('zoomHintTopics');
            if (checked) {
                createTopicBtn.classList.add('show');
                loadTopics();
            } else {
                createTopicBtn.classList.remove('show');
                zoomHintTopics.classList.remove('show');
                clearTopicMarkers();
                clearBeaconMarkers();
            }
            updateDebugPanel();
        }

        function toggleExploreMode() {
            const checkbox = document.getElementById('topicLayerCheckbox');
            const nextValue = !isExploreMode;
            if (checkbox) checkbox.checked = nextValue;
            toggleTopicLayer(nextValue);
        }

        function getAgeCategoryLabel(category) {
            switch (category) {
                case 'today': return '今天';
                case 'three_days': return '近3天';
                case 'seven_days': return '近7天';
                default: return '较早';
            }
        }

        function getBubbleClassByAge(category) {
            switch (category) {
                case 'today': return 'today';
                case 'three_days': return 'three-days';
                case 'seven_days': return 'seven-days';
                default: return '';
            }
        }

        function getDistanceMeters(lat1, lon1, lat2, lon2) {
            const radius = 6371000;
            const toRad = value => value * Math.PI / 180;
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
            return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        function findNearestSpot(lat, lon, maxDistance = 500) {
            let nearest = null;
            let nearestDistance = Infinity;

            spotData.forEach(spot => {
                const distance = getDistanceMeters(lat, lon, spot.lat, spot.lon);
                if (distance < nearestDistance) {
                    nearest = spot;
                    nearestDistance = distance;
                }
            });

            if (!nearest || nearestDistance > maxDistance) return null;
            return { spot: nearest, distance: nearestDistance };
        }

        function getNearbyTopicsForSpot(spot, maxDistance = 800, limit = 5) {
            return topicData
                .map(topic => ({ ...topic, spotDistance: getDistanceMeters(spot.lat, spot.lon, topic.lat, topic.lon) }))
                .filter(topic => topic.spotDistance <= maxDistance)
                .sort((a, b) => (b.likes + b.comments * 2) - (a.likes + a.comments * 2))
                .slice(0, limit);
        }

        function renderSpotTopics(spot) {
            const nearbyTopics = getNearbyTopicsForSpot(spot);
            if (!nearbyTopics.length) {
                return '<div class="spot-topic-empty">附近暂无实时话题</div>';
            }

            return nearbyTopics.map(topic => `
                <div class="spot-topic-item">
                    <div class="spot-topic-text">${escapeHtml(topic.content.length > 28 ? topic.content.substring(0, 28) + '...' : topic.content)}</div>
                    <div class="spot-topic-meta">${escapeHtml(topic.user_name)} · ${Math.round(topic.spotDistance)}m · ❤️ ${topic.likes}</div>
                </div>
            `).join('');
        }

        function formatDate(dateStr) {
            try {
                const date = new Date(dateStr);
                const now = new Date();
                const diff = now - date;
                const minutes = Math.floor(diff / 60000);
                const hours = Math.floor(diff / 3600000);
                const days = Math.floor(diff / 86400000);
                
                if (minutes < 60) {
                    return `${minutes}分钟前`;
                } else if (hours < 24) {
                    return `${hours}小时前`;
                } else if (days < 7) {
                    return `${days}天前`;
                } else {
                    return date.toLocaleDateString('zh-CN');
                }
            } catch (e) {
                return dateStr;
            }
        }

        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function renderTopicReplies(topic) {
            const replies = topic.replies || [];
            if (!replies.length) {
                return '<div class="topic-reply-empty">还没有回复，来抢沙发</div>';
            }
            const collapsed = replies.length > 3;
            const visibleReplies = collapsed ? replies.slice(0, 3) : replies;
            return `
                <div id="topicReplies-${topic.id}" class="topic-replies ${collapsed ? 'collapsed' : ''}">
                    ${visibleReplies.map(reply => `
                        <div class="topic-reply-item">
                            <span class="topic-reply-name">${escapeHtml(reply.user_name)}</span>
                            <span class="topic-reply-content">${escapeHtml(reply.content)}</span>
                        </div>
                    `).join('')}
                    ${collapsed ? `<button class="topic-replies-toggle" onclick="toggleTopicReplies('${topic.id}')">展开全部 ${replies.length} 条回复</button>` : ''}
                    <template id="topicRepliesAll-${topic.id}">
                        ${replies.map(reply => `
                            <div class="topic-reply-item">
                                <span class="topic-reply-name">${escapeHtml(reply.user_name)}</span>
                                <span class="topic-reply-content">${escapeHtml(reply.content)}</span>
                            </div>
                        `).join('')}
                        <button class="topic-replies-toggle" onclick="toggleTopicReplies('${topic.id}', true)">收起回复</button>
                    </template>
                </div>
            `;
        }

        function buildTopicPopupContent(topic) {
            return `
                <div class="topic-popup moments-card">
                    <div class="topic-header moments-header">
                        <div class="user-avatar">${escapeHtml(topic.user_name.charAt(0).toUpperCase())}</div>
                        <div class="user-info">
                            <div class="user-name">${escapeHtml(topic.user_name)}</div>
                            <div class="time-info">${formatDate(topic.created_at)} · ${Math.round(topic.distance)}m · 热度 ${Number(topic.score || 0).toFixed(2)}</div>
                        </div>
                    </div>
                    <div class="topic-content moments-content">${escapeHtml(topic.content).replace(/\n/g, '<br>')}</div>
                    ${topic.scenic_spot_name ? `<div class="topic-spot-tag">关联景点：${escapeHtml(topic.scenic_spot_name)} · ${Math.round(topic.scenic_spot_distance_m || 0)}m</div>` : ''}
                    <div class="topic-actions-row">
                        <button class="moment-action-btn" onclick="likeTopic('${topic.id}')">赞 ${topic.likes}</button>
                        <span class="moment-action-count">回复 ${topic.comments || 0}</span>
                        <span class="moment-action-count">浏览 ${topic.clicks || 0}</span>
                    </div>
                    <div class="topic-replies-wrap">
                        ${renderTopicReplies(topic)}
                    </div>
                    <div class="topic-reply-form">
                        <input id="topicReplyInput-${topic.id}" class="topic-reply-input" type="text" maxlength="500" placeholder="回复 ${escapeHtml(topic.user_name)}..." />
                        <button class="topic-reply-submit" onclick="submitTopicReply('${topic.id}')">发送</button>
                    </div>
                </div>
            `;
        }

        function getTopicIconSvg() {
            return `
                <svg class="topic-icon-svg" viewBox="0 0 32 32" aria-hidden="true">
                    <path class="topic-icon-bubble" d="M6.2 7.5c0-2.15 1.75-3.9 3.9-3.9h11.8c2.15 0 3.9 1.75 3.9 3.9v8.35c0 2.15-1.75 3.9-3.9 3.9h-4.45l-6.2 5.15c-.78.65-1.94-.05-1.72-1.04l.9-4.11h-.33c-2.15 0-3.9-1.75-3.9-3.9V7.5Z"/>
                    <path class="topic-icon-bolt" d="M15.25 7.6h4.9l-3.05 5.2h3.2l-6.2 8.35 1.35-5.95h-3.5l3.3-7.6Z"/>
                    <circle class="topic-icon-dot" cx="10.9" cy="12.1" r="1.25"/>
                </svg>
            `;
        }

        function addTopicMarker(topic) {
            const el = document.createElement('div');
            el.className = 'topic-marker';
            
            const bubbleClass = getBubbleClassByAge(topic.age_category);
            const isHeatPoint = map && map.getZoom() <= TOPICS_BUBBLE_MIN_ZOOM;
            const bubble = document.createElement('div');
            bubble.className = `topic-bubble ${bubbleClass}${isHeatPoint ? ' heat-point' : ''} ${topic.freshness || 'active'}`;
            bubble.style.opacity = topic.opacity;
            bubble.style.transform = `translateY(-${Math.round(topic.height || 0)}px) scale(${topic.radius || 1})`;
            el.style.setProperty('--topic-height', `${Math.round(topic.height || 0)}px`);
            
            const displayContent = topic.content.length > 18
                ? `${topic.content.substring(0, 18)}...`
                : topic.content;

            if (isHeatPoint) {
                bubble.innerHTML = `<span class="topic-icon-core">${getTopicIconSvg()}</span><span class="topic-text topic-text-auto">${escapeHtml(displayContent)}</span>`;
            } else {
                bubble.innerHTML = `<span class="topic-icon-core">${getTopicIconSvg()}</span><span class="topic-text">${escapeHtml(displayContent)}</span>`;
            }
            
            el.appendChild(bubble);
            
            const popupContent = buildTopicPopupContent(topic);
            
            const popup = new maplibregl.Popup({
                offset: 35,
                closeButton: true,
                closeOnClick: true
            }).setHTML(popupContent);
            
            const marker = new maplibregl.Marker(el)
                .setLngLat([topic.lon, topic.lat])
                .setPopup(popup)
                .addTo(map);

            marker.getElement().classList.add('topic-marker-layer');
            popup.on('open', () => {
                const popupElement = popup.getElement();
                if (popupElement) popupElement.classList.add('topic-popup-layer');
            });

            el.addEventListener('click', () => recordTopicClick(topic.id), { once: true });

            if (topicMarkers.length < 3) {
                setTimeout(() => {
                    if (map && marker.getElement().isConnected && !marker.getPopup().isOpen()) {
                        marker.togglePopup();
                    }
                }, 180 + topicMarkers.length * 120);
            }
            
            topicMarkers.push(marker);
            log('话题标记已添加:', topic.user_name, '- 距离:', Math.round(topic.distance), 'm, 透明度:', topic.opacity);
        }

        function clearTopicMarkers() {
            log('清除话题标记, 当前数量:', topicMarkers.length);
            topicMarkers.forEach(marker => marker.remove());
            topicMarkers = [];
        }

        function clearBeaconMarkers() {
            beaconMarkers.forEach(marker => marker.remove());
            beaconMarkers = [];
        }

        function addBeaconMarker(beacon) {
            const el = document.createElement('div');
            el.className = 'beacon-marker';
            el.innerHTML = '<div class="beacon-beam"></div><div class="beacon-core"></div>';

            const popup = new maplibregl.Popup({ offset: 28, closeButton: true, closeOnClick: true })
                .setHTML(`
                    <div class="beacon-popup">
                        <div class="beacon-title">迷雾灯塔</div>
                        <div>热度：${Number(beacon.score_sum || 0).toFixed(2)} · 话题 ${beacon.topic_count}</div>
                        <div class="beacon-preview">${escapeHtml(beacon.preview || '附近有高热度话题')}</div>
                        <div class="beacon-hint">前往该区域可解锁完整内容</div>
                    </div>
                `);

            const marker = new maplibregl.Marker(el)
                .setLngLat([beacon.lon, beacon.lat])
                .setPopup(popup)
                .addTo(map);
            beaconMarkers.push(marker);
        }

        async function loadBeacons() {
            if (!map || !isExploreMode) return;
            const bounds = map.getBounds();
            if (!bounds) return;
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            try {
                const response = await fetch(`/api/topics/beacons?sw_lat=${sw.lat}&sw_lon=${sw.lng}&ne_lat=${ne.lat}&ne_lon=${ne.lng}`);
                if (!response.ok) return;
                const data = await response.json();
                clearBeaconMarkers();
                (data.beacons || []).forEach(addBeaconMarker);
            } catch (error) {
                log('加载灯塔失败:', error);
            }
        }

        async function loadTopics() {
            if (!isExploreMode) {
                log('探索模式未开启，跳过话题加载');
                return;
            }
            
            if (!map) {
                log('地图未初始化，无法加载话题');
                return;
            }
            
            const zoom = map.getZoom();
            if (zoom <= TOPICS_HEAT_MIN_ZOOM) {
                log(`缩放级别 ${zoom.toFixed(2)} <= ${TOPICS_HEAT_MIN_ZOOM}，隐藏话题并加载灯塔`);
                clearTopicMarkers();
                loadBeacons();
                return;
            }
            
            const center = map.getCenter();
            const bounds = map.getBounds();
            
            if (!bounds) {
                log('无法获取地图边界');
                return;
            }
            
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            
            log('加载话题数据:');
            log('  - 中心点:', center.lat.toFixed(4), center.lng.toFixed(4));
            log('  - 视口: SW(', sw.lat.toFixed(4), sw.lng.toFixed(4), ') - NE(', ne.lat.toFixed(4), ne.lng.toFixed(4), ')');
            log('  - 缩放级别:', zoom.toFixed(2));
            
            try {
                const url = `/api/topics?center_lat=${center.lat}&center_lon=${center.lng}&sw_lat=${sw.lat}&sw_lon=${sw.lng}&ne_lat=${ne.lat}&ne_lon=${ne.lng}`;
                log('请求 URL:', url);
                
                const response = await fetch(url);
                log('响应状态:', response.status);
                
                if (!response.ok) {
                    log('✗ 话题 API 请求失败');
                    return;
                }
                
                const data = await response.json();
                log('✓ 话题 API 响应:');
                log('  - 总数:', data.total);
                clearBeaconMarkers();
                
                topicData = (data.topics || []).map(topic => {
                    if (topic.scenic_spot_name) return topic;
                    const linkedSpot = findNearestSpot(topic.lat, topic.lon, 500);
                    if (!linkedSpot) return topic;
                    return {
                        ...topic,
                        scenic_spot_name: linkedSpot.spot.name,
                        scenic_spot_distance_m: linkedSpot.distance
                    };
                });
                clearTopicMarkers();
                
                if (topicData.length > 0) {
                    log('开始添加话题标记...');
                    topicData.forEach((topic, index) => {
                        log(`  [${index + 1}] ${topic.user_name}: ${topic.content.substring(0, 20)}... - 距离: ${Math.round(topic.distance)}m, 分类: ${topic.age_category}, 透明度: ${topic.opacity}`);
                        addTopicMarker(topic);
                    });
                    
                    log(`✓ 共添加 ${topicMarkers.length} 个话题标记`);
                    setMapStatus(`已加载 ${topicData.length} 个话题`, 'ok');
                } else {
                    log('当前区域没有找到话题');
                    setMapStatus('当前区域无话题', 'warning');
                }
            } catch (error) {
                log('✗ 加载话题失败:', error);
            }
        }

        function handleTopicsMapMove() {
            if (!isExploreMode) return;
            
            const zoom = map.getZoom();
            const zoomHintTopics = document.getElementById('zoomHintTopics');
            
            if (zoom <= TOPICS_HEAT_MIN_ZOOM) {
                clearTopicMarkers();
                loadBeacons();
                log('缩放级别过低，清除话题标记并加载迷雾灯塔');
            } else {
                zoomHintTopics.classList.remove('show');
                
                if (topicsDebounceTimer) {
                    clearTimeout(topicsDebounceTimer);
                }
                
                topicsDebounceTimer = setTimeout(() => {
                    log('防抖延迟结束，加载话题数据');
                    loadTopics();
                }, TOPICS_DEBOUNCE_DELAY);
                
                log(`已设置话题防抖定时器 (${TOPICS_DEBOUNCE_DELAY}ms)`);
            }
        }

        async function recordTopicClick(topicId) {
            try {
                await fetch(`/api/topics/${topicId}/click`, { method: 'POST' });
            } catch (error) {
                log('话题点击计数失败:', error);
            }
        }

        async function likeTopic(topicId) {
            log('点赞话题:', topicId);
            
            try {
                const response = await fetch(`/api/topics/${topicId}/like`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    log('点赞成功，当前点赞数:', data.likes);
                    showToast('点赞成功！');
                    loadTopics();
                } else {
                    log('点赞失败');
                    showToast('点赞失败，请稍后重试');
                }
            } catch (error) {
                log('点赞出错:', error);
                showToast('点赞失败，请稍后重试');
            }
        }

        function toggleTopicReplies(topicId, collapse = false) {
            const container = document.getElementById(`topicReplies-${topicId}`);
            const template = document.getElementById(`topicRepliesAll-${topicId}`);
            if (!container || !template) return;
            if (collapse) {
                loadTopics();
                return;
            }
            container.innerHTML = template.innerHTML;
            container.classList.remove('collapsed');
        }

        async function submitTopicReply(topicId) {
            const input = document.getElementById(`topicReplyInput-${topicId}`);
            if (!input) return;
            const content = input.value.trim();
            if (!content) {
                showToast('请输入回复内容');
                return;
            }
            const headers = { 'Content-Type': 'application/json' };
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
            const body = { content };
            if (!authUser) {
                const name = prompt('请输入您的昵称');
                if (!name || !name.trim()) return;
                body.user_name = name.trim();
            }
            try {
                const response = await fetch(`/api/topics/${topicId}/replies`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body)
                });
                if (!response.ok) {
                    showToast('回复失败，请稍后重试');
                    return;
                }
                input.value = '';
                showToast('回复成功');
                loadTopics();
            } catch (error) {
                log('回复话题失败:', error);
                showToast('回复失败，请稍后重试');
            }
        }

        function openCreateTopicModal() {
            if (!map) return;

            const center = map.getCenter();
            const coordsEl = document.getElementById('topicLocationCoords');
            coordsEl.textContent = `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;

            const userNameGroup = document.getElementById('topicUserNameGroup');
            const userNameInput = document.getElementById('topicUserName');
            if (authUser) {
                userNameGroup.style.display = 'none';
                userNameInput.value = authUser.nickname;
            } else {
                userNameGroup.style.display = 'block';
                userNameInput.value = '';
            }

            document.getElementById('topicContent').value = '';
            const modal = document.getElementById('createTopicModal');
            modal.classList.add('show');
        }

        function closeCreateTopicModal() {
            const modal = document.getElementById('createTopicModal');
            modal.classList.remove('show');
        }

        async function submitTopic() {
            const userNameInput = document.getElementById('topicUserName');
            const content = document.getElementById('topicContent').value.trim();
            const submitBtn = document.getElementById('submitTopicBtn');

            if (!authUser) {
                if (!userNameInput.value.trim()) {
                    showToast('请输入您的昵称');
                    return;
                }
            }

            if (!content) {
                showToast('请输入话题内容');
                return;
            }

            if (!map) {
                showToast('地图未初始化');
                return;
            }

            const center = map.getCenter();
            const linkedSpot = findNearestSpot(center.lat, center.lng, 500);

            submitBtn.disabled = true;
            submitBtn.textContent = '发布中...';

            try {
                const headers = { 'Content-Type': 'application/json' };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }

                const body = {
                    content: content,
                    lat: center.lat,
                    lon: center.lng,
                    scenic_spot_name: linkedSpot ? linkedSpot.spot.name : null,
                    scenic_spot_distance_m: linkedSpot ? linkedSpot.distance : null
                };
                if (!authUser) {
                    body.user_name = userNameInput.value.trim();
                }

                const response = await fetch('/api/topics', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(body)
                });
                
                submitBtn.disabled = false;
                submitBtn.textContent = '发布话题';
                
                if (response.ok) {
                    const data = await response.json();
                    log('话题发布成功:', data.topic_id);
                    showToast('话题发布成功！');
                    closeCreateTopicModal();
                    loadTopics();
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    log('话题发布失败:', errorData);
                    showToast('发布失败，请稍后重试');
                }
            } catch (error) {
                submitBtn.disabled = false;
                submitBtn.textContent = '发布话题';
                log('话题发布出错:', error);
                showToast('发布失败，请稍后重试');
            }
        }

        function showToast(message) {
            const toast = document.getElementById('errorToast');
            toast.textContent = message;
            toast.style.background = 'rgba(67, 233, 123, 0.9)';
            toast.classList.add('show');
            
            setTimeout(() => {
                toast.classList.remove('show');
                toast.style.background = 'rgba(239, 68, 68, 0.9)';
            }, 3000);
        }

        window.openPanorama = openPanorama;
        window.closePanorama = closePanorama;
        window.toggleDebug = toggleDebug;
        window.toggleViewMode = toggleViewMode;
        window.setPitch = setPitch;
        window.setBearing = setBearing;
        window.rotateView = rotateView;
        window.toggleExploreMode = toggleExploreMode;
        window.toggleScenicLayer = toggleScenicLayer;
        window.toggleTopicLayer = toggleTopicLayer;
        window.openCreateTopicModal = openCreateTopicModal;
        window.closeCreateTopicModal = closeCreateTopicModal;
        window.submitTopic = submitTopic;
        window.likeTopic = likeTopic;
        window.toggleAuthModal = toggleAuthModal;
        window.closeAuthModal = closeAuthModal;
        window.toggleAuthMode = toggleAuthMode;
        window.submitAuth = submitAuth;

        log('页面加载完成，开始初始化地图...');

        if (debugMode) {
            document.getElementById('debugPanel').style.display = 'block';
            document.getElementById('toggleDebugBtn').textContent = '🔧 隐藏调试';
        }

        initAuth();
        log('认证状态已初始化:', authUser ? `已登录 (${authUser.nickname})` : '未登录');

        initMap();
