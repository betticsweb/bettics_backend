const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

const partidosJugarSchema = new Schema({

    fecha: {
        type: String,
        required: true
    },
    hora: {
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
 
       
    cornersHechoTotalesLocalVisita: {
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
    idEvent: {
        type: String,
        required: true
    },
    activo: {
        type: Boolean,
        default: true
    },
    home_image: {
        type: String,
        required: true
    },
    away_image: {
        type: String,
        required: true
    },
    pais_imagen: {
        type: String,
        required: true
    }

}, {
    versionKey: false,
    timestamps: true
})
partidosJugarSchema.plugin(aggregatePaginate);
partidosJugarSchema.plugin(mongoosePaginate)
module.exports = partidosJugarSchema;