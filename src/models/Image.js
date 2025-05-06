import mongoose from 'mongoose';

const imageSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
    unique: true
  },
  path: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
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
  metadata: {
    type: Map,
    of: String
  }
}, { timestamps: true });

// Middleware para eliminar el archivo físico al eliminar el registro
imageSchema.post('remove', async function(doc) {
  const fs = require('fs');
  const path = require('path');
  const filePath = path.join(__dirname, '../../uploads', doc.filename);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
});

export default mongoose.model('Image', imageSchema);