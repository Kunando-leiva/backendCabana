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

} from '../controllers/cabanaController.js';
import { auth, isAdmin } from '../middlewares/auth.js';
import { upload } from '../utils/multerConfig.js';
import { procesarImagenes } from '../utils/imageMiddleware.js';
import { API_URL } from '../../config/config.js';
import { handleGridFSUpload } from '../utils/multerConfig.js';
import { uploadImage } from '../controllers/imageController.js';


const router = express.Router();

// Middlewares reutilizables
const adminAuth = [auth, isAdmin];
const imageUpload = [...adminAuth, upload.array('images', 5), procesarImagenes];

// --- Rutas Públicas ---
router.get('/', listarCabanas);
router.get('/disponibles', listarCabanasDisponibles);
router.get('/:id', verCabana);
router.get('/:id/imagenes', obtenerImagenesCabana);

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

export default router;