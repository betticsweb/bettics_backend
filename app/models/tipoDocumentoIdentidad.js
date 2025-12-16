const { Schema, model } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')
const consta = require('../config/constantes');

const tipoDocumentoIdentidad = new Schema({

    nombre: {
        type: String,
        required: true
    }
})
tipoDocumentoIdentidad.plugin(mongoosePaginate)
module.exports = tipoDocumentoIdentidad;