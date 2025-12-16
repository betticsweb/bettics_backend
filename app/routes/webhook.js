const express = require('express')
const validarJwt = require('../middleware/validar-jwt')
const controller = require('../controllers/webhook')

const router = express.Router()
const path = '/api/webhook'

router.post(
    `${path}/eventos`,
    controller.eventos
)

module.exports = router;