import express from 'express';
import { listarMisReservas,  eliminarReserva, actualizarReserva, filtrarReservas, obtenerReservas, crearReservaAdmin,
 obtenerReservaById, obtenerReservasAdmin
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
router.get('/ocupadas', async (req, res) => {
  try {
    const { cabanaId, startDate, endDate } = req.query;
    const query = {};
    
    if (cabanaId) query.cabana = cabanaId;
    
    if (startDate && endDate) {
      query.fechaInicio = { $lte: new Date(endDate) };
      query.fechaFin = { $gte: new Date(startDate) };
    }
    const reservas = await Reserva.find(query, 'fechaInicio fechaFin');

    const fechasOcupadas = reservas.flatMap(reserva => {
      const dates = [];
      let currentDate = new Date(reserva.fechaInicio);
      const endDate = new Date(reserva.fechaFin);

      while (currentDate <= endDate) {
        dates.push(currentDate.toISOString());
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return dates;
    });

    res.status(200).json(fechasOcupadas);
  } catch (error) {
    console.error('Error en /ocupadas:', error);
    res.status(500).json({ error: 'Error al obtener fechas ocupadas' });
  }
});
export default router;