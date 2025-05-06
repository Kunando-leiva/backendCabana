import Cabana from '../models/Cabana.js';
import Reserva from '../models/Reserva.js';
// import { generateImageUrl,} from '../utils/imageHelpers.js';
import mongoose from 'mongoose';
import Image from '../models/Image.js';

// Crear cabaña (Admin)
export const crearCabana = async (req, res) => {
    try {
        const { nombre, descripcion, precio, capacidad, servicios, imageIds } = req.body;

        // Validación básica
        if (!nombre || !descripcion || !precio || !capacidad) {
            return res.status(400).json({
                success: false,
                error: "Faltan campos obligatorios"
            });
        }

        // Verificar imágenes si se proporcionan
        let images = [];
        if (imageIds && imageIds.length > 0) {
            // Validar que los IDs son válidos
            const validImageIds = imageIds.filter(id => mongoose.Types.ObjectId.isValid(id));
            if (validImageIds.length !== imageIds.length) {
                return res.status(400).json({
                    success: false,
                    error: "Algunos IDs de imagen no son válidos"
                });
            }

            // Verificar que las imágenes existen
            const existingImages = await Image.find({ _id: { $in: validImageIds } });
            if (existingImages.length !== validImageIds.length) {
                return res.status(400).json({
                    success: false,
                    error: "Algunas imágenes no existen"
                });
            }

            images = validImageIds;
        }

        // Crear la cabaña
        const nuevaCabana = new Cabana({
            nombre,
            descripcion,
            precio: Number(precio),
            capacidad: Number(capacidad),
            servicios: servicios || [],
            images
        });

        await nuevaCabana.save();

        // Actualizar las imágenes con la referencia a la cabaña
        if (images.length > 0) {
            await Image.updateMany(
                { _id: { $in: images } },
                { $set: { relatedCabana: nuevaCabana._id } }
            );
        }

        res.status(201).json({
            success: true,
            data: nuevaCabana
        });

    } catch (error) {
        console.error('Error al crear cabaña:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};

// Función auxiliar para validar ObjectIds de MongoDB
function isValidObjectId(id) {
    return /^[0-9a-fA-F]{24}$/.test(id);
}

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

// Al subir imágenes:
// export const uploadImages = async (req, res) => {
//     try {
//       const { id } = req.params;
//       const uploadedFiles = req.files.map(file => ({
//         publicId: file.filename.split('.')[0],
//         url: `/persistent-uploads/${file.filename}`,
//         formato: file.filename.split('.').pop()
//       }));
  
//       const cabana = await Cabana.findByIdAndUpdate(
//         id,
//         { $push: { imagenes: { $each: uploadedFiles } } },
//         { new: true }
//       );
  
//       res.status(201).json(cabana.imagenes);
//     } catch (error) {
//       res.status(500).json({ error: 'Error al subir imágenes' });
//     }
//   };
  
//   export const deleteImage = async (req, res) => {
//     try {
//       const { id, imageId } = req.params;
//       const cabana = await Cabana.findById(id);
      
//       const imagen = cabana.imagenes.find(img => img._id.toString() === imageId);
//       if (!imagen) throw new Error('Imagen no encontrada');
  
//       // Elimina el archivo físico
//       fs.unlinkSync(join(__dirname, `../../persistent-uploads/${imagen.publicId}.${imagen.formato}`));
  
//       // Elimina la referencia en la DB
//       cabana.imagenes = cabana.imagenes.filter(img => img._id.toString() !== imageId);
//       await cabana.save();
  
//       res.status(200).json(cabana);
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   };
