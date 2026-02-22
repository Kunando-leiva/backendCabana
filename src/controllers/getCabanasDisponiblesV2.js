// controllers/getCabanasDisponiblesV2.js
import Reserva from '../models/Reserva.js';
import Cabana from '../models/Cabana.js';

export const getCabanasDisponiblesV2 = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    console.log('🏨 [V2] Buscando cabañas disponibles...');
    console.log('📅 Fechas solicitadas:', { fechaInicio, fechaFin });

    // Validaciones básicas
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren fechaInicio y fechaFin en formato YYYY-MM-DD'
      });
    }

    // Crear fechas
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

    console.log('🔍 [V2] Buscando reservas conflictivas...');
    
    // Traer TODAS las reservas activas
    const reservas = await Reserva.find({
      estado: { $ne: 'cancelada' }
    })
    .select('cabana fechaInicio fechaFin')
    .lean();

    console.log(`📊 [V2] Total reservas activas: ${reservas.length}`);

    // IDs de cabañas ocupadas
    const cabanasOcupadasIds = new Set();
    
    // Para cada reserva, verificar si se superpone con el rango solicitado
    reservas.forEach((reserva) => {
      const reservaInicio = new Date(reserva.fechaInicio);
      const reservaFin = new Date(reserva.fechaFin);
      
      // 🔥 CONDICIÓN CORRECTA: Cualquier superposición
      if (reservaFin > fechaInicioDate && reservaInicio < fechaFinDate) {
        console.log(`❌ [V2] CONFLICTO: Reserva ${reservaInicio.toISOString().split('T')[0]}→${reservaFin.toISOString().split('T')[0]}`);
        cabanasOcupadasIds.add(reserva.cabana.toString());
      }
    });

    console.log(`📋 [V2] Cabañas ocupadas: ${Array.from(cabanasOcupadasIds).length}`);

    // Obtener cabañas disponibles
    const cabanasDisponibles = await Cabana.find({
      _id: { $nin: Array.from(cabanasOcupadasIds) }
    })
    .populate({
      path: 'images',
      select: 'url filename _id'
    })
    .populate({
      path: 'imagenPrincipal',
      select: 'url filename _id'
    })
    .lean();

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
        disponible: true
      };
    });

    console.log(`🎉 [V2] ${response.length} cabañas disponibles`);

    res.status(200).json({
      success: true,
      count: response.length,
      data: response,
      metadata: {
        fechaSolicitada: { 
          checkIn: fechaInicioDate.toISOString().split('T')[0],
          checkOut: fechaFinDate.toISOString().split('T')[0]
        },
        totalCabanas: await Cabana.countDocuments(),
        cabanasOcupadas: Array.from(cabanasOcupadasIds).length
      }
    });

  } catch (error) {
    console.error('❌ [V2] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al buscar cabañas disponibles',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};