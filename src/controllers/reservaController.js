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
export const calcularPrecioReserva = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, cabanaId } = req.body;
    
    console.log('🔢 calcularPrecioReserva - Recibido:', { fechaInicio, fechaFin, cabanaId });
    
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
    
    const resumen = generarResumenPrecio(fechaInicioDate, fechaFinDate);
    
    console.log('💰 Precio calculado para', resumen.totalNoches, 'noches:', resumen.precioTotal);
    
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

    console.log('📝 crearReservaAdmin - Iniciando reserva para cabaña:', cabanaId);
    console.log('📅 Fechas:', { fechaInicio, fechaFin });

    if (!cabanaId || !fechaInicio || !fechaFin || !huesped) {
      return res.status(400).json({ 
        success: false,
        error: 'Faltan campos obligatorios: cabanaId, fechaInicio o fechaFin' 
      });
    }

    if (!huesped.dni || !huesped.nombre || !huesped.apellido) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos obligatorios del huésped: dni, nombre o apellido'
      });
    }

    if (!/^\d+$/.test(huesped.dni)) {
      return res.status(400).json({
        success: false,
        error: 'El DNI debe contener solo números'
      });
    }

    const fechaInicioDate = new Date(fechaInicio);
    const fechaFinDate = new Date(fechaFin);
    
    console.log('📅 Fechas parseadas:', {
      inicio: fechaInicioDate.toISOString(),
      fin: fechaFinDate.toISOString()
    });
    
    if (fechaInicioDate > fechaFinDate) {
      return res.status(400).json({ 
        success: false,
        error: 'La fecha fin no puede ser anterior a la fecha inicio' 
      });
    }

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
      console.log('❌ Conflicto con reserva existente:', existeReserva._id);
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

    const precioTotal = calcularPrecioTotal(fechaInicioDate, fechaFinDate);
    console.log('💰 Precio total calculado:', precioTotal);
    
    const cabana = await Cabana.findById(cabanaId);
    if (!cabana) {
      return res.status(404).json({
        success: false,
        error: 'Cabaña no encontrada'
      });
    }

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
    console.log('✅ Reserva creada ID:', reserva._id);

    await Cabana.findByIdAndUpdate(cabanaId, {
      $push: {
        fechasReservadas: {
          fechaInicio: fechaInicioDate,
          fechaFin: fechaFinDate,
          reservaId: reserva._id
        }
      }
    });

    const desglose = obtenerDesglosePrecios(fechaInicioDate, fechaFinDate);

    res.status(201).json({
      success: true,
      data: {
        ...reserva.toObject(),
        precioDesglose: desglose.desglose,
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
    
    console.log('✏️ actualizarReserva - ID:', req.params.id);
    
    const reservaActual = await Reserva.findById(req.params.id);
    if (!reservaActual) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }
    
    const nuevaFechaInicio = fechaInicio ? new Date(fechaInicio) : reservaActual.fechaInicio;
    const nuevaFechaFin = fechaFin ? new Date(fechaFin) : reservaActual.fechaFin;
    
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

    let nuevoPrecioTotal = reservaActual.precioTotal;
    if (fechaInicio || fechaFin) {
      nuevoPrecioTotal = calcularPrecioTotal(nuevaFechaInicio, nuevaFechaFin);
      console.log('💰 Precio actualizado:', nuevoPrecioTotal);
    }

    const reservaActualizada = await Reserva.findByIdAndUpdate(
      req.params.id,
      { 
        fechaInicio: nuevaFechaInicio,
        fechaFin: nuevaFechaFin,
        estado, 
        huesped, 
        cabana: cabanaId,
        precioTotal: nuevoPrecioTotal
      },
      { new: true, runValidators: true }
    ).populate('cabana usuario');

    res.status(200).json({ 
      success: true, 
      data: reservaActualizada 
    });
  } catch (error) {
    console.error('Error en actualizarReserva:', error);
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
};

// ============================================
// 4. FUNCIONES EXISTENTES (con logging)
// ============================================
export const obtenerReservas = async (req, res) => {
  try {
    console.log('📋 obtenerReservas para admin');
    
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

    console.log(`📊 ${reservas.length} reservas encontradas`);
    
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

export const listarMisReservas = async (req, res) => {
  try {
    console.log('📋 listarMisReservas para usuario:', req.user.id);
    
    const reservas = await Reserva.find({ usuario: req.user.id })
      .populate('cabana')
      .sort({ fechaInicio: -1 });
    
    console.log(`📊 ${reservas.length} reservas del usuario`);
    
    res.status(200).json({
      success: true,
      data: reservas
    });
  } catch (error) {
    console.error('Error en listarMisReservas:', error);
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
};

export const eliminarReserva = async (req, res) => {
  try {
    console.log('🗑️ Eliminando reserva ID:', req.params.id);
    
    const reserva = await Reserva.findByIdAndDelete(req.params.id);
    if (!reserva) {
      return res.status(404).json({ 
        success: false, 
        error: 'Reserva no encontrada' 
      });
    }
    
    await Cabana.findByIdAndUpdate(reserva.cabana, {
      $pull: { fechasReservadas: { reservaId: reserva._id } }
    });
    
    console.log('✅ Reserva eliminada correctamente');
    
    res.json({ 
      success: true, 
      message: 'Reserva eliminada correctamente',
      deletedId: reserva._id 
    });
  } catch (error) {
    console.error('Error en eliminarReserva:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al eliminar reserva',
      details: error.message 
    });
  }
};

export const listarTodasReservas = async (req, res) => {
  try {
    if (req.user.rol !== "admin") {
      return res.status(403).json({ 
        success: false,
        error: "Acceso denegado" 
      });
    }
    
    console.log('📋 listarTodasReservas');
    
    const reservas = await Reserva.find()
      .populate("usuario cabana")
      .sort({ fechaInicio: -1 });
    
    console.log(`📊 ${reservas.length} reservas totales`);
    
    res.status(200).json({
      success: true,
      data: reservas
    });
  } catch (error) {
    console.error('Error en listarTodasReservas:', error);
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
};

export const filtrarReservas = async (req, res) => {
  try {
    const { cabanaId, fechaInicio, fechaFin } = req.query;
    const filtro = {};

    console.log('🔍 filtrarReservas:', { cabanaId, fechaInicio, fechaFin });

    if (cabanaId) filtro.cabana = cabanaId;
    if (fechaInicio && fechaFin) {
      filtro.fechaInicio = { $gte: new Date(fechaInicio) };
      filtro.fechaFin = { $lte: new Date(fechaFin) };
    }

    const reservas = await Reserva.find(filtro)
      .populate("cabana")
      .sort({ fechaInicio: -1 });
    
    console.log(`📊 ${reservas.length} reservas encontradas con filtro`);
    
    res.status(200).json({
      success: true,
      data: reservas
    });
  } catch (error) {
    console.error('Error en filtrarReservas:', error);
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
};

export const obtenerReservasAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 10, estado, fechaInicio, fechaFin } = req.query;
    
    console.log('📋 obtenerReservasAdmin - Página:', page);
    
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

    console.log(`📊 ${total} reservas totales, ${pages} páginas`);
    
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
    console.log('🔍 obtenerReservaById - ID:', req.params.id);
    
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
    
    const fechaInicio = new Date(reserva.fechaInicio);
    const fechaFin = new Date(reserva.fechaFin);
    const desglose = obtenerDesglosePrecios(fechaInicio, fechaFin);
    
    console.log('📅 Reserva encontrada:', {
      id: reserva._id,
      fechaInicio: fechaInicio.toISOString().split('T')[0],
      fechaFin: fechaFin.toISOString().split('T')[0],
      noches: Math.floor((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24))
    });
    
    const reservaFormateada = {
      ...reserva,
      fechaInicio: reserva.fechaInicio?.toISOString().split('T')[0] || '',
      fechaFin: reserva.fechaFin?.toISOString().split('T')[0] || '',
      precioDesglose: desglose.desglose,
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

// 🔥 FUNCIÓN CORREGIDA Y MEJORADA CON LOGGING
export const getFechasOcupadas = async (req, res) => {
  try {
    const { cabanaId, startDate, endDate } = req.query;

    console.log('📅 getFechasOcupadas - Solicitud:', { cabanaId, startDate, endDate });

    if (cabanaId && !mongoose.Types.ObjectId.isValid(cabanaId)) {
      return res.status(400).json({ 
        success: false,
        error: 'ID de cabaña inválido'
      });
    }

    const query = { estado: { $ne: 'cancelada' } };
    
    if (cabanaId) {
      query.cabana = cabanaId;
      console.log(`🏠 Filtrando por cabaña: ${cabanaId}`);
    }
    
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
      console.log(`📆 Rango solicitado: ${startDate} a ${endDate}`);
    }

    const reservas = await Reserva.find(query)
      .select('fechaInicio fechaFin cabana')
      .populate('cabana', 'nombre')
      .lean();

    console.log(`📊 ${reservas.length} reservas encontradas`);

    // 🔥 CORRECCIÓN CRÍTICA: Procesar fechas ocupadas correctamente
    const todasFechasOcupadas = [];
    
    reservas.forEach((reserva, index) => {
      try {
        const fechaInicio = new Date(reserva.fechaInicio);
        const fechaFin = new Date(reserva.fechaFin);
        
        fechaInicio.setHours(0, 0, 0, 0);
        fechaFin.setHours(0, 0, 0, 0);
        
        console.log(`📅 Reserva ${index + 1}:`, {
          cabana: reserva.cabana?.nombre || 'Desconocida',
          checkIn: fechaInicio.toISOString().split('T')[0],
          checkOut: fechaFin.toISOString().split('T')[0],
          noches: Math.floor((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24))
        });
        
        const current = new Date(fechaInicio);
        
        // 🔥 LOGICA CORRECTA: NO incluir el día de check-out
        while (current < fechaFin) {
          const fechaStr = current.toISOString().split('T')[0];
          
          todasFechasOcupadas.push({
            fecha: fechaStr,
            cabana: reserva.cabana?.nombre || 'Desconocida',
            reservaId: reserva._id,
            checkIn: fechaInicio.toISOString().split('T')[0],
            checkOut: fechaFin.toISOString().split('T')[0]
          });
          
          console.log(`   🛌 Noche ocupada: ${fechaStr} (noche del ${fechaStr})`);
          current.setDate(current.getDate() + 1);
        }
        
        // 🔥 MOSTRAR EXPLICITAMENTE QUE EL DÍA DE CHECK-OUT NO ESTÁ OCUPADO
        const checkOutDate = fechaFin.toISOString().split('T')[0];
        console.log(`   ✅ Día LIBRE (check-out): ${checkOutDate} - Disponible para nueva reserva`);
        
      } catch (error) {
        console.warn(`⚠️ Error procesando reserva ${reserva._id}:`, error.message);
      }
    });

    // Filtrar duplicados
    const fechasUnicas = [];
    const fechasSet = new Set();
    
    todasFechasOcupadas.forEach(item => {
      if (!fechasSet.has(item.fecha)) {
        fechasSet.add(item.fecha);
        fechasUnicas.push(item);
      }
    });

    console.log(`📈 Total días ocupados únicos: ${fechasUnicas.length}`);
    console.log('📋 Fechas ocupadas:', fechasUnicas.map(f => f.fecha));

    res.status(200).json({
      success: true,
      data: fechasUnicas.map(item => item.fecha), // Solo las fechas para frontend
      detalles: fechasUnicas, // Detalles completos para debug
      total: fechasUnicas.length,
      mensaje: `Se encontraron ${fechasUnicas.length} días ocupados ${cabanaId ? 'para esta cabaña' : 'en total'}`
    });

  } catch (error) {
    console.error('❌ Error en getFechasOcupadas:', error);
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

    console.log('🔍 getCabanasDisponibles - Fechas:', { fechaInicio, fechaFin });

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren fechaInicio y fechaFin en formato YYYY-MM-DD'
      });
    }

    // 🔥 NORMALIZAR FECHAS - CRÍTICO
    const fechaInicioDate = new Date(fechaInicio);
    fechaInicioDate.setHours(0, 0, 0, 0);
    
    const fechaFinDate = new Date(fechaFin);
    fechaFinDate.setHours(0, 0, 0, 0);
    
    console.log('📅 Fechas normalizadas:', {
      inicio: fechaInicioDate.toISOString(),
      fin: fechaFinDate.toISOString()
    });

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

    // 🔥 OBTENER TODAS LAS CABANAS
    const todasLasCabanas = await Cabana.find({})
      .select('nombre capacidad precio imagenes descripcion comodidades imagenPrincipal _id')
      .lean();

    console.log(`🏠 ${todasLasCabanas.length} cabañas en total DB:`);
    todasLasCabanas.forEach((cabana, index) => {
      console.log(`   ${index + 1}. ${cabana.nombre} (ID: ${cabana._id})`);
    });

    // 🔥 LÓGICA CORREGIDA: CHECK-OUT NO BLOQUEA CHECK-IN MISMO DÍA
    // Nueva reserva: check-in X, check-out Y
    // Reserva existente: check-in A, check-out B
    // CONFLICTO si: 
    // 1. A < Y (reserva existente comienza antes de que termine mi reserva)
    // 2. B > X (reserva existente termina después de que comience mi reserva)
    // PERO: Si B == X (check-out mismo día que mi check-in) → NO CONFLICTO
    
    const reservasEnRango = await Reserva.find({
      estado: { $ne: 'cancelada' },
      $or: [
        // 🔥 CASO 1: Reserva existente COMIENZA dentro de mi estadía
        // Y termina DESPUÉS de que yo comience
        {
          fechaInicio: { 
            $lt: fechaFinDate,      // Comienza antes de que yo termine
            $gt: fechaInicioDate    // Y después de que yo comience
          }
        },
        // 🔥 CASO 2: Reserva existente TERMINA dentro de mi estadía  
        // Y comienza ANTES de que yo termine
        {
          fechaFin: { 
            $gt: fechaInicioDate,    // Termina después de que yo comience
            $lt: fechaFinDate        // Y antes de que yo termine
          }
        },
        // 🔥 CASO 3: Reserva existente ENVUELVE mi estadía
        {
          fechaInicio: { $lte: fechaInicioDate },
          fechaFin: { $gte: fechaFinDate }
        },
        // 🔥 CASO 4: Reserva existente comienza el MISMO día que yo (check-in mismo día)
        {
          fechaInicio: fechaInicioDate
        }
      ]
    }).select('cabana fechaInicio fechaFin').lean();

    console.log(`📅 ${reservasEnRango.length} reservas conflictivas encontradas:`);
    reservasEnRango.forEach((reserva, index) => {
      const inicio = new Date(reserva.fechaInicio);
      const fin = new Date(reserva.fechaFin);
      inicio.setHours(0, 0, 0, 0);
      fin.setHours(0, 0, 0, 0);
      
      console.log(`   ${index + 1}. Cabana: ${reserva.cabana}`);
      console.log(`       Reserva: ${inicio.toISOString().split('T')[0]} a ${fin.toISOString().split('T')[0]}`);
      console.log(`       Mi reserva: ${fechaInicioDate.toISOString().split('T')[0]} a ${fechaFinDate.toISOString().split('T')[0]}`);
      
      // Explicar por qué es conflicto
      if (inicio.getTime() === fechaInicioDate.getTime()) {
        console.log(`       → CONFLICTO: Check-in mismo día`);
      } else if (inicio < fechaFinDate && inicio > fechaInicioDate) {
        console.log(`       → CONFLICTO: Comienza durante mi estadía`);
      } else if (fin > fechaInicioDate && fin < fechaFinDate) {
        console.log(`       → CONFLICTO: Termina durante mi estadía`);
      } else if (inicio <= fechaInicioDate && fin >= fechaFinDate) {
        console.log(`       → CONFLICTO: Envuelve mi estadía`);
      }
    });

    // 🔥 IDs de cabañas OCUPADAS
    const cabanasOcupadasIds = new Set();
    reservasEnRango.forEach(reserva => {
      cabanasOcupadasIds.add(reserva.cabana.toString());
    });

    console.log(`🚫 Cabañas ocupadas IDs:`, Array.from(cabanasOcupadasIds));

    // 🔥 VERIFICACIÓN ESPECÍFICA
    const cabanaTroncos = todasLasCabanas.find(c => 
      c.nombre && (c.nombre.includes('Troncos') || c.nombre.includes('troncos'))
    );
    const cabanaNormanda = todasLasCabanas.find(c => 
      c.nombre && (c.nombre.includes('Normanda') || c.nombre.includes('Normandia'))
    );

    if (cabanaTroncos) {
      const ocupada = cabanasOcupadasIds.has(cabanaTroncos._id.toString());
      console.log(`🔍 Cabaña de Troncos (${cabanaTroncos._id}): ${ocupada ? 'OCUPADA ❌' : 'DISPONIBLE ✅'}`);
      
      // Buscar reserva específica que causa conflicto
      if (ocupada) {
        const reservaConflicto = reservasEnRango.find(r => 
          r.cabana.toString() === cabanaTroncos._id.toString()
        );
        if (reservaConflicto) {
          const inicioRes = new Date(reservaConflicto.fechaInicio).toISOString().split('T')[0];
          const finRes = new Date(reservaConflicto.fechaFin).toISOString().split('T')[0];
          console.log(`   Reserva conflictiva: ${inicioRes} a ${finRes}`);
        }
      }
    }

    if (cabanaNormanda) {
      const ocupada = cabanasOcupadasIds.has(cabanaNormanda._id.toString());
      console.log(`🔍 cabaña Normanda (${cabanaNormanda._id}): ${ocupada ? 'OCUPADA ❌' : 'DISPONIBLE ✅'}`);
    }

    // 🔥 FILTRAR DISPONIBLES
    const cabanasDisponibles = todasLasCabanas.filter(cabana => 
      !cabanasOcupadasIds.has(cabana._id.toString())
    );

    console.log(`✅ ${cabanasDisponibles.length} cabañas disponibles de ${todasLasCabanas.length}:`);
    cabanasDisponibles.forEach(cabana => {
      console.log(`   - ${cabana.nombre} (${cabana._id})`);
    });

    // 🔥 FORMATO DE RESPUESTA
    const API_URL = process.env.API_URL || 'http://localhost:5000';
    
    const cabanasFormateadas = cabanasDisponibles.map(cabana => {
      // ... (mantén el mismo código de formato de imágenes)
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
        } else if (cabana.imagenPrincipal._id) {
          imagenPrincipal = `${API_URL}/api/images/${cabana.imagenPrincipal._id}`;
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
      count: cabanasFormateadas.length,
      data: cabanasFormateadas,
      total: cabanasFormateadas.length,
      filtros: {
        fechaInicio: fechaInicioDate.toISOString().split('T')[0],
        fechaFin: fechaFinDate.toISOString().split('T')[0],
        noches: Math.floor((fechaFinDate - fechaInicioDate) / (1000 * 60 * 60 * 24))
      },
      debug: {
        totalCabanasEnDB: todasLasCabanas.length,
        fechasSolicitadas: {
          inicio: fechaInicioDate.toISOString(),
          fin: fechaFinDate.toISOString()
        },
        reservasConflictivas: reservasEnRango.map(r => ({
          cabana: r.cabana,
          inicio: new Date(r.fechaInicio).toISOString(),
          fin: new Date(r.fechaFin).toISOString()
        })),
        cabanasOcupadas: Array.from(cabanasOcupadasIds),
        cabanasDisponibles: cabanasDisponibles.map(c => ({ nombre: c.nombre, id: c._id })),
        logica: 'CONFLICTO si: (A < Y Y B > X) donde A=inicio reserva existente, B=fin reserva existente, X=mi check-in, Y=mi check-out'
      }
    });

  } catch (error) {
    console.error('❌ Error en getCabanasDisponibles:', error);
    res.status(500).json({
      success: false,
      error: 'Error al buscar cabañas disponibles',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};