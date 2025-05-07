import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';

// Usa la misma conexión de Mongoose
const conn = mongoose.connection;

// Configura GridFS cuando la conexión esté lista
let gridFSBucket;
conn.once('open', () => {
  gridFSBucket = new GridFSBucket(conn.db, {
    bucketName: 'images', // Nombre del bucket
     chunkSizeBytes: 1024 * 255, // Tamaño óptimo para imágenes
  });
  console.log('✅ GridFS configurado');
});

export { gridFSBucket };