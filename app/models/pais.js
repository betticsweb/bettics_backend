const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')

const paisSchema = new Schema({

    codigo: {
        type: String
    },
    nombre: {
        type: String,
        required: true
    },
}, {
    versionKey: false,
    timestamps: true
})
paisSchema.plugin(mongoosePaginate)
module.exports = paisSchema;