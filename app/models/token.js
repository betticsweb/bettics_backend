const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')

const tokenSchema = new Schema({
    usuarioId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    token: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        required: true,
        default: Date.now,
        expires: 900,
    },
});

tokenSchema.plugin(mongoosePaginate)
module.exports = tokenSchema;