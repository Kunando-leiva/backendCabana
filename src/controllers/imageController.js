import Image from '../models/Image.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadImage = async (req, res) => {
  try {
    console.log('Usuario autenticado:', req.user); // Verifica los datos

    const image = await Image.create({
      filename: req.file.filename,
      path: `/uploads/${req.file.filename}`,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user._id // Usa _id en lugar de id
    });

    res.status(201).json({ success: true, image });
  } catch (error) {
    console.error('Error detallado:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

export const getImage = async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }

    res.json({
      success: true,
      image: {
        ...image.toObject(),
        url: `${process.env.API_URL}${image.path}`
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener imagen' });
  }
};

export const getGallery = async (req, res) => {
  try {
    const images = await Image.find({ isPublic: true })
      .populate('relatedCabana', 'nombre descripcion')
      .populate('uploadedBy', 'name email');

    res.json({
      success: true,
      images: images.map(img => ({
        id: img._id,
        url: `${process.env.API_URL}${img.path}`,
        cabana: img.relatedCabana,
        uploadedBy: img.uploadedBy,
        metadata: img.metadata
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar galería' });
  }
};

// Función para eliminar imagen (añade esta nueva función)
export const deleteImage = async (req, res) => {
    try {
      const image = await Image.findById(req.params.id);
      
      if (!image) {
        return res.status(404).json({ success: false, error: 'Imagen no encontrada' });
      }
  
      // Eliminar archivo físico
      const filePath = path.join(__dirname, '../../persistent-uploads', image.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
  
      // Eliminar referencias en cabañas
      await Cabana.updateMany(
        { images: image._id },
        { $pull: { images: image._id } }
      );
  
      // Eliminar registro de la base de datos
      await Image.findByIdAndDelete(req.params.id);
  
      res.json({
        success: true,
        message: 'Imagen eliminada correctamente'
      });
  
    } catch (error) {
      console.error('Error al eliminar imagen:', error);
      res.status(500).json({
        success: false,
        error: 'Error al eliminar imagen',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
