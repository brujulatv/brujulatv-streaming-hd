const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Variables globales
let ffmpegProcess = null;
let streamStatus = 'stopped';
let streamInfo = {
    title: 'BrujulaTV Colombia',
    description: 'Streaming HD desde Colombia',
    viewerCount: 0,
    isLive: false,
    startTime: null
};

// Servir archivos estáticos
app.use('/hls', express.static(path.join(__dirname, 'hls')));

// Ruta principal - Página del canal
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BrujulaTV Colombia - Streaming HD</title>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Arial', sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; 
            min-height: 100vh;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { font-size: 3em; margin-bottom: 10px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); }
        .header p { font-size: 1.2em; opacity: 0.9; }
        .video-container { 
            background: rgba(0,0,0,0.3); 
            border-radius: 15px; 
            padding: 20px; 
            margin-bottom: 30px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        video { 
            width: 100%; 
            max-width: 800px; 
            border-radius: 10px; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        .status { 
            text-align: center; 
            margin: 20px 0; 
            padding: 15px;
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
        }
        .live-indicator { 
            display: inline-block; 
            background: #ff4444; 
            color: white; 
            padding: 5px 15px; 
            border-radius: 20px; 
            font-weight: bold;
            animation: pulse 2s infinite;
        }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        .info-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); 
            gap: 20px; 
            margin-top: 30px;
        }
        .info-card { 
            background: rgba(255,255,255,0.1); 
            padding: 20px; 
            border-radius: 10px; 
            text-align: center;
        }
        .info-card h3 { margin-bottom: 10px; color: #ffd700; }
        .controls { text-align: center; margin: 20px 0; }
        .btn { 
            background: #4CAF50; 
            color: white; 
            border: none; 
            padding: 12px 24px; 
            border-radius: 25px; 
            cursor: pointer; 
            margin: 0 10px;
            font-size: 16px;
            transition: all 0.3s;
        }
        .btn:hover { background: #45a049; transform: translateY(-2px); }
        .btn.stop { background: #f44336; }
        .btn.stop:hover { background: #da190b; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎬 BrujulaTV Colombia</h1>
            <p>Transmisión en vivo desde Colombia</p>
        </div>
        
        <div class="video-container">
            <center>
                <video id="video" controls autoplay muted>
                    Tu navegador no soporta video HTML5.
                </video>
            </center>
        </div>
        
        <div class="status" id="status">
            <div class="live-indicator" id="liveIndicator" style="display: none;">🔴 EN VIVO</div>
            <p id="statusText">Preparando transmisión...</p>
        </div>
        
        <div class="controls">
            <button class="btn" onclick="checkStream()">🔄 Actualizar</button>
            <button class="btn" onclick="toggleFullscreen()">📺 Pantalla Completa</button>
        </div>
        
        <div class="info-grid">
            <div class="info-card">
                <h3>📊 Estado del Stream</h3>
                <p id="streamStatus">Desconectado</p>
            </div>
            <div class="info-card">
                <h3>👥 Espectadores</h3>
                <p id="viewerCount">0</p>
            </div>
            <div class="info-card">
                <h3>⏰ Tiempo en vivo</h3>
                <p id="liveTime">--:--:--</p>
            </div>
            <div class="info-card">
                <h3>🌍 Calidad</h3>
                <p>HD 1080p</p>
            </div>
        </div>
    </div>

    <script>
        const video = document.getElementById('video');
        const statusText = document.getElementById('statusText');
        const liveIndicator = document.getElementById('liveIndicator');
        const streamStatus = document.getElementById('streamStatus');
        
        let hls;
        let checkInterval;
        
        function initPlayer() {
            if (Hls.isSupported()) {
                hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 90
                });
                
                hls.loadSource('/hls/stream.m3u8');
                hls.attachMedia(video);
                
                hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    statusText.textContent = '✅ Stream conectado - Reproduciendo';
                    liveIndicator.style.display = 'inline-block';
                    streamStatus.textContent = 'Conectado';
                });
                
                hls.on(Hls.Events.ERROR, function(event, data) {
                    if (data.fatal) {
                        statusText.textContent = '❌ Error de conexión - Reintentando...';
                        liveIndicator.style.display = 'none';
                        streamStatus.textContent = 'Error';
                        setTimeout(checkStream, 5000);
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = '/hls/stream.m3u8';
            } else {
                statusText.textContent = '❌ Tu navegador no soporta HLS';
            }
        }
        
        function checkStream() {
            fetch('/api/status')
                .then(response => response.json())
                .then(data => {
                    if (data.isLive) {
                        initPlayer();
                        document.getElementById('viewerCount').textContent = data.viewerCount;
                        updateLiveTime(data.startTime);
                    } else {
                        statusText.textContent = '📴 Stream sin señal';
                        liveIndicator.style.display = 'none';
                        streamStatus.textContent = 'Desconectado';
                    }
                })
                .catch(error => {
                    statusText.textContent = '🔄 Buscando señal...';
                    setTimeout(checkStream, 3000);
                });
        }
        
        function updateLiveTime(startTime) {
            if (!startTime) return;
            
            setInterval(() => {
                const now = new Date();
                const start = new Date(startTime);
                const diff = now - start;
                
                const hours = Math.floor(diff / 3600000);
                const minutes = Math.floor((diff % 3600000) / 60000);
                const seconds = Math.floor((diff % 60000) / 1000);
                
                document.getElementById('liveTime').textContent = 
                    \`\${hours.toString().padStart(2, '0')}:\${minutes.toString().padStart(2, '0')}:\${seconds.toString().padStart(2, '0')}\`;
            }, 1000);
        }
        
        function toggleFullscreen() {
            if (video.requestFullscreen) {
                video.requestFullscreen();
            } else if (video.webkitRequestFullscreen) {
                video.webkitRequestFullscreen();
            }
        }
        
        // Inicializar
        checkStream();
        setInterval(checkStream, 10000);
        
        // Simular espectadores
        setInterval(() => {
            const current = parseInt(document.getElementById('viewerCount').textContent);
            const change = Math.floor(Math.random() * 3) - 1;
            const newCount = Math.max(0, current + change);
            document.getElementById('viewerCount').textContent = newCount;
        }, 30000);
    </script>
</body>
</html>
    `);
});

// API para estado del stream
app.get('/api/status', (req, res) => {
    res.json(streamInfo);
});

// API para iniciar stream
app.post('/api/start-stream', (req, res) => {
    if (streamStatus === 'running') {
        return res.json({ success: false, message: 'Stream ya está activo' });
    }
    
    startFFmpegStream();
    res.json({ success: true, message: 'Stream iniciado' });
});

// API para detener stream
app.post('/api/stop-stream', (req, res) => {
    stopFFmpegStream();
    res.json({ success: true, message: 'Stream detenido' });
});

// Función para iniciar FFmpeg
function startFFmpegStream() {
    // Crear directorio HLS si no existe
    const hlsDir = path.join(__dirname, 'hls');
    if (!fs.existsSync(hlsDir)) {
        fs.mkdirSync(hlsDir, { recursive: true });
    }
    
    // Comando FFmpeg optimizado para streaming
    const ffmpegArgs = [
        '-f', 'lavfi',
        '-i', 'testsrc2=size=1920x1080:rate=30',
        '-f', 'lavfi', 
        '-i', 'sine=frequency=1000:sample_rate=48000',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-crf', '23',
        '-maxrate', '4000k',
        '-bufsize', '8000k',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-f', 'hls',
        '-hls_time', '6',
        '-hls_list_size', '10',
        '-hls_flags', 'delete_segments',
        '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts'),
        path.join(hlsDir, 'stream.m3u8')
    ];
    
    ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
    
    ffmpegProcess.stdout.on('data', (data) => {
        console.log(\`FFmpeg stdout: \${data}\`);
    });
    
    ffmpegProcess.stderr.on('data', (data) => {
        console.log(\`FFmpeg stderr: \${data}\`);
    });
    
    ffmpegProcess.on('close', (code) => {
        console.log(\`FFmpeg process exited with code \${code}\`);
        streamStatus = 'stopped';
        streamInfo.isLive = false;
    });
    
    streamStatus = 'running';
    streamInfo.isLive = true;
    streamInfo.startTime = new Date().toISOString();
    
    console.log('✅ Stream iniciado con FFmpeg');
}

// Función para detener FFmpeg
function stopFFmpegStream() {
    if (ffmpegProcess) {
        ffmpegProcess.kill('SIGTERM');
        ffmpegProcess = null;
    }
    
    streamStatus = 'stopped';
    streamInfo.isLive = false;
    streamInfo.startTime = null;
    
    console.log('⏹️ Stream detenido');
}

// Limpiar al cerrar
process.on('SIGINT', () => {
    stopFFmpegStream();
    process.exit(0);
});

process.on('SIGTERM', () => {
    stopFFmpegStream();
    process.exit(0);
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(\`🚀 BrujulaTV Server running on port \${PORT}\`);
    console.log(\`📺 Visit: http://localhost:\${PORT}\`);
    console.log(\`🎬 Stream URL: http://localhost:\${PORT}/hls/stream.m3u8\`);
    
    // Auto-iniciar stream en desarrollo
    if (process.env.NODE_ENV !== 'production') {
        setTimeout(startFFmpegStream, 3000);
    }
});
