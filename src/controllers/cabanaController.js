import Cabana from '../models/Cabana.js';
import Reserva from '../models/Reserva.js';
import { generateImageUrl, updateImageUrls } from '../utils/imageHelpers.js';

// Crear cabaña (Admin)
export const crearCabana = async (req, res) => {
    try {
        // Generar URLs completas para las imágenes si vienen en el body
        const cabanaData = req.body;
        if (cabanaData.imagenes && Array.isArray(cabanaData.imagenes)) {
            cabanaData.imagenes = cabanaData.imagenes.map(img => 
                img.startsWith('http') ? img : generateImageUrl(req, img)
            );
        }

        const nuevaCabana = new Cabana(cabanaData);
        await nuevaCabana.save();
        
        res.status(201).json({
            success: true,
            data: nuevaCabana
        });
    } catch (error) {
        res.status(400).json({ 
            success: false,
            error: error.message 
        });
    }
};

// Actualizar cabaña (Admin)
export const actualizarCabana = async (req, res) => {
    try {
        const { id } = req.params;
        const cabanaData = req.body;

        // Validar ID
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                error: 'ID de cabaña no válido'
            });
        }

        // Actualizar URLs de imágenes si es necesario
        if (cabanaData.imagenes && Array.isArray(cabanaData.imagenes)) {
            cabanaData.imagenes = cabanaData.imagenes.map(img => 
                img.startsWith('http') ? img : generateImageUrl(req, img)
            );
        }

        const cabana = await Cabana.findByIdAndUpdate(
            id, 
            cabanaData, 
            { new: true, runValidators: true }
        );

        if (!cabana) {
            return res.status(404).json({
                success: false,
                error: 'Cabaña no encontrada'
            });
        }

        res.status(200).json({
            success: true,
            data: cabana
        });
    } catch (error) {
        res.status(400).json({ 
            success: false,
            error: error.message 
        });
    }
};

// Eliminar cabaña (Admin)
export const eliminarCabana = async (req, res) => {
    try {
        const cabana = await Cabana.findByIdAndDelete(req.params.id);
        
        if (!cabana) {
            return res.status(404).json({
                success: false,
                error: 'Cabaña no encontrada'
            });
        }

        res.status(200).json({ 
            success: true,
            message: 'Cabaña eliminada correctamente' 
        });
    } catch (error) {
        res.status(400).json({ 
            success: false,
            error: error.message 
        });
    }
};

// Listar todas las cabañas (Admin y usuarios)
export const listarCabanas = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const cabanas = await Cabana.find().limit(limit).lean();

        // Construir URLs completas para las imágenes
        const cabanasConImagenes = cabanas.map(cabana => ({
            ...cabana,
            imagenes: cabana.imagenes?.map(img => 
                img.startsWith('http') ? img : generateImageUrl(req, img)
            ) || []
        }));

        res.status(200).json({
            success: true,
            data: cabanasConImagenes
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: "Error al obtener cabañas",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Ver detalles de una cabaña (público)
export const verCabana = async (req, res) => {
    try {
        const cabana = await Cabana.findById(req.params.id).lean();
        
        if (!cabana) {
            return res.status(404).json({
                success: false,
                error: 'Cabaña no encontrada'
            });
        }

        // Asegurar URLs HTTPS para las imágenes
        const cabanaConImagenes = {
            ...cabana,
            imagenes: cabana.imagenes?.map(img => 
                img.startsWith('http') ? img : generateImageUrl(req, img)
            ) || []
        };

        res.status(200).json({
            success: true,
            data: cabanaConImagenes
        });
    } catch (error) {
        res.status(400).json({ 
            success: false,
            error: error.message 
        });
    }
};

// Obtener servicios disponibles
export const getServiciosDisponibles = async (req, res) => {
    try {
        const servicios = await Cabana.aggregate([
            { $unwind: "$servicios" },
            { $group: { _id: "$servicios" } },
            { $sort: { _id: 1 } }
        ]);
        
        const serviciosDefault = [
            'Wifi', 'Piscina', 'Aire acondicionado', 'Cocina', 'Estacionamiento',
            'TV', 'Ropa de cama', 'Artículos de aseo', 'Balcón o terraza',
            'Calefacción', 'Cocina equipada', 'Solárium o reposeras', 'Ducha',
            'Secadora', 'Cama doble', 'Heladera', 'Microondas', 'Ingreso con llave o tarjeta',
            'Pava eléctrica', 'Televisión', 'Sofá', 'Toallas', 'Vajilla',
            'Placard o armario', 'Seguridad (cámara o vigilancia)', 'Wi-Fi', 'Ventiladores'
        ];

        const serviciosUnicos = [...new Set([
            ...servicios.map(s => s._id),
            ...serviciosDefault
        ])].sort();
        
        res.status(200).json({
            success: true,
            data: serviciosUnicos
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};

// Listar cabañas disponibles en un rango de fechas
export const listarCabanasDisponibles = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;

        // 1. Validación avanzada de fechas
        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({ 
                success: false,
                code: 'MISSING_DATES',
                message: 'Debe proporcionar fechaInicio y fechaFin',
                details: 'Ambos parámetros son requeridos en formato YYYY-MM-DD'
            });
        }

        const fechaInicioDate = new Date(fechaInicio);
        const fechaFinDate = new Date(fechaFin);

        if (isNaN(fechaInicioDate.getTime())) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_START_DATE',
                message: 'Fecha inicio no válida',
                details: 'Formato debe ser YYYY-MM-DD'
            })
            ;
        }

        if (isNaN(fechaFinDate.getTime())) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_END_DATE',
                message: 'Fecha fin no válida',
                details: 'Formato debe ser YYYY-MM-DD'
            });
        }

        if (fechaInicioDate >= fechaFinDate) {
            return res.status(400).json({ 
                success: false,
                code: 'INVALID_DATE_RANGE',
                message: 'La fecha fin debe ser posterior a la fecha inicio',
                details: `Rango recibido: ${fechaInicio} a ${fechaFin}`
            });
        }

        // 2. Optimización: Cache de 5 minutos para consultas frecuentes
        const cacheKey = `disponibles-${fechaInicio}-${fechaFin}`;
        const cached = await redisClient?.get(cacheKey);
        
        if (cached) {
            return res.status(200).json(JSON.parse(cached));
        }

        // 3. Búsqueda eficiente con agregación
        const cabanasDisponibles = await Reserva.aggregate([
            // Paso 1: Encontrar reservas que se superponen
            {
                $match: {
                    $and: [
                        { fechaInicio: { $lt: fechaFinDate } },
                        { fechaFin: { $gt: fechaInicioDate } },
                        { estado: { $ne: 'cancelada' } }
                    ]
                }
            },
            // Paso 2: Agrupar por cabaña
            {
                $group: {
                    _id: "$cabana",
                    count: { $sum: 1 }
                }
            },
            // Paso 3: Buscar cabañas no reservadas
            {
                $lookup: {
                    from: "cabanas",
                    localField: "_id",
                    foreignField: "_id",
                    as: "cabanaInfo"
                }
            },
            // Paso 4: Proyectar solo las disponibles
            {
                $project: {
                    _id: 0,
                    cabanaId: "$_id",
                    reservas: "$count",
                    cabana: { $arrayElemAt: ["$cabanaInfo", 0] }
                }
            }
        ]);

        // 4. Procesamiento de imágenes seguro
        const baseUrl = `${req.protocol}://${req.get('host')}/uploads/`;
        const resultados = cabanasDisponibles.map(item => ({
            ...item.cabana,
            imagenes: item.cabana.imagenes?.map(img => 
                img.startsWith('http') ? img : `${baseUrl}${img}`
            ) || [],
            _disponibilidad: {
                reservasEnPeriodo: item.reservas
            }
        }));

        // 5. Cachear resultados
        if (redisClient) {
            await redisClient.setEx(
                cacheKey,
                300, // 5 minutos de cache
                JSON.stringify({ success: true, data: resultados })
            );
        }

        return res.status(200).json({ 
            success: true,
            data: resultados,
            metadata: {
                total: resultados.length,
                fechaInicio,
                fechaFin,
                consultadoEn: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('[ERROR] listarCabanasDisponibles:', {
            message: error.message,
            stack: error.stack,
            params: req.query
        });

        return res.status(500).json({ 
            success: false,
            code: 'SERVER_ERROR',
            message: 'Error al procesar la solicitud',
            details: process.env.NODE_ENV === 'development' ? {
                error: error.message,
                stack: error.stack
            } : undefined
        });
    }
};

