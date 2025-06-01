# Usar imagen oficial de Node.js con Ubuntu
FROM node:18-bullseye

# Establecer directorio de trabajo
WORKDIR /app

# Instalar FFmpeg y dependencias del sistema
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copiar archivos de configuración
COPY package*.json ./

# Instalar dependencias de Node.js
RUN npm install --production

# Copiar código fuente
COPY . .

# Crear directorio para archivos HLS
RUN mkdir -p /app/hls && chmod 755 /app/hls

# Crear directorio público si no existe
RUN mkdir -p /app/public && chmod 755 /app/public

# Exponer puerto
EXPOSE 3000

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=3000

# Comando de inicio
CMD ["npm", "start"]
