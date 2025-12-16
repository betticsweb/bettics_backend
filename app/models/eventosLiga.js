const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

const eventosLigaSchema = new Schema({

    strLeague: {
        type: String,
        required: true
    },

    dateEvent: {
        type: String
    },
    strSeason: {
        type: String
    },
    idHomeTeam: {
        type: String,
        required: true
    },
    strHomeTeam: {
        type: String,
        required: true
    },
    idAwayTeam: {
        type: String,
        required: true
    },
    strAwayTeam: {
        type: String
    },
    intHomeScore: {
        type: Number
    },
    intAwayScore: {
        type: Number
    },
    cornerKicksHome: {
        type: Number
    },
    cornerKicksAway: {
        type: Number
    },
    activo: {
        type: Boolean,
        default: true
    }

}, {
    versionKey: false,
    timestamps: true
})
eventosLigaSchema.plugin(aggregatePaginate);
eventosLigaSchema.plugin(mongoosePaginate)
module.exports = eventosLigaSchema;