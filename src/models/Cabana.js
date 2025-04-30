import mongoose from 'mongoose';

const cabanaSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
    },
    descripcion: {
        type: String,
        required: true,
    },
    precio: {
        type: Number,
        required: true,
    },
    capacidad: {
        type: Number,
        required: true,
    },
    servicios: {  // Añade este campo
        type: [String],
        default: []
    },
    imagenes: [String], // URLs de imágenes
    fechasReservadas:
    [{
        fechaInicio: Date,
        fechaFin: Date,
        reservaId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Reserva' 
        },
    }]
}, {
    timestamps: true // Corrige de timestamp a timestamps
});

export default mongoose.model('Cabana', cabanaSchema);