import mongoose from 'mongoose';

const reservaSchema = new mongoose.Schema({
  usuario: { // Admin que creó la reserva
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dni: { 
    type: String, 
    required: true 
  },
  cabana: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cabana',
    required: true
  },
  fechaInicio: {
    type: Date,
    required: true
  },
  fechaFin: {
    type: Date,
    required: true
  },
  precioTotal: {
    type: Number,
    required: true,
    min: 0 // Evitar valores negativos
  },
  estado: {
    type: String,
    enum: ['pendiente', 'confirmada', 'cancelada'],
    default: 'pendiente'
  },
  pagado: {
    type: Boolean,
    default: false
  },
  huesped: {
    nombre: String,
    apellido: String,
    dni: String,
    direccion: String,
    telefono: String,
    email: String
  }
  
}, { timestamps: true });
reservaSchema.index({ cabana: 1 }); // Útil para filtrar por cabaña
reservaSchema.index({ estado: 1 }); // Para consultas de estado
reservaSchema.index({ fechaInicio: 1, fechaFin: 1 }); // Rango de fechas

// Verificar si una reserva está activa (no cancelada y en rango de fechas)
reservaSchema.methods.isActive = function() {
  const now = new Date();
  return this.estado !== 'cancelada' && 
         this.fechaInicio <= now && 
         this.fechaFin >= now;
};
export default mongoose.model('Reserva', reservaSchema);