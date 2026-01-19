import express from 'express';
import { 
  listarMisReservas,  
  eliminarReserva, 
  actualizarReserva, 
  filtrarReservas, 
  crearReservaAdmin,
  obtenerReservaById, 
  obtenerReservasAdmin, 
  getFechasOcupadas,
  calcularPrecioReserva,
  getCabanasDisponibles
} from '../controllers/reservaController.js';
import { auth, isAdmin } from '../middlewares/auth.js';
import Reserva from '../models/Reserva.js';

const router = express.Router();

// ============================================
// RUTA PÚBLICA PARA CALCULAR PRECIOS
// ============================================
router.post('/calcular-precio', calcularPrecioReserva);

// ============================================
// RUTAS PARA ADMIN
// ============================================
router.get('/admin', auth, isAdmin, obtenerReservasAdmin);
router.post('/admin/crear', auth, isAdmin, crearReservaAdmin);
router.put('/admin/:id', auth, isAdmin, actualizarReserva);
router.delete('/admin/eliminar/:id', auth, isAdmin, eliminarReserva);
router.get('/admin/filtrar', auth, filtrarReservas);

// ============================================
// RUTA PARA USUARIOS
// ============================================
router.get('/mis-reservas', auth, listarMisReservas);

router.get('/admin/:id', auth, isAdmin, async (req, res, next) => {
  try {
    await obtenerReservaById(req, res);
  } catch (error) {
    next(error);
  }
});

router.get('/disponibles', getCabanasDisponibles);



// Endpoint para fechas ocupadas
router.get('/ocupadas', getFechasOcupadas);

export default router;