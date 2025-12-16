const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

const eventosLigaProbSchema = new Schema({

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

    shotsonGoalHome: {
        type: Number
    },
    shotsonGoalAway: {
        type: Number
    },


    totalCardsHome: {
        type: Number
    },
    totalCardsAway: {
        type: Number
    },
    idEvent: {
        type: String
    },
    activo: {
        type: Boolean,
        default: true
    }

}, {
    versionKey: false,
    timestamps: true
})
eventosLigaProbSchema.plugin(aggregatePaginate);
eventosLigaProbSchema.plugin(mongoosePaginate)
module.exports = eventosLigaProbSchema;