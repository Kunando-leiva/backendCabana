import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';

let gridFSBucket;

const initializeGridFS = () => {
  if (mongoose.connection.readyState === 1) {
    gridFSBucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'images',
      chunkSizeBytes: 255 * 1024 // 255KB
    });
  }
};

// Inicialización inmediata si la conexión está lista
initializeGridFS();

// Reinicialización cuando se reconecte
mongoose.connection.on('connected', initializeGridFS);

export { gridFSBucket };