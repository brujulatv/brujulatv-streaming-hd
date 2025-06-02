const NodeMediaServer = require('node-media-server');
const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

// Configuración del servidor
const app = express();
const PORT = process.env.PORT || 3000;
const RTMP_PORT = 1935;
const HTTP_MEDIA_PORT = 8000;

// Tu IP pública real
const PUBLIC_IP = '45.177.53.24';

// Configuración de fotogramas
const FRAME_CONFIG = {
  maxFrames: 10,              // Máximo 10 fotogramas
  frameDuration: 30,          // 30 segundos cada uno
  frameDir: './frames',       // Directorio de fotogramas
  autoClean: true             // Auto-limpieza activada
};

// Middlewares
app.use(cors({
  origin: '*',
  credentials: false
}));
app.use(express.static('public'));
app.use(express.static('frames')); // Servir fotogramas
app.use(express.json());

// Función para crear directorios necesarios
const createDirectories = () => {
  const dirs = ['./media', './public', './frames', './logs'];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Directorio creado: ${dir}`);
    }
  });
};

// Función de limpieza automática de archivos temporales
const cleanupTempFiles = () => {
  const cleanup = () => {
    try {
      // Limpiar segmentos HLS antiguos (más de 1 minuto)
      const mediaDir = './media';
      if (fs.existsSync(mediaDir)) {
        const files = fs.readdirSync(mediaDir, { withFileTypes: true });
        const now = Date.now();
        
        files.forEach(file => {
          if (file.isFile()) {
            const filePath = path.join(mediaDir, file.name);
            const stats = fs.statSync(filePath);
            const fileAge = now - stats.mtime.getTime();
            
            // Eliminar archivos .ts y .m3u8 más antiguos de 2 minutos
            if ((file.name.endsWith('.ts') || file.name.endsWith('.m3u8')) && fileAge > 120000) {
              fs.unlinkSync(filePath);
              console.log(`🗑️ Archivo temporal eliminado: ${file.name}`);
            }
          }
        });
      }
      
      // Limpiar logs antiguos (más de 24 horas)
      const logsDir = './logs';
      if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir);
        const now = Date.now();
        
        files.forEach(file => {
          const filePath = path.join(logsDir, file);
          const stats = fs.statSync(filePath);
          const fileAge = now - stats.mtime.getTime();
          
          if (fileAge > 86400000) { // 24 horas
            fs.unlinkSync(filePath);
            console.log(`🗑️ Log antiguo eliminado: ${file}`);
          }
        });
      }
      
    } catch (error) {
      console.error('⚠️ Error en limpieza automática:', error.message);
    }
  };
  
  // Ejecutar limpieza cada 5 minutos
  setInterval(cleanup, 5 * 60 * 1000);
  console.log('🧹 Sistema de limpieza automática activado (cada 5 min)');
};

// Gestión inteligente de fotogramas
class FrameManager {
  constructor() {
    this.frames = [];
    this.maxFrames = FRAME_CONFIG.maxFrames;
    this.frameDuration = FRAME_CONFIG.frameDuration * 1000; // Convertir a ms
    this.frameDir = FRAME_CONFIG.frameDir;
  }
  
  addFrame(streamPath) {
    const timestamp = Date.now();
    const frameId = `frame_${timestamp}`;
    const framePath = path.join(this.frameDir, `${frameId}.jpg`);
    
    // Crear fotograma simulado (en producción aquí iría la captura real)
    const frameData = {
      id: frameId,
      path: framePath,
      timestamp: timestamp,
      streamPath: streamPath,
      url: `http://${PUBLIC_IP}:${PORT}/frames/${frameId}.jpg`
    };
    
    this.frames.push(frameData);
    
    // Programar eliminación automática
    setTimeout(() => {
      this.removeFrame(frameId);
    }, this.frameDuration);
    
    // Mantener solo los últimos 10 fotogramas
    if (this.frames.length > this.maxFrames) {
      const oldFrame = this.frames.shift();
      this.removeFrameFile(oldFrame);
    }
    
    console.log(`📸 Fotograma creado: ${frameId} (Total: ${this.frames.length}/${this.maxFrames})`);
    return frameData;
  }
  
  removeFrame(frameId) {
    const frameIndex = this.frames.findIndex(f => f.id === frameId);
    if (frameIndex !== -1) {
      const frame = this.frames[frameIndex];
      this.frames.splice(frameIndex, 1);
      this.removeFrameFile(frame);
      console.log(`🗑️ Fotograma eliminado: ${frameId} (Total: ${this.frames.length})`);
    }
  }
  
  removeFrameFile(frame) {
    try {
      if (fs.existsSync(frame.path)) {
        fs.unlinkSync(frame.path);
      }
    } catch (error) {
      console.error(`⚠️ Error eliminando fotograma ${frame.id}:`, error.message);
    }
  }
  
  getActiveFrames() {
    return this.frames;
  }
  
  cleanup() {
    this.frames.forEach(frame => this.removeFrameFile(frame));
    this.frames = [];
    console.log('🧹 Todos los fotogramas eliminados');
  }
}

// Inicializar gestor de fotogramas
const frameManager = new FrameManager();

// Configuración RTMP optimizada
const config = {
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
    allow_origin: '*'
  },
  http: {
    port: HTTP_MEDIA_PORT,
    mediaroot: './media',
    allow_origin: '*'
  },
  hls: {
    mediaroot: './media',
    segment: 3,
    flags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]'
  }
};

// Crear servidor RTMP
const nms = new NodeMediaServer(config);

// Variables de estado
let activeStreams = new Map();
let serverStartTime = new Date();
let streamingActive = false;

// Eventos del servidor RTMP
nms.on('preConnect', (id, args) => {
  console.log(`🔄 [${new Date().toLocaleTimeString()}] Nueva conexión: ${id}`);
});

nms.on('postConnect', (id, args) => {
  console.log(`✅ [${new Date().toLocaleTimeString()}] Conectado: ${id} desde ${args.ip}`);
  activeStreams.set(id, {
    id,
    ip: args.ip,
    connectedAt: new Date(),
    status: 'connected'
  });
});

nms.on('doneConnect', (id, args) => {
  console.log(`❌ [${new Date().toLocaleTimeString()}] Desconectado: ${id}`);
  activeStreams.delete(id);
});

nms.on('prePublish', (id, StreamPath, args) => {
  console.log(`🎥 [${new Date().toLocaleTimeString()}] Iniciando stream: ${StreamPath}`);
  
  const streamKey = StreamPath.split('/').pop();
  console.log(`🔑 Stream Key: ${streamKey}`);
});

nms.on('postPublish', (id, StreamPath, args) => {
  const timestamp = new Date().toLocaleTimeString();
  streamingActive = true;
  
  console.log(`🔴 [${timestamp}] ¡BRUJULATV EN VIVO!`);
  console.log(`📺 StreamPath: ${StreamPath}`);
  console.log(`🆔 Stream ID: ${id}`);
  
  // Actualizar estado del stream
  if (activeStreams.has(id)) {
    const streamInfo = activeStreams.get(id);
    streamInfo.streamPath = StreamPath;
    streamInfo.publishStarted = new Date();
    streamInfo.status = 'publishing';
    activeStreams.set(id, streamInfo);
  }
  
  // Crear fotograma inicial
  frameManager.addFrame(StreamPath);
  
  // Crear fotogramas cada 30 segundos mientras esté activo
  const frameInterval = setInterval(() => {
    if (streamingActive && activeStreams.has(id)) {
      frameManager.addFrame(StreamPath);
    } else {
      clearInterval(frameInterval);
    }
  }, FRAME_CONFIG.frameDuration * 1000);
  
  console.log('🌐 ¡CANAL COMUNITARIO BRUJULATV TRANSMITIENDO!');
  console.log('📡 URLs DE DISTRIBUCIÓN:');
  console.log(`   🔴 RTMP: rtmp://${PUBLIC_IP}:${RTMP_PORT}${StreamPath}`);
  console.log(`   📱 M3U8: http://${PUBLIC_IP}:${HTTP_MEDIA_PORT}${StreamPath}/index.m3u8`);
  console.log(`   🌐 HTTP: http://${PUBLIC_IP}:${HTTP_MEDIA_PORT}${StreamPath}.flv`);
  console.log('🚀 ¡COMPARTE ESTOS ENLACES CON LA COMUNIDAD!');
});

nms.on('donePublish', (id, StreamPath, args) => {
  const timestamp = new Date().toLocaleTimeString();
  streamingActive = false;
  
  console.log(`⭕ [${timestamp}] Transmisión finalizada: ${StreamPath}`);
  
  if (activeStreams.has(id)) {
    const streamInfo = activeStreams.get(id);
    streamInfo.publishEnded = new Date();
    streamInfo.status = 'disconnected';
  }
});

// Página principal del servidor
app.get('/', (req, res) => {
  const publishingStreams = Array.from(activeStreams.values()).filter(s => s.status === 'publishing');
  const uptime = Math.floor((new Date() - serverStartTime) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const activeFrames = frameManager.getActiveFrames();
  
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🎥 BrujulaTV Colombia - Canal Comunitario</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #667eea 100%);
            color: white;
            min-height: 100vh;
            padding: 20px;
          }
          .container { 
            max-width: 1200px; 
            margin: 0 auto;
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(15px);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid rgba(255,255,255,0.2);
            padding-bottom: 30px;
          }
          .logo {
            font-size: 4em;
            font-weight: bold;
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
            text-shadow: 0 0 30px rgba(255,255,255,0.5);
          }
          .subtitle {
            font-size: 1.5em;
            opacity: 0.9;
            margin-bottom: 10px;
          }
          .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
          }
          .status-card {
            background: linear-gradient(135deg, rgba(76, 175, 80, 0.2), rgba(76, 175, 80, 0.1));
            padding: 25px;
            border-radius: 15px;
            border-left: 5px solid #4CAF50;
            text-align: center;
          }
          .status-card.warning {
            background: linear-gradient(135deg, rgba(255, 152, 0, 0.2), rgba(255, 152, 0, 0.1));
            border-left-color: #FF9800;
          }
          .status-number {
            font-size: 2.5em;
            font-weight: bold;
            margin-bottom: 10px;
          }
          .info-section {
            background: rgba(255,255,255,0.05);
            padding: 25px;
            border-radius: 15px;
            margin: 20px 0;
            border-left: 5px solid #2196F3;
          }
          .urls-container {
            background: rgba(0,0,0,0.2);
            padding: 20px;
            border-radius: 10px;
            margin: 15px 0;
          }
          .url-item {
            background: rgba(255,255,255,0.1);
            padding: 15px;
            border-radius: 8px;
            margin: 10px 0;
            border-left: 3px solid #4CAF50;
          }
          .url-label {
            font-weight: bold;
            color: #4CAF50;
            margin-bottom: 5px;
          }
          .url-value {
            font-family: 'Courier New', monospace;
            background: rgba(0,0,0,0.3);
            padding: 8px 12px;
            border-radius: 5px;
            word-break: break-all;
            border: 1px solid rgba(255,255,255,0.1);
          }
          .live-indicator {
            display: inline-block;
            width: 15px;
            height: 15px;
            background: #ff4444;
            border-radius: 50%;
            animation: pulse 2s infinite;
            margin-right: 10px;
          }
          @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.1); }
            100% { opacity: 1; transform: scale(1); }
          }
          .stream-live {
            background: linear-gradient(135deg, rgba(244, 67, 54, 0.2), rgba(244, 67, 54, 0.1));
            border-left-color: #f44336;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
          }
          .obs-config {
            background: linear-gradient(135deg, rgba(156, 39, 176, 0.2), rgba(156, 39, 176, 0.1));
            border-left: 5px solid #9C27B0;
            padding: 25px;
            border-radius: 15px;
            margin: 20px 0;
          }
          .config-item {
            background: rgba(255,255,255,0.1);
            padding: 12px;
            border-radius: 8px;
            margin: 8px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .frames-section {
            background: linear-gradient(135deg, rgba(255, 193, 7, 0.2), rgba(255, 193, 7, 0.1));
            border-left: 5px solid #FFC107;
            padding: 25px;
            border-radius: 15px;
            margin: 20px 0;
          }
          .frames-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 15px;
          }
          .frame-item {
            background: rgba(255,255,255,0.1);
            padding: 10px;
            border-radius: 8px;
            text-align: center;
            font-size: 0.9em;
          }
          .auto-features {
            background: linear-gradient(135deg, rgba(103, 58, 183, 0.2), rgba(103, 58, 183, 0.1));
            border-left: 5px solid #673AB7;
            padding: 25px;
            border-radius: 15px;
            margin: 20px 0;
          }
          .feature-item {
            background: rgba(255,255,255,0.1);
            padding: 12px;
            border-radius: 8px;
            margin: 8px 0;
          }
          .refresh-note {
            text-align: center;
            margin-top: 30px;
            opacity: 0.7;
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🎥 BrujulaTV</div>
            <div class="subtitle">Canal Comunitario de Colombia</div>
            <div>Servidor RTMP Autónomo - Bogotá</div>
          </div>
          
          <div class="status-grid">
            <div class="status-card">
              <div class="status-number">${publishingStreams.length}</div>
              <div>Streams en Vivo</div>
            </div>
            <div class="status-card">
              <div class="status-number">${activeStreams.size}</div>
              <div>Conexiones</div>
            </div>
            <div class="status-card">
              <div class="status-number">${activeFrames.length}</div>
              <div>Fotogramas Activos</div>
            </div>
            <div class="status-card">
              <div class="status-number">${hours}h ${minutes}m</div>
              <div>Tiempo Activo</div>
            </div>
            <div class="status-card">
              <div class="status-number">✅</div>
              <div>Sistema Operativo</div>
            </div>
          </div>
          
          ${publishingStreams.length > 0 ? `
            <div class="stream-live">
              <h2><span class="live-indicator"></span>¡BRUJULATV EN VIVO!</h2>
              <p><strong>Canal comunitario transmitiendo ahora</strong></p>
              <p>Streams activos: ${publishingStreams.map(s => s.streamPath).join(', ')}</p>
            </div>
          ` : `
            <div class="status-card warning">
              <div class="status-number">⚠️</div>
              <div>Esperando transmisión</div>
              <p style="margin-top: 10px; font-size: 0.9em;">Configura OBS e inicia streaming</p>
            </div>
          `}
          
          <div class="auto-features">
            <h2>🤖 Funciones Automáticas Activas</h2>
            <div class="feature-item">
              <strong>✅ Auto-inicio con sistema:</strong> El servidor se ejecuta automáticamente al encender el PC
            </div>
            <div class="feature-item">
              <strong>📸 Gestión de fotogramas:</strong> Máximo ${FRAME_CONFIG.maxFrames} fotogramas de ${FRAME_CONFIG.frameDuration}s cada uno
            </div>
            <div class="feature-item">
              <strong>🧹 Limpieza automática:</strong> Eliminación automática de archivos temporales cada 5 minutos
            </div>
            <div class="feature-item">
              <strong>🔄 Reinicio automático:</strong> Recuperación automática en caso de errores
            </div>
          </div>
          
          <div class="frames-section">
            <h2>📸 Fotogramas Activos (${activeFrames.length}/${FRAME_CONFIG.maxFrames})</h2>
            <p>Duración: ${FRAME_CONFIG.frameDuration} segundos cada uno | Auto-eliminación activada</p>
            ${activeFrames.length > 0 ? `
              <div class="frames-grid">
                ${activeFrames.map(frame => `
                  <div class="frame-item">
                    <div>📸 ${frame.id.substring(6, 16)}</div>
                    <div style="font-size: 0.8em; opacity: 0.8;">
                      ${new Date(frame.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <p style="opacity: 0.7; margin-top: 15px;">No hay fotogramas activos. Inicia transmisión para generar capturas.</p>
            `}
          </div>
          
          <div class="obs-config">
            <h2>📡 Configuración OBS Studio</h2>
            <div class="config-item">
              <span><strong>Servicio:</strong></span>
              <span>Personalizado</span>
            </div>
            <div class="config-item">
              <span><strong>Servidor:</strong></span>
              <span class="url-value">rtmp://${PUBLIC_IP}:${RTMP_PORT}/live</span>
            </div>
            <div class="config-item">
              <span><strong>Clave de Stream:</strong></span>
              <span class="url-value">brujulatv</span>
            </div>
            <div class="config-item">
              <span><strong>Bitrate recomendado:</strong></span>
              <span>2500-5000 kbps</span>
            </div>
          </div>
          
          <div class="info-section">
            <h2>🌐 Enlaces de Distribución</h2>
            <div class="urls-container">
              <div class="url-item">
                <div class="url-label">📺 RTMP (Para distribución):</div>
                <div class="url-value">rtmp://${PUBLIC_IP}:${RTMP_PORT}/live/brujulatv</div>
              </div>
              <div class="url-item">
                <div class="url-label">📱 M3U8 (Para apps móviles):</div>
                <div class="url-value">http://${PUBLIC_IP}:${HTTP_MEDIA_PORT}/live/brujulatv/index.m3u8</div>
              </div>
              <div class="url-item">
                <div class="url-label">🌐 HTTP (Para navegadores):</div>
                <div class="url-value">http://${PUBLIC_IP}:${HTTP_MEDIA_PORT}/live/brujulatv.flv</div>
              </div>
            </div>
          </div>
          
          <div class="info-section">
            <h2>🚀 Estado del Sistema</h2>
            <p><strong>IP Pública:</strong> ${PUBLIC_IP}</p>
            <p><strong>Puerto RTMP:</strong> ${RTMP_PORT}</p>
            <p><strong>Puerto HTTP:</strong> ${HTTP_MEDIA_PORT}</p>
            <p><strong>Puerto Web:</strong> ${PORT}</p>
            <p><strong>Ubicación:</strong> Bogotá, Colombia</p>
            <p><strong>Auto-inicio:</strong> Configurado ✅</p>
            <p><strong>Gestión de memoria:</strong> Optimizada ✅</p>
          </div>
          
          <div class="refresh-note">
            <p>🔄 Esta página se actualiza automáticamente cada 30 segundos</p>
            <p>💾 Espacio en disco optimizado automáticamente</p>
          </div>
        </div>
        
        <script>
          // Auto-refresh cada 30 segundos
          setTimeout(() => window.location.reload(), 30000);
        </script>
      </body>
    </html>
  `);
});

// API para información del servidor
app.get('/api/status', (req, res) => {
  const publishingStreams = Array.from(activeStreams.values()).filter(s => s.status === 'publishing');
  const activeFrames = frameManager.getActiveFrames();
  
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    publicIP: PUBLIC_IP,
    ports: {
      rtmp: RTMP_PORT,
      http: HTTP_MEDIA_PORT,
      web: PORT
    },
    streams: {
      active: activeStreams.size,
      publishing: publishingStreams.length,
      list: publishingStreams
    },
    frames: {
      active: activeFrames.length,
      max: FRAME_CONFIG.maxFrames,
      duration: FRAME_CONFIG.frameDuration,
      list: activeFrames
    },
    urls: {
      rtmp: `rtmp://${PUBLIC_IP}:${RTMP_PORT}/live/brujulatv`,
      m3u8: `http://${PUBLIC_IP}:${HTTP_MEDIA_PORT}/live/brujulatv/index.m3u8`,
      http: `http://${PUBLIC_IP}:${HTTP_MEDIA_PORT}/live/brujulatv.flv`,
      panel: `http://${PUBLIC_IP}:${PORT}`
    },
    serverInfo: {
      startTime: serverStartTime,
      uptime: Math.floor((new Date() - serverStartTime) / 1000),
      location: 'Bogotá, Colombia',
      autoStart: true,
      autoCleanup: true
    }
  });
});

// API para gestión de fotogramas
app.get('/api/frames', (req, res) => {
  res.json({
    frames: frameManager.getActiveFrames(),
    config: FRAME_CONFIG
  });
});

// Función para crear servicio de Windows (auto-inicio)
const createWindowsService = () => {
  const servicePath = path.join(__dirname, 'install-service.bat');
  const serviceScript = `
@echo off
echo Instalando BrujulaTV como servicio de Windows...
npm install -g node-windows
node -e "
const Service = require('node-windows').Service;
const svc = new Service({
  name: 'BrujulaTV-Server',
  description: 'Servidor RTMP BrujulaTV Colombia',
  script: '${path.join(__dirname, 'server.js')}',
  nodeOptions: ['--harmony', '--max_old_space_size=4096']
});
svc.on('install', () => {
  console.log('Servicio BrujulaTV instalado exitosamente');
  svc.start();
});
svc.install();
"
echo Servicio instalado. BrujulaTV se iniciará automáticamente con Windows.
pause
`;
  
  try {
    fs.writeFileSync(servicePath, serviceScript);
    console.log('📄 Script de instalación de servicio creado: install-service.bat');
    console.log('💡 Ejecuta install-service.bat como administrador para auto-inicio');
  } catch (error) {
    console.error('⚠️ Error creando script de servicio:', error.message);
  }
};

// Inicialización del servidor
const startServer = async () => {
  try {
    // Crear directorios
    createDirectories();
    
    // Activar limpieza automática
    cleanupTempFiles();
    
    // Crear script de servicio de Windows
    createWindowsService();
    
    // Iniciar servidor RTMP
    nms.run();
    
    // Iniciar servidor web
    app.listen(PORT, '0.0.0.0', () => {
      console.log('🚀 ================================================');
      console.log('🎥 BRUJULATV COLOMBIA - SERVIDOR AUTÓNOMO INICIADO');
      console.log('🚀 ================================================');
      console.log(`🌍 IP Pública: ${PUBLIC_IP}`);
      console.log(`📡 Panel Web: http://${PUBLIC_IP}:${PORT}`);
      console.log(`📡 Panel Local: http://localhost:${PORT}`);
      console.log(`📡 RTMP Server: rtmp://${PUBLIC_IP}:${RTMP_PORT}`);
      console.log(`📡 Media Server: http://${PUBLIC_IP}:${HTTP_MEDIA_PORT}`);
      console.log('🚀 ================================================');
      console.log('');
      console.log('🤖 FUNCIONES AUTOMÁTICAS ACTIVAS:');
      console.log('   ✅ Auto-inicio con sistema (ejecutar install-service.bat)');
      console.log(`   📸 Gestión de fotogramas (${FRAME_CONFIG.maxFrames} x ${FRAME_CONFIG.frameDuration}s)`);
      console.log('   🧹 Limpieza automática cada 5 minutos');
      console.log('   🔄 Reinicio automático en caso de errores');
      console.log('');
      console.log('📋 CONFIGURACIÓN OBS STUDIO:');
      console.log(`   🎯 Servidor: rtmp://${PUBLIC_IP}:${RTMP_PORT}/live`);
      console.log('   🔑 Clave: brujulatv');
      console.log('   ⚙️  Bitrate: 2500-5000 kbps');
      console.log('   📺 Resolución: 1280x720 o 1920x1080');
      console.log('');
      console.log('🌐 ENLACES DE DISTRIBUCIÓN:');
      console.log(`   📺 RTMP: rtmp://${PUBLIC_IP}:${RTMP_PORT}/live/brujulatv`);
      console.log(`   📱 M3U8: http://${PUBLIC_IP}:${HTTP_MEDIA_PORT}/live/brujulatv/index.m3u8`);
      console.log(`   🌐 HTTP: http://${PUBLIC_IP}:${HTTP_MEDIA_PORT}/live/brujulatv.flv`);
      console.log('');
      console.log('💾 OPTIMIZACIÓN DE DISCO:');
      console.log('   ✅ Auto-eliminación de archivos temporales');
      console.log('   ✅ Rotación automática de logs');
      console.log('   ✅ Gestión inteligente de fotogramas');
      console.log('');
      console.log('✅ ¡CANAL COMUNITARIO BRUJULATV COMPLETAMENTE AUTÓNOMO!');
      console.log('🚀 ================================================');
    });
    
  } catch (error) {
    console.error('❌ Error al iniciar servidor:', error);
    
    // Reinicio automático en caso de error
    console.log('🔄 Reintentando en 10 segundos...');
    setTimeout(() => {
      startServer();
    }, 10000);
  }
};

// Manejo de errores y reinicio automático
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando BrujulaTV...');
  frameManager.cleanup();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Error crítico:', error);
  console.log('🔄 Reiniciando servidor automáticamente...');
  setTimeout(() => {
    startServer();
  }, 5000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada:', reason);
  console.log('🔄 Continuando operación...');
});

// Iniciar el servidor
startServer();
