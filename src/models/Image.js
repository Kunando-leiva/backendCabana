import mongoose from 'mongoose';

const ImageSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  mimeType: String,
  size: Number,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  relatedCabana: { type: mongoose.Schema.Types.ObjectId, ref: 'Cabana' },
  isPublic: { type: Boolean, default: true },
  metadata: Object,
  createdAt: { type: Date, default: Date.now }
});

// Añade indexación para búsquedas rápidas
ImageSchema.index({ filename: 1, uploadedBy: 1 });

export default mongoose.model('Image', ImageSchema);