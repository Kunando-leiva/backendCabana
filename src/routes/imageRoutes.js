import express from 'express';
import { 
  uploadImage, 
  getImage, 
  getGallery,
    deleteImage,
} from '../controllers/imageController.js';
import { auth, isAdmin } from '../middlewares/auth.js';
import { upload,handleGridFSUpload,  } from '../utils/multerConfig.js';
import { verificarImagenes } from '../controllers/diagnosticoController.js';
import GridFSBucket from 'mongodb';
import mongoose from 'mongoose';

const debugMiddleware = (req, res, next) => {
  console.log('Archivo recibido:', req.file);
  console.log('Cuerpo de la solicitud:', req.body);
  next();
};

const router = express.Router();

router.get('/diagnostico/imagenes', verificarImagenes);

// Subida de imágenes (solo admin)
router.post('/upload',
  auth,
  isAdmin,
  upload.single('image'), // Asegúrate que coincida con el FormData
  debugMiddleware, // Solo para diagnóstico, quitar después
  handleGridFSUpload,
  uploadImage,

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


// En tu imageRoutes.js
router.delete('/by-name/:filename', auth, isAdmin, async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const image = await Image.findOneAndDelete({ filename });
    
    if (!image) {
      return res.status(404).json({ success: false, error: 'Imagen no encontrada' });
    }

    // Eliminar el archivo de GridFS
    await GridFSBucket.delete(image.fileId);

    res.json({ success: true, message: 'Imagen eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener URLs de múltiples imágenes (para el frontend)
router.post('/bulk-urls', async (req, res) => {
  try {
    const { imageIds } = req.body; // Array de IDs
    if (!Array.isArray(imageIds)) throw new Error('Se requiere un array de IDs');

    const images = await Image.find({ _id: { $in: imageIds } })
      .select('url fileId filename');

    res.json(images.map(img => ({
      id: img._id,
      url: img.url || `${API_URL}/api/images/${img.fileId}`,
      filename: img.filename
    })));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// En tus rutas, agrega:
router.get('/diagnostico/imagenes/:cabanaId', auth, isAdmin, async (req, res) => {
  try {
    const cabana = await Cabana.findById(req.params.cabanaId)
      .populate('images')
      .lean();
    
    const gridfsFiles = await mongoose.connection.db.collection('images.files')
      .find({})
      .toArray();
    
    res.json({
      cabana: {
        id: cabana._id,
        nombre: cabana.nombre,
        totalImagenes: cabana.images?.length || 0,
        imagenes: cabana.images?.map(img => ({
          id: img._id,
          fileId: img.fileId,
          filename: img.filename,
          url: img.url
        }))
      },
      gridfs: {
        totalArchivos: gridfsFiles.length,
        archivos: gridfsFiles.map(f => ({
          id: f._id,
          filename: f.filename,
          length: f.length,
          uploadDate: f.uploadDate
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;