import mongoose from 'mongoose';
import { gridFSBucket } from '../../config/gridfs-config.js';
import Image from '../models/Image.js';
import { API_URL } from '../../config/config.js'
import Cabana from '../models/Cabana.js';

export const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se subió ningún archivo'
      });
    }

    // Creamos la imagen en la colección
    const image = await Image.create({
      filename: req.file.originalname,
      fileId: req.file.id,
      url: `${API_URL}/api/images/${req.file.id}`,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user._id
    }); 

    // ✅ Asociar la imagen a la cabaña
    const cabanaId = req.params.id; // asegurate que se llama :id en la ruta
    const cabana = await Cabana.findById(cabanaId);
    if (!cabana) {
      return res.status(404).json({ success: false, error: 'Cabaña no encontrada' });
    }

    cabana.images.push(image._id);
    await cabana.save();

    // Respuesta
    res.json({
      success: true,
      image: {
        fileId: image.fileId,
        url: image.url,
        filename: image.filename
      }
    });
  } catch (error) {
    console.error('Error al guardar imagen:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

export const getImage = async (req, res) => {
  try {
    const objectId = new mongoose.Types.ObjectId(req.params.id);
    
    // Primero verificar metadatos
    const imageMeta = await Image.findOne({ fileId: objectId });
    if (!imageMeta) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }

    // Verificar si la imagen es pública o el usuario tiene acceso
    if (!imageMeta.isPublic && (!req.user || !req.user._id.equals(imageMeta.uploadedBy))) {
      return res.status(403).json({ error: 'Acceso no autorizado' });
    }

    // Obtener el archivo de GridFS
    const file = await mongoose.connection.db.collection('images.files')
      .findOne({ _id: objectId });

    if (!file) return res.status(404).json({ error: 'Archivo de imagen no encontrado' });

    // Configurar headers y enviar la imagen
    res.set({
      'Content-Type': file.metadata?.mimeType || 'image/jpeg',
      'Content-Disposition': `inline; filename="${file.filename}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': file._id.toString()
    });

    gridFSBucket.openDownloadStream(objectId).pipe(res);

  } catch (error) {
    res.status(500).json({ 
      error: 'Error del servidor',
      details: API_URL === 'development' ? error.message : undefined
    });
  }
};

export const getGallery = async (req, res) => {
  try {
    const { limit = 12, offset = 0 } = req.query;
    
    const [images, total] = await Promise.all([
      Image.find({ isPublic: true })
        .populate('uploadedBy', 'name email')
        .populate('relatedCabana', 'name')
        .sort({ createdAt: -1 })
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .lean(),
      Image.countDocuments({ isPublic: true })
    ]);

    // Estructura de respuesta mejorada
    res.json({
      success: true,
      data: images.map(img => ({
        _id: img._id,
        fileId: img.fileId,
        filename: img.filename,
        url: img.url,
        fullUrl: img.fullUrl,
        createdAt: img.createdAt,
        size: img.size,
        uploadedBy: {
          _id: img.uploadedBy._id,
          name: img.uploadedBy.name
        },
        relatedCabana: img.relatedCabana ? {
          _id: img.relatedCabana._id,
          name: img.relatedCabana.name
        } : null,
        isPublic: img.isPublic
      })),
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener la galería',
      details: API_URL === 'development' ? error.message : undefined
    });
  }
};

// ✅✅✅ VERSIÓN CORREGIDA DE deleteImage
export const deleteImage = async (req, res) => {
  try {
    // ✅ SOLUCIÓN: Usar req.params.id en lugar de req.body
    const { id } = req.params; // Ahora viene de la URL: DELETE /api/images/:id
    
    console.log('🗑️ Eliminando imagen con ID:', id);

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        error: 'ID de imagen no válido' 
      });
    }

    // 1. Buscar la imagen usando el ID de params
    const image = await Image.findOne({
      $or: [
        { _id: new mongoose.Types.ObjectId(id) },
        { fileId: new mongoose.Types.ObjectId(id) }
      ]
    });

    if (!image) {
      console.log('❌ Imagen no encontrada con ID:', id);
      return res.status(404).json({ 
        success: false,
        error: 'Imagen no encontrada'
      });
    }

    console.log('✅ Imagen encontrada:', {
      _id: image._id,
      fileId: image.fileId,
      filename: image.filename,
      relatedCabana: image.relatedCabana
    });

    // 2. Eliminar de GridFS
    if (image.fileId) {
      try {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
          bucketName: 'images'
        });
        await bucket.delete(new mongoose.Types.ObjectId(image.fileId));
        console.log('✅ Archivo eliminado de GridFS:', image.fileId);
      } catch (gridfsError) {
        console.warn('⚠️ Error eliminando de GridFS:', gridfsError.message);
      }
    }

    // 3. Si está asignada a una cabaña, remover la referencia
    if (image.relatedCabana) {
      try {
        await Cabana.findByIdAndUpdate(image.relatedCabana, {
          $pull: { images: image._id }
        });
        console.log('✅ Referencia eliminada de cabaña:', image.relatedCabana);
      } catch (cabanaError) {
        console.warn('⚠️ Error actualizando cabaña:', cabanaError.message);
      }
    }

    // 4. Eliminar el documento de la colección images
    await Image.findByIdAndDelete(image._id);
    console.log('✅ Documento eliminado:', image._id);

    // 5. Responder éxito
    res.json({ 
      success: true,
      message: 'Imagen eliminada correctamente',
      deletedImage: {
        _id: image._id,
        fileId: image.fileId,
        filename: image.filename
      }
    });

  } catch (error) {
    console.error('❌ Error en deleteImage:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al eliminar imagen',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};