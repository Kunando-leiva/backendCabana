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
import http from 'http';
import mongoose from 'mongoose';

// Configuración de entorno y paths
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar Express
const app = express();
const server = http.createServer(app);

// Conexión a la base de datos
connectDB(); 

// ============================================
// 1. CONFIGURACIÓN CORS SIMPLIFICADA
// ============================================
const corsOptions = {
  origin: function (origin, callback) {
    // En desarrollo, permitir cualquier origen
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // En producción, solo orígenes específicos
    const allowedOrigins = [
      'http://localhost:3000',  // Desarrollo local
      'https://cabanafront.vercel.app',
      'https://complejolosalerces-git-primeraramafront-kunandoleivas-projects.vercel.app',
      'https://complejolosalerces.vercel.app',
      'http://localhost:5000'
    ];
    
    // Permitir peticiones sin origen (como desde Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    
    return callback(new Error('Origen no permitido por CORS'), false);
    
  },
  
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Origin',
    'X-Requested-With',
    'Accept'
  ],
  exposedHeaders: [],
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 600 // 10 minutos para preflight cache
  
};

// Aplicar CORS - SOLO UNA VEZ
app.use(cors(corsOptions));

// ============================================
// 2. MIDDLEWARES BÁSICOS
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// 3. SERVIR ARCHIVOS ESTÁTICOS
// ============================================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Servir archivos estáticos
app.use('/uploads', express.static(uploadDir));

// Crear ruta para imagen por defecto si no existe el archivo
app.use('/default-cabana.jpg', (req, res) => {
  const defaultImagePath = path.join(__dirname, 'public/default-cabana.jpg');
  if (fs.existsSync(defaultImagePath)) {
    res.sendFile(defaultImagePath);
  } else {
    // Crear imagen por defecto simple si no existe
    res.set('Content-Type', 'image/svg+xml');
    res.send(`
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f0f0f0"/>
        <rect x="50" y="100" width="300" height="150" fill="#8B4513"/>
        <rect x="150" y="70" width="100" height="30" fill="#A0522D"/>
        <rect x="180" y="180" width="40" height="70" fill="#696969"/>
        <circle cx="120" cy="220" r="15" fill="#DAA520"/>
        <circle cx="280" cy="220" r="15" fill="#DAA520"/>
        <text x="200" y="240" text-anchor="middle" font-family="Arial" font-size="14" fill="#333">Cabaña</text>
      </svg>
    `);
  }
});

// ============================================
// 4. RUTAS BÁSICAS
// ============================================
app.get('/', (req, res) => {
  res.json({ 
    message: 'API del Complejo de Cabañas',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const dbStatusText = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  }[dbStatus] || 'unknown';
  
  res.json({
    status: dbStatus === 1 ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatusText,
    memory: process.memoryUsage()
  });
});

// ============================================
// 5. RUTAS DE API
// ============================================
app.use('/api/cabanas', cabanaRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/images', imageRoutes);

// ============================================
// 6. MANEJO DE ERRORES
// ============================================
// Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Ruta no encontrada',
    path: req.url,
    method: req.method
  });
});

// Error global
app.use((err, req, res, next) => {
  console.error('🔥 Error global:', {
    message: err.message,
    url: req.url,
    method: req.method
  });
  
  // Error CORS específico
  if (err.message.includes('CORS') || err.message.includes('Origen')) {
    return res.status(403).json({ 
      success: false,
      error: 'Acceso CORS denegado',
      allowedOrigins: process.env.NODE_ENV === 'production' 
        ? ['https://cabanafront.vercel.app', 'https://complejolosalerces.vercel.app']
        : ['* (desarrollo)'],
      yourOrigin: req.headers.origin,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  
  res.status(err.status || 500).json({ 
    success: false,
    error: 'Error interno del servidor',
    details: process.env.NODE_ENV === 'development' ? {
      message: err.message,
      stack: err.stack
    } : undefined
  });
});

// ============================================
// 7. INICIAR SERVIDOR
// ============================================
const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
  console.log(`🌍 Modo: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log(`🌐 CORS: ${process.env.NODE_ENV === 'production' ? 'Restringido' : 'Permitir todo'}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`=========================================`);
  
  // Mostrar rutas disponibles
  console.log('\n📌 Rutas disponibles:');
  console.log('  GET  /                    → Estado API');
  console.log('  GET  /health              → Health check');
  console.log('  GET  /api/cabanas         → Listar cabañas');
  console.log('  GET  /api/reservas/ocupadas → Fechas ocupadas');
  console.log('  POST /api/reservas/calcular-precio → Calcular precio');
  console.log('  GET  /uploads/:filename   → Archivos subidos');
  console.log('  GET  /default-cabana.jpg  → Imagen por defecto');
  console.log(`=========================================`);
});