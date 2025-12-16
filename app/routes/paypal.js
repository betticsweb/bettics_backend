const express = require('express')
const controller = require('../controllers/paypal')
const { validarJwt } = require('../middleware/validar-jwt')

const router = express.Router()
const path = '/api/paypal'


router.post(
    `${path}/crearSuscripcion`,
    validarJwt,
    controller.crearSuscripcion
)

router.post(
    `${path}/webhook`,
    controller.webhook
)

router.get(
    `${path}/getSuscripcion/:suscriptionId`,
    validarJwt,
    controller.getSuscripcion
)

router.get(
    `${path}/getSuscripcionDB/:suscriptionId`,
    validarJwt,
    controller.getSuscripcionDB
)

router.post(
    `${path}/cancelarSuscripcion/:suscriptionId`,
    validarJwt,
    controller.cancelarSuscripcion
)

module.exports = router;