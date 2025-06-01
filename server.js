const NodeMediaServer = require('node-media-server');
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const RTMP_PORT = 1935;

// Permitir conexiones desde cualquier IP
app.use(cors({
  origin: '*',
  credentials: false
}));
app.use(express.static('public'));
app.use(express.json());

// Configuración para IP pública
const config = {
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
    // Permitir conexiones externas
    allow_origin: '*'
  },
  http: {
    port: 8000,
    allow_origin: '*',
    mediaroot: './media'
  },
  hls: {
    mediaroot: './media',
    segment: 3,
    flags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]'
  }
};

const nms = new NodeMediaServer(config);

// Tu IP pública real
let publicIP = '45.177.53.24';

// Eventos del servidor
nms.on('postPublish', (id, StreamPath, args) => {
  console.log('🔴 STREAM INICIADO:', StreamPath);
  console.log(`🌐 Accesible desde: rtmp://${publicIP}:${RTMP_PORT}${StreamPath}`);
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('⭕ STREAM TERMINADO:', StreamPath);
});

// Función para obtener IP pública automáticamente
const getPublicIP = async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    publicIP = data.ip;
    console.log(`🌍 IP Pública detectada: ${publicIP}`);
  } catch (error) {
    console.log('⚠️ No se pudo obtener IP pública automáticamente');
    console.log('💡 Configúrala manualmente en la variable publicIP');
  }
};

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BrujulaTV - Servidor RTMP Público</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white; 
            margin: 0; 
            padding: 20px;
          }
          .container { 
            max-width: 800px; 
            margin: 0 auto; 
            background: rgba(255,255,255,0.1);
            padding: 30px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
          }
          .header { text-align: center; margin-bottom: 30px; }
          .status { 
            background: rgba(76, 175, 80, 0.2); 
            padding: 20px; 
            border-radius: 10px; 
            margin: 20px 0;
            border-left: 5px solid #4CAF50;
          }
          .info { 
            background: rgba(33, 150, 243, 0.2); 
            padding: 20px; 
            border-radius: 10px; 
            margin: 15px 0;
            border-left: 5px solid #2196F3;
          }
          code { 
            background: rgba(0,0,0,0.3); 
            padding: 8px 12px; 
            border-radius: 5px; 
            font-family: monospace;
            display: inline-block;
            margin: 5px 0;
          }
          .warning {
            background: rgba(255, 152, 0, 0.2);
            padding: 15px;
            border-radius: 10px;
            border-left: 5px solid #FF9800;
            margin: 15px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎥 BrujulaTV Colombia</h1>
            <h2>🌐 Servidor RTMP Público</h2>
          </div>
          
          <div class="status">
            <h2>✅ Estado: SERVIDOR PÚBLICO ACTIVO</h2>
            <p><strong>🌍 IP Pública:</strong> ${publicIP}</p>
            <p><strong>📡 Puerto RTMP:</strong> ${RTMP_PORT}</p>
            <p><strong>🎥 Puerto Media:</strong> 8000</p>
          </div>
          
          <div class="info">
            <h3>📡 Configuración OBS Studio</h3>
            <p><strong>🎯 Servidor RTMP:</strong></p>
            <code>rtmp://${publicIP}:${RTMP_PORT}/live</code>
            <br><br>
            <p><strong>🔑 Clave de Stream:</strong></p>
            <code>brujulatv</code>
            <br><br>
            <p><strong>📺 URL Completa Ejemplo:</strong></p>
            <code>rtmp://${publicIP}:${RTMP_PORT}/live/brujulatv</code>
          </div>
          
          <div class="info">
            <h3>🎬 URLs de Visualización Pública</h3>
            <p><strong>📄 Formato FLV:</strong></p>
            <code>http://${publicIP}:8000/live/brujulatv.flv</code>
            <br><br>
            <p><strong>📱 Formato HLS (Recomendado):</strong></p>
            <code>http://${publicIP}:8000/live/brujulatv/index.m3u8</code>
            <br><br>
            <p><em>Cualquier persona puede ver tu stream usando estas URLs</em></p>
          </div>
          
          <div class="warning">
            <h3>🔒 Importante - Seguridad</h3>
            <p>⚠️ <strong>Tu servidor es público</strong> - cualquiera puede conectarse</p>
            <p>💡 Considera agregar autenticación para streams privados</p>
            <p>🚪 Asegúrate de que tu firewall permita los puertos 1935 y 8000</p>
          </div>
          
          <div class="info">
            <h3>🔧 Para Conectar desde Cualquier Lugar</h3>
            <p><strong>Desde tu casa:</strong> <code>rtmp://localhost:1935/live</code></p>
            <p><strong>Desde internet:</strong> <code>rtmp://${publicIP}:1935/live</code></p>
            <p><strong>Otros streamers:</strong> Pueden usar tu IP pública</p>
          </div>
        </div>
        
        <script>
          // Auto-refresh cada 60 segundos
          setTimeout(() => window.location.reload(), 60000);
        </script>
      </body>
    </html>
  `);
});

// API para obtener información del servidor
app.get('/api/info', (req, res) => {
  res.json({
    status: 'running',
    publicIP: publicIP,
    rtmp_port: RTMP_PORT,
    media_port: 8000,
    web_port: PORT,
    urls: {
      rtmp_local: `rtmp://localhost:${RTMP_PORT}/live`,
      rtmp_public: `rtmp://${publicIP}:${RTMP_PORT}/live`,
      view_flv: `http://${publicIP}:8000/live/brujulatv.flv`,
      view_hls: `http://${publicIP}:8000/live/brujulatv/index.m3u8`
    }
  });
});

// Inicializar servidor
const startServer = async () => {
  // Obtener IP pública
  await getPublicIP();
  
  // Iniciar servidor RTMP
  nms.run();
  
  // Iniciar servidor web
  app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 ========================================');
    console.log('🎥 BRUJULATV - SERVIDOR PÚBLICO INICIADO');
    console.log('🚀 ========================================');
    console.log(`🌍 IP Pública: ${publicIP}`);
    console.log(`📡 Web Panel: http://${publicIP}:${PORT}`);
    console.log(`📡 RTMP Público: rtmp://${publicIP}:${RTMP_PORT}/live`);
    console.log(`📡 Media Público: http://${publicIP}:8000`);
    console.log('🚀 ========================================');
    console.log('');
    console.log('📋 CONFIGURACIÓN OBS (PÚBLICO):');
    console.log(`   🎯 Servidor: rtmp://${publicIP}:${RTMP_PORT}/live`);
    console.log('   🔑 Clave: brujulatv');
    console.log('');
    console.log('📋 CONFIGURACIÓN OBS (LOCAL):');
    console.log(`   🎯 Servidor: rtmp://localhost:${RTMP_PORT}/live`);
    console.log('   🔑 Clave: brujulatv');
    console.log('');
    console.log('🎬 VER STREAM PÚBLICO:');
    console.log(`   📄 FLV: http://${publicIP}:8000/live/brujulatv.flv`);
    console.log(`   📱 HLS: http://${publicIP}:8000/live/brujulatv/index.m3u8`);
    console.log('');
    console.log('✅ ¡Accesible desde cualquier parte del mundo!');
    console.log('🚀 ========================================');
  });
};

startServer();
