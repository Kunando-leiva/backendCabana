// ./config/config.js - CORREGIDO
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const API_URL = NODE_ENV === 'production' 
  ? 'https://backendcabana.onrender.com' 
  : 'http://localhost:5000';
export const PORT = process.env.PORT || 5000;
export const MONGO_URI = process.env.MONGO_URI;
export const JWT_SECRET = process.env.JWT_SECRET;
export const CLIENT_URL = NODE_ENV === 'production'
  ? 'https://cabanafront.vercel.app'
  : 'http://localhost:3000';

console.log(`⚙️  Entorno: ${NODE_ENV}`);
console.log(`⚙️  API_URL: ${API_URL}`);
console.log(`⚙️  CLIENT_URL: ${CLIENT_URL}`);