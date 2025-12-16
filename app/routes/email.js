const express = require('express')
const controller = require('../controllers/sendgrid')
const { validarJwt } = require('../middleware/validar-jwt')

const router = express.Router()
const path = '/api/email'

router.post(
    `${path}/enviarmensajesoporte`,
    controller.enviarmensajesoporte
)

module.exports = router;