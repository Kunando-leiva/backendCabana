import Cabana from '../models/Cabana.js';

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
      const cabanas = await Cabana.find({
          $or: [
              { fechasReservadas: { $eq: [] } },
              {
                  fechasReservadas: {
                      $not: {
                          $elemMatch: {
                              fechaInicio: { $lt: new Date(fechaFin) },
                              fechaFin: { $gt: new Date(fechaInicio) },
                          },
                      },
                  },
              },
          ],
      });
      res.status(200).json(cabanas);
  } catch (error) {
      res.status(400).json({ error: error.message });
  }
};