const express = require('express')
const controller = require('../controllers/login')

const router = express.Router()
const path = '/api/login'

router.post(
    `${path}/Login`,
    controller.getLogin
)

module.exports = router;