import express from 'express';
import upload from '../utils/multerConfig.js';
import { auth, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

router.post('/', auth, isAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ 
      success: false,
      error: 'No se subió ningún archivo' 
    });
  }

  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

  res.status(200).json({ 
    success: true,
    url: imageUrl,
    filename: req.file.filename,
    message: 'Imagen subida correctamente'
  });
});

export default router;