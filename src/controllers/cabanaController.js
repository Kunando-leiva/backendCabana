import Cabana from '../models/Cabana.js';
import Reserva from '../models/Reserva.js';
import mongoose from 'mongoose';
import Image from '../models/Image.js';
import { API_URL } from '../../config/config.js';
import { gridFSBucket } from '../../config/gridfs-config.js';

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
          relatedCabana: savedCabana._id
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
        relatedCabana: savedCabana._id
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
            servicios
        } = req.body;

        const newFiles = req.files || [];
        const userId = req.user._id;

        console.log('📝 Datos recibidos en actualizarCabana:', {
            cabanaId: id,
            newFiles: newFiles.length,
            bodyKeys: Object.keys(req.body)
        });

        // ✅✅✅ SOLUCIÓN CRÍTICA: Manejo seguro de imagesToDelete
        let imagesToDeleteArray = [];
        if (req.body.imagesToDelete) {
            console.log('🗑️ imagesToDelete raw:', req.body.imagesToDelete, '| Tipo:', typeof req.body.imagesToDelete);
            
            try {
                // Si es string JSON, parsear
                if (typeof req.body.imagesToDelete === 'string') {
                    imagesToDeleteArray = JSON.parse(req.body.imagesToDelete);
                } 
                // Si ya es array, usar directamente
                else if (Array.isArray(req.body.imagesToDelete)) {
                    imagesToDeleteArray = req.body.imagesToDelete;
                }
                // Si viene como string simple (id único)
                else if (typeof req.body.imagesToDelete === 'string' && mongoose.Types.ObjectId.isValid(req.body.imagesToDelete)) {
                    imagesToDeleteArray = [req.body.imagesToDelete];
                }
            } catch (e) {
                console.warn('⚠️ Error parsing imagesToDelete:', e);
                imagesToDeleteArray = [];
            }
        }

        // ✅✅✅ SOLUCIÓN CRÍTICA: Manejo seguro de imagesToKeep
        let imagesToKeepArray = [];
        if (req.body.imagesToKeep) {
            console.log('💾 imagesToKeep raw:', req.body.imagesToKeep, '| Tipo:', typeof req.body.imagesToKeep);
            
            try {
                if (typeof req.body.imagesToKeep === 'string') {
                    imagesToKeepArray = JSON.parse(req.body.imagesToKeep);
                } else if (Array.isArray(req.body.imagesToKeep)) {
                    imagesToKeepArray = req.body.imagesToKeep;
                }
            } catch (e) {
                console.warn('⚠️ Error parsing imagesToKeep:', e);
                imagesToKeepArray = [];
            }
        }

        // Asegurar que sean arrays
        if (!Array.isArray(imagesToDeleteArray)) imagesToDeleteArray = [];
        if (!Array.isArray(imagesToKeepArray)) imagesToKeepArray = [];

        console.log('✅ Arrays procesados:', {
            imagesToKeepArray,
            imagesToDeleteArray
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

        // 2. ELIMINAR IMÁGENES SOLICITADAS
        const imagenesEliminadas = [];
        if (imagesToDeleteArray.length > 0) {
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

        // 4. CONSTRUIR ARRAY FINAL
        const imagenesConservadas = imagesToKeepArray
            .filter(imgId => mongoose.Types.ObjectId.isValid(imgId))
            .map(imgId => new mongoose.Types.ObjectId(imgId));

        const imagenesFinales = [...imagenesConservadas, ...nuevasImagenesIds];

        // 5. ACTUALIZAR CABAÑA
        const updateData = {
            nombre,
            descripcion,
            precio: Number(precio),
            capacidad: Number(capacidad),
            servicios: Array.isArray(servicios) ? servicios : JSON.parse(servicios || '[]'),
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

        // Buscar reservas que se superpongan CORRECTAMENTE
        const reservas = await Reserva.find({
            estado: { $ne: 'cancelada' }
        }).select('cabana fechaInicio fechaFin');

        // Obtener IDs de cabañas ocupadas para las fechas solicitadas
        const cabanasOcupadasIds = [];
        
        reservas.forEach(reserva => {
            const reservaInicio = new Date(reserva.fechaInicio);
            const reservaFin = new Date(reserva.fechaFin);
            
            // LÓGICA: Una reserva NO ocupa su fecha de salida
            const hayConflicto = 
                reservaInicio < fechaFinDate && // Reserva comienza antes que nueva termine
                reservaFin > fechaInicioDate;   // Reserva termina después que nueva comience
            
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
  
export const obtenerTodasImagenes = async (req, res) => {
  try {
    const images = await Image.find({ isPublic: true })
      .select('url filename size createdAt mimeType')
      .sort({ createdAt: -1 })
      .lean();

    const formattedImages = images.map(img => ({
      ...img,
      url: img.url?.startsWith('http') ? img.url : `${API_URL}${img.url?.startsWith('/') ? '' : '/'}${img.url}`
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

export const agregarImagenesACabana = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const newFiles = req.files || [];
    const userId = req.user._id;

    console.log('📤 ========== AGREGAR IMÁGENES A CABAÑA ==========');
    console.log('📌 Cabaña ID:', id);
    console.log('📁 Archivos recibidos:', newFiles.length);
    console.log('👤 Usuario ID:', userId);
    console.log('📦 Body recibido:', req.body);

    // ✅ VALIDACIÓN BÁSICA
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: 'ID de cabaña no válido'
      });
    }

    // ✅ PROCESAR imagesToKeep
    let imagesToKeep = [];
    if (req.body.imagesToKeep) {
      console.log('💾 imagesToKeep (raw):', req.body.imagesToKeep, '| Tipo:', typeof req.body.imagesToKeep);
      
      try {
        if (typeof req.body.imagesToKeep === 'string') {
          // Intentar parsear como JSON
          imagesToKeep = JSON.parse(req.body.imagesToKeep);
        } else if (Array.isArray(req.body.imagesToKeep)) {
          imagesToKeep = req.body.imagesToKeep;
        } else if (typeof req.body.imagesToKeep === 'object') {
          // Si es objeto, extraer valores
          imagesToKeep = Object.values(req.body.imagesToKeep);
        }
      } catch (parseError) {
        console.warn('⚠️ Error parseando imagesToKeep:', parseError.message);
        imagesToKeep = [];
      }
    }

    // Asegurar que sea array
    if (!Array.isArray(imagesToKeep)) {
      imagesToKeep = [];
    }

    console.log('✅ imagesToKeep procesado:', imagesToKeep.length, 'imágenes');

    // 1. VERIFICAR CABAÑA EXISTE
    console.log('🔍 Buscando cabaña:', id);
    const cabana = await Cabana.findById(id).session(session);
    if (!cabana) {
      await session.abortTransaction();
      session.endSession();
      console.log('❌ Cabaña no encontrada:', id);
      return res.status(404).json({
        success: false,
        error: 'Cabaña no encontrada'
      });
    }

    console.log('✅ Cabaña encontrada:', cabana.nombre);

    // 2. SUBIR NUEVAS IMÁGENES (si las hay)
    const nuevasImagenesIds = [];
    
    if (newFiles.length > 0) {
      console.log('📤 Subiendo', newFiles.length, 'nuevas imágenes...');
      
      for (let i = 0; i < newFiles.length; i++) {
        const file = newFiles[i];
        
        try {
          console.log(`📁 Procesando archivo ${i + 1}/${newFiles.length}:`, {
            nombre: file.originalname,
            tamaño: file.size,
            tipo: file.mimetype
          });

          // ✅ CREAR NOMBRE ÚNICO PARA CADA ARCHIVO
          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(2, 15);
          const originalName = file.originalname;
          const extension = originalName.split('.').pop() || 'jpg';
          
          // Nombre seguro: quitar caracteres especiales y espacios
          const safeName = originalName
            .replace(/\.[^/.]+$/, "") // Quitar extensión
            .replace(/[^a-zA-Z0-9]/g, '-') // Reemplazar caracteres especiales
            .toLowerCase();
          
          const uniqueFilename = `${safeName}-${timestamp}-${random}.${extension}`;
          
          console.log(`   📝 Nombre único generado: ${uniqueFilename}`);

          // ✅ SUBIR A GRIDFS
          console.log(`   🚀 Subiendo a GridFS...`);
          const uploadStream = gridFSBucket.openUploadStream(uniqueFilename, {
            metadata: {
              uploadedBy: userId,
              mimeType: file.mimetype,
              originalName: originalName,
              size: file.size,
              relatedCabana: id,
              uploadDate: new Date()
            }
          });

          const fileId = await new Promise((resolve, reject) => {
            uploadStream.on('error', (error) => {
              console.error(`   ❌ Error en uploadStream:`, error);
              reject(error);
            });
            
            uploadStream.on('finish', () => {
              console.log(`   ✅ GridFS upload completado. File ID: ${uploadStream.id}`);
              resolve(uploadStream.id);
            });
            
            uploadStream.end(file.buffer);
          });

          // ✅ CREAR DOCUMENTO EN COLECCIÓN IMAGES
          console.log(`   📄 Creando documento Image...`);
          const newImage = new Image({
            fileId,
            filename: uniqueFilename,
            originalName: originalName,
            mimeType: file.mimetype,
            size: file.size,
            uploadedBy: userId,
            url: `/api/images/${fileId}`,
            isPublic: true,
            relatedCabana: id
          });

          const savedImage = await newImage.save({ session });
          nuevasImagenesIds.push(savedImage._id);
          
          console.log(`   ✅ Imagen guardada en BD: ${savedImage._id}`);
          
        } catch (fileError) {
          console.error(`❌ Error procesando archivo ${file.originalname}:`, {
            message: fileError.message,
            code: fileError.code,
            stack: fileError.stack
          });
          
          // Si es error de duplicado, continuar
          if (fileError.code === 11000) {
            console.warn(`   ⚠️ Archivo duplicado: ${file.originalname}. Saltando...`);
            continue;
          }
          
          // Para otros errores, decidir si continuar o abortar
          console.warn(`   ⚠️ Continuando con siguiente archivo después de error...`);
        }
      }
    } else {
      console.log('ℹ️ No hay archivos nuevos para subir');
    }

    console.log('📊 Resultados de subida:', {
      nuevasSubidas: nuevasImagenesIds.length,
      ids: nuevasImagenesIds
    });

    // 3. COMBINAR IMÁGENES EXISTENTES CON NUEVAS
    const imagenesConservadas = imagesToKeep
      .filter(imgId => {
        const isValid = mongoose.Types.ObjectId.isValid(imgId);
        if (!isValid) {
          console.warn(`⚠️ ID inválido en imagesToKeep: ${imgId}`);
        }
        return isValid;
      })
      .map(imgId => new mongoose.Types.ObjectId(imgId));

    const todasLasImagenes = [...imagenesConservadas, ...nuevasImagenesIds];

    console.log('🔄 Combinando imágenes:', {
      conservadas: imagenesConservadas.length,
      nuevas: nuevasImagenesIds.length,
      total: todasLasImagenes.length
    });

    // 4. ACTUALIZAR CABAÑA
    console.log('🔄 Actualizando cabaña...');
    const updateData = {
      images: todasLasImagenes,
      updatedAt: new Date()
    };

    // Solo actualizar imagenPrincipal si hay imágenes
    if (todasLasImagenes.length > 0) {
      updateData.imagenPrincipal = todasLasImagenes[0];
    }

    const cabanaActualizada = await Cabana.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        session,
        populate: {
          path: 'images',
          select: 'url filename _id fileId originalName',
          options: { limit: 20 }
        }
      }
    );

    // 5. ACTUALIZAR REFERENCIAS EN IMÁGENES CONSERVADAS
    if (imagenesConservadas.length > 0) {
      console.log('🔗 Actualizando referencias en imágenes conservadas...');
      await Image.updateMany(
        { _id: { $in: imagenesConservadas } },
        { $set: { relatedCabana: id } },
        { session }
      );
    }

    // 6. CONFIRMAR TRANSACCIÓN
    await session.commitTransaction();
    session.endSession();

    console.log('✅ Transacción completada exitosamente');
    console.log('==========================================');

    // 7. PREPARAR RESPUESTA
    const responseData = {
      success: true,
      message: nuevasImagenesIds.length > 0 
        ? `Se ${nuevasImagenesIds.length === 1 ? 'agregó' : 'agregaron'} ${nuevasImagenesIds.length} ${nuevasImagenesIds.length === 1 ? 'imagen' : 'imágenes'}`
        : 'No se agregaron nuevas imágenes',
      data: {
        cabanaId: id,
        cabanaNombre: cabanaActualizada.nombre,
        totalImagenes: cabanaActualizada.images.length,
        nuevasImagenes: nuevasImagenesIds.length,
        imagenes: cabanaActualizada.images.map(img => ({
          _id: img._id,
          url: img.url.startsWith('http') ? img.url : `${API_URL}${img.url}`,
          filename: img.filename,
          originalName: img.originalName || img.filename,
          isNew: nuevasImagenesIds.some(newId => newId.equals(img._id))
        }))
      },
      debug: {
        archivosRecibidos: newFiles.length,
        imagenesConservadas: imagenesConservadas.length,
        imagenesNuevas: nuevasImagenesIds.length,
        imagenesTotales: cabanaActualizada.images.length
      }
    };

    res.json(responseData);

  } catch (error) {
    // 8. MANEJO DE ERRORES DETALLADO
    await session.abortTransaction();
    session.endSession();
    
    console.error('❌ ========== ERROR CRÍTICO ==========');
    console.error('❌ Error en agregarImagenesACabana:');
    console.error('📌 Mensaje:', error.message);
    console.error('📌 Código:', error.code);
    console.error('📌 Stack:', error.stack);
    
    if (error.name === 'MongoServerError') {
      console.error('📌 Error de MongoDB:', {
        code: error.code,
        keyPattern: error.keyPattern,
        keyValue: error.keyValue
      });
    }
    
    console.error('❌ ====================================');

    // Respuesta de error detallada
    let errorMessage = 'Error al procesar la solicitud';
    let statusCode = 500;

    if (error.code === 11000) {
      errorMessage = `Error de duplicado: Ya existe un archivo con nombre "${error.keyValue?.filename}"`;
      statusCode = 400;
    } else if (error.name === 'ValidationError') {
      errorMessage = 'Error de validación: ' + Object.values(error.errors).map(e => e.message).join(', ');
      statusCode = 400;
    } else if (error.message.includes('timeout')) {
      errorMessage = 'La operación tardó demasiado. Intenta con menos imágenes.';
      statusCode = 408;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        code: error.code,
        stack: error.stack
      } : undefined
    });
  }
};

export const eliminarImagenCabana = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { cabanaId, imageId } = req.params;

        console.log('🗑️ Eliminando imagen de cabaña:', { cabanaId, imageId });

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

export const reordenarImagenesCabana = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { imageIds } = req.body; // Array ordenado de IDs

    console.log('🔄 Reordenando imágenes para cabaña:', { cabanaId: id, imageIds });

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
    agregarImagenesACabana,
    eliminarImagenCabana,
    reordenarImagenesCabana
};