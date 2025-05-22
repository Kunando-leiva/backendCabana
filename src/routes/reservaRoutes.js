import express from 'express';
import { listarMisReservas,  eliminarReserva, actualizarReserva, filtrarReservas, crearReservaAdmin,
 obtenerReservaById, obtenerReservasAdmin, getFechasOcupadas
} from '../controllers/reservaController.js';
import { auth, isAdmin } from '../middlewares/auth.js';
import Reserva from '../models/Reserva.js';

const router = express.Router();
// RUTAS PARA ADMIN
 // Detalle específico
router.get('/admin', auth, isAdmin, obtenerReservasAdmin);
router.post('/admin/crear', auth, isAdmin, crearReservaAdmin);
router.put('/admin/:id', auth, isAdmin, actualizarReserva);
router.delete('/admin/eliminar/:id', auth, isAdmin, eliminarReserva);
router.get('/admin/filtrar', auth, filtrarReservas); // Filtrar reservas por fecha y estado
// RUTA PARA USUARIOS - listar sus reservas
router.get('/mis-reservas', auth, listarMisReservas);

router.get('/admin/:id', auth, isAdmin, async (req, res, next) => {
  try {
    await obtenerReservaById(req, res);
  } catch (error) {
    next(error); // Pasa el error al middleware centralizado
  }
});

// Endpoint para fechas ocupadas
router.get('/ocupadas', getFechasOcupadas);
export default router;