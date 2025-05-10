import multer from 'multer';
import { gridFSBucket } from '../../config/gridfs-config.js';
import path from 'path';
import Image from '../models/Image.js';
import { API_URL } from '../../config/config.js';

// Configuración de Multer para almacenamiento en memoria
const storage = multer.memoryStorage();

// Filtro de tipos de archivo permitidos
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  // Validar tipo MIME
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error('Solo se permiten imágenes (JPEG, JPG, PNG, WEBP)'), false);
  }

  // Validar extensión del archivo
  const extname = path.extname(file.originalname).toLowerCase();
  if (!['.jpeg', '.jpg', '.png', '.webp'].includes(extname)) {
    return cb(new Error('Extensión de archivo no permitida'), false);
  }

  // Validar tamaño del archivo
  if (file.size > maxSize) {
    return cb(new Error('El tamaño máximo permitido es 10MB'), false);
  }

  cb(null, true);
};

// Configuración de Multer
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Middleware para manejar la subida de imágenes a GridFS
// En utils/multerConfig.js
export const handleImageUpload = async (req, res, next) => {
  try {
    if (!req.file && !req.files) return next();

    const files = req.file ? [req.file] : req.files;
    req.uploadedImages = [];

    for (const file of files) {
      const uploadStream = gridFSBucket.openUploadStream(file.originalname, {
        metadata: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          uploadedBy: req.user?._id
        }
      });

      const fileId = await new Promise((resolve, reject) => {
        uploadStream.end(file.buffer, (error) => {
          if (error) return reject(error);
          resolve(uploadStream.id);
        });
      });

      // Crear registro en la colección Image
      const image = await Image.create({
        filename: file.originalname,
        fileId,
        url: `${API_URL}/api/images/${fileId}`,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: req.user?._id
      });

      req.uploadedImages.push({
        fileId,
        filename: file.originalname,
        url: image.url
      });
    }

    next();
  } catch (error) {
    // Limpiar imágenes subidas si hay error
    if (req.uploadedImages?.length > 0) {
      await Promise.all(
        req.uploadedImages.map(img => 
          gridFSBucket.delete(img.fileId).catch(console.error)
       ) );
    }
    res.status(400).json({ success: false, error: error.message });
  }
};

// Middleware para eliminar imágenes en caso de fallo posterior
export const cleanupImagesOnError = async (err, req, res, next) => {
  if (req.uploadedImages) {
    await Promise.all(
      req.uploadedImages.map(img => 
        gridFSBucket.delete(img.fileId).catch(console.error)
      )
    );
  }
  next(err);
};