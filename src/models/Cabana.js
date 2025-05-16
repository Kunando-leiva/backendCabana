import mongoose from 'mongoose';

const cabanaSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        maxlength: [100, 'El nombre no puede exceder los 100 caracteres']
    },
    descripcion: {
        type: String,
        required: true,
        maxlength: [500, 'La descripción no puede exceder los 500 caracteres']
    },
    precio: {
        type: Number,
        required: true,
        min: [0, 'El precio no puede ser negativo']
    },
    capacidad: {
        type: Number,
        required: true,
        min: [1, 'La capacidad mínima es 1'],
        max: [20, 'La capacidad máxima es 20']
    },
    servicios: {
        type: [String],
        default: [],
        validate: {
            validator: function(servicios) {
                return servicios.length <= 20; // Máximo 20 servicios
            },
            message: 'No se pueden asignar más de 20 servicios'
        }
    },
    images: {
        type: [{
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Image',
         
        }],
        default: []
      },
    imagenPrincipal: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Image',
        
      },
    fechasReservadas: [{
        fechaInicio: {
            type: Date,
            required: true
        },
        fechaFin: {
            type: Date,
            required: true,
            validate: {
                validator: function(fechaFin) {
                    return fechaFin > this.fechaInicio;
                },
                message: 'La fecha fin debe ser posterior a la fecha inicio'
            }
        },
        reservaId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Reserva',
            required: true
        }
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Middleware para limpieza al eliminar una cabaña
cabanaSchema.pre('remove', async function(next) {
    try {
        // Limpiar referencias en las imágenes
        await mongoose.model('Image').updateMany(
            { _id: { $in: this.images } },
            { $unset: { relatedCabana: "" } }
        );
        
        // Opcional: Eliminar imágenes asociadas si no se usan en otros lugares
        // await mongoose.model('Image').deleteMany({ _id: { $in: this.images } });
        
        next();
    } catch (error) {
        next(error);
    }
});
cabanaSchema.methods.validateImages = async function(session) {
    if (this.imagenPrincipal) {
        const exists = await mongoose.model('Image').countDocuments({ 
            _id: this.imagenPrincipal 
        }).session(session);
        if (!exists) throw new Error('La imagen principal no existe');
    }
    
    if (this.images.length > 0) {
        const count = await mongoose.model('Image').countDocuments({
            _id: { $in: this.images }
        }).session(session);
        if (count !== this.images.length) {
            throw new Error('Una o más imágenes no existen');
        }
    }
    return true;
};

// Virtual para imagen principal (mejorada)
cabanaSchema.virtual('imagenPrincipalUrl').get(function() {
    if (this.imagenPrincipal) {
        return `/api/images/${this.imagenPrincipal}`;
    }
    return (Array.isArray(this.images)) && this.images.length > 0 ? 
    `/api/images/${this.images[0]}` : 
    '/default-cabana.jpg';
});

// Índices para mejor performance
cabanaSchema.index({ nombre: 1 }); // Búsqueda por nombre
cabanaSchema.index({ precio: 1 }); // Ordenar por precio
cabanaSchema.index({ capacidad: 1 }); // Filtrado por capacidad
cabanaSchema.index({ 'fechasReservadas.fechaInicio': 1, 'fechasReservadas.fechaFin': 1 }); // Consultas de disponibilidad

export default mongoose.model('Cabana', cabanaSchema);