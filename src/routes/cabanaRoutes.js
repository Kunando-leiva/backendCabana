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

const router = express.Router();

// Rutas protegidas para admin
router.post('/', auth, isAdmin, crearCabana);
router.put('/:id', auth, isAdmin, actualizarCabana);
router.delete('/:id', auth, isAdmin, eliminarCabana);

// Ruta pública
router.get('/', listarCabanas);
router.get('/:id', verCabana); // Ver detalles de una cabaña (público)
router.get('/disponibles', listarCabanasDisponibles); // Listar cabañas disponibles en un rango de fechas (público)


export default router;