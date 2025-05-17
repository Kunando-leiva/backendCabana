import mongoose from 'mongoose';
import { gridFSBucket } from '../../config/gridfs-config.js';
import Image from '../models/Image.js';
import { API_URL } from '../../config/config.js'
import  Cabana  from '../models/Cabana.js';

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
      'Cache-Control': 'public, max-age=31536000, immutable', // Cache de 1 año
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

// Modifica getGallery así:
// Modifica getGallery así:
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
        url: img.url, // Asegúrate que esta URL es accesible
        fullUrl: img.fullUrl, // Usar este campo si está disponible
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


export const deleteImage = async (req, res) => {
  try {
    const objectId = new mongoose.Types.ObjectId(req.params.id);

    // Verificar existencia primero
    const imageExists = await Image.findOne({ fileId: objectId });
    if (!imageExists) {
      return res.status(404).json({ success: false, error: 'Imagen no encontrada' });
    }

    // Verificar permisos (solo admin o el propietario puede borrar)
    if (!req.user._id.equals(imageExists.uploadedBy) && !req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'No autorizado' });
    }

    // Eliminar en paralelo
    await Promise.all([
      gridFSBucket.delete(objectId),
      Image.deleteOne({ fileId: objectId }),
      mongoose.model('Cabana').updateMany(
        { images: objectId },
        { $pull: { images: objectId } }
      )
    ]);

    res.json({ 
      success: true,
      message: 'Imagen eliminada correctamente'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Error al eliminar la imagen',
      details: API_URL === 'development' ? error.message : undefined
    });
  }
};
