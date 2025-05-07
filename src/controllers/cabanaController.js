import Cabana from '../models/Cabana.js';
import Reserva from '../models/Reserva.js';
import mongoose from 'mongoose';
import Image from '../models/Image.js';
import { API_URL } from '../../config/config.js';

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

            // Verificar que las imágenes existen y obtener sus datos
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

        // Obtener la cabaña con las imágenes pobladas
        const cabanaConImagenes = await Cabana.findById(nuevaCabana._id)
            .populate('images', 'path originalName mimeType size');

        res.status(201).json({
            success: true,
            data: cabanaConImagenes
        });

    } catch (error) {
        console.error('Error al crear cabaña:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};

// Actualizar cabaña (Admin)
export const actualizarCabana = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, precio, capacidad, servicios, imageIds } = req.body;

        // Validar ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'ID de cabaña no válido'
            });
        }

        // Obtener cabaña existente
        const cabanaExistente = await Cabana.findById(id);
        if (!cabanaExistente) {
            return res.status(404).json({
                success: false,
                error: 'Cabaña no encontrada'
            });
        }

        // Procesar imágenes
        let images = cabanaExistente.images || [];
        if (imageIds && Array.isArray(imageIds)) {
            // Validar nuevos IDs de imágenes
            const validImageIds = imageIds.filter(id => mongoose.Types.ObjectId.isValid(id));
            const existingImages = await Image.find({ _id: { $in: validImageIds } });
            
            if (existingImages.length !== validImageIds.length) {
                return res.status(400).json({
                    success: false,
                    error: "Algunas imágenes no existen"
                });
            }

            // Eliminar referencia de imágenes removidas
            const imagenesARemover = cabanaExistente.images.filter(
                imgId => !validImageIds.includes(imgId.toString())
            );

            if (imagenesARemover.length > 0) {
                await Image.updateMany(
                    { _id: { $in: imagenesARemover } },
                    { $unset: { relatedCabana: "" } }
                );
            }

            // Agregar referencia a nuevas imágenes
            const nuevasImagenes = validImageIds.filter(
                imgId => !cabanaExistente.images.includes(imgId)
            );

            if (nuevasImagenes.length > 0) {
                await Image.updateMany(
                    { _id: { $in: nuevasImagenes } },
                    { $set: { relatedCabana: id } }
                );
            }

            images = validImageIds;
        }

        // Actualizar la cabaña
        const cabanaActualizada = await Cabana.findByIdAndUpdate(
            id,
            {
                nombre,
                descripcion,
                precio: Number(precio),
                capacidad: Number(capacidad),
                servicios: servicios || [],
                images
            },
            { new: true, runValidators: true }
        ).populate('images', 'path originalName mimeType size');

        res.status(200).json({
            success: true,
            data: cabanaActualizada
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
        const cabana = await Cabana.findById(req.params.id);
        
        if (!cabana) {
            return res.status(404).json({
                success: false,
                error: 'Cabaña no encontrada'
            });
        }

        // Eliminar referencia de las imágenes asociadas
        if (cabana.images && cabana.images.length > 0) {
            await Image.updateMany(
                { _id: { $in: cabana.images } },
                { $unset: { relatedCabana: "" } }
            );
        }

        // Eliminar la cabaña
        await Cabana.findByIdAndDelete(req.params.id);

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
        const cabanas = await Cabana.find()
            .limit(limit)
            .populate('images', 'path originalName mimeType size')
            .lean();

        // Construir URLs completas para las imágenes
        const cabanasConImagenes = cabanas.map(cabana => ({
            ...cabana,
            images: cabana.images?.map(img => ({
                ...img,
                url: img.path.startsWith('http') ? img.path : `${API_URL}${img.path}`
            })) || []
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
        const cabana = await Cabana.findById(req.params.id)
            .populate('images', 'path originalName mimeType size')
            .lean();
        
        if (!cabana) {
            return res.status(404).json({
                success: false,
                error: 'Cabaña no encontrada'
            });
        }

        // Construir URLs completas para las imágenes
        const cabanaConImagenes = {
            ...cabana,
            images: cabana.images?.map(img => ({
                ...img,
                url: img.path.startsWith('http') ? img.path : `${API_URL}${img.path}`
            })) || []
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

// Obtener servicios disponibles (se mantiene igual)
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
        })
        .populate('images', 'path originalName mimeType size')
        .lean();

        // Construir URLs completas para las imágenes
        const cabanasConImagenes = cabanasDisponibles.map(cabana => ({
            ...cabana,
            images: cabana.images?.map(img => ({
                ...img,
                url: img.path.startsWith('http') ? img.path : `${API_URL}${img.path}`
            })) || []
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
