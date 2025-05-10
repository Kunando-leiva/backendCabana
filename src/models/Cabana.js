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
    images: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Image'
      }],
    fechasReservadas:
    [{
        fechaInicio: Date,
        fechaFin: Date,
        reservaId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Reserva' 
        },
    }]
}, 
{
    timestamps: true // Corrige de timestamp a timestamps
});

cabanaSchema.virtual('imagenPrincipal').get(function() {
    return this.images.length > 0 ? this.images[0] : null;
});

export default mongoose.model('Cabana', cabanaSchema);