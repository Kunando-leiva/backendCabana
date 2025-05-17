import multer from 'multer';
import { GridFSBucket } from 'mongodb';
import mongoose from 'mongoose';

// Configuración mejorada de Multer
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedExtensions = ['.jpeg', '.jpg', '.png', '.webp'];
  
  // Validar tipo MIME
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error('Solo imágenes (JPEG, PNG, WEBP)'), false);
  }
  
  // Validar extensión
  const ext = file.originalname.toLowerCase().slice(-5);
  if (!allowedExtensions.some(e => ext.endsWith(e))) {
    return cb(new Error('Extensión no permitida'), false);
  }
  
  cb(null, true);
};

// Exporta Multer configurado
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // Máximo 5 archivos
  }
});

// Middleware mejorado para GridFS
export const handleGridFSUpload = async (req, res, next) => {
  if (!req.file) {
    console.log('Debug - Archivo recibido en GridFS:', req.file);
    return res.status(400).json({ 
      success: false, 
      error: 'No se recibió archivo para GridFS' 
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'images',
      chunkSizeBytes: 255 * 1024 // 255KB
    });

    const uploadStream = bucket.openUploadStream(req.file.originalname, {
      metadata: {
        uploadedBy: req.user._id,
        mimeType: req.file.mimetype,
        size: req.file.size
        
      }
    });

    req.file.id = await new Promise((resolve, reject) => {
      uploadStream.end(req.file.buffer, (err) => {
        if (err) {
          session.abortTransaction();
          reject(err);
        } else {
          resolve(uploadStream.id);
        }
      });
    });

    await session.commitTransaction();
    next();
  } catch (error) {
    await session.abortTransaction();
    console.error('Error en GridFS:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al subir a GridFS',
      details: API_URL === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};