const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

const tableroPosicionesSchema = new Schema({

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
   
 
    golesProbabilidadMas1: {
        type: Number
    },

 
    tirosaporteriaProb6: {
        type: Number
    },

  
    cornersLocalProbMas7: {
        type: Number
    },
     
    cornersLocalProbMas5: {
        type: Number
    },
    golesLocalProbMas1: {
        type: Number
    },
    tirosaporteriaLocalProb5: {
        type: Number
    },

    tarjetasLocalProb2: {
        type: Number
    },
    cornersHechoTotalesLocalVisita: {
        type: Number
    },
    golesHechoTotalesLocalVisita: {
        type: Number
    },
    tirosaporteriaTotalProm: {
        type: Number
    },
    tarjetasTotalProm: {
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
    cornerstotalesresultado: {
        type: Number,
        required: true,
        default:0
    },
    golestotalesresultado: {
        type: Number,
        required: true,
        default:0
    },
    tirosaporteriatotalresultado: {
        type: Number,
        required: true,
        default:0
    },
    tarjetastotalresultado: {
        type: Number,
        required: true,
        default:0
    }

}, {
    versionKey: false,
    timestamps: true
})
tableroPosicionesSchema.plugin(aggregatePaginate);
tableroPosicionesSchema.plugin(mongoosePaginate)
module.exports = tableroPosicionesSchema;