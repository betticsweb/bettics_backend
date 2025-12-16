/**
 * Dialogflow Webhook Routes
 * Routes for handling Dialogflow webhook requests
 */

const express = require('express');
const controller = require('../controllers/chatbot-dialogflow');

const router = express.Router();
const path = '/api/chatbot';

// Dialogflow webhook endpoint
// This endpoint receives webhook requests from Dialogflow
router.post(
    `${path}/dialogflow-webhook`,
    controller.webhook
);

module.exports = router;

