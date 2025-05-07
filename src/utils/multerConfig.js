import multer from 'multer';
import { gridFSBucket } from '../../config/gridfs-config.js'; // Archivo que creamos antes
import fs from 'fs';
import path from 'path';

// Elimina la configuración de disco (storage) y reemplázala con esto:
const storage = multer.memoryStorage(); // Almacena en memoria antes de subir a GridFS

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes (JPEG, JPG, PNG, WEBP)'), false);
  }
};

export const upload = multer({
  storage, // Ahora es memoryStorage
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Elimina checkUploadsDir (no es necesario con GridFS)

// Adapta handleImageUpload para GridFS:
export const handleImageUpload = async (req, res, next) => {
  try {
    if (!req.file) throw new Error('No se subió ningún archivo');
    
    const uploadStream = gridFSBucket.openUploadStream(req.file.originalname, {
      metadata: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedBy: req.user?._id
      }
    });

    uploadStream.end(req.file.buffer);

    uploadStream.on('finish', () => {
      req.imageData = {
        fileId: uploadStream.id,
        filename: req.file.originalname,
        url: `/api/images/${req.file.originalname}` // Ruta para descargar
      };
      next();
    });

  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};