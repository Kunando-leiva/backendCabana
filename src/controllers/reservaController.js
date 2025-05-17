import Reserva from '../models/Reserva.js';
import Cabana from '../models/Cabana.js';
import User from '../models/User.js';
import mongoose from 'mongoose';


// Crear reserva (usuario autenticado)

  
  // Obtener todas las reservas (admin)
  // En reservaController.js
export const obtenerReservas = async (req, res) => {
  try {
    console.log('Iniciando obtención de reservas para admin'); // Log de depuración
    
    // Validar que el usuario sea admin
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Acceso no autorizado' 
      });
    }

    // Obtener reservas con información poblada
    const reservas = await Reserva.find({})
      .populate({
        path: 'usuario',
        select: 'nombre email'
      })
      .populate({
        path: 'cabana',
        select: 'nombre precio'
      })
      .sort({ createdAt: -1 }); // Ordenar por fecha de creación

    console.log(`Se encontraron ${reservas.length} reservas`); // Log de depuración

    res.status(200).json({
      success: true,
      count: reservas.length,
      data: reservas
    });
  } catch (error) {
    console.error('Error en obtenerReservas:', error); // Log detallado
    
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener reservas',
      // Solo mostrar detalles en desarrollo
      details: API_URL === 'development' ? {
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
};

// Listar reservas del usuario
export const listarMisReservas = async (req, res) => {
    try {
        const reservas = await Reserva.find({ usuario: req.user.id }).populate('cabana');
        res.status(200).json(reservas);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const eliminarReserva = async (req, res) => {
  try {
    const reserva = await Reserva.findByIdAndDelete(req.params.id);
    if (!reserva) {
      return res.status(404).json({ success: false, error: 'Reserva no encontrada' });
    }
    
    // Opcional: Limpiar fechas reservadas en la cabaña
    await Cabana.findByIdAndUpdate(reserva.cabana, {
      $pull: { fechasReservadas: { reservaId: reserva._id } }
    });
    
    res.json({ success: true, message: 'Reserva eliminada correctamente',deletedId: reserva._id });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Error al eliminar reserva',
      details: error.message 
    });
  }
};

// controllers/reservaController.js
export const actualizarReserva = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, estado, huesped, cabana } = req.body;
    
    // Validar disponibilidad si se cambia cabaña o fechas
    if (cabana || fechaInicio || fechaFin) {
      const existeOtraReserva = await Reserva.findOne({
        cabana: cabana || req.reserva.cabana,
        _id: { $ne: req.params.id },
        $or: [
          { fechaInicio: { $lt: fechaFin || req.reserva.fechaFin }, 
           fechaFin: { $gt: fechaInicio || req.reserva.fechaInicio } 
          }
        ]
      });
      
      if (existeOtraReserva) {
        return res.status(400).json({ error: "La cabaña ya está reservada en esas fechas" });
      }
    }

    const reservaActualizada = await Reserva.findByIdAndUpdate(
      req.params.id,
      { fechaInicio, fechaFin, estado, huesped, cabana },
      { new: true, runValidators: true }
    ).populate('cabana usuario');

    res.status(200).json({ success: true, data: reservaActualizada });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Listar TODAS las reservas (solo admin)
export const listarTodasReservas = async (req, res) => {
    try {
        if (req.user.rol !== "admin") {
            return res.status(403).json({ error: "Acceso denegado" });
        }
        const reservas = await Reserva.find().populate("usuario cabana");
        res.status(200).json(reservas);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Filtrar reservas por cabaña o fechas (admin/usuario)
export const filtrarReservas = async (req, res) => {
    try {
        const { cabanaId, fechaInicio, fechaFin } = req.query;
        const filtro = {};

        if (cabanaId) filtro.cabana = cabanaId;
        if (fechaInicio && fechaFin) {
            filtro.fechaInicio = { $gte: new Date(fechaInicio) };
            filtro.fechaFin = { $lte: new Date(fechaFin) };
        }
     

        const reservas = await Reserva.find(filtro).populate("cabana");
        res.status(200).json(reservas);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// En reservaController.js
// En controllers/reservaController.js
export const crearReservaAdmin = async (req, res) => {
  try {
    const { cabanaId, fechaInicio, fechaFin, huesped } = req.body;

    // Validaciones mejoradas
    if (!cabanaId || !fechaInicio || !fechaFin || !huesped) {
      return res.status(400).json({ 
        success: false,
        error: 'Faltan campos obligatorios: cabanaId, fechaInicio o fechaFin' 
      });
    }

    // Validar campos del huésped
    if (!huesped || !huesped.dni || !huesped.nombre || !huesped.apellido) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos obligatorios del huésped: dni, nombre o apellido'
      });
    }

    // Validar formato del DNI
    if (!/^\d+$/.test(huesped.dni)) {
      return res.status(400).json({
        success: false,
        error: 'El DNI debe contener solo números'
      });
    }

    // Validar fechas
    const fechaInicioDate = new Date(fechaInicio);
    const fechaFinDate = new Date(fechaFin);
    
    if (fechaInicioDate >= fechaFinDate) {
      return res.status(400).json({ 
        success: false,
        error: 'La fecha fin debe ser posterior a la fecha inicio' 
      });
    }

    // Validar disponibilidad
    const existeReserva = await Reserva.findOne({
      cabana: cabanaId,
      $or: [
        { 
          fechaInicio: { $lt: fechaFinDate }, 
          fechaFin: { $gt: fechaInicioDate } 
        }
      ],
      estado: { $ne: 'cancelada' }
    });

    if (existeReserva) {
      return res.status(400).json({ 
        success: false,
        error: 'La cabaña ya está reservada en esas fechas',
        conflictoCon: {
          reservaId: existeReserva._id,
          fechas: {
            inicio: existeReserva.fechaInicio,
            fin: existeReserva.fechaFin
          }
        }
      });
    }

    // Calcular precio (ignorar cualquier precioTotal enviado desde el frontend)
    const cabana = await Cabana.findById(cabanaId);
    if (!cabana) {
      return res.status(404).json({
        success: false,
        error: 'Cabaña no encontrada'
      });
    }

    const diffTime = Math.abs(fechaFinDate - fechaInicioDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const precioTotal = diffDays * cabana.precio;

    // Crear reserva
    const reserva = new Reserva({
      usuario: req.user.id,
      cabana: cabanaId,
      dni: huesped.dni.trim(),
      fechaInicio: fechaInicioDate,
      fechaFin: fechaFinDate,
      precioTotal,
      estado: 'confirmada',
      creadaPorAdmin: true,
      huesped: {
        nombre: huesped.nombre.trim(),
        apellido: huesped.apellido.trim(),
        dni: huesped.dni.trim(),
        direccion: huesped.direccion?.trim() || '',
        telefono: huesped.telefono?.trim() || '',
        email: huesped.email?.trim() || ''
      }
    });

    await reserva.save();

    // Actualizar cabaña
    await Cabana.findByIdAndUpdate(cabanaId, {
      $push: {
        fechasReservadas: {
          fechaInicio: fechaInicioDate,
          fechaFin: fechaFinDate,
          reservaId: reserva._id
        }
      }
    });

    res.status(201).json({
      success: true,
      data: {
        ...reserva.toObject(),
        cabana: {
          _id: cabana._id,
          nombre: cabana.nombre,
          precio: cabana.precio
        },
        usuario: {
          _id: req.user._id,
          nombre: req.user.nombre,
          email: req.user.email
        }
      }
    });

  } catch (error) {
    console.error('Error en crearReservaAdmin:', error);
    
    // Manejar errores de validación de Mongoose específicamente
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: 'Error de validación',
        details: errors
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Error interno al crear reserva',
      details: API_URL === 'development' ? error.message : undefined
    });
  }
};
// Agrega este método si no existe:
// reservaController.js
export const obtenerReservasAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 10, estado, fechaInicio, fechaFin } = req.query;
    
    // Construir filtros
    const filter = {};
    if (estado) filter.estado = estado;
    if (fechaInicio && fechaFin) {
      filter.fechaInicio = { $gte: new Date(fechaInicio) };
      filter.fechaFin = { $lte: new Date(fechaFin) };
    }

    // Consulta con paginación
    const [reservas, total] = await Promise.all([
      Reserva.find(filter)
        .populate('usuario', 'nombre email')
        .populate('cabana', 'nombre precio')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Reserva.countDocuments(filter)
    ]);

    const pages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: reservas,
      total,
      pages,
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Error en obtenerReservasAdmin:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener reservas',
      details: API_URL === 'development' ? error.message : undefined
    });
  }
};


export const obtenerReservaById = async (req, res) => {
  try {
    // Validar que el ID sea un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false,
        error: 'ID de reserva inválido' 
      });
    }

    const reserva = await Reserva.findById(req.params.id)
      .populate({
        path: 'usuario',
        select: 'nombre email',
        options: { lean: true } // Usar lean para objetos simples
      })
      .populate({
        path: 'cabana',
        select: 'nombre precio imagenes',
        options: { 
          lean: true,
          // Proteger contra campos virtuales problemáticos
          virtuals: false 
        }
      })
      .lean(); // Convertir a objeto simple
    
    if (!reserva) {
      return res.status(404).json({ 
        success: false,
        error: 'Reserva no encontrada' 
      });
    }
    
    // Formatear fechas manualmente
    const reservaFormateada = {
      ...reserva,
      fechaInicio: reserva.fechaInicio?.toISOString().split('T')[0] || '',
      fechaFin: reserva.fechaFin?.toISOString().split('T')[0] || '',
      // Asegurar que cabana tenga estructura válida
      cabana: reserva.cabana ? {
        _id: reserva.cabana._id,
        nombre: reserva.cabana.nombre,
        precio: reserva.cabana.precio,
        // Manejar imágenes de forma segura
        imagenes: Array.isArray(reserva.cabana.imagenes) ? 
          reserva.cabana.imagenes.map(img => ({
            _id: img._id,
            url: img.url || `/api/images/${img.fileId}`
          })) : []
      } : null
    };
    
    res.status(200).json({ 
      success: true, 
      data: reservaFormateada 
    });
  } catch (error) {
    console.error('Error en obtenerReservaById:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener reserva',
      // Solo mostrar detalles en desarrollo
      details: API_URL=== 'development' ? {
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
};


