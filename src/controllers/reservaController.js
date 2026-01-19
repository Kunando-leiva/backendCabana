import Reserva from '../models/Reserva.js';
import Cabana from '../models/Cabana.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import { 
  calcularPrecioTotal, 
  obtenerDesglosePrecios,
  crearFechaArgentina,
  generarResumenPrecio
} from '../utils/precioCabana.js';

// ============================================
// 1. NUEVA FUNCIÓN: CALCULAR PRECIO RESERVA
// ============================================
// En calcularPrecioReserva, usa la nueva función:
export const calcularPrecioReserva = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, cabanaId } = req.body; // Agregar cabanaId si es necesario
    
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ 
        success: false,
        error: 'Se requieren fechaInicio y fechaFin'
      });
    }
    
    const fechaInicioDate = crearFechaArgentina(fechaInicio);
    const fechaFinDate = crearFechaArgentina(fechaFin);
    
    // Validar que haya al menos 1 noche
    if (fechaInicioDate >= fechaFinDate) {
      return res.status(400).json({ 
        success: false,
        error: 'La fecha de salida debe ser posterior a la fecha de entrada' 
      });
    }
    
    // Usar la nueva función para generar resumen
    const resumen = generarResumenPrecio(fechaInicioDate, fechaFinDate);
    
    res.status(200).json({
      success: true,
      precioTotal: resumen.precioTotal,
      precioTotalFormateado: resumen.precioTotalFormateado,
      desglose: resumen.desgloseCompleto,
      totalNoches: resumen.totalNoches,
      cuentaPorTipo: resumen.desglosePorTipo,
      mensaje: `Precio para ${resumen.totalNoches} noche${resumen.totalNoches !== 1 ? 's' : ''} de alojamiento`,
      moneda: 'ARS (Pesos Argentinos)',
      detalles: `Check-in: ${resumen.desgloseCompleto[0]?.fecha} | Check-out: ${fechaFin}`
    });
    
  } catch (error) {
    console.error('Error calculando precio:', error);
    res.status(500).json({
      success: false,
      error: 'Error al calcular el precio',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============================================
// 2. MODIFICAR: crearReservaAdmin
// ============================================
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
    if (!huesped.dni || !huesped.nombre || !huesped.apellido) {
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
    
    if (fechaInicioDate > fechaFinDate) {  // Quita el =
  return res.status(400).json({ 
    success: false,
    error: 'La fecha fin no puede ser anterior a la fecha inicio' 
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

    // 🔥 CAMBIO IMPORTANTE: Usar precio dinámico en lugar del precio fijo de la cabaña
    const precioTotal = calcularPrecioTotal(fechaInicioDate, fechaFinDate);
    
    // Obtener cabaña para referencia (pero NO usar su precio)
    const cabana = await Cabana.findById(cabanaId);
    if (!cabana) {
      return res.status(404).json({
        success: false,
        error: 'Cabaña no encontrada'
      });
    }

    // Crear reserva con precio dinámico calculado
    const reserva = new Reserva({
      usuario: req.user.id,
      cabana: cabanaId,
      dni: huesped.dni.trim(),
      fechaInicio: fechaInicioDate,
      fechaFin: fechaFinDate,
      precioTotal, // 🔥 Usamos el precio dinámico calculado
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

    // Actualizar cabaña con fechas reservadas
    await Cabana.findByIdAndUpdate(cabanaId, {
      $push: {
        fechasReservadas: {
          fechaInicio: fechaInicioDate,
          fechaFin: fechaFinDate,
          reservaId: reserva._id
        }
      }
    });

    // Obtener desglose para mostrar en respuesta
    const desglose = obtenerDesglosePrecios(fechaInicioDate, fechaFinDate);

    res.status(201).json({
      success: true,
      data: {
        ...reserva.toObject(),
        precioDesglose: desglose.desglose, // Mostrar desglose
        cabana: {
          _id: cabana._id,
          nombre: cabana.nombre,
          precio: cabana.precio // Este es el precio BASE, pero NO se usa para cálculo
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
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============================================
// 3. MODIFICAR: actualizarReserva para usar precios dinámicos
// ============================================
export const actualizarReserva = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, estado, huesped, cabana } = req.body;
    
    // Obtener reserva actual
    const reservaActual = await Reserva.findById(req.params.id);
    if (!reservaActual) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }
    
    // Usar nuevas fechas o mantener las actuales
    const nuevaFechaInicio = fechaInicio ? new Date(fechaInicio) : reservaActual.fechaInicio;
    const nuevaFechaFin = fechaFin ? new Date(fechaFin) : reservaActual.fechaFin;
    
    // Validar disponibilidad si se cambia cabaña o fechas
    const cabanaId = cabana || reservaActual.cabana.toString();
    
    if (cabana || fechaInicio || fechaFin) {
      const existeOtraReserva = await Reserva.findOne({
        cabana: cabanaId,
        _id: { $ne: req.params.id },
        $or: [
          { 
            fechaInicio: { $lt: nuevaFechaFin }, 
            fechaFin: { $gt: nuevaFechaInicio } 
          }
        ]
      });
      
      if (existeOtraReserva) {
        return res.status(400).json({ 
          success: false,
          error: "La cabaña ya está reservada en esas fechas" 
        });
      }
    }

    // 🔥 CALCULAR NUEVO PRECIO si cambian las fechas
    let nuevoPrecioTotal = reservaActual.precioTotal;
    if (fechaInicio || fechaFin) {
      nuevoPrecioTotal = calcularPrecioTotal(nuevaFechaInicio, nuevaFechaFin);
    }

    const reservaActualizada = await Reserva.findByIdAndUpdate(
      req.params.id,
      { 
        fechaInicio: nuevaFechaInicio,
        fechaFin: nuevaFechaFin,
        estado, 
        huesped, 
        cabana: cabanaId,
        precioTotal: nuevoPrecioTotal // 🔥 Actualizar precio si cambió
      },
      { new: true, runValidators: true }
    ).populate('cabana usuario');

    res.status(200).json({ 
      success: true, 
      data: reservaActualizada 
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
};

// ============================================
// 4. FUNCIONES EXISTENTES (mantener igual)
// ============================================

// Obtener todas las reservas (admin)
export const obtenerReservas = async (req, res) => {
  try {
    console.log('Iniciando obtención de reservas para admin');
    
    if (req.user.rol !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Acceso no autorizado' 
      });
    }

    const reservas = await Reserva.find({})
      .populate({
        path: 'usuario',
        select: 'nombre email'
      })
      .populate({
        path: 'cabana',
        select: 'nombre precio'
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reservas.length,
      data: reservas
    });
  } catch (error) {
    console.error('Error en obtenerReservas:', error);
    
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener reservas',
      details: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
};

// Listar reservas del usuario
export const listarMisReservas = async (req, res) => {
  try {
    const reservas = await Reserva.find({ usuario: req.user.id })
      .populate('cabana')
      .sort({ fechaInicio: -1 });
    
    res.status(200).json({
      success: true,
      data: reservas
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
};

export const eliminarReserva = async (req, res) => {
  try {
    const reserva = await Reserva.findByIdAndDelete(req.params.id);
    if (!reserva) {
      return res.status(404).json({ 
        success: false, 
        error: 'Reserva no encontrada' 
      });
    }
    
    // Limpiar fechas reservadas en la cabaña
    await Cabana.findByIdAndUpdate(reserva.cabana, {
      $pull: { fechasReservadas: { reservaId: reserva._id } }
    });
    
    res.json({ 
      success: true, 
      message: 'Reserva eliminada correctamente',
      deletedId: reserva._id 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Error al eliminar reserva',
      details: error.message 
    });
  }
};

// Listar TODAS las reservas (solo admin)
export const listarTodasReservas = async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ 
        success: false,
        error: "Acceso denegado" 
      });
    }
    const reservas = await Reserva.find()
      .populate("usuario cabana")
      .sort({ fechaInicio: -1 });
    
    res.status(200).json({
      success: true,
      data: reservas
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
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

    const reservas = await Reserva.find(filtro)
      .populate("cabana")
      .sort({ fechaInicio: -1 });
    
    res.status(200).json({
      success: true,
      data: reservas
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
};

export const obtenerReservasAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 10, estado, fechaInicio, fechaFin } = req.query;
    
    const filter = {};
    if (estado) filter.estado = estado;
    if (fechaInicio && fechaFin) {
      filter.fechaInicio = { $gte: new Date(fechaInicio) };
      filter.fechaFin = { $lte: new Date(fechaFin) };
    }

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
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const obtenerReservaById = async (req, res) => {
  try {
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
        options: { lean: true }
      })
      .populate({
        path: 'cabana',
        select: 'nombre precio imagenes',
        options: { 
          lean: true,
          virtuals: false 
        }
      })
      .lean();
    
    if (!reserva) {
      return res.status(404).json({ 
        success: false,
        error: 'Reserva no encontrada' 
      });
    }
    
    // Agregar desglose de precios si existe
    const fechaInicio = new Date(reserva.fechaInicio);
    const fechaFin = new Date(reserva.fechaFin);
    const desglose = obtenerDesglosePrecios(fechaInicio, fechaFin);
    
    const reservaFormateada = {
      ...reserva,
      fechaInicio: reserva.fechaInicio?.toISOString().split('T')[0] || '',
      fechaFin: reserva.fechaFin?.toISOString().split('T')[0] || '',
      precioDesglose: desglose.desglose, // 🔥 Mostrar desglose
      cabana: reserva.cabana ? {
        _id: reserva.cabana._id,
        nombre: reserva.cabana.nombre,
        precio: reserva.cabana.precio,
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
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getFechasOcupadas = async (req, res) => {
  try {
    const { cabanaId, startDate, endDate } = req.query;

    if (cabanaId && !mongoose.Types.ObjectId.isValid(cabanaId)) {
      return res.status(400).json({ 
        success: false,
        error: 'ID de cabaña inválido'
      });
    }

    const query = { estado: { $ne: 'cancelada' } };
    
    if (cabanaId) query.cabana = cabanaId;
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ 
          success: false,
          error: 'Formato de fecha inválido. Use YYYY-MM-DD'
        });
      }

      query.$or = [
        { 
          fechaInicio: { $lte: end },
          fechaFin: { $gte: start }
        }
      ];
    }

    const reservas = await Reserva.find(query)
      .select('fechaInicio fechaFin cabana')
      .populate('cabana', 'nombre')
      .lean();

    // Formatear respuesta
    const fechasOcupadas = reservas.map(reserva => ({
      fechaInicio: reserva.fechaInicio.toISOString().split('T')[0],
      fechaFin: reserva.fechaFin.toISOString().split('T')[0],
      cabana: reserva.cabana?.nombre || 'Desconocida'
    }));

    res.status(200).json({
      success: true,
      data: fechasOcupadas
    });

  } catch (error) {
    console.error('Error en getFechasOcupadas:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener fechas ocupadas',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============================================
// NUEVO ENDPOINT: OBTENER CABAÑAS DISPONIBLES
// ============================================
export const getCabanasDisponibles = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    // Validar que se proporcionen ambas fechas
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren fechaInicio y fechaFin en formato YYYY-MM-DD'
      });
    }

    // Validar formato de fechas
    const fechaInicioDate = new Date(fechaInicio);
    const fechaFinDate = new Date(fechaFin);
    
    if (isNaN(fechaInicioDate.getTime()) || isNaN(fechaFinDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Formato de fecha inválido. Use YYYY-MM-DD'
      });
    }

    if (fechaInicioDate >= fechaFinDate) {
      return res.status(400).json({
        success: false,
        error: 'La fecha de fin debe ser posterior a la fecha de inicio'
      });
    }

    // 1. Obtener TODAS las cabañas
    const todasLasCabanas = await Cabana.find({})
      .select('nombre capacidad precio imagenes descripcion comodidades imagenPrincipal')
      .lean();

    // 2. Obtener reservas ACTIVAS en el rango de fechas
    const reservasEnRango = await Reserva.find({
      estado: { $ne: 'cancelada' },
      $or: [
        { 
          fechaInicio: { $lt: fechaFinDate }, 
          fechaFin: { $gt: fechaInicioDate } 
        }
      ]
    }).select('cabana fechaInicio fechaFin').lean();

    // 3. Crear un Set de IDs de cabañas OCUPADAS
    const cabanasOcupadasIds = new Set();
    reservasEnRango.forEach(reserva => {
      cabanasOcupadasIds.add(reserva.cabana.toString());
    });

    // 4. Filtrar las cabañas DISPONIBLES (las que NO están en el Set de ocupadas)
    const cabanasDisponibles = todasLasCabanas.filter(cabana => 
      !cabanasOcupadasIds.has(cabana._id.toString())
    );

    // 5. Formatear la respuesta con URLs de imágenes completas
    const API_URL = process.env.API_URL || 'http://localhost:5000';
    
    const cabanasFormateadas = cabanasDisponibles.map(cabana => {
      // Obtener imagen principal
      let imagenPrincipal = `${API_URL}/default-cabana.jpg`;
      
      if (cabana.imagenPrincipal) {
        if (typeof cabana.imagenPrincipal === 'string') {
          if (cabana.imagenPrincipal.startsWith('http')) {
            imagenPrincipal = cabana.imagenPrincipal;
          } else if (cabana.imagenPrincipal.startsWith('/')) {
            imagenPrincipal = `${API_URL}${cabana.imagenPrincipal}`;
          } else {
            imagenPrincipal = `${API_URL}/${cabana.imagenPrincipal}`;
          }
        } else if (cabana.imagenPrincipal.url) {
          if (cabana.imagenPrincipal.url.startsWith('http')) {
            imagenPrincipal = cabana.imagenPrincipal.url;
          } else if (cabana.imagenPrincipal.url.startsWith('/')) {
            imagenPrincipal = `${API_URL}${cabana.imagenPrincipal.url}`;
          } else {
            imagenPrincipal = `${API_URL}/${cabana.imagenPrincipal.url}`;
          }
        }
      } else if (cabana.imagenes && cabana.imagenes.length > 0) {
        // Usar primera imagen como fallback
        const primeraImagen = cabana.imagenes[0];
        if (typeof primeraImagen === 'string') {
          if (primeraImagen.startsWith('http')) {
            imagenPrincipal = primeraImagen;
          } else {
            imagenPrincipal = `${API_URL}/${primeraImagen}`;
          }
        } else if (primeraImagen.url) {
          if (primeraImagen.url.startsWith('http')) {
            imagenPrincipal = primeraImagen.url;
          } else {
            imagenPrincipal = `${API_URL}${primeraImagen.url}`;
          }
        }
      }

      return {
        _id: cabana._id,
        nombre: cabana.nombre,
        capacidad: cabana.capacidad,
        precio: cabana.precio,
        descripcion: cabana.descripcion,
        comodidades: cabana.comodidades || [],
        imagenPrincipal: imagenPrincipal,
        imagenes: cabana.imagenes || [],
        disponible: true
      };
    });

    res.status(200).json({
      success: true,
      data: cabanasFormateadas,
      total: cabanasFormateadas.length,
      filtros: {
        fechaInicio: fechaInicioDate.toISOString().split('T')[0],
        fechaFin: fechaFinDate.toISOString().split('T')[0],
        noches: Math.floor((fechaFinDate - fechaInicioDate) / (1000 * 60 * 60 * 24))
      }
    });

  } catch (error) {
    console.error('Error en getCabanasDisponibles:', error);
    res.status(500).json({
      success: false,
      error: 'Error al buscar cabañas disponibles',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};