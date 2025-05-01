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
        const cabanaData = req.body;
        
        // Actualizar URLs de imágenes si es necesario
        if (cabanaData.imagenes && Array.isArray(cabanaData.imagenes)) {
            cabanaData.imagenes = cabanaData.imagenes.map(img => 
                img.startsWith('http') ? img : generateImageUrl(req, img)
            );
        }

        const cabana = await Cabana.findByIdAndUpdate(
            req.params.id, 
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
    // Validar que el ID sea un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
            success: false,
            error: 'ID de cabaña inválido'
        });
    }

    try {
        const cabana = await Cabana.findById(req.params.id)
            .select('-fechasReservadas -__v') // Excluir campos innecesarios
            .lean();

        if (!cabana) {
            return res.status(404).json({
                success: false,
                error: 'Cabaña no encontrada'
            });
        }

        // Validación y transformación de datos
        const cabanaTransformada = {
            _id: cabana._id,
            nombre: cabana.nombre || 'Sin nombre',
            descripcion: cabana.description || cabana.descripcion || '',
            precio: Number(cabana.precio) || 0,
            capacidad: Number(cabana.capacidad) || 1,
            servicios: Array.isArray(cabana.servicios) ? cabana.servicios : [],
            imagenes: procesarImagenes(cabana.imagenes, req),
            createdAt: cabana.createdAt,
            updatedAt: cabana.updatedAt
        };

        res.status(200).json({
            success: true,
            data: cabanaTransformada
        });

    } catch (error) {
        console.error('Error en verCabana:', error);
        
        // Manejar diferentes tipos de errores
        const statusCode = error.name === 'CastError' ? 400 : 500;
        const errorMessage = error.name === 'CastError' 
            ? 'Formato de ID inválido' 
            : 'Error al obtener la cabaña';

        res.status(statusCode).json({ 
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Función auxiliar para procesar imágenes
const procesarImagenes = (imagenes, req) => {
    if (!imagenes) return [];
    
    // Si es un string individual, convertirlo a array
    if (typeof imagenes === 'string') {
        imagenes = [imagenes];
    }

    // Asegurar que sea un array
    if (!Array.isArray(imagenes)) return [];

    return imagenes.map(img => {
        if (typeof img !== 'string') return generateImageUrl(req, 'default.jpg');
        
        // Si ya es una URL completa
        if (img.startsWith('http')) {
            return img.replace('http://', 'https://');
        }
        
        // Si es solo el nombre del archivo
        return generateImageUrl(req, img);
    });
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

        // Buscar reservas que se superpongan
        const reservas = await Reserva.find({
            $or: [
                { 
                    fechaInicio: { $lt: fechaFinDate }, 
                    fechaFin: { $gt: fechaInicioDate } 
                }
            ],
            estado: { $ne: 'cancelada' }
        });

        // Obtener IDs de cabañas ocupadas
        const cabanasOcupadasIds = reservas.map(r => r.cabana);

        // Buscar cabañas disponibles
        const cabanasDisponibles = await Cabana.find({
            _id: { $nin: cabanasOcupadasIds }
        }).lean();

        // Asegurar URLs HTTPS para las imágenes
        const cabanasConImagenes = cabanasDisponibles.map(cabana => ({
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
        console.error('Error en listarCabanasDisponibles:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al buscar cabañas disponibles',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};