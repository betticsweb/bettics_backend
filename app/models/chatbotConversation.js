const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

/**
 * Chatbot Conversation Log Model
 * Stores all conversations with Betina for analytics and improvement
 */
const chatbotConversationSchema = new Schema({
    sessionId: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'usuario',
        default: null,
        index: true
    },
    
    // User query
    query: {
        type: String,
        required: true
    },
    queryLanguage: {
        type: String,
        default: 'es'
    },
    
    // Intent detection
    intent: {
        type: String,
        required: true,
        index: true
    },
    originalIntent: {
        type: String,
        default: null // For Dialogflow compatibility
    },
    confidence: {
        type: Number,
        default: 0,
        min: 0,
        max: 1
    },
    
    // Extracted entities/parameters
    parameters: {
        type: Object,
        default: {}
    },
    entities: {
        teams: [{ type: String }],
        date: { type: String, default: null },
        league: { type: String, default: null },
        keywords: [{ type: String }]
    },
    
    // Bot response
    response: {
        type: String,
        required: true
    },
    recommendations: [{
        type: Object
    }],
    faqs: [{
        type: Object
    }],
    knowledgeBase: {
        type: Object,
        default: null
    },
    
    // Metadata
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    userAgent: {
        type: String,
        default: null
    },
    ipAddress: {
        type: String,
        default: null
    },
    
    // Quality metrics
    wasHelpful: {
        type: Boolean,
        default: null
    },
    userRating: {
        type: Number,
        min: 1,
        max: 5,
        default: null
    },
    feedback: {
        type: String,
        default: null
    },
    
    // Error tracking
    error: {
        type: String,
        default: null
    },
    processingTime: {
        type: Number, // milliseconds
        default: null
    }
}, {
    versionKey: false,
    timestamps: true
});

// Indexes for analytics queries
chatbotConversationSchema.index({ sessionId: 1, timestamp: -1 });
chatbotConversationSchema.index({ intent: 1, timestamp: -1 });
chatbotConversationSchema.index({ userId: 1, timestamp: -1 });
chatbotConversationSchema.index({ timestamp: -1 });

chatbotConversationSchema.plugin(mongoosePaginate);

module.exports = chatbotConversationSchema;

