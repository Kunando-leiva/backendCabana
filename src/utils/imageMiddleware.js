import mongoose from 'mongoose';
import { gridFSBucket } from '../../config/gridfs-config.js';

export const procesarImagenes = async (req, res, next) => {
    if (!req.files || req.files.length === 0) {
        return next();
    }

    try {
        // Procesar imágenes SIN transacción (se manejará en el controlador)
        req.uploadedImages = await Promise.all(
            req.files.map(async (file) => {
                const uploadStream = gridFSBucket.openUploadStream(file.originalname, {
                    metadata: {
                        uploadedBy: req.user._id,
                        mimeType: file.mimetype,
                        originalName: file.originalname
                    }
                });

                const fileId = await new Promise((resolve, reject) => {
                    uploadStream.end(file.buffer, () => resolve(uploadStream.id));
                    uploadStream.on('error', reject);
                });

                return {
                    fileId,
                    filename: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                    originalName: file.originalname // Añade esto
                };
            })
        );

        next();
    } catch (error) {
        res.status(400).json({ 
            success: false,
            error: error.message 
        });
    }
};

export const buildImageResponse = (images) => {
  return images.map(img => ({
    _id: img._id,
    filename: img.filename,
    mimeType: img.mimeType,
    size: img.size,
    url: img.url || `${API_URL}/api/images/${img.fileId}`
  }));
};