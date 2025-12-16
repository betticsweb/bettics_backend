const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')

const chatbotKnowledgeBaseSchema = new Schema({
    topic: {
        type: String,
        required: true,
        unique: true
    },
    title: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    examples: {
        type: [String],
        default: []
    },
    relatedTopics: {
        type: [String],
        default: []
    },
    keywords: {
        type: [String],
        default: []
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

chatbotKnowledgeBaseSchema.plugin(mongoosePaginate)
module.exports = chatbotKnowledgeBaseSchema;

