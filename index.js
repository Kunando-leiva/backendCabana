import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import cors from 'cors';
import cabanaRoutes from './src/routes/cabanaRoutes.js';
import authRoutes from './src/routes/authRoutes.js';
import reservaRoutes from './src/routes/reservaRoutes.js';
import imageRoutes from './src/routes/imageRoutes.js';  
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cron from 'node-cron';
import http from 'http'; // Añadir importación de http
import { webSocketServer } from './websocket.js'; // Cambiado a webSocketServer
import { API_URL } from './config/config.js';



// Configuración de entorno y paths
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar Express
const app = express();
const server = http.createServer(app);



// Configuración CORS mejorada
const allowedOrigins = [
  'http://localhost:3000',
  'https://cabanafront.vercel.app',
  'https://backendcabana.onrender.com'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origen ${origin} no permitido`), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  credentials: true,
  optionsSuccessStatus: 204
};


// Middlewares
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Habilitar preflight para todas las rutas
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Conexión a la base de datos
connectDB(); 

// Configurar upgrade para WebSocket
server.on('upgrade', (request, socket, head) => {
  webSocketServer.handleUpgrade(request, socket, head, (ws) => {
    webSocketServer.emit('connection', ws, request);
  });
});



const setupImageBackups = () => {
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  // Programar backup diario a las 3 AM
  cron.schedule('0 3 * * *', async () => { 
    console.log('⏰ Iniciando backup automático de imágenes...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `images-backup-${timestamp}.json`);

    const session = await mongoose.startSession();
    try {
      const [files, chunks] = await Promise.all([
        mongoose.connection.db.collection('images.files').find({}).toArray(),
        mongoose.connection.db.collection('images.chunks').find({}).toArray()
      ]);

      fs.writeFileSync(backupFile, JSON.stringify({ files, chunks }, null, 2));
      console.log(`✅ Backup guardado: ${backupFile.replace(__dirname, '')}`);

      // Limpiar backups antiguos (>7 días)
      fs.readdirSync(backupDir).forEach(file => {
        const filePath = path.join(backupDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtime < Date.now() - 7 * 24 * 60 * 60 * 1000) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Eliminado backup antiguo: ${file}`);
        }
      });
    } catch (error) {
      console.error('❌ Error en backup:', error.message);
    } finally {
      session.endSession();
    }
  });
};

// Iniciar el servicio de backups
if (API_URL === 'production') {
  setupImageBackups();
}

// =============================================
// 2. RUTA MANUAL PARA BACKUP (OPCIONAL)
// =============================================
app.get('/api/admin/backup-images', (req, res) => {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  
  setupImageBackups(); // Ejecuta inmediatamente
  res.json({ message: 'Backup iniciado manualmente' });
});

// Crear directorio de uploads si no existe
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir)); // Sirve los archivos estáticos
app.use('/default-cabana.jpg', express.static(path.join(__dirname, 'public/default-cabana.jpg')));

// Rutas
app.get('/', (req, res) => {
  res.send('API del Complejo de Cabañas');
});

app.use('/api/cabanas', cabanaRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/images', imageRoutes); // Reemplaza uploadRoutes por imageRoutes
app.use('/api/', imageRoutes); // Reemplaza uploadRoutes por imageRoutes

// Configuración para servir archivos estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Middleware para verificar acceso a archivos
app.use('/uploads', (req, res, next) => {
  // Añadir lógica de autenticación si es necesario
  next();
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false,
    error: 'Error interno del servidor',
    details: API_URL === 'development' ? err.message : undefined
  });
});

// Redirección HTTPS en producción
app.use((req, res, next) => {
  if (API_URL === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// Iniciar servidor
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Servidor HTTP y WebSocket ejecutándose en puerto ${PORT}`);
  console.log(`Modo: ${API_URL || 'development'}`);
  console.log(`WebSocket disponible en ws://localhost:${PORT}`);
  console.log(`URL de uploads: ${API_URL}/uploads`);

});
