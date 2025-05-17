import { GridFSBucket } from 'mongodb';
import mongoose from 'mongoose';
import Image from '../models/Image.js';

// Variable para almacenar el bucket
let bucket;

// Función para inicializar GridFSBucket cuando la conexión esté lista
const initializeBucket = () => {
  if (mongoose.connection.readyState === 1) { // 1 = CONNECTED
    bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'images',
      chunkSizeBytes: 255 * 1024 // 255KB
    });
  }
};

// Inicializar al cargar el módulo
initializeBucket();

// También inicializar cuando se conecte
mongoose.connection.on('connected', initializeBucket);

export const handleGridFSUpload = async (req, res, next) => {
  // Verificar que el bucket esté listo
  if (!bucket) {
    return res.status(500).json({
      success: false,
      error: 'GridFS no está configurado correctamente'
    });
  }

  if (!req.files || req.files.length === 0) {
    return next();
  }

  try {
    req.uploadedImages = await Promise.all(
      req.files.map(async (file) => {
        // 1. Subir a GridFS
        const uploadStream = bucket.openUploadStream(file.originalname, {
          metadata: {
            uploadedBy: req.user._id,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size
          }
        });

        const fileId = await new Promise((resolve, reject) => {
          uploadStream.on('error', reject);
          uploadStream.end(file.buffer, () => resolve(uploadStream.id));
        });

        // 2. Crear documento en MongoDB
        const newImage = new Image({
          filename: file.originalname,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          uploadedBy: req.user._id,
          fileId,
          url: `/api/images/${fileId}`
        });

        await newImage.save();
        return newImage;
      })
    );

    next();
  } catch (error) {
    console.error('Error en handleGridFSUpload:', error);
    res.status(500).json({
      success: false,
      error: 'Error al procesar imágenes',
      details: API_URL === 'development' ? error.message : undefined
    });
  }
};