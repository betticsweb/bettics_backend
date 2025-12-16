const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')

const ubigeoSchema = new Schema({

    codigo: {
        type: String,
        unique: true
    },
    distrito: {
        type: String,
        required: true
    },
    provincia: {
        type: String,
        required: true
    },
    departamento: {
        type: String,
        required: true
    }
}, {
    versionKey: false,
    timestamps: true
})
ubigeoSchema.plugin(mongoosePaginate)
module.exports = ubigeoSchema;