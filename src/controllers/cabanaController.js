import Cabana from '../models/Cabana.js';
import Reserva from '../models/Reserva.js'; // Asegúrate de importar el modelo de Reserva

// Crear cabaña (Admin)
export const crearCabana = async (req, res) => {
    try {
        const nuevaCabana = new Cabana(req.body);
        await nuevaCabana.save();
        res.status(201).json(nuevaCabana);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Actualizar cabaña (Admin)
export const actualizarCabana = async (req, res) => {
    try {
        const cabana = await Cabana.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(cabana);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Eliminar cabaña (Admin)
export const eliminarCabana = async (req, res) => {
    try {
        await Cabana.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Cabaña eliminada' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Listar todas las cabañas (Admin y usuarios)
export const listarCabanas = async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const cabanas = await Cabana.find().limit(limit).lean(); // .lean() para mejor performance
  
      // Construye URLs completas para las imágenes
      const cabanasConImagenes = cabanas.map(cabana => ({
        ...cabana,
        imagenes: cabana.imagenes?.map(img => 
          img.startsWith('http') ? img : `${req.protocol}://${req.get('host')}/uploads/${img}`
        ) || []
      }));
  
      res.status(200).json(cabanasConImagenes);
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: "Error al obtener cabañas",
        details: error.message 
      });
    }
  };

// Ver detalles de una cabaña (público)
export const verCabana = async (req, res) => {
  try {
      const cabana = await Cabana.findById(req.params.id);
      if (!cabana) {
          return res.status(404).json({ error: 'Cabaña no encontrada' });
      }
      res.status(200).json(cabana);
  } catch (error) {
      res.status(400).json({ error: error.message });
  }
};

// En tu controlador de cabañas (Cabana.js)
// En tu controlador de cabañas (Cabana.js)
export const getServiciosDisponibles = async (req, res) => {
  try {
    // Esto obtiene todos los servicios únicos usados en las cabañas existentes
    const servicios = await Cabana.aggregate([
      { $unwind: "$servicios" },
      { $group: { _id: "$servicios" } },
      { $sort: { _id: 1 } }
    ]);
    
    // Si no hay cabañas, devuelve servicios por defecto
    if (servicios.length === 0) {
      return res.json([
        'Wifi',
        'Piscina',
        'Aire acondicionado',
        'Cocina',
        'Estacionamiento',
        'TV',
        'Ropa de cama',
        'Artículos de aseo',
        'Balcón o terraza',
        'Calefacción',
        'Cocina equipada',
        'Solárium o reposeras',
        'Ducha',
        'Secadora',
        'Cama doble',
        'Heladera',
        'Microondas',
        'Ingreso con llave o tarjeta',
        'Pava eléctrica',
        'Televisión',
        'Sofá',
        'Toallas',
        'Vajilla',
        'Placard o armario',
        'Seguridad (cámara o vigilancia)',
        'Wi-Fi',
        'Ventiladores'
      ]);
    }
    
    // Combinar servicios existentes con los nuevos (eliminando duplicados)
    const serviciosUnicos = [...new Set([
      ...servicios.map(s => s._id),
      'Ropa de cama',
      'Artículos de aseo',
      'Balcón o terraza',
      'Calefacción',
      'Cocina equipada',
      'Solárium o reposeras',
      'Ducha',
      'Secadora',
      'Cama doble',
      'Heladera',
      'Microondas',
      'Ingreso con llave o tarjeta',
      'Pava eléctrica',
      'Televisión',
      'Sofá',
      'Toallas',
      'Vajilla',
      'Placard o armario',
      'Seguridad (cámara o vigilancia)',
      'Wi-Fi',
      'Ventiladores'
    ])].sort();
    
    res.json(serviciosUnicos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Listar cabañas disponibles en un rango de fechas (público)
export const listarCabanasDisponibles = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    // Validar fechas
    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ 
        success: false,
        error: 'Debe proporcionar fechaInicio y fechaFin' 
      });
    }

    const fechaInicioDate = new Date(fechaInicio);
    const fechaFinDate = new Date(fechaFin);

    if (fechaInicioDate >= fechaFinDate) {
      return res.status(400).json({ 
        success: false,
        error: 'La fecha fin debe ser posterior a la fecha inicio' 
      });
    }

    // Corrección: Usar Reserva con mayúscula (el modelo)
    const reservas = await Reserva.find({
      $or: [
        { 
          fechaInicio: { $lt: fechaFinDate }, 
          fechaFin: { $gt: fechaInicioDate } 
        }
      ],
      estado: { $ne: 'cancelada' }
    });

    const cabanasOcupadasIds = reservas.map(r => r.cabana);
    const cabanasDisponibles = await Cabana.find({
      _id: { $nin: cabanasOcupadasIds }
    });

    res.status(200).json({ 
      success: true,
      data: cabanasDisponibles 
    });
  } catch (error) {
    console.error('Error en listarCabanasDisponibles:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al buscar cabañas disponibles',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};