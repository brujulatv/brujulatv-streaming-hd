const NodeMediaServer = require('node-media-server');
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const RTMP_PORT = 1935;

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

const config = {
  rtmp: {
    port: RTMP_PORT,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*',
    mediaroot: './media'
  }
};

const nms = new NodeMediaServer(config);

nms.on('postPublish', (id, StreamPath, args) => {
  console.log('🔴 STREAM INICIADO:', StreamPath);
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('⭕ STREAM TERMINADO:', StreamPath);
});

app.get('/', (req, res) => {
  res.send(`
    <h1>🎥 BrujulaTV - Servidor RTMP</h1>
    <h2>✅ Estado: ACTIVO</h2>
    <h3>📡 Configuración OBS:</h3>
    <p>Servidor: <strong>rtmp://localhost:1935/live</strong></p>
    <p>Clave: <strong>brujulatv</strong></p>
    <h3>🎬 Ver Stream:</h3>
    <p>URL: <strong>http://localhost:8000/live/brujulatv.flv</strong></p>
  `);
});

nms.run();
app.listen(PORT, () => {
  console.log('🚀 ========================================');
  console.log('🎥 BRUJULATV - SERVIDOR INICIADO');
  console.log(`📡 Web: http://localhost:${PORT}`);
  console.log(`📡 RTMP: rtmp://localhost:${RTMP_PORT}/live`);
  console.log('📋 OBS - Servidor: rtmp://localhost:1935/live');
  console.log('📋 OBS - Clave: brujulatv');
  console.log('✅ ¡LISTO PARA OBS!');
  console.log('🚀 ========================================');
});
