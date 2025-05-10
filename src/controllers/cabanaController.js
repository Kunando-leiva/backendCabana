import Cabana from '../models/Cabana.js';
import Reserva from '../models/Reserva.js';
import mongoose from 'mongoose';
import Image from '../models/Image.js';
import { API_URL } from '../../config/config.js';
import { gridFSBucket } from '../../config/gridfs-config.js';

// Crear cabaña (Admin)
// En controllers/cabanaController.js
export const crearCabana = async (req, res) => {
    try {
      const { nombre, descripcion, precio, capacidad, servicios } = req.body;
      const uploadedImages = req.uploadedImages || []; // Asume que el middleware procesa las imágenes
  
      // Crear la cabaña con referencias a las imágenes
      const nuevaCabana = new Cabana({
        nombre,
        descripcion,
        precio,
        capacidad,
        servicios,
        images: uploadedImages.map(img => img.fileId) // Usar fileId de GridFS
      });
  
      await nuevaCabana.save();
  
      // Actualizar las imágenes con la referencia a la cabaña
      if (uploadedImages.length > 0) {
        await Image.updateMany(
          { fileId: { $in: uploadedImages.map(img => img.fileId) } },
          { $set: { relatedCabana: nuevaCabana._id } }
        );
      }
  
      // Obtener la cabaña con las imágenes pobladas
      const cabanaConImagenes = await Cabana.findById(nuevaCabana._id)
        .populate({
          path: 'images',
          select: 'filename url fileId'
        });
  
      res.status(201).json({
        success: true,
        data: cabanaConImagenes
      });
  
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  };

// Actualizar cabaña (Admin)
export const actualizarCabana = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { id } = req.params;
        const { nombre, descripcion, precio, capacidad, servicios } = req.body;
        const uploadedImages = req.uploadedImages || []; // Imágenes nuevas subidas

        // Validar ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                error: 'ID de cabaña no válido'
            });
        }

        // Obtener cabaña existente
        const cabanaExistente = await Cabana.findById(id).session(session);
        if (!cabanaExistente) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                error: 'Cabaña no encontrada'
            });
        }

        // Procesar imágenes
        let imagesToKeep = cabanaExistente.images || [];
        let imagesToRemove = [];
        let imagesToAdd = uploadedImages.map(img => img.fileId);

        // Si se envía un array de imágenes en el body, reemplazar completamente
        if (req.body.images && Array.isArray(req.body.images)) {
            // Validar IDs de imágenes
            const validImageIds = req.body.images.filter(id => 
                mongoose.Types.ObjectId.isValid(id)
            );

            // Verificar que las imágenes existen
            const existingImages = await Image.find({ 
                fileId: { $in: validImageIds } 
            }).session(session);

            if (existingImages.length !== validImageIds.length) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({
                    success: false,
                    error: "Algunas imágenes no existen"
                });
            }

            // Determinar imágenes a mantener y eliminar
            imagesToKeep = validImageIds;
            imagesToRemove = cabanaExistente.images.filter(
                imgId => !validImageIds.includes(imgId.toString())
            );
        }

        // Eliminar referencia de imágenes removidas
        if (imagesToRemove.length > 0) {
            await Image.updateMany(
                { fileId: { $in: imagesToRemove } },
                { $unset: { relatedCabana: "" } },
                { session }
            );
        }

        // Agregar referencia a nuevas imágenes
        if (imagesToAdd.length > 0) {
            await Image.updateMany(
                { fileId: { $in: imagesToAdd } },
                { $set: { relatedCabana: id } },
                { session }
            );
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
                images: [...imagesToKeep, ...imagesToAdd]
            },
            { 
                new: true, 
                runValidators: true,
                session 
            }
        ).populate({
            path: 'images',
            select: 'filename url fileId mimeType size'
        });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            success: true,
            data: cabanaActualizada
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        
        // Eliminar imágenes subidas si hubo error
        if (req.uploadedImages?.length > 0) {
            await Promise.all(
                req.uploadedImages.map(img => 
                    gridFSBucket.delete(img.fileId).catch(console.error)
                )
            );
        }

        res.status(400).json({ 
            success: false,
            error: error.message 
        });
    }
};

// Eliminar cabaña (Admin)
export const eliminarCabana = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const cabana = await Cabana.findById(req.params.id).session(session);
        
        if (!cabana) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                error: 'Cabaña no encontrada'
            });
        }

        // Eliminar referencia de las imágenes asociadas
        if (cabana.images && cabana.images.length > 0) {
            await Image.updateMany(
                { fileId: { $in: cabana.images } },
                { $unset: { relatedCabana: "" } },
                { session }
            );
        }

        // Eliminar la cabaña
        await Cabana.findByIdAndDelete(req.params.id, { session });

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ 
            success: true,
            message: 'Cabaña eliminada correctamente' 
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        
        res.status(400).json({ 
            success: false,
            error: error.message 
        });
    }
};

// Listar todas las cabañas
export const listarCabanas = async (req, res) => {
    try {
        const cabanas = await Cabana.find()
            .populate({
                path: 'images',
                select: 'filename url fileId mimeType size',
                match: { isPublic: true } // Solo imágenes públicas
            })
            .lean();

        // Construir URLs completas para las imágenes
        const response = cabanas.map(cabana => ({
            ...cabana,
            images: cabana.images?.map(img => ({
                ...img,
                url: img.url || `${API_URL}/api/images/${img.fileId}`
            })) || [],
            imagenPrincipal: cabana.images?.[0]?.url || `${API_URL}/default-cabana.jpg`
        }));

        res.status(200).json({
            success: true,
            count: cabanas.length,
            data: response
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};

// Ver detalles de una cabaña
export const verCabana = async (req, res) => {
    try {
        const cabana = await Cabana.findById(req.params.id)
            .populate({
                path: 'images',
                select: 'filename url fileId mimeType size uploadedBy isPublic',
                match: { 
                    $or: [
                        { isPublic: true },
                        { uploadedBy: req.user?._id }
                    ]
                }
            })
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
                url: img.url || `${API_URL}/api/images/${img.fileId}`
            })) || [],
            imagenPrincipal: cabana.images?.[0]?.url || `${API_URL}/default-cabana.jpg`
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
        .populate({
            path: 'images',
            select: 'filename url fileId mimeType size',
            match: { isPublic: true },
            perDocumentLimit: 1 // Solo traer la primera imagen para la vista de lista
        })
        .lean();

        // Construir respuesta
        const response = cabanasDisponibles.map(cabana => ({
            ...cabana,
            imagenPrincipal: cabana.images?.[0]?.url || `${API_URL}/default-cabana.jpg`,
            precio: cabana.precio,
            capacidad: cabana.capacidad
        }));

        res.status(200).json({ 
            success: true,
            data: response
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

