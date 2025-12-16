const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/chatbot-conversation');

// Get conversations with filters
router.get('/conversations', conversationController.getConversations);

// Export conversations to CSV
router.get('/conversations/export', conversationController.exportConversations);

// Get analytics
router.get('/conversations/analytics', conversationController.getAnalytics);

// Update feedback
router.put('/conversations/:id/feedback', conversationController.updateFeedback);

module.exports = router;

