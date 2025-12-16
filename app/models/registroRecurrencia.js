const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')


const registroRecurrenciaSchema = new Schema({
    aniomes: {
        type: String,
        required: true
    },
    activo: {
        type: Boolean,
        default: true
    },
    correoElectronico: {
        type: String,
        required: true
    },
    nombreUsuario: {
        type: String,
        default: null
    },
    cantidadRecurrencia: {
        type: Number,
        default: 0
    }
}, {
    versionKey: false,
    timestamps: true
})

registroRecurrenciaSchema.plugin(mongoosePaginate)
module.exports = registroRecurrenciaSchema;