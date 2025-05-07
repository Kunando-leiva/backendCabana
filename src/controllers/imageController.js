import Image from '../models/Image.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { API_URL } from '../../config/config.js';
import { gridFSBucket } from '../../config/gridfs-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export const uploadImage = async (req, res) => {
  try {
    if (!req.file) throw new Error('No file uploaded');

    // 1. Subir a GridFS
    const uploadStream = gridFSBucket.openUploadStream(req.file.originalname, {
      metadata: {
        uploadedBy: req.user._id,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype
      }
    });

    uploadStream.end(req.file.buffer);

    uploadStream.on('finish', async () => {
      // 2. Guardar metadatos en MongoDB CON fileId
      const image = await Image.create({
        filename: req.file.originalname,
        fileId: uploadStream.id, // <- Esto faltaba
        path: `/api/images/${uploadStream.id}`, // Usar ID en lugar de undefined
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedBy: req.user._id
      });

      res.status(201).json({
        success: true,
        image: {
          ...image.toObject(),
          url: `/api/images/${image.fileId}` // Nueva URL con fileId
        }
      });
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

export const getImage = async (req, res) => {
  try {
    // Convertir el ID a ObjectId
    const { id } = req.params;
    const objectId = new mongoose.Types.ObjectId(id);

    // Verificar existencia en la colección de metadatos
    const file = await mongoose.connection.db.collection('images.files')
      .findOne({ _id: objectId });

    if (!file) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }

    // Stream desde GridFS
    const downloadStream = gridFSBucket.openDownloadStream(objectId);
    
    // Configurar headers
    res.set({
      'Content-Type': file.metadata?.mimeType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000'
    });

    downloadStream.pipe(res);

  } catch (error) {
    res.status(500).json({ error: 'Error al recuperar imagen' });
  }
};

export const getGallery = async (req, res) => {
  try {
    const images = await Image.find({ isPublic: true })
      .populate('uploadedBy', 'name email')
      .lean(); // Más eficiente

    res.json({
      success: true,
      images: images.map(img => ({
        ...img,
        url: `/api/images/${img.fileId}`,
        uploadedBy: img.uploadedBy
      }))
    });

  } catch (error) {
    res.status(500).json({ error: 'Error al cargar galería' });
  }
};

// Función para eliminar imagen (añade esta nueva función)
export const deleteImage = async (req, res) => {
  try {
    const { id } = req.params;
    const objectId = new mongoose.Types.ObjectId(id);

    // 1. Eliminar de GridFS
    await gridFSBucket.delete(objectId);

    // 2. Eliminar metadatos
    await Image.findOneAndDelete({ fileId: objectId });

    // 3. Limpiar referencias (opcional)
    await mongoose.model('Cabana').updateMany(
      { images: objectId },
      { $pull: { images: objectId } }
    );

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'Error al eliminar'
    });
  }
};
