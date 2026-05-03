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
                
                map = new maplibregl.Map({
                    container: 'map',
                    style: style,
                    center: SHANGHAI_CENTER,
                    zoom: 12,
                    maxZoom: MAP_MAX_ZOOM,
                    pitch: 0,
                    bearing: 0,
                    failIfMajorPerformanceCaveat: false,
                    preserveDrawingBuffer: false
                });

                map.addControl(new maplibregl.NavigationControl(), 'top-right');
                log('✓ 添加导航控件');
                
                map.addControl(new maplibregl.GeolocateControl({
                    positionOptions: { enableHighAccuracy: true },
                    trackUserLocation: true
                }), 'top-right');
                log('✓ 添加定位控件');
                
                map.addControl(new maplibregl.FullscreenControl(), 'top-right');
                log('✓ 添加全屏控件');
                
                map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
                log('✓ 添加比例尺控件');

                map.on('load', () => {
                    log('✓ 地图加载完成!');
                    log('  - 当前缩放:', map.getZoom());
                    log('  - 当前中心:', map.getCenter());
                    setMapStatus('已加载', 'ok');
                    updateDebugPanel();
                    setTimeout(() => {
                        handleMapMoveEnd();
                        handleWeatherMapMove();
                        handleTopicsMapMove();
                    }, 800);
                    
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
                    
                    if (activeMapSource === 'maptiler') {
                        log('尝试切换到 OpenStreetMap 备用地图...');
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
                    } else {
                        setMapStatus('地图错误', 'error');
                        showError('地图加载出错: ' + (e.error ? e.error.message : '未知错误'));
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

        function handleMapMoveEnd() {
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
                
                loadScenicSpots(center.lat, center.lng, radius);
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

        async function loadScenicSpots(lat, lon, radius) {
            log('='.repeat(40));
            log('加载景点数据');
            log('='.repeat(40));
            log('参数:');
            log('  - 纬度:', lat);
            log('  - 经度:', lon);
            log('  - 半径:', radius, '公里');
            
            currentRadius = radius;
            showLoading();
            
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
                showError('加载景点失败: ' + error.message);
            } finally {
                hideLoading();
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

        function getTopicIconSvg() {
            return `
                <svg class="topic-icon-svg" viewBox="0 0 32 32" aria-hidden="true">
                    <path class="topic-icon-hex" d="M16 2.6 27.6 9.3v13.4L16 29.4 4.4 22.7V9.3L16 2.6Z"/>
                    <path class="topic-icon-chat" d="M10 12.3c0-2.05 1.9-3.7 4.24-3.7h3.52c2.34 0 4.24 1.65 4.24 3.7v2.2c0 2.05-1.9 3.7-4.24 3.7h-1.14l-3.02 2.35c-.46.36-1.15 0-1.08-.57l.22-1.8C11.14 17.65 10 16.22 10 14.5v-2.2Z"/>
                    <circle cx="13.2" cy="13.7" r="1"/>
                    <circle cx="16" cy="13.7" r="1"/>
                    <circle cx="18.8" cy="13.7" r="1"/>
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
            
            const displayContent = isHeatPoint
                ? `${Math.max(1, topic.likes + topic.comments)}`
                : (topic.content.length > 15 
                    ? topic.content.substring(0, 15) + '...' 
                    : topic.content);

            if (isHeatPoint) {
                bubble.innerHTML = `<span class="topic-icon-core">${getTopicIconSvg()}</span><span class="topic-heat-count">${escapeHtml(displayContent)}</span>`;
            } else {
                bubble.innerHTML = `<span class="topic-icon-core">${getTopicIconSvg()}</span><span class="topic-text">${escapeHtml(displayContent)}</span>`;
            }
            
            el.appendChild(bubble);
            
            const popupContent = `
                <div class="topic-popup">
                    <div class="topic-header">
                        <div class="user-avatar">${escapeHtml(topic.user_name.charAt(0).toUpperCase())}</div>
                        <div class="user-info">
                            <div class="user-name">${escapeHtml(topic.user_name)}</div>
                            <div class="time-info">${formatDate(topic.created_at)} · 热度 ${Number(topic.score || 0).toFixed(2)} · ${Math.round(topic.distance)}m</div>
                        </div>
                    </div>
                    <div class="topic-content">${escapeHtml(topic.content).replace(/\n/g, '<br>')}</div>
                    ${topic.scenic_spot_name ? `<div class="topic-spot-tag">关联景点：${escapeHtml(topic.scenic_spot_name)} · ${Math.round(topic.scenic_spot_distance_m || 0)}m</div>` : ''}
                    <div class="topic-stats">
                        <div class="stat-item">❤️ ${topic.likes}</div>
                        <div class="stat-item">💬 ${topic.comments}</div>
                        <div class="stat-item">👁️ ${topic.clicks || 0}</div>
                    </div>
                    <button class="like-btn" onclick="likeTopic('${topic.id}')">
                        ❤️ 点赞
                    </button>
                </div>
            `;
            
            const popup = new maplibregl.Popup({
                offset: 35,
                closeButton: true,
                closeOnClick: true
            }).setHTML(popupContent);
            
            const marker = new maplibregl.Marker(el)
                .setLngLat([topic.lon, topic.lat])
                .setPopup(popup)
                .addTo(map);

            el.addEventListener('click', () => recordTopicClick(topic.id), { once: true });
            
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

        function openCreateTopicModal() {
            if (!map) return;
            
            const center = map.getCenter();
            const coordsEl = document.getElementById('topicLocationCoords');
            coordsEl.textContent = `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
            
            const modal = document.getElementById('createTopicModal');
            modal.classList.add('show');
            
            document.getElementById('topicUserName').value = '';
            document.getElementById('topicContent').value = '';
        }

        function closeCreateTopicModal() {
            const modal = document.getElementById('createTopicModal');
            modal.classList.remove('show');
        }

        async function submitTopic() {
            const userName = document.getElementById('topicUserName').value.trim();
            const content = document.getElementById('topicContent').value.trim();
            const submitBtn = document.getElementById('submitTopicBtn');
            
            if (!userName) {
                showToast('请输入您的昵称');
                return;
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
                const response = await fetch('/api/topics', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        user_name: userName,
                        content: content,
                        lat: center.lat,
                        lon: center.lng,
                        scenic_spot_name: linkedSpot ? linkedSpot.spot.name : null,
                        scenic_spot_distance_m: linkedSpot ? linkedSpot.distance : null
                    })
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

        log('页面加载完成，开始初始化地图...');
        
        if (debugMode) {
            document.getElementById('debugPanel').style.display = 'block';
            document.getElementById('toggleDebugBtn').textContent = '🔧 隐藏调试';
        }
        
        initMap();
