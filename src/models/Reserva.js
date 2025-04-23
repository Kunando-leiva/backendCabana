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
    required: true
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

export default mongoose.model('Reserva', reservaSchema);