import Cabana from '../models/Cabana.js';
import Reserva from '../models/Reserva.js';
import mongoose from 'mongoose';
import Image from '../models/Image.js';
import { API_URL } from '../../config/config.js';
import { gridFSBucket } from '../../config/gridfs-config.js';
import {  procesarImagenes, buildImageResponse } from '../utils/imageMiddleware.js';

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

    // 3. Crear cabaña primero para tener su ID
    const nuevaCabana = new Cabana({
      nombre,
      descripcion,
      precio: Number(precio),
      capacidad: Number(capacidad),
      servicios: Array.isArray(servicios) ? servicios : JSON.parse(servicios || '[]'),
      images: [],
      imagenPrincipal: null
    });

    const savedCabana = await nuevaCabana.save({ session });

    // 4. Procesar imágenes con referencia directa a la cabaña
    const imageDocuments = [];
    for (const file of files) {
      const uploadStream = gridFSBucket.openUploadStream(file.originalname, {
        metadata: {
          uploadedBy: userId,
          mimeType: file.mimetype,
          originalName: file.originalname,
          size: file.size,
          relatedCabana: savedCabana._id // Añadimos la referencia aquí
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
        isPublic: true,
        relatedCabana: savedCabana._id // Referencia directa
      });

      const savedImage = await newImage.save({ session });
      imageDocuments.push(savedImage._id);
    }

    // 5. Actualizar cabaña con las imágenes
    savedCabana.images = imageDocuments;
    savedCabana.imagenPrincipal = imageDocuments[0] || null;
    await savedCabana.save({ session });

    await session.commitTransaction();

    // 6. Preparar respuesta con datos poblados
    const cabanaPopulada = await Cabana.findById(savedCabana._id)
      .populate({
        path: 'images',
        select: 'filename url relatedCabana',
        populate: {
          path: 'relatedCabana',
          select: 'nombre'
        }
      })
      .populate({
        path: 'imagenPrincipal',
        select: 'filename url relatedCabana',
        populate: {
          path: 'relatedCabana',
          select: 'nombre'
        }
      })
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
      const validImageIds = imagenesNuevas
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));
      
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
      const imagenesARemover = imagenesPrevias.filter(img => !imagenesNuevas.includes(img));
  
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
        { 
          new: true, 
          session,
          populate: {
            path: 'images',
            select: 'url filename'
          }
        }
      );
  
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
  
      // Formatear respuesta con URLs completas
      const responseData = {
        ...cabanaActualizada.toObject(),
        imagenes: cabanaActualizada.images.map(img => ({
          _id: img._id,
          url: img.url.startsWith('http') ? img.url : `${API_URL}${img.url}`,
          filename: img.filename
        }))
      };
  
      res.json({
        success: true,
        data: responseData
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
        select: 'url filename size createdAt',
        match: { isPublic: true }
      })
      .populate({
        path: 'imagenPrincipal',
        select: 'url filename -_id'
      })
      .lean();

    // Formatear URLs
    const response = cabanas.map(cabana => ({
      ...cabana,
      images: cabana.images?.map(img => ({
        ...img,
        url: img.url?.startsWith('http') 
          ? img.url 
          : `${API_URL}${img.url?.startsWith('/') ? '' : '/'}${img.url}`
      })) || [],
      imagenPrincipal: cabana.imagenPrincipal?.url 
        ? (cabana.imagenPrincipal.url.startsWith('http')
            ? cabana.imagenPrincipal.url
            : `${API_URL}${cabana.imagenPrincipal.url.startsWith('/') ? '' : '/'}${cabana.imagenPrincipal.url}`)
        : `${API_URL}/default-cabana.jpg`
    }));

    res.status(200).json({
      success: true,
      count: response.length,
      data: response
    });
  } catch (error) {
    console.error('Error en listarCabanas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener cabañas',
      details: API_URL === 'development' ? error.message : undefined
    });
  }
};

// Ver detalles de una cabaña
export const verCabana = async (req, res) => {
  try {
    const cabana = await Cabana.findById(req.params.id)
      .populate('images imagenPrincipal')
      .lean();

    if (!cabana) {
      return res.status(404).json({
        success: false,
        error: 'Cabaña no encontrada'
      });
    }

    // Formatear respuesta
    const formatImage = (img) => ({
      _id: img?._id,
      url: img?.url?.startsWith('http') 
        ? img.url 
        : `${API_URL}${img?.url?.startsWith('/') ? '' : '/'}${img?.url || ''}`,
      filename: img?.filename || 'default.jpg'
    });

    res.status(200).json({
      success: true,
      data: {
        ...cabana,
        images: cabana.images?.map(formatImage) || [],
        imagenPrincipal: formatImage(cabana.imagenPrincipal || cabana.images?.[0])
      }
    });

  } catch (error) {
    console.error('Error en verCabana:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener cabaña',
      details: API_URL === 'development' ? error.message : undefined
    });
  }
};


// controllers/cabanaController.js - CORREGIR listarCabanasDisponibles
export const listarCabanasDisponibles = async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;

        // Validación más estricta
        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({ 
                success: false,
                error: 'Debe proporcionar fechaInicio y fechaFin como parámetros de consulta' 
            });
        }

        // Validar formato de fechas
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(fechaInicio) || !dateRegex.test(fechaFin)) {
            return res.status(400).json({ 
                success: false,
                error: 'Formato de fecha inválido. Use YYYY-MM-DD' 
            });
        }

        const fechaInicioDate = new Date(fechaInicio);
        const fechaFinDate = new Date(fechaFin);

        // Validar que sean fechas válidas
        if (isNaN(fechaInicioDate.getTime()) || isNaN(fechaFinDate.getTime())) {
            return res.status(400).json({ 
                success: false,
                error: 'Fechas proporcionadas no son válidas' 
            });
        }

        if (fechaInicioDate >= fechaFinDate) {
            return res.status(400).json({ 
                success: false,
                error: 'La fecha fin debe ser posterior a la fecha inicio' 
            });
        }

        // 🔥 CORRECCIÓN: Buscar reservas que se superpongan CORRECTAMENTE
        // Una reserva ocupa desde fechaInicio HASTA fechaFin-1
        const reservas = await Reserva.find({
            estado: { $ne: 'cancelada' }
        }).select('cabana fechaInicio fechaFin');

        // Obtener IDs de cabañas ocupadas para las fechas solicitadas
        const cabanasOcupadasIds = [];
        
        reservas.forEach(reserva => {
            const reservaInicio = new Date(reserva.fechaInicio);
            const reservaFin = new Date(reserva.fechaFin);
            
            // 🔥 LÓGICA CORREGIDA: Una reserva NO ocupa su fecha de salida
            // Reserva ocupa: [reservaInicio, reservaFin)
            // Nueva reserva: [fechaInicioDate, fechaFinDate)
            
            // Hay conflicto si los rangos se superponen excluyendo el día de salida
            const hayConflicto = 
                reservaInicio < fechaFinDate && // Reserva comienza antes que nueva termine
                reservaFin > fechaInicioDate;   // Reserva termina después que nueva comience
                // NOTA: fechaFinDate es EXCLUSIVO (check-in no permitido ese día)
                //       reservaFin es EXCLUSIVO (check-out ese día)
            
            if (hayConflicto) {
                cabanasOcupadasIds.push(reserva.cabana.toString());
            }
        });

        // Buscar cabañas disponibles con imágenes
        const cabanasDisponibles = await Cabana.find({
            _id: { $nin: cabanasOcupadasIds }
        })
        .populate({
            path: 'images',
            select: 'url filename',
            match: { url: { $exists: true } },
            perDocumentLimit: 1
        })
        .lean();

        // Construir respuesta consistente
        const API_URL = process.env.API_URL || 'http://localhost:5000';
        const response = cabanasDisponibles.map(cabana => {
            const imagen = cabana.images?.[0]?.url || 
                         cabana.imagenPrincipal || 
                         `${API_URL}/default-cabana.jpg`;

            return {
                _id: cabana._id,
                nombre: cabana.nombre,
                descripcion: cabana.descripcion,
                capacidad: cabana.capacidad,
                precio: cabana.precio,
                servicios: cabana.servicios || [],
                imagenPrincipal: imagen.startsWith('http') ? imagen : `${API_URL}${imagen.startsWith('/') ? '' : '/'}${imagen}`,
                createdAt: cabana.createdAt,
                updatedAt: cabana.updatedAt,
                disponible: true,
                // 🔥 Info de debug
                debug: {
                    fechaInicio: fechaInicio,
                    fechaFin: fechaFin,
                    totalCabanas: cabanasDisponibles.length,
                    ocupadas: cabanasOcupadasIds.length
                }
            };
        });

        res.status(200).json({ 
            success: true,
            count: response.length,
            data: response,
            debug: {
                fechaInicio,
                fechaFin,
                cabanasOcupadas: cabanasOcupadasIds.length,
                totalCabanas: cabanasDisponibles.length,
                logic: 'Una reserva ocupa desde fechaInicio HASTA fechaFin-1 (no incluye día de salida)'
            }
        });

    } catch (error) {
        console.error('Error en listarCabanasDisponibles:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al buscar cabañas disponibles',
            details: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                stack: error.stack,
                fechaInicio: req.query.fechaInicio,
                fechaFin: req.query.fechaFin
            } : undefined
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
export const obtenerImagenesCabana = async (req, res) => {
  try {
    const cabana = await Cabana.findById(req.params.id)
      .select('images')
      .populate({
        path: 'images',
        select: 'url filename -_id'
      })
      .lean();

    if (!cabana) {
      return res.status(404).json({
        success: false,
        error: 'Cabaña no encontrada'
      });
    }

    res.status(200).json({
      success: true,
      data: cabana.images?.map(img => ({
        ...img,
        url: img.url?.startsWith('http') 
          ? img.url 
          : `${API_URL}${img.url}`
      })) || []
    });

  } catch (error) {
    console.error('Error en obtenerImagenesCabana:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener imágenes',
      details: API_URL === 'development' ? error.message : undefined
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
            details: API_URL === 'development' ? error.message : undefined
        });
    } finally {
        session.endSession();
    }
};
  
// controllers/imageController.js
export const obtenerTodasImagenes = async (req, res) => {
  try {
    const images = await Image.find({ isPublic: true })
      .select('url filename size createdAt mimeType')
      .sort({ createdAt: -1 })
      .lean();

    const formattedImages = images.map(img => ({
      ...img,
      url: formatImageUrl(img.url, img._id)
    }));

    res.status(200).json({
      success: true,
      count: formattedImages.length,
      data: formattedImages
    });
  } catch (error) {
    console.error('Error al obtener imágenes:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cargar imágenes',
      details: API_URL === 'development' ? error.message : undefined
    });
  }
};

// Función auxiliar para formatear URLs
function formatImageUrl(url, imageId) {
  if (!url) return `${API_URL}/api/images/${imageId}`;
  if (url.startsWith('http')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}


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