const NodeMediaServer = require('node-media-server');
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
require('dotenv').config();

// Configuración del servidor
const app = express();
const PORT = process.env.PORT || 3000;
const RTMP_PORT = process.env.RTMP_PORT || 1935;
const HTTP_MEDIA_PORT = process.env.HTTP_MEDIA_PORT || 8000;

// Middlewares de seguridad y configuración
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:8000'],
  credentials: true
}));
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Crear directorios necesarios
const createDirectories = () => {
  const dirs = ['./media', './public', './logs'];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Directorio creado: ${dir}`);
    }
  });
};

// Configuración avanzada del servidor RTMP
const config = {
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
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
  },
  dash: {
    mediaroot: './media',
    segment: 3,
    flags: '[f=dash:window_size=3:extra_window_size=5]'
  },
  fission: {
    ffmpeg: '/usr/local/bin/ffmpeg',
    tasks: [
      {
        rule: "live/*",
        model: [
          {
            ab: "128k",
            vb: "1000k",
            vs: "1280x720",
            vf: "30"
          },
          {
            ab: "96k", 
            vb: "500k",
            vs: "854x480",
            vf: "24"
          }
        ]
      }
    ]
  }
};

// Variables globales para tracking
let activeStreams = new Map();
let streamStats = new Map();

// Crear servidor RTMP
const nms = new NodeMediaServer(config);

// Eventos del servidor RTMP con logging mejorado
nms.on('preConnect', (id, args) => {
  const timestamp = new Date().toISOString();
  console.log(`🔄 [${timestamp}] PreConnect: ID=${id}`);
  console.log(`📡 Args:`, JSON.stringify(args, null, 2));
});

nms.on('postConnect', (id, args) => {
  const timestamp = new Date().toISOString();
  console.log(`✅ [${timestamp}] PostConnect: ID=${id}`);
  
  // Guardar información de conexión
  activeStreams.set(id, {
    id,
    connected: timestamp,
    ip: args.ip || 'unknown',
    status: 'connected'
  });
});

nms.on('doneConnect', (id, args) => {
  const timestamp = new Date().toISOString();
  console.log(`❌ [${timestamp}] DoneConnect: ID=${id}`);
  
  // Remover de streams activos
  activeStreams.delete(id);
  streamStats.delete(id);
});

nms.on('prePublish', (id, StreamPath, args) => {
  const timestamp = new Date().toISOString();
  console.log(`🎥 [${timestamp}] PrePublish: ID=${id}`);
  console.log(`📺 StreamPath: ${StreamPath}`);
  console.log(`🔧 Args:`, JSON.stringify(args, null, 2));
  
  // Aquí puedes agregar autenticación
  const streamKey = StreamPath.split('/').pop();
  console.log(`🔑 Stream Key: ${streamKey}`);
  
  // Validación básica de stream key (opcional)
  const validKeys = ['brujulatv', 'test', 'live', 'stream'];
  if (!validKeys.includes(streamKey)) {
    console.log(`❌ Stream Key inválida: ${streamKey}`);
    // return null; // Descomenta para rechazar streams inválidas
  }
});

nms.on('postPublish', (id, StreamPath, args) => {
  const timestamp = new Date().toISOString();
  console.log(`🔴 [${timestamp}] STREAM INICIADO`);
  console.log(`📺 StreamPath: ${StreamPath}`);
  console.log(`🆔 Stream ID: ${id}`);
  
  // Actualizar información del stream
  if (activeStreams.has(id)) {
    const streamInfo = activeStreams.get(id);
    streamInfo.streamPath = StreamPath;
    streamInfo.publishStarted = timestamp;
    streamInfo.status = 'publishing';
    activeStreams.set(id, streamInfo);
  }
  
  // Iniciar tracking de estadísticas
  streamStats.set(id, {
    startTime: Date.now(),
    viewers: 0,
    totalBytes: 0
  });
  
  console.log(`🌐 URLs disponibles:`);
  console.log(`   RTMP: rtmp://localhost:${RTMP_PORT}${StreamPath}`);
  console.log(`   FLV:  http://localhost:${HTTP_MEDIA_PORT}${StreamPath}.flv`);
  console.log(`   HLS:  http://localhost:${HTTP_MEDIA_PORT}${StreamPath}/index.m3u8`);
});

nms.on('donePublish', (id, StreamPath, args) => {
  const timestamp = new Date().toISOString();
  console.log(`⭕ [${timestamp}] STREAM TERMINADO`);
  console.log(`📺 StreamPath: ${StreamPath}`);
  console.log(`🆔 Stream ID: ${id}`);
  
  // Limpiar información del stream
  if (activeStreams.has(id)) {
    const streamInfo = activeStreams.get(id);
    streamInfo.publishEnded = timestamp;
    streamInfo.status = 'disconnected';
  }
  
  streamStats.delete(id);
});

// Rutas del servidor web mejoradas
app.get('/', (req, res) => {
  const streamCount = activeStreams.size;
  const publishingStreams = Array.from(activeStreams.values()).filter(s => s.status === 'publishing');
  
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BrujulaTV - Servidor de Streaming HD</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; 
            min-height: 100vh;
            padding: 20px;
          }
          .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid rgba(255,255,255,0.2);
            padding-bottom: 20px;
          }
          .logo {
            font-size: 3em;
            font-weight: bold;
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
          }
          .status { 
            background: linear-gradient(135deg, #2d5a27, #4CAF50); 
            padding: 25px; 
            border-radius: 15px; 
            margin: 20px 0; 
            border-left: 5px solid #4CAF50;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          }
          .info { 
            background: linear-gradient(135deg, #1e3a5f, #3498db); 
            padding: 20px; 
            border-radius: 15px; 
            margin: 15px 0; 
            border-left: 5px solid #3498db;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          }
          .warning {
            background: linear-gradient(135deg, #8B4513, #FF8C00);
            padding: 20px;
            border-radius: 15px;
            margin: 15px 0;
            border-left: 5px solid #FF8C00;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 30px;
          }
          code { 
            background: rgba(0,0,0,0.3); 
            padding: 8px 12px; 
            border-radius: 8px; 
            font-family: 'Courier New', monospace;
            border: 1px solid rgba(255,255,255,0.2);
          }
          .metric {
            display: inline-block;
            background: rgba(255,255,255,0.1);
            padding: 10px 15px;
            border-radius: 25px;
            margin: 5px;
            font-weight: bold;
          }
          .btn {
            display: inline-block;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 12px 25px;
            text-decoration: none;
            border-radius: 25px;
