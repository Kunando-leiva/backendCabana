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
    obtenerTodasImagenes,
    agregarImagenesACabana,
    eliminarImagenCabana,
    reordenarImagenesCabana
} from '../controllers/cabanaController.js';
import { auth, isAdmin } from '../middlewares/auth.js';
import { upload } from '../utils/multerConfig.js';
import { API_URL } from '../../config/config.js';
import Cabana from '../models/Cabana.js';
import Image from '../models/Image.js';
import mongoose from 'mongoose';

const router = express.Router();

// Middleware de diagnóstico
const debugMiddleware = (req, res, next) => {
  console.log('🔍 DEBUG - Ruta:', req.path);
  console.log('📦 Body keys:', Object.keys(req.body));
  console.log('📁 Files count:', req.files?.length || 0);
  
  if (req.body.imagesToKeep) {
    console.log('📌 imagesToKeep (raw):', req.body.imagesToKeep);
    console.log('📌 Tipo:', typeof req.body.imagesToKeep);
  }
  
  if (req.body.imagesToDelete) {
    console.log('🗑️ imagesToDelete (raw):', req.body.imagesToDelete);
    console.log('🗑️ Tipo:', typeof req.body.imagesToDelete);
  }
  
  next();
};

// Middlewares reutilizables
const adminAuth = [auth, isAdmin];

// --- Rutas Públicas ---
router.get('/', listarCabanas);
router.get('/disponibles', listarCabanasDisponibles);
router.get('/images/all', obtenerTodasImagenes);

// Validación de ID
const validateObjectId = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ 
      success: false,
      error: 'ID no válido' 
    });
  }
  next();
};

router.get('/:id', validateObjectId, verCabana);

// Ruta para imágenes de cabaña
router.get('/:id/images', validateObjectId, obtenerImagenesCabana);

// --- Rutas Protegidas ---
router.post('/', 
  auth,
  isAdmin,
  upload.array('images', 5),
  crearCabana
);

// ✅ RUTA PRINCIPAL DE ACTUALIZACIÓN (usa actualizarCabana corregido)
router.put('/:id', 
  auth,
  isAdmin,
  upload.array('newImages', 10),
  debugMiddleware, // Opcional: quitar en producción
  actualizarCabana
);

// Ruta para eliminar una imagen específica de una cabaña
router.delete('/:cabanaId/images/:imageId',
  auth,
  isAdmin,
  async (req, res) => {
    try {
      const { cabanaId, imageId } = req.params;
      
      // Validar IDs
      if (!mongoose.Types.ObjectId.isValid(cabanaId) || !mongoose.Types.ObjectId.isValid(imageId)) {
        return res.status(400).json({
          success: false,
          error: 'IDs no válidos'
        });
      }
      
      // Llamar función del controlador
      return eliminarImagenCabana(req, res);
    } catch (error) {
      console.error('Error en ruta eliminar imagen:', error);
      res.status(500).json({
        success: false,
        error: 'Error al procesar solicitud'
      });
    }
  }
);

// ✅ RUTA MEJORADA PARA AGREGAR IMÁGENES
router.post('/:id/agregar-imagenes',
  auth,
  isAdmin,
  debugMiddleware, // Opcional: para diagnóstico
  upload.array('images', 10),
  async (req, res) => {
    try {
      console.log('📤 Ruta /agregar-imagenes llamada');
      console.log('📊 Datos recibidos:', {
        cabanaId: req.params.id,
        filesCount: req.files?.length || 0,
        body: req.body
      });
      
      // Llamar función del controlador
      return agregarImagenesACabana(req, res);
    } catch (error) {
      console.error('❌ Error en ruta agregar-imagenes:', error);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Ruta para reordenar imágenes
router.patch('/:id/reordenar-imagenes',
  auth,
  isAdmin,
  async (req, res) => {
    try {
      return reordenarImagenesCabana(req, res);
    } catch (error) {
      console.error('Error en ruta reordenar-imagenes:', error);
      res.status(500).json({
        success: false,
        error: 'Error al procesar solicitud'
      });
    }
  }
);

// Eliminar cabaña completa
router.delete('/:id', adminAuth, eliminarCabana);

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
            details: API_URL === 'development' ? error.message : undefined
        });
    }
});

export default router;