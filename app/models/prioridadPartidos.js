const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')

const prioridadPartidosSchema = new Schema({
    competition_id: {
        type: String,
        required: true
    },
    id: {
        type: String,
        required: true
    },
    homeID: {
        type: String,
        required: true
    },
    awayID: {
        type: String,
        required: true
    },
    liga: {
        type: String,
        required: true
    },
    season: {
        type: String,
        required: true
    },
    status: {
        type: String,
        required: true
    },
    game_week: {
        type: String,
        required: true
    },
    home_name: {
        type: String,
        required: true
    },
    away_name: {
        type: String,
        required: true
    },
    date_unix: {
        type: String,
        required: true
    },
    date_partido : {
        type: Date,
        required: true
    },
    home_image: {
        type: String,
        required: true
    },
    away_image: {
        type: String,
        required: true
    },
    probabilidad: {
        type: String,
        required: true
    },
    mercado: {
        type: String,
        required: true
    },
    pais_imagen: {
        type: String,
        required: true
    },
    prioridad: {
        type: String,
        required: true
    }
})
prioridadPartidosSchema.plugin(mongoosePaginate)
module.exports = prioridadPartidosSchema;