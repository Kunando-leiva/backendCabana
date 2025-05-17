import mongoose from 'mongoose';
import { API_URL } from '../../config/config.js';

const ImageSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
    trim: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true,
    enum: ['image/jpeg', 'image/png', 'image/webp']
  },
  size: {
    type: Number,
    required: true,
    min: [100, 'El tamaño mínimo es 100 bytes'],
    max: [10 * 1024 * 1024, 'El tamaño máximo es 10MB']
  },
  uploadedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  relatedCabana: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Cabana' 
  },
  isPublic: { 
    type: Boolean, 
    default: true 
  },
  fileId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true,
    unique: true
  },
  url: { 
    type: String, 
    required: true,
    unique: true
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true } 
});

// Índices para mejor performance
ImageSchema.index({ filename: 1 });
ImageSchema.index({ uploadedBy: 1 });
ImageSchema.index({ relatedCabana: 1 });

// Virtual para URL completa
ImageSchema.virtual('fullUrl').get(function() {
  // Usa API_URL importada de tu config en producción
  // Y localhost en desarrollo (NODE_ENV lo detecta automáticamente)
  const baseUrl = 'https://backendcabana.onrender.com' 
  
  return `${baseUrl}${this.url}`;
});


const Image = mongoose.model('Image', ImageSchema);
export default Image;