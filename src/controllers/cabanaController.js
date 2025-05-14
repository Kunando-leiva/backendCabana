import Cabana from '../models/Cabana.js';
import Reserva from '../models/Reserva.js';
import mongoose from 'mongoose';
import Image from '../models/Image.js';
import { API_URL } from '../../config/config.js';
import { gridFSBucket } from '../../config/gridfs-config.js';
import {  procesarImagenes } from '../utils/imageMiddleware.js';

export const crearCabana = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Extraer datos del formulario y archivos
    const { nombre, descripcion, precio, capacidad, servicios } = req.body;
    const files = req.files || [];
    const userId = req.user._id;

    // 2. Validación básica
    if (!nombre || !descripcion || !precio || !capacidad) {
      throw new Error('Faltan campos obligatorios');
    }

    // 3. Procesar imágenes
    const imageDocuments = [];
    for (const file of files) {
      const uploadStream = gridFSBucket.openUploadStream(file.originalname, {
        metadata: {
          uploadedBy: userId,
          mimeType: file.mimetype,
          originalName: file.originalname,
          size: file.size
        }
      });

      const fileId = await new Promise((resolve, reject) => {
        uploadStream.on('error', reject);
        uploadStream.on('finish', () => resolve(uploadStream.id));
        uploadStream.end(file.buffer);
      });

      const newImage = new Image({
        fileId,
        filename: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: userId,
        url: `/api/images/${fileId}`,
        isPublic: true
      });

      const savedImage = await newImage.save({ session });
      imageDocuments.push(savedImage._id);
    }

    // 4. Crear cabaña
    const nuevaCabana = new Cabana({
      nombre,
      descripcion,
      precio: Number(precio),
      capacidad: Number(capacidad),
      servicios: Array.isArray(servicios) ? servicios : JSON.parse(servicios || '[]'),
      images: imageDocuments,
      imagenPrincipal: imageDocuments[0] || null
    });

    const savedCabana = await nuevaCabana.save({ session });

    // 5. Actualizar referencias en imágenes
    if (imageDocuments.length > 0) {
      await Image.updateMany(
        { _id: { $in: imageDocuments } },
        { $set: { relatedCabana: savedCabana._id } },
        { session }
      );
    }

    await session.commitTransaction();

    // 6. Preparar respuesta
    const cabanaPopulada = await Cabana.findById(savedCabana._id)
      .populate('images imagenPrincipal')
      .lean();

    res.status(201).json({
      success: true,
      data: cabanaPopulada
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error en crearCabana:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    session.endSession();
  }
};

// Actualizar cabaña con manejo transaccional mejorado
export const actualizarCabana = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
      const { id } = req.params;
      const { nombre, descripcion, precio, capacidad, servicios, images: imagenesNuevas = [] } = req.body;
  
      // Validar IDs de imágenes
      const validImageIds = imagenesNuevas.filter(id => mongoose.Types.ObjectId.isValid(id));
      if (validImageIds.length !== imagenesNuevas.length) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false,
          error: 'IDs de imagen no válidos' 
        });
      }
  
      // Obtener cabaña actual
      const cabanaActual = await Cabana.findById(id).session(session);
      if (!cabanaActual) {
        await session.abortTransaction();
        return res.status(404).json({ 
          success: false,
          error: 'Cabaña no encontrada' 
        });
      }
  
      // Determinar imágenes a remover
      const imagenesPrevias = cabanaActual.images.map(img => img.toString());
      const imagenesARemover = imagenesPrevias.filter(img => !validImageIds.includes(img));
  
      // Actualizar cabaña
      const cabanaActualizada = await Cabana.findByIdAndUpdate(
        id,
        {
          nombre,
          descripcion,
          precio: Number(precio),
          capacidad: Number(capacidad),
          servicios: servicios || [],
          images: validImageIds,
          imagenPrincipal: validImageIds[0] || null
        },
        { new: true, session }
      ).populate('images');
  
      // Actualizar referencias de imágenes
      if (imagenesARemover.length > 0) {
        await Image.updateMany(
          { _id: { $in: imagenesARemover } },
          { $unset: { relatedCabana: "" } },
          { session }
        );
      }
  
      if (validImageIds.length > 0) {
        await Image.updateMany(
          { _id: { $in: validImageIds } },
          { $set: { relatedCabana: id } },
          { session }
        );
      }
  
      await session.commitTransaction();
  
      res.json({
        success: true,
        data: cabanaActualizada
      });
    } catch (error) {
      await session.abortTransaction();
      res.status(400).json({ 
        success: false,
        error: error.message 
      });
    } finally {
      session.endSession();
    }
  };

export const eliminarCabana = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const cabana = await Cabana.findById(req.params.id).session(session);
        if (!cabana) {
            throw new Error('Cabaña no encontrada');
        }

        // Eliminar referencias en imágenes
        if (cabana.images.length > 0) {
            await Image.updateMany(
                { _id: { $in: cabana.images } },
                { $unset: { relatedCabana: "" } },
                { session }
            );
        }

        await Cabana.findByIdAndDelete(req.params.id, { session });
        
        await session.commitTransaction();
        session.endSession();

        res.json({ 
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
                select: 'url filename',
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
          select: 'filename url fileId mimeType size',
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
  
      const cabanaConImagenes = {
        ...cabana,
        images: buildImageResponse(cabana.images || []),
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


// Obtener imágenes de cabaña con mejor manejo de errores
// Obtener imágenes de cabaña con mejor manejo de errores
export const obtenerImagenesCabana = async (req, res) => {
    try {
      const cabana = await Cabana.findById(req.params.id)
        .populate({
          path: 'images',
          select: 'url filename fileId mimeType size',
          match: { fileId: { $exists: true } }
        });
  
      if (!cabana) {
        return res.status(404).json({ 
          success: false,
          error: 'Cabaña no encontrada' 
        });
      }
  
      const imagenes = buildImageResponse(cabana.images);
  
      res.json({ 
        success: true, 
        data: imagenes.length > 0 ? imagenes : [{
          url: `${API_URL}/default-cabana.jpg`,
          filename: 'default.jpg'
        }]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error al obtener imágenes',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };

  export const asociarImagenes = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const { images } = req.body;

        const cabana = await Cabana.findById(id).session(session);
        if (!cabana) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false,
                error: 'Cabaña no encontrada' 
            });
        }

        const validImageIds = images.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validImageIds.length !== images.length) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false,
                error: 'IDs de imagen no válidos' 
            });
        }

        const existingImages = await Image.find({
            _id: { $in: validImageIds },
            fileId: { $exists: true }
        }).session(session);

        if (existingImages.length !== validImageIds.length) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false,
                error: 'Algunas imágenes no existen' 
            });
        }

        const updatedCabana = await Cabana.findByIdAndUpdate(
            id,
            { 
                $set: { 
                    images: validImageIds,
                    imagenPrincipal: validImageIds[0] || null 
                } 
            },
            { new: true, session }
        ).populate('images');

        await Image.updateMany(
            { _id: { $in: validImageIds } },
            { $set: { relatedCabana: id } },
            { session }
        );

        await session.commitTransaction();
        
        res.json({ 
            success: true,
            data: {
                ...updatedCabana.toObject(),
                images: existingImages.map(img => ({
                    _id: img._id,
                    url: img.url || `${API_URL}/api/images/${img.fileId}`,
                    filename: img.filename
                }))
            }
        });

    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({ 
            success: false,
            error: 'Error al asociar imágenes',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        session.endSession();
    }
};
  


export default {
    crearCabana,
    actualizarCabana,
    eliminarCabana,
    listarCabanas,
    verCabana,
    listarCabanasDisponibles,
    getServiciosDisponibles,
    obtenerImagenesCabana,
    asociarImagenes
  };