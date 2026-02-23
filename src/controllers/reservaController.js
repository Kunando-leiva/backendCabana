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
// 2. MODIFICAR: crearReservaAdmin - VERSIÓN CORREGIDA
// ============================================
export const crearReservaAdmin = async (req, res) => {
  try {
    const { cabanaId, fechaInicio, fechaFin, huesped } = req.body;

    console.log('📝 crearReservaAdmin - Iniciando reserva para cabaña:', cabanaId);
    console.log('📅 Fechas recibidas:', { fechaInicio, fechaFin });

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

    // Crear fechas SIN HORAS para comparación
    const fechaInicioDate = new Date(fechaInicio + 'T00:00:00.000Z');
    const fechaFinDate = new Date(fechaFin + 'T00:00:00.000Z');
    
    console.log('📅 Fechas parseadas (sin horas):', {
      inicio: fechaInicioDate.toISOString(),
      fin: fechaFinDate.toISOString()
    });
    
    if (fechaInicioDate >= fechaFinDate) {
      return res.status(400).json({ 
        success: false,
        error: 'La fecha fin debe ser posterior a la fecha inicio' 
      });
    }

    // 🔥 CONDICIÓN CORREGIDA: Buscar reservas que se superpongan
    // Una reserva existente ocupa las noches desde su fechaInicio hasta fechaFin-1
    // Tu reserva ocupa las noches desde fechaInicioDate hasta fechaFinDate-1
    
    const existeReserva = await Reserva.findOne({
      cabana: cabanaId,
      $and: [
        { fechaInicio: { $lt: fechaFinDate } },  // La reserva empieza ANTES de tu check-out
        { fechaFin: { $gt: fechaInicioDate } }     // La reserva termina DESPUÉS de tu check-in
      ],
      estado: { $ne: 'cancelada' }
    });

    if (existeReserva) {
      console.log('❌ Conflicto con reserva existente:', existeReserva._id);
      
      // Log detallado
      console.log('   - Tu reserva:', {
        inicio: fechaInicioDate.toISOString(),
        fin: fechaFinDate.toISOString()
      });
      console.log('   - Reserva existente:', {
        inicio: existeReserva.fechaInicio,
        fin: existeReserva.fechaFin
      });
      
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

    // Crear fechas con horas para guardar en la BD
    const fechaInicioBD = new Date(fechaInicio + 'T15:00:00.000Z'); // 12:00 PM ART
    const fechaFinBD = new Date(fechaFin + 'T13:00:00.000Z');      // 10:00 AM ART

    // Calcular precio total
    const precioTotal = calcularPrecioTotal(fechaInicioDate, fechaFinDate);
    console.log('💰 Precio total calculado:', precioTotal);
    
    const cabana = await Cabana.findById(cabanaId);
    if (!cabana) {
      return res.status(404).json({
        success: false,
        error: 'Cabaña no encontrada'
      });
    }

    // Crear la reserva
    const reserva = new Reserva({
      usuario: req.user.id,
      cabana: cabanaId,
      dni: huesped.dni.trim(),
      fechaInicio: fechaInicioBD,
      fechaFin: fechaFinBD,
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

    // Actualizar la cabaña con las fechas reservadas
    await Cabana.findByIdAndUpdate(cabanaId, {
      $push: {
        fechasReservadas: {
          fechaInicio: fechaInicioBD,
          fechaFin: fechaFinBD,
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
// 🔥 FUNCIÓN CORREGIDA - VERSIÓN GENERAL DEFINITIVA
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
    }
    
    const reservas = await Reserva.find(query)
      .select('fechaInicio fechaFin cabana')
      .lean();

    console.log(`📊 ${reservas.length} reservas encontradas`);

    // 🔥 NUEVA LÓGICA: Separar días de check-in y noches ocupadas
    const nochesOcupadas = new Set(); // Días donde se DUERME (check-in hasta check-out-1)
    const diasCheckIn = new Set();    // Días donde hay ENTRADA (check-in)
    
    reservas.forEach((reserva) => {
      try {
        const fechaInicio = new Date(reserva.fechaInicio);
        const fechaFin = new Date(reserva.fechaFin);
        
        // Normalizar a UTC
        const inicioUTC = new Date(Date.UTC(
          fechaInicio.getUTCFullYear(),
          fechaInicio.getUTCMonth(),
          fechaInicio.getUTCDate()
        ));
        
        const finUTC = new Date(Date.UTC(
          fechaFin.getUTCFullYear(),
          fechaFin.getUTCMonth(),
          fechaFin.getUTCDate()
        ));
        
        const inicioStr = inicioUTC.toISOString().split('T')[0];
        const finStr = finUTC.toISOString().split('T')[0];
        
        console.log(`📅 Reserva: ${inicioStr} → ${finStr}`);
        
        // 🔥 REGLA DE NEGOCIO:
        // 1. Las NOCHES OCUPADAS son desde fechaInicio HASTA fechaFin-1
        // 2. Los días de CHECK-IN (fechaInicio) están disponibles para CHECK-OUT hasta las 10AM
        
        // Marcar noches ocupadas (días donde se duerme)
        const fechaActual = new Date(inicioUTC);
        while (fechaActual.toISOString().split('T')[0] < finStr) {
          const fechaStr = fechaActual.toISOString().split('T')[0];
          nochesOcupadas.add(fechaStr);
          console.log(`   🛌 Noche ocupada: ${fechaStr}`);
          fechaActual.setUTCDate(fechaActual.getUTCDate() + 1);
        }
        
        // Marcar día de check-in (entrada 12PM)
        diasCheckIn.add(inicioStr);
        console.log(`   🔓 Día check-in (disponible para check-out hasta 10AM): ${inicioStr}`);
        
      } catch (error) {
        console.warn(`⚠️ Error:`, error.message);
      }
    });

    // 🔥 Decidir qué días mostrar como "ocupados" en el calendario:
    // Mostramos SOLO las noches ocupadas, NO los días de check-in
    const fechasAMostrar = [...nochesOcupadas].sort();

    console.log(`📊 RESULTADO:`);
    console.log(`   - Noches ocupadas: ${nochesOcupadas.size}`);
    console.log(`   - Días check-in (disponibles para check-out): ${diasCheckIn.size}`);
    console.log(`   - Total fechas a mostrar: ${fechasAMostrar.length}`);
    
    // Verificación específica para el 20 de febrero
    if (diasCheckIn.has('2026-02-20')) {
      console.log('✅ 2026-02-20 es check-in (disponible para check-out)');
    }
    if (nochesOcupadas.has('2026-02-20')) {
      console.log('✅ 2026-02-20 es noche ocupada');
    }

    res.status(200).json({
      success: true,
      fechas: fechasAMostrar,        // Solo noches ocupadas
      data: fechasAMostrar,
      total: fechasAMostrar.length,
      mensaje: `Se encontraron ${fechasAMostrar.length} noches ocupadas`
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener fechas ocupadas'
    });
  }
};

// ============================================
// NUEVO ENDPOINT: OBTENER CABAÑAS DISPONIBLES
// ============================================
export const getCabanasDisponibles = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    console.log('🏨 Buscando cabañas disponibles...');
    console.log('📅 Fechas solicitadas:', { fechaInicio, fechaFin });

    // Validaciones básicas
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren fechaInicio y fechaFin en formato YYYY-MM-DD'
      });
    }

    // Crear fechas - usar UTC para consistencia
    const fechaInicioDate = new Date(fechaInicio + 'T12:00:00Z');
    const fechaFinDate = new Date(fechaFin + 'T10:00:00Z');
    
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

    console.log('🔍 Buscando reservas conflictivas...');
    
    // 🔥 NUEVA LÓGICA: Usar la misma que getFechasOcupadas
    // Una cabaña está ocupada si hay una reserva que cubra ALGUNA de las noches
    // Las noches son desde fechaInicioDate hasta fechaFinDate-1
    
    const reservasEnRango = await Reserva.find({
      estado: { $ne: 'cancelada' },
      $or: [
        // Caso 1: Reserva que comienza antes de nuestro check-out y termina después de nuestro check-in
        // Pero NO considerar si termina exactamente el día de nuestro check-out (check-out válido)
        {
          fechaInicio: { $lt: fechaFinDate },  // Comienza antes de que nos vayamos
          fechaFin: { $gt: fechaInicioDate }    // Termina después de que llegamos
        }
      ]
    })
    .select('cabana fechaInicio fechaFin')
    .lean();

    console.log(`📊 Reservas encontradas: ${reservasEnRango.length}`);

    // 🔥 FILTRADO ADICIONAL: Excluir reservas que terminan exactamente el día de check-out
    const reservasConflictivas = reservasEnRango.filter(reserva => {
      const reservaFinDate = new Date(reserva.fechaFin);
      const reservaInicioDate = new Date(reserva.fechaInicio);
      
      // Normalizar a YYYY-MM-DD para comparación
      const reservaFinStr = reservaFinDate.toISOString().split('T')[0];
      const fechaFinStr = fechaFinDate.toISOString().split('T')[0];
      const reservaInicioStr = reservaInicioDate.toISOString().split('T')[0];
      
      // Si la reserva termina el mismo día de nuestro check-out, NO es conflicto
      if (reservaFinStr === fechaFinStr) {
        console.log(`✅ Reserva termina el día de check-out (${reservaFinStr}), NO bloquea`);
        return false;
      }
      
      // Si la reserva comienza el mismo día de nuestro check-out después de las 10AM, NO es conflicto
      if (reservaInicioStr === fechaFinStr) {
        console.log(`✅ Reserva comienza el día de check-out (${reservaInicioStr}), disponible para check-out hasta 10AM`);
        return false;
      }
      
      console.log(`❌ Reserva conflictiva: ${reservaInicioStr} → ${reservaFinStr}`);
      return true;
    });

    console.log(`📊 Reservas conflictivas después de filtrar: ${reservasConflictivas.length}`);

    // IDs de cabañas ocupadas
    const cabanasOcupadasIds = new Set();
    reservasConflictivas.forEach((reserva) => {
      cabanasOcupadasIds.add(reserva.cabana.toString());
    });

    console.log(`📋 Cabañas ocupadas: ${Array.from(cabanasOcupadasIds).length}`);

    // Obtener cabañas disponibles
    console.log('🔍 Obteniendo cabañas disponibles con populate...');
    
    const cabanasDisponibles = await Cabana.find({
      _id: { $nin: Array.from(cabanasOcupadasIds) }
    })
    .populate({
      path: 'images',
      select: 'url filename _id',
      match: { url: { $exists: true } }
    })
    .populate({
      path: 'imagenPrincipal',
      select: 'url filename _id'
    })
    .lean();

    console.log(`📄 Cabañas disponibles encontradas: ${cabanasDisponibles.length}`);

    // Procesar respuesta
    const API_URL = process.env.API_URL || 'http://localhost:5000';
    
    const response = cabanasDisponibles.map(cabana => {
      const imagen = cabana.images?.[0]?.url || 
                   cabana.imagenPrincipal || 
                   `${API_URL}/default-cabana.jpg`;

      return {
        _id: cabana._id,
        nombre: cabana.nombre,
        descripcion: cabana.descripcion || '',
        capacidad: cabana.capacidad || 2,
        precio: cabana.precio || 0,
        servicios: Array.isArray(cabana.servicios) ? cabana.servicios : [],
        comodidades: Array.isArray(cabana.comodidades) ? cabana.comodidades : [],
        imagenPrincipal: imagen.startsWith('http') ? imagen : `${API_URL}${imagen.startsWith('/') ? '' : '/'}${imagen}`,
        imagenes: (cabana.images || []).map(img => ({
          _id: img._id,
          url: img.url?.startsWith('http') ? img.url : `${API_URL}${img.url?.startsWith('/') ? '' : '/'}${img.url}`,
          filename: img.filename || 'imagen.jpg'
        })),
        disponible: true,
        createdAt: cabana.createdAt,
        updatedAt: cabana.updatedAt
      };
    });

    console.log(`🎉 ${response.length} cabañas procesadas correctamente`);

    res.status(200).json({
      success: true,
      count: response.length,
      data: response,
      metadata: {
        fechaSolicitada: { 
          checkIn: fechaInicioDate.toISOString(),
          checkOut: fechaFinDate.toISOString()
        },
        totalCabanas: await Cabana.countDocuments(),
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