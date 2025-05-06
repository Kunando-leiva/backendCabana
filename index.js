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

// Configuración de entorno y paths
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar Express
const app = express();

// Configuración CORS mejorada
const allowedOrigins = [
  'http://localhost:3000',
  'https://cabanafront.vercel.app',
  'https://backendcabana.onrender.com' // Añade tu dominio de backend
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir solicitudes sin origen (como apps móviles o Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      const msg = `El origen ${origin} no tiene permiso de acceso`;
      return callback(new Error(msg), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Middlewares
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Conexión a la base de datos
connectDB();

// Crear directorio de uploads si no existe
const uploadDir = path.join(__dirname, 'persistent-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`Directorio de uploads creado en: ${uploadDir}`);
}

// Rutas
app.get('/', (req, res) => {
  res.send('API del Complejo de Cabañas');
});

app.use('/api/cabanas', cabanaRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/images', imageRoutes); // Reemplaza uploadRoutes por imageRoutes


// Configuración para servir archivos estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Middleware para verificar acceso a archivos
app.use('/uploads', (req, res, next) => {
  // Puedes añadir lógica de autenticación aquí si necesitas proteger las imágenes
  next();
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false,
    error: 'Error interno del servidor',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Redirección HTTPS en producción
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && 
      req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
  console.log(`Modo: ${process.env.NODE_ENV || 'development'}`);
  console.log(`URL de uploads: ${process.env.NODE_ENV === 'production' 
    ? 'https://backendcabana.onrender.com/uploads' 
    : `http://localhost:${PORT}/uploads`}`);
});