const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')

const chatbotFAQSchema = new Schema({
    question: {
        type: String,
        required: true
    },
    answer: {
        type: String,
        required: true
    },
    keywords: {
        type: [String],
        default: []
    },
    category: {
        type: String,
        enum: ['general', 'betting', 'platform', 'subscription'],
        default: 'general'
    },
    priority: {
        type: Number,
        default: 0
    },
    language: {
        type: String,
        default: 'es'
    },
    active: {
        type: Boolean,
        default: true
    }
}, {
    versionKey: false,
    timestamps: true
})

chatbotFAQSchema.plugin(mongoosePaginate)
module.exports = chatbotFAQSchema;

