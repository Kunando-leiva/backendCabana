import express from 'express';
import upload from '../utils/multerConfig.js';
import { auth, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

// Función para generar URL segura
const getSecureImageUrl = (req, filename) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const protocol = isProduction ? 'https' : req.protocol;

  // Si querés evitar depender de req.get('host') en producción:
  const host = isProduction
    ? 'backendcabana.onrender.com'
    : req.get('host');

  return `${protocol}://${host}/uploads/${filename}`;
};

router.post('/', auth, isAdmin, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No se subió ningún archivo' 
      });
    }

    const imageUrl = getSecureImageUrl(req, req.file.filename);

    res.status(200).json({ 
      success: true,
      url: imageUrl,
      filename: req.file.filename,
      message: 'Imagen subida correctamente'
    });
  } catch (error) {
    console.error('Error al subir imagen:', error);
    res.status(500).json({
      success: false,
      error: 'Error al procesar la imagen',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;