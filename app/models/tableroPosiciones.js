const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

const tableroPosicionesSchema = new Schema({

    fecha: {
        type: String,
        required: true
    },

    liga: {
        type: String
    },
    equipoLocal: {
        type: String
    },
    equipoVisitante: {
        type: String,
        required: true
    },
    posicionLocal: {
        type: Number,
        required: true
    },
    posicionVisita: {
        type: Number,
        required: true
    },
    cornersHechosLocal: {
        type: Number
    },
    cornersRecibidosLocal: {
        type: Number
    },
    cornersHechosVisita: {
        type: Number
    },
    cornersRecibidosVisita: {
        type: Number
    },
    cornersHechoTotalesLocalVisita: {
        type: Number
    },
    cornersProbabilidadMas6: {
        type: Number
    },

    golesHechosLocal: {
        type: Number
    },
    golesRecibidosLocal: {
        type: Number
    },
    golesHechosVisita: {
        type: Number
    },
    golesRecibidosVisita: {
        type: Number
    },
    golesHechoTotalesLocalVisita: {
        type: Number
    },
    golesProbabilidadMas6: {
        type: Number
    },
    idAwayTeam: {
        type: String,
        required: true
    },
    idHomeTeam: {
        type: String,
        required: true
    },
    activo: {
        type: Boolean,
        default: true
    }

}, {
    versionKey: false,
    timestamps: true
})
tableroPosicionesSchema.plugin(aggregatePaginate);
tableroPosicionesSchema.plugin(mongoosePaginate)
module.exports = tableroPosicionesSchema;