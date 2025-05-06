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