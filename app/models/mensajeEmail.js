const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')

const mensajeEmailSchema = new Schema({
    to: {
        type: String,
        required: true
    },
    from: {
        type: String,
        required: true
    },
    name: {
        type: String
    },
    subject: {
        type: String,
        required: true
    },
    text: {
        type: String,
        required: true
    },
    htmlTemplate: {
        type: String,
        required: true
    }

})
mensajeEmailSchema.plugin(mongoosePaginate)
module.exports = mensajeEmailSchema;