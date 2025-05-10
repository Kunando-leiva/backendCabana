import express from 'express';
import {
    crearCabana,
    actualizarCabana,
    eliminarCabana,
    listarCabanas,
    verCabana,
    listarCabanasDisponibles
} from '../controllers/cabanaController.js';
import { auth, isAdmin } from '../middlewares/auth.js';
import { upload } from '../utils/multerConfig.js';
import Image from '../models/Image.js';

const router = express.Router();

// Middleware para procesar imágenes
const procesarImagenes = async (req, res, next) => {
    try {
        if (req.files && req.files.length > 0) {
            const uploadedImages = await Promise.all(
                req.files.map(async (file) => {
                    const image = new Image({
                        filename: file.originalname,
                        fileId: file.filename, // ID de GridFS
                        mimeType: file.mimetype,
                        size: file.size,
                        uploadedBy: req.user._id,
                        url: `/api/images/${file.filename}`
                    });
                    await image.save();
                    return image._id;
                })
            );
            
            req.body.images = [
                ...(req.body.images || []),
                ...uploadedImages
            ];
        }
        next();
    } catch (error) {
        next(error);
    }
};

// Rutas protegidas para admin
router.post('/',
    auth,
    isAdmin,
    upload.array('images', 5),
    procesarImagenes,
    crearCabana
);

router.put('/:id', 
    auth,
    isAdmin,
    upload.array('images', 5),
    procesarImagenes,
    actualizarCabana
);

router.delete('/:id', auth, isAdmin, eliminarCabana);

// Rutas públicas
router.get('/', listarCabanas);
router.get('/disponibles', listarCabanasDisponibles);
router.get('/:id', verCabana);

export default router;