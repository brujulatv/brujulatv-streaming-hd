#!/bin/bash

# Script de inicio para BrujulaTV Streaming Server
echo "🎬 Iniciando BrujulaTV Streaming Server..."

# Crear directorios necesarios
mkdir -p /app/hls
mkdir -p /app/public
mkdir -p /app/logs

# Establecer permisos
chmod 755 /app/hls
chmod 755 /app/public
chmod 755 /app/logs

# Verificar que FFmpeg esté disponible
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ Error: FFmpeg no está instalado"
    exit 1
fi

echo "✅ FFmpeg disponible: $(ffmpeg -version | head -n1)"

# Verificar que Node.js esté disponible
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js no está instalado"
    exit 1
fi

echo "✅ Node.js disponible: $(node --version)"

# Limpiar archivos HLS anteriores
echo "🧹 Limpiando archivos HLS anteriores..."
rm -f /app/hls/*.ts
rm -f /app/hls/*.m3u8

# Variables de entorno por defecto
export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-3000}

echo "🌍 Entorno: $NODE_ENV"
echo "🚪 Puerto: $PORT"

# Función para manejar señales de terminación
cleanup() {
    echo "🛑 Señal de terminación recibida, limpiando..."
    
    # Matar procesos FFmpeg si existen
    pkill -f ffmpeg
    
    # Limpiar archivos temporales
    rm -f /app/hls/*.ts
    rm -f /app/hls/*.m3u8
    
    echo "✅ Limpieza completada"
    exit 0
}

# Configurar manejadores de señales
trap cleanup SIGTERM SIGINT

# Verificar espacio en disco
AVAILABLE_SPACE=$(df /app | tail -1 | awk '{print $4}')
if [ "$AVAILABLE_SPACE" -lt 1048576 ]; then
    echo "⚠️ Advertencia: Poco espacio en disco disponible"
fi

# Crear archivo de prueba para HLS
echo "📝 Creando estructura HLS inicial..."
cat > /app/hls/index.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>BrujulaTV HLS Directory</title>
</head>
<body>
    <h1>🎬 BrujulaTV HLS Streaming</h1>
    <p>Este directorio contiene los archivos de streaming HLS.</p>
    <ul>
        <li><a href="stream.m3u8">stream.m3u8</a> - Playlist principal</li>
    </ul>
</body>
</html>
EOF

# Función de monitoreo
monitor_server() {
    while true; do
        sleep 30
        
        # Verificar si el servidor Node.js está ejecutándose
        if ! pgrep -f "node.*server.js" > /dev/null; then
            echo "⚠️ Servidor Node.js no detectado, reiniciando..."
            break
        fi
        
        # Verificar uso de memoria
        MEMORY_USAGE=$(ps aux | grep 'node.*server.js' | grep -v grep | awk '{print $4}' | head -1)
        if [ ! -z "$MEMORY_USAGE" ] && [ $(echo "$MEMORY_USAGE > 80" | bc -l) -eq 1 ]; then
            echo "⚠️ Alto uso de memoria: ${MEMORY_USAGE}%"
        fi
        
        # Limpiar archivos HLS antiguos (mantener solo los últimos 20 segmentos)
        find /app/hls -name "segment_*.ts" -type f | sort | head -n -20 | xargs rm -f 2>/dev/null
        
        echo "💓 Servidor funcionando correctamente - $(date)"
    done
}

# Función principal
main() {
    echo "🚀 Iniciando servidor principal..."
    
    # Cambiar al directorio de la aplicación
    cd /app
    
    # Instalar dependencias si es necesario
    if [ ! -d "node_modules" ]; then
        echo "📦 Instalando dependencias..."
        npm install --production
    fi
    
    # Iniciar monitoreo en segundo plano
    monitor_server &
    MONITOR_PID=$!
    
    # Iniciar servidor Node.js
    echo "🎯 Iniciando BrujulaTV Server en puerto $PORT..."
    
    # Ejecutar con reinicio automático
    while true; do
        node server.js 2>&1 | tee -a /app/logs/server.log
        EXIT_CODE=$?
        
        echo "⚠️ Servidor terminó con código: $EXIT_CODE"
        
        if [ $EXIT_CODE -eq 0 ]; then
            echo "✅ Servidor terminó normalmente"
            break
        else
            echo "🔄 Reiniciando servidor en 5 segundos..."
            sleep 5
        fi
    done
    
    # Detener monitoreo
    kill $MONITOR_PID 2>/dev/null
}

# Verificar conectividad (opcional)
check_connectivity() {
    echo "🌐 Verificando conectividad..."
    if ping -c 1 8.8.8.8 &> /dev/null; then
        echo "✅ Conectividad a internet disponible"
    else
        echo "⚠️ Sin conectividad a internet"
    fi
}

# Mostrar información del sistema
show_system_info() {
    echo "📊 Información del sistema:"
    echo "   - CPU: $(nproc) cores"
    echo "   - RAM: $(free -h | grep Mem | awk '{print $2}')"
    echo "   - Disco: $(df -h /app | tail -1 | awk '{print $4}') disponible"
    echo "   - Fecha: $(date)"
}

# Ejecutar verificaciones iniciales
show_system_info
check_connectivity

# Iniciar aplicación principal
main

# Si llegamos aquí, limpiar y salir
cleanup
