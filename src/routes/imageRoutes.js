import express from 'express';
import { 
  uploadImage, 
  getImage, 
  getGallery,
    deleteImage 
} from '../controllers/imageController.js';
import { auth, isAdmin } from '../middlewares/auth.js';
import { upload } from '../utils/multerConfig.js';

const router = express.Router();

// Subida de imágenes (solo admin)
router.post('/upload',
  auth,
  isAdmin,
  upload.single('image'),
  uploadImage
);

// Obtener detalles de una imagen (público)
router.get('/:id', getImage);

// Obtener galería completa (público)
router.get('/', getGallery);

// Eliminar imagen (protegida)
router.delete('/:id',
    auth,
    isAdmin,
    deleteImage
  );
export default router;

// En tu imageRoutes.js
router.delete('/by-name/:filename', auth, isAdmin, async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const image = await Image.findOneAndDelete({ filename });
    
    if (!image) {
      return res.status(404).json({ success: false, error: 'Imagen no encontrada' });
    }

    // Eliminar el archivo de GridFS
    await gridFSBucket.delete(image.fileId);

    res.json({ success: true, message: 'Imagen eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});