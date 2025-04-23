import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import cors from 'cors';
import cabanaRoutes from './src/routes/cabanaRoutes.js';
import authRoutes from './src/routes/authRoutes.js';
import reservaRoutes from './src/routes/reservaRoutes.js';
import uploadRoutes from './src/routes/upload.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Configuración CORS actualizada
const allowedOrigins = [
  'http://localhost:3000',
  'https://cabanafront.vercel.app',

];

// Permite peticiones desde tu frontend (ajusta el origen)
app.use(cors({
  origin: function (origin, callback) {
    // Permitir solicitudes sin origen (como apps móviles o Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `Origen ${origin} no permitido por política CORS`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true // Si usas cookies/tokens de autenticación
}));
app.use(express.json());

// Conectar a la base de datos
connectDB();

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use('/api/cabanas', cabanaRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// vite.config.js
export default {
  server: {
    proxy: {
      '/api': 'http://localhost:3000/', // Reemplaza con tu API
    },
  },
};
