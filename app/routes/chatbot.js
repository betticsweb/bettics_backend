const express = require('express');
const controller = require('../controllers/chatbot');
// const { validarJwt } = require('../middleware/validar-jwt') // Optional: Add auth later

const router = express.Router();
const path = '/api/chatbot';

// Main chat query endpoint (public for MVP)
router.post(
    `${path}/query`,
    controller.processQuery
);

// Direct search endpoint (public for MVP)
router.get(
    `${path}/search`,
    controller.searchRecommendations
);

// Get FAQs (public)
router.get(
    `${path}/faqs`,
    controller.getFAQs
);

// Get knowledge base articles (public)
router.get(
    `${path}/knowledge-base`,
    controller.getKnowledgeBase
);

module.exports = router;

