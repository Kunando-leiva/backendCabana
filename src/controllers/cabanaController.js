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
// En controllers/cabanaController.js - REEMPLAZA la función actualizarCabana
// REEMPLAZA LA FUNCIÓN actualizarCabana EXISTENTE con esta:

export const actualizarCabana = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const { 
            nombre, 
            descripcion, 
            precio, 
            capacidad, 
            servicios,
            imagesToKeep,    // IDs de imágenes a CONSERVAR
            imagesToDelete   // IDs de imágenes a ELIMINAR
        } = req.body;

        const newFiles = req.files || [];  // Nuevas imágenes subidas
        const userId = req.user._id;

        console.log('📝 Datos recibidos:', {
            id,
            imagesToKeep,
            imagesToDelete,
            tipoImagesToKeep: typeof imagesToKeep,
            tipoImagesToDelete: typeof imagesToDelete,
            newFiles: newFiles.length
        });

        // ✅✅✅ CORRECCIÓN 1: Asegurar que imagesToDelete sea un array
        let imagesToDeleteArray = [];
        if (imagesToDelete) {
            // Si es string, intentar parsear como JSON
            if (typeof imagesToDelete === 'string') {
                try {
                    imagesToDeleteArray = JSON.parse(imagesToDelete);
                } catch (e) {
                    console.log('⚠️ No se pudo parsear imagesToDelete como JSON');
                    imagesToDeleteArray = [];
                }
            } 
            // Si ya es array, usarlo directamente
            else if (Array.isArray(imagesToDelete)) {
                imagesToDeleteArray = imagesToDelete;
            }
        }

        // ✅✅✅ CORRECCIÓN 2: Asegurar que imagesToKeep sea un array
        let imagesToKeepArray = [];
        if (imagesToKeep) {
            if (typeof imagesToKeep === 'string') {
                try {
                    imagesToKeepArray = JSON.parse(imagesToKeep);
                } catch (e) {
                    console.log('⚠️ No se pudo parsear imagesToKeep como JSON');
                    imagesToKeepArray = [];
                }
            } else if (Array.isArray(imagesToKeep)) {
                imagesToKeepArray = imagesToKeep;
            }
        }

        console.log('✅ Arrays procesados:', {
            imagesToKeepArray,
            imagesToDeleteArray,
            esArrayKeep: Array.isArray(imagesToKeepArray),
            esArrayDelete: Array.isArray(imagesToDeleteArray)
        });

        // 1. Validar cabaña existe
        const cabanaActual = await Cabana.findById(id).session(session);
        if (!cabanaActual) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false,
                error: 'Cabaña no encontrada' 
            });
        }

        // 2. ELIMINAR IMÁGENES SOLICITADAS - USAR EL ARRAY CORREGIDO
        const imagenesEliminadas = [];
        if (imagesToDeleteArray.length > 0) { // ✅ Usar el array corregido
            const imagesToDeleteIds = imagesToDeleteArray
                .filter(imgId => mongoose.Types.ObjectId.isValid(imgId))
                .map(imgId => new mongoose.Types.ObjectId(imgId));

            for (const imageId of imagesToDeleteIds) {
                const imageDoc = await Image.findById(imageId).session(session);
                if (imageDoc && imageDoc.fileId) {
                    // Eliminar de GridFS
                    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
                        bucketName: 'images'
                    });
                    await bucket.delete(imageDoc.fileId);
                    
                    // Eliminar documento
                    await Image.findByIdAndDelete(imageId, { session });
                    imagenesEliminadas.push(imageId);
                    
                    console.log(`🗑️ Imagen eliminada: ${imageId}`);
                }
            }
        }

        // 3. SUBIR NUEVAS IMÁGENES
        const nuevasImagenesIds = [];
        for (const file of newFiles) {
            const uploadStream = gridFSBucket.openUploadStream(file.originalname, {
                metadata: {
                    uploadedBy: userId,
                    mimeType: file.mimetype,
                    originalName: file.originalname,
                    size: file.size,
                    relatedCabana: id
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
                relatedCabana: id
            });

            const savedImage = await newImage.save({ session });
            nuevasImagenesIds.push(savedImage._id);
            console.log(`🆕 Nueva imagen subida: ${savedImage._id}`);
        }

        // 4. CONSTRUIR ARRAY FINAL - USAR EL ARRAY CORREGIDO
        const imagenesConservadas = imagesToKeepArray // ✅ Usar el array corregido
            .filter(imgId => mongoose.Types.ObjectId.isValid(imgId))
            .map(imgId => new mongoose.Types.ObjectId(imgId));

        const imagenesFinales = [...imagenesConservadas, ...nuevasImagenesIds];

        // 5. ACTUALIZAR CABAÑA
        const updateData = {
            nombre,
            descripcion,
            precio: Number(precio),
            capacidad: Number(capacidad),
            servicios: servicios || [],
            images: imagenesFinales,
            imagenPrincipal: imagenesFinales[0] || null
        };

        console.log('🔄 Actualizando cabaña con:', updateData);

        const cabanaActualizada = await Cabana.findByIdAndUpdate(
            id,
            updateData,
            { 
                new: true, 
                session,
                populate: {
                    path: 'images',
                    select: 'url filename _id fileId'
                }
            }
        );

        // 6. ACTUALIZAR REFERENCIAS
        if (imagenesConservadas.length > 0) {
            await Image.updateMany(
                { _id: { $in: imagenesConservadas } },
                { $set: { relatedCabana: id } },
                { session }
            );
        }

        await session.commitTransaction();

        // 7. RESPUESTA
        const responseData = {
            ...cabanaActualizada.toObject(),
            images: cabanaActualizada.images.map(img => ({
                _id: img._id,
                fileId: img.fileId,
                url: img.url.startsWith('http') ? img.url : `${API_URL}${img.url}`,
                filename: img.filename,
                isNew: nuevasImagenesIds.some(newId => newId.equals(img._id))
            }))
        };

        res.json({
            success: true,
            message: `Cabaña actualizada. ${nuevasImagenesIds.length} nuevas, ${imagenesEliminadas.length} eliminadas`,
            data: responseData,
            summary: {
                conservadas: imagenesConservadas.length,
                nuevas: nuevasImagenesIds.length,
                eliminadas: imagenesEliminadas.length,
                total: imagenesFinales.length
            }
        });
        
    } catch (error) {
        await session.abortTransaction();
        console.error('❌ Error en actualizarCabana:', error);
        res.status(400).json({ 
            success: false,
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

// Función específica para agregar imágenes a cabaña existente
export const agregarImagenesACabana = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const newFiles = req.files || [];
    const { imagesToKeep = [] } = req.body;
    const userId = req.user._id;

    // 1. Verificar cabaña existe
    const cabana = await Cabana.findById(id).session(session);
    if (!cabana) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        error: 'Cabaña no encontrada'
      });
    }

    // 2. Subir nuevas imágenes
    const nuevasImagenesIds = [];
    for (const file of newFiles) {
      const uploadStream = gridFSBucket.openUploadStream(file.originalname, {
        metadata: {
          uploadedBy: userId,
          mimeType: file.mimetype,
          originalName: file.originalname,
          size: file.size,
          relatedCabana: id
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
        relatedCabana: id
      });

      const savedImage = await newImage.save({ session });
      nuevasImagenesIds.push(savedImage._id);
    }

    // 3. Combinar imágenes existentes (las que se quieren conservar) con nuevas
    const imagenesConservadas = imagesToKeep
      .filter(imgId => mongoose.Types.ObjectId.isValid(imgId))
      .map(imgId => new mongoose.Types.ObjectId(imgId));

    const todasLasImagenes = [...imagenesConservadas, ...nuevasImagenesIds];

    // 4. Actualizar cabaña
    const cabanaActualizada = await Cabana.findByIdAndUpdate(
      id,
      {
        images: todasLasImagenes,
        imagenPrincipal: todasLasImagenes[0] || cabana.imagenPrincipal
      },
      {
        new: true,
        session,
        populate: {
          path: 'images',
          select: 'url filename _id'
        }
      }
    );

    await session.commitTransaction();

    // 5. Preparar respuesta
    res.json({
      success: true,
      message: `Se agregaron ${nuevasImagenesIds.length} nuevas imágenes`,
      data: {
        cabanaId: id,
        totalImagenes: cabanaActualizada.images.length,
        nuevasImagenes: nuevasImagenesIds,
        imagenes: cabanaActualizada.images.map(img => ({
          _id: img._id,
          url: img.url.startsWith('http') ? img.url : `${API_URL}${img.url}`,
          filename: img.filename,
          isNew: nuevasImagenesIds.some(newId => newId.equals(img._id))
        }))
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error en agregarImagenesACabana:', error);
    res.status(500).json({
      success: false,
      error: 'Error al agregar imágenes'
    });
  } finally {
    session.endSession();
  }
};


export const eliminarImagenCabana = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { cabanaId, imageId } = req.params;

        // 1. Verificar que la cabaña existe
        const cabana = await Cabana.findById(cabanaId).session(session);
        if (!cabana) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                error: 'Cabaña no encontrada'
            });
        }

        // 2. Verificar que la imagen existe y está asociada a la cabaña
        const image = await Image.findOne({
            _id: imageId,
            relatedCabana: cabanaId
        }).session(session);

        if (!image) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                error: 'Imagen no encontrada o no pertenece a esta cabaña'
            });
        }

        console.log(`🗑️ Eliminando imagen: ${imageId} de cabaña: ${cabanaId}`);

        // 3. Eliminar de GridFS
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: 'images'
        });
        
        await bucket.delete(image.fileId);
        console.log(`✅ Eliminada de GridFS: ${image.fileId}`);

        // 4. Eliminar de la colección Image
        await Image.findByIdAndDelete(imageId, { session });
        console.log(`✅ Eliminada de colección Image: ${imageId}`);

        // 5. Remover de la cabaña y ajustar imagen principal si es necesario
        const updatedCabana = await Cabana.findByIdAndUpdate(
            cabanaId,
            {
                $pull: { images: imageId },
                // Si era la imagen principal, asignar otra o null
                $set: {
                    imagenPrincipal: cabana.imagenPrincipal && 
                                   cabana.imagenPrincipal.equals(imageId) 
                        ? (cabana.images.length > 1 ? cabana.images[1] : null)
                        : cabana.imagenPrincipal
                }
            },
            { new: true, session }
        ).populate({
            path: 'images',
            select: 'url filename _id'
        });

        await session.commitTransaction();

        // 6. Preparar respuesta
        res.json({
            success: true,
            message: 'Imagen eliminada correctamente',
            data: {
                cabanaId,
                imageId,
                remainingImages: updatedCabana.images.length,
                imagenesActualizadas: updatedCabana.images.map(img => ({
                    _id: img._id,
                    url: img.url.startsWith('http') ? img.url : `${API_URL}${img.url}`,
                    filename: img.filename
                })),
                nuevaImagenPrincipal: updatedCabana.imagenPrincipal
            }
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('❌ Error eliminando imagen de cabaña:', error);
        res.status(500).json({
            success: false,
            error: 'Error al eliminar imagen',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        session.endSession();
    }
};

// Función para reordenar imágenes de cabaña
export const reordenarImagenesCabana = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { imageIds } = req.body; // Array ordenado de IDs

    if (!Array.isArray(imageIds)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        error: 'Se requiere un array de IDs de imágenes'
      });
    }

    // Validar que todos los IDs sean válidos
    const validImageIds = imageIds
      .filter(imgId => mongoose.Types.ObjectId.isValid(imgId))
      .map(imgId => new mongoose.Types.ObjectId(imgId));

    if (validImageIds.length !== imageIds.length) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        error: 'Algunos IDs de imagen no son válidos'
      });
    }

    // Actualizar cabaña con nuevo orden
    const cabanaActualizada = await Cabana.findByIdAndUpdate(
      id,
      {
        images: validImageIds,
        imagenPrincipal: validImageIds[0] || null
      },
      {
        new: true,
        session,
        populate: {
          path: 'images',
          select: 'url filename _id'
        }
      }
    );

    await session.commitTransaction();

    res.json({
      success: true,
      message: 'Imágenes reordenadas correctamente',
      data: {
        cabanaId: id,
        images: cabanaActualizada.images.map((img, index) => ({
          _id: img._id,
          url: img.url.startsWith('http') ? img.url : `${API_URL}${img.url}`,
          filename: img.filename,
          position: index
        }))
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error en reordenarImagenesCabana:', error);
    res.status(500).json({
      success: false,
      error: 'Error al reordenar imágenes'
    });
  } finally {
    session.endSession();
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
    asociarImagenes,
    obtenerTodasImagenes,
    agregarImagenesACabana,     // <-- Asegúrate de exportar
    eliminarImagenCabana,       // <-- Asegúrate de exportar
    reordenarImagenesCabana     // <-- Asegúrate de exportar
  };