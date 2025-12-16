const errorMiddleware = require('../middleware/errors');
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes');

/**
 * Save conversation to database
 * @param {Object} req - Express request
 * @param {Object} conversationData - Conversation data to save
 * @returns {Promise<Object>} - Saved conversation document
 */
async function saveConversation(req, conversationData) {
    const conn = conectionManager(req);
    
    try {
        const Conversation = getModel(conn, consta.SchemaName.chatbotConversation);
        
        const conversation = new Conversation({
            sessionId: conversationData.sessionId || req.sessionId || `session_${Date.now()}`,
            userId: conversationData.userId || req.usuarioConectado?._id || null,
            query: conversationData.query,
            queryLanguage: conversationData.queryLanguage || 'es',
            intent: conversationData.intent,
            originalIntent: conversationData.originalIntent || null,
            confidence: conversationData.confidence || 0,
            parameters: conversationData.parameters || {},
            entities: conversationData.entities || {},
            response: conversationData.response,
            recommendations: conversationData.recommendations || [],
            faqs: conversationData.faqs || [],
            knowledgeBase: conversationData.knowledgeBase || null,
            timestamp: conversationData.timestamp || new Date(),
            userAgent: req.headers['user-agent'] || null,
            ipAddress: req.ip || req.connection.remoteAddress || null,
            processingTime: conversationData.processingTime || null,
            error: conversationData.error || null
        });
        
        const saved = await conversation.save();
        return saved;
    } catch (error) {
        console.error('Error saving conversation:', error);
        // Don't throw - logging should not break the main flow
        return null;
    } finally {
        if (conn) conn.close();
    }
}

/**
 * Get conversations with filters
 * GET /api/chatbot/conversations
 */
exports.getConversations = async (req, res, next) => {
    const conn = conectionManager(req);
    
    try {
        const Conversation = getModel(conn, consta.SchemaName.chatbotConversation);
        const {
            sessionId,
            userId,
            intent,
            startDate,
            endDate,
            limit = 50,
            page = 1
        } = req.query;
        
        const query = {};
        
        if (sessionId) query.sessionId = sessionId;
        if (userId) query.userId = userId;
        if (intent) query.intent = intent;
        
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }
        
        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: { timestamp: -1 }
        };
        
        const conversations = await Conversation.paginate(query, options);
        
        return res.json({
            success: true,
            data: conversations.docs,
            pagination: {
                page: conversations.page,
                limit: conversations.limit,
                total: conversations.totalDocs,
                pages: conversations.totalPages
            }
        });
    } catch (err) {
        console.error('Error getting conversations:', err);
        return errorMiddleware(err, req, res, next);
    } finally {
        if (conn) conn.close();
    }
};

/**
 * Export conversations to CSV
 * GET /api/chatbot/conversations/export
 */
exports.exportConversations = async (req, res, next) => {
    const conn = conectionManager(req);
    
    try {
        const Conversation = getModel(conn, consta.SchemaName.chatbotConversation);
        const {
            sessionId,
            userId,
            intent,
            startDate,
            endDate
        } = req.query;
        
        const query = {};
        
        if (sessionId) query.sessionId = sessionId;
        if (userId) query.userId = userId;
        if (intent) query.intent = intent;
        
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }
        
        const conversations = await Conversation.find(query)
            .sort({ timestamp: -1 })
            .limit(10000) // Limit export size
            .lean();
        
        // Convert to CSV
        const csv = convertToCSV(conversations);
        
        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=conversations_${Date.now()}.csv`);
        res.setHeader('Content-Encoding', 'utf-8');
        
        // Add BOM for Excel compatibility
        res.write('\ufeff');
        res.send(csv);
    } catch (err) {
        console.error('Error exporting conversations:', err);
        return errorMiddleware(err, req, res, next);
    } finally {
        if (conn) conn.close();
    }
};

/**
 * Update conversation feedback
 * PUT /api/chatbot/conversations/:id/feedback
 */
exports.updateFeedback = async (req, res, next) => {
    const conn = conectionManager(req);
    
    try {
        const Conversation = getModel(conn, consta.SchemaName.chatbotConversation);
        const { id } = req.params;
        const { wasHelpful, userRating, feedback } = req.body;
        
        const update = {};
        if (wasHelpful !== undefined) update.wasHelpful = wasHelpful;
        if (userRating !== undefined) update.userRating = userRating;
        if (feedback !== undefined) update.feedback = feedback;
        
        const conversation = await Conversation.findByIdAndUpdate(
            id,
            update,
            { new: true }
        );
        
        if (!conversation) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }
        
        return res.json({
            success: true,
            data: conversation
        });
    } catch (err) {
        console.error('Error updating feedback:', err);
        return errorMiddleware(err, req, res, next);
    } finally {
        if (conn) conn.close();
    }
};

/**
 * Get conversation analytics
 * GET /api/chatbot/conversations/analytics
 */
exports.getAnalytics = async (req, res, next) => {
    const conn = conectionManager(req);
    
    try {
        const Conversation = getModel(conn, consta.SchemaName.chatbotConversation);
        const { startDate, endDate } = req.query;
        
        const matchQuery = {};
        if (startDate || endDate) {
            matchQuery.timestamp = {};
            if (startDate) matchQuery.timestamp.$gte = new Date(startDate);
            if (endDate) matchQuery.timestamp.$lte = new Date(endDate);
        }
        
        // Aggregate analytics
        const analytics = await Conversation.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalConversations: { $sum: 1 },
                    uniqueSessions: { $addToSet: '$sessionId' },
                    uniqueUsers: { $addToSet: '$userId' },
                    avgConfidence: { $avg: '$confidence' },
                    avgProcessingTime: { $avg: '$processingTime' },
                    intents: { $push: '$intent' }
                }
            },
            {
                $project: {
                    totalConversations: 1,
                    uniqueSessions: { $size: '$uniqueSessions' },
                    uniqueUsers: { $size: '$uniqueUsers' },
                    avgConfidence: { $round: ['$avgConfidence', 2] },
                    avgProcessingTime: { $round: ['$avgProcessingTime', 2] }
                }
            }
        ]);
        
        // Get intent distribution
        const intentDistribution = await Conversation.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$intent',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        // Get feedback stats
        const feedbackStats = await Conversation.aggregate([
            { 
                $match: { 
                    ...matchQuery,
                    wasHelpful: { $ne: null }
                }
            },
            {
                $group: {
                    _id: '$wasHelpful',
                    count: { $sum: 1 },
                    avgRating: { $avg: '$userRating' }
                }
            }
        ]);
        
        return res.json({
            success: true,
            data: {
                overview: analytics[0] || {},
                intentDistribution: intentDistribution,
                feedbackStats: feedbackStats
            }
        });
    } catch (err) {
        console.error('Error getting analytics:', err);
        return errorMiddleware(err, req, res, next);
    } finally {
        if (conn) conn.close();
    }
};

/**
 * Convert conversations array to CSV format
 * @param {Array} conversations - Array of conversation documents
 * @returns {string} - CSV string
 */
function convertToCSV(conversations) {
    if (!conversations || conversations.length === 0) {
        return 'Timestamp,Session,Query,Intent,Confidence,Parameters,Response\n';
    }
    
    // CSV header
    const headers = [
        'Timestamp',
        'Session',
        'Query',
        'Intent',
        'Confidence',
        'Parameters',
        'Response',
        'Recommendations',
        'User ID',
        'Processing Time',
        'Error'
    ];
    
    let csv = headers.join(',') + '\n';
    
    // CSV rows
    conversations.forEach(conv => {
        const row = [
            conv.timestamp ? new Date(conv.timestamp).toISOString() : '',
            escapeCSV(conv.sessionId || ''),
            escapeCSV(conv.query || ''),
            escapeCSV(conv.intent || ''),
            conv.confidence || 0,
            escapeCSV(JSON.stringify(conv.parameters || {})),
            escapeCSV(conv.response || ''),
            escapeCSV(JSON.stringify(conv.recommendations || [])),
            conv.userId || '',
            conv.processingTime || '',
            escapeCSV(conv.error || '')
        ];
        
        csv += row.join(',') + '\n';
    });
    
    return csv;
}

/**
 * Escape CSV field (handle commas, quotes, newlines)
 * @param {string} field - Field value
 * @returns {string} - Escaped field
 */
function escapeCSV(field) {
    if (field === null || field === undefined) {
        return '';
    }
    
    const str = String(field);
    
    // If contains comma, quote, or newline, wrap in quotes and escape quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
}

// Export saveConversation for use in other controllers
module.exports.saveConversation = saveConversation;

