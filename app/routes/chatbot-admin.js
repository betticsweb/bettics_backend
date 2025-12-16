const express = require('express');
const controller = require('../controllers/chatbot-admin');
// const { validarJwt } = require('../middleware/validar-jwt') // Add auth later for admin

const router = express.Router();
const path = '/api/chatbot/admin';

// Upload CSV file
router.post(
    `${path}/upload-csv`,
    controller.uploadCSV
);

// Preview CSV before upload
router.post(
    `${path}/preview-csv`,
    controller.previewCSV
);

// Get CSV template/format
router.get(
    `${path}/csv-template`,
    controller.getCSVTemplate
);

module.exports = router;

