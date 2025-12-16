const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')

const relacionCompaniaMenuSchema = new Schema({
    companiaMenuId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    activo: {
        type: Boolean,
        default: true
    }
})

const rolSchema = new Schema({
    nombre: {
        type: String,
        required: true
    },
    activo: {
        type: Boolean,
        default: true
    },
    companiaId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    usuarioIdAct: {
        type: Schema.Types.ObjectId,
        default: null
    },
    nombreUsuarioAct: {
        type: String,
        default: ''
    },
    usuarioIdReg: {
        type: Schema.Types.ObjectId,
        default: null
    },
    nombreUsuarioReg: {
        type: String,
        required: true
    },
    usuarioIdEli: {
        type: Schema.Types.ObjectId,
        default: null
    },
    nombreUsuarioEli: {
        type: String,
        default: ''
    },
    motivoEli: {
        type: String
    },
    relacionCompaniaMenu: [relacionCompaniaMenuSchema]
}, {
    versionKey: false,
    timestamps: true
})

rolSchema.plugin(mongoosePaginate)
module.exports = rolSchema;