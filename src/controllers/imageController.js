import mongoose from 'mongoose';
import { gridFSBucket } from '../../config/gridfs-config.js';
import Image from '../models/Image.js';
import { API_URL } from '../../config/config.js';


// En tu imageController.js
export const uploadImage = async (req, res) => {
  try {
    if (!req.file) throw new Error('No file uploaded');

    // Verificar si ya existe una imagen con el mismo nombre
    const existingImage = await Image.findOne({ filename: req.file.originalname });
    
    if (existingImage) {
      return res.status(409).json({ 
        success: false,
        error: `Ya existe una imagen con el nombre "${req.file.originalname}"`,
        duplicate: true
      });
    }

    // Resto de la lógica de subida...
    const uploadStream = gridFSBucket.openUploadStream(req.file.originalname, {
      metadata: {
        uploadedBy: req.user._id,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname
      }
    });

    const fileId = await new Promise((resolve, reject) => {
      uploadStream.end(req.file.buffer, () => resolve(uploadStream.id));
      uploadStream.on('error', reject);
    });

    const image = await Image.create({
      filename: req.file.originalname,
      fileId: fileId,
      url: `${API_URL}/api/images/${fileId}`,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user._id
    });

    res.status(201).json({ success: true, image });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
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
      'Cache-Control': 'public, max-age=31536000'
    });

    gridFSBucket.openDownloadStream(objectId).pipe(res);

  } catch (error) {
    res.status(500).json({ 
      error: 'Error del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Modifica getGallery así:
// Modifica getGallery así:
export const getGallery = async (req, res) => {
  try {
    // Traer todas las imágenes, sin importar si son públicas o privadas
    const images = await Image.find()
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      images: images.map(img => ({
        id: img._id,
        filename: img.filename,
        url: img.url,
        isPublic: img.isPublic,
        uploadedBy: img.uploadedBy,
        createdAt: img.createdAt,
        size: img.size
      }))
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener la galería',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
