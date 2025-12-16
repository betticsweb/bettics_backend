const { Schema } = require('mongoose');

const parametroSchema = new Schema({
    tipo: {
        type: String,
        required: true
    },
    linea: {
        type: Number,
        required: true
    },
    companiaId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    descripcion: {
        type: String,
        required: true
    },
    auxiliar1: {
        type: String
    },
    auxiliar2: {
        type: String
    },
    auxiliar3: {
        type: String
    },
    auxiliar4: {
        type: String
    },
    sistema: {
        type: Boolean,
        required: false
    },
    activo: {
        type: Boolean,
        default: true
    }
}, {
    versionKey: false,
    timestamps: true
})
module.exports = parametroSchema;