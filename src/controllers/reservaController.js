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

    console.log('🏨 Lógica corregida: Check-out 10:00 AM | Check-in 12:00 PM');
    console.log('📅 Fechas solicitadas:', { fechaInicio, fechaFin });

    // Validaciones básicas
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren fechaInicio y fechaFin en formato YYYY-MM-DD'
      });
    }

    // 🔥 CORRECCIÓN CRÍTICA 1: Crear fechas en UTC para evitar problemas de zona horaria
    const fechaInicioDate = new Date(fechaInicio + 'T12:00:00Z');  // 12:00 PM UTC
    const fechaFinDate = new Date(fechaFin + 'T10:00:00Z');       // 10:00 AM UTC
    
    console.log('🕐 Fechas en UTC (sin conversión automática):');
    console.log(`   Check-in: ${fechaInicioDate.toISOString()}`);
    console.log(`   Check-out: ${fechaFinDate.toISOString()}`);

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

    // 🔥 CORRECCIÓN CRÍTICA 2: Lógica correcta con $and (AMBAS condiciones deben cumplirse)
    console.log('🔍 Buscando reservas conflictivas con lógica CORREGIDA...');
    
    const reservasEnRango = await Reserva.find({
      estado: { $ne: 'cancelada' },
      // 🔥 LÓGICA CORRECTA: Una reserva es conflictiva si:
      // 1. Termina DESPUÉS de nuestro check-in (12:00 PM)
      // 2. Y comienza ANTES de nuestro check-out (10:00 AM)
      $and: [
        {
          fechaFin: { $gt: fechaInicioDate }  // Termina DESPUÉS de las 12:00 PM
        },
        {
          fechaInicio: { $lt: fechaFinDate }  // Comienza ANTES de las 10:00 AM
        }
      ]
    })
    .select('cabana fechaInicio fechaFin')
    .lean();

    console.log(`📊 Reservas REALMENTE conflictivas encontradas: ${reservasEnRango.length}`);
    
    // 🔥 DEBUG MEJORADO
    if (reservasEnRango.length > 0) {
      console.log('🔍 Detalles de reservas REALMENTE conflictivas:');
      reservasEnRango.forEach((reserva, i) => {
        const inicio = new Date(reserva.fechaInicio);
        const fin = new Date(reserva.fechaFin);
        const cabanaId = reserva.cabana.toString();
        
        console.log(`   ${i + 1}. Cabaña ID: ${cabanaId}`);
        console.log(`      Ocupada del: ${inicio.toISOString()} al ${fin.toISOString()}`);
        console.log(`      Nuestras fechas: ${fechaInicio} 12:00 PM → ${fechaFin} 10:00 AM`);
        
        const conflictoPorFin = fin > fechaInicioDate;
        const conflictoPorInicio = inicio < fechaFinDate;
        
        console.log(`      ¿Fin reserva (${fin.toISOString()}) > nuestro check-in (${fechaInicioDate.toISOString()})?: ${conflictoPorFin ? 'SÍ' : 'NO'}`);
        console.log(`      ¿Inicio reserva (${inicio.toISOString()}) < nuestro check-out (${fechaFinDate.toISOString()})?: ${conflictoPorInicio ? 'SÍ' : 'NO'}`);
        console.log(`      ¿AMBAS condiciones?: ${conflictoPorFin && conflictoPorInicio ? '✅ CONFLICTO REAL' : '❌ NO es conflicto'}`);
      });
    } else {
      console.log('✅ ¡Excelente! No hay reservas conflictivas reales.');
    }

    // Obtener todas las cabañas (simplificado)
    console.log('🔍 Obteniendo todas las cabañas...');
    const todasCabanasRaw = await mongoose.connection.db.collection('cabanas').find({}).toArray();
    console.log(`📄 Encontradas: ${todasCabanasRaw.length} cabañas`);

    // 🔥 IDs de cabañas ocupadas
    const cabanasOcupadasIds = new Set();
    reservasEnRango.forEach((reserva) => {
      cabanasOcupadasIds.add(reserva.cabana.toString());
    });

    console.log(`📋 Cabañas ocupadas: ${Array.from(cabanasOcupadasIds).length}`);

    // 🔥 Filtrar cabañas disponibles
    const cabanasDisponibles = todasCabanasRaw
      .filter(doc => {
        const id = doc._id.toString();
        const estaOcupada = cabanasOcupadasIds.has(id);
        if (!estaOcupada) {
          console.log(`   ✅ ${doc.nombre || 'Sin nombre'} (${id}) → DISPONIBLE`);
        }
        return !estaOcupada;
      })
      .map(doc => {
        const API_URL = process.env.API_URL || 'http://localhost:5000';
        let imagenPrincipal = `${API_URL}/default-cabana.jpg`;
        
        if (doc.imagenPrincipal) {
          if (typeof doc.imagenPrincipal === 'string') {
            imagenPrincipal = doc.imagenPrincipal.startsWith('http') 
              ? doc.imagenPrincipal 
              : `${API_URL}${doc.imagenPrincipal.startsWith('/') ? '' : '/'}${doc.imagenPrincipal}`;
          } else if (doc.imagenPrincipal._id) {
            imagenPrincipal = `${API_URL}/api/images/${doc.imagenPrincipal._id}`;
          }
        }

        return {
          _id: doc._id,
          nombre: doc.nombre || 'Cabaña sin nombre',
          capacidad: doc.capacidad || 2,
          precio: doc.precio || 0,
          descripcion: doc.descripcion || '',
          servicios: Array.isArray(doc.servicios) ? doc.servicios : [],
          comodidades: Array.isArray(doc.comodidades) ? doc.comodidades : [],
          imagenPrincipal: imagenPrincipal,
          imagenes: Array.isArray(doc.imagenes) ? doc.imagenes : [],
          disponible: true
        };
      });

    console.log(`🎉 RESULTADO FINAL: ${cabanasDisponibles.length} cabañas disponibles de ${todasCabanasRaw.length} totales`);

    // 🔥 Respuesta simplificada (sin debug extenso)
    res.status(200).json({
      success: true,
      count: cabanasDisponibles.length,
      data: cabanasDisponibles,
      metadata: {
        fechaSolicitada: { 
          checkIn: fechaInicioDate.toISOString(),
          checkOut: fechaFinDate.toISOString()
        },
        totalCabanas: todasCabanasRaw.length,
        cabanasOcupadas: Array.from(cabanasOcupadasIds).length
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