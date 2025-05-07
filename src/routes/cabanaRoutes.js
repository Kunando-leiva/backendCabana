import express from 'express';
import {
    crearCabana,
    actualizarCabana,
    eliminarCabana,
    listarCabanas,
    verCabana,
    listarCabanasDisponibles,
  
  
    
} from '../controllers/cabanaController.js';
import { auth, isAdmin } from '../middlewares/auth.js'; 
import { upload, } from '../utils/multerConfig.js'; // Asegúrate de que esta ruta sea correcta

const router = express.Router();

// Rutas protegidas para admin
router.post('/',
    auth,
    isAdmin,
    upload.array('images', 5), // Permite hasta 5 imágenes
    async (req, res, next) => {
        try {
            // Procesar imágenes subidas
            if (req.files && req.files.length > 0) {
                const uploadedImages = await Promise.all(
                    req.files.map(async (file) => {
                        const image = new Image({
                            filename: file.filename,
                            path: `/uploads/${file.filename}`,
                            originalName: file.originalname,
                            mimeType: file.mimetype,
                            size: file.size,
                            uploadedBy: req.user._id
                        });
                        await image.save();
                        return image._id;
                    })
                );
                
                req.body.imageIds = [
                    ...(req.body.imageIds || []),
                    ...uploadedImages
                ];
            }
            next();
        } catch (error) {
            next(error);
        }
    },
    crearCabana
);

router.put('/:id', auth, isAdmin, actualizarCabana);
router.delete('/:id', auth, isAdmin, eliminarCabana);

// Ruta pública
router.get('/', listarCabanas);
router.get('/disponibles', listarCabanasDisponibles); // Listar cabañas disponibles en un rango de fechas (público)
router.get('/:id', verCabana); // Ver detalles de una cabaña (público)

export default router;