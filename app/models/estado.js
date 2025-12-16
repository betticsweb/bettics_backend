const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')

const estadoSchema = new Schema({
    nombre: {
        type: String,
        required: true
    },
    origen: {
        type: Number,
        required: true
    },
    nombreCorto: {
        type: String,
        required: true
    }
})
estadoSchema.plugin(mongoosePaginate)
module.exports = estadoSchema;