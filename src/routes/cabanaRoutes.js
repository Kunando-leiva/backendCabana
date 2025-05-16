import express from 'express';
import {
    crearCabana,
    actualizarCabana,
    eliminarCabana,
    listarCabanas,
    verCabana,
    listarCabanasDisponibles,
    obtenerImagenesCabana,
    asociarImagenes,
    obtenerTodasImagenes

} from '../controllers/cabanaController.js';
import { auth, isAdmin } from '../middlewares/auth.js';
import { upload } from '../utils/multerConfig.js';
import { procesarImagenes } from '../utils/imageMiddleware.js';
import { API_URL } from '../../config/config.js';
import { handleGridFSUpload } from '../utils/multerConfig.js';
import { uploadImage } from '../controllers/imageController.js';
import mongoose from 'mongoose';

const router = express.Router();

// Middlewares reutilizables
const adminAuth = [auth, isAdmin];
const imageUpload = [...adminAuth, upload.array('images', 5), procesarImagenes];

// --- Rutas Públicas ---
router.get('/', listarCabanas);
router.get('/disponibles', listarCabanasDisponibles);
router.get('/', obtenerTodasImagenes);
router.get('/:id', 
  // Validación de ID
  async (req, res, next) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false,
        error: 'ID de cabaña no válido' 
      });
    }
    next();
  },
  verCabana
);
// Ruta para imágenes de cabaña
router.get('/:id/images',
  async (req, res, next) => {
    console.log('Solicitud de imágenes para cabaña ID:', req.params.id);
    next();
  },
  obtenerImagenesCabana
);

// --- Rutas Protegidas ---
router.post('/', 
    auth,
    isAdmin,
    upload.array('images', 5), // Acepta hasta 5 imágenes
    crearCabana
);
router.put('/:id', imageUpload, actualizarCabana);
router.delete('/:id', adminAuth, eliminarCabana);
router.patch('/:id/imagenes', adminAuth, asociarImagenes);

router.post(
    '/:id/imagen',
    auth,
    upload.single('imagen'),
    handleGridFSUpload,
    uploadImage
  );

// Ruta optimizada para imagen principal
router.get('/:id/imagen-principal', async (req, res) => {
    try {
        const cabana = await Cabana.findById(req.params.id)
            .select('imagenPrincipal images')
            .populate({
                path: 'imagenPrincipal',
                select: 'url -_id',
                match: { url: { $exists: true } }
            })
            .populate({
                path: 'images',
                select: 'url -_id',
                perDocumentLimit: 1,
                match: { url: { $exists: true } }
            })
            .lean();

        if (!cabana) {
            return res.status(404).json({ 
                success: false,
                error: 'Cabaña no encontrada' 
            });
        }

        const imagen = cabana.imagenPrincipal?.url || 
                     cabana.images?.[0]?.url || 
                     `${API_URL}/default-cabana.jpg`;

        return res.redirect(imagen.startsWith('http') ? imagen : `${API_URL}${imagen}`);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener imagen',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Obtener todas las imágenes con opción de filtrar por cabaña
router.get('/images/all', async (req, res) => {
  try {
    // Opción 1: Obtener imágenes a través de las cabañas
    const cabanas = await Cabana.find()
      .populate({
        path: 'images',
        select: 'url filename size createdAt',
        match: { isPublic: true }
      })
      .lean();

    let images = [];
    cabanas.forEach(cabana => {
      if (cabana.images && cabana.images.length > 0) {
        images = [
          ...images,
          ...cabana.images.map(img => ({
            ...img,
            cabanaId: cabana._id,
            cabanaNombre: cabana.nombre
          }))
        ];
      }
    });

    // Opción 2: Si no hay imágenes en cabañas, obtener directamente
    if (images.length === 0) {
      images = await Image.find({ isPublic: true })
        .select('url filename size createdAt')
        .lean();
    }

    // Formatear URLs
    const formattedImages = images.map(img => ({
      ...img,
      url: img.url?.startsWith('http') 
        ? img.url 
        : `${API_URL}${img.url?.startsWith('/') ? '' : '/'}${img.url}`
    }));

    res.status(200).json({
      success: true,
      count: formattedImages.length,
      data: formattedImages
    });
  } catch (error) {
    console.error('Error en /images/all:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener imágenes',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;