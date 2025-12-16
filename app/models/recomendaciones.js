const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

const recomendacionesSchema = new Schema({

    id_apuesta_combinada: {
        type: String,
        required: true
    },

    id_apuesta_simple: {
        type: String
    },
    tipoApuesta: {
        type: String
    },
    liga: {
        type: String,
        required: true
    },
    equipoLocal: {
        type: String,
        required: true
    },
    equipoVisitante: {
        type: String,
        required: true
    },
    pais: {
        type: String
    },
    mercadoApuesta: {
        type: String
    },
    opcionApuesta: {
        type: String
    },
    valorOpcionApuesta: {
        type: String
    },
    cuotaSimple: {
        type: String
    },
    cuotaCombinada: {
        type: String
    },
    fechaRegistro: {
        type: String,
        default: null
    },
    fechaJuego: {
        type: String,
        default: null
    },
    activo: {
        type: Boolean,
        default: true
    },
    nombreUsuarioAct: {
        type: String,
        default: ''
    },
    motivoEli: {
        type: String
    },
    fechaEli: {
        type: Date,
        default: null
    },
    usuarioIdEli: {
        type: Schema.Types.ObjectId,
        default: null
    },
    nombreUsuarioEli: {
        type: String,
        default: ''
    },
    nombre: {
        type: String
    }
}, {
    versionKey: false,
    timestamps: true
})
recomendacionesSchema.plugin(aggregatePaginate);
recomendacionesSchema.plugin(mongoosePaginate)
module.exports = recomendacionesSchema;