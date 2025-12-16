const express = require('express')
const controller = require('../controllers/culqi')
const { validarJwt } = require('../middleware/validar-jwt')
const router = express.Router()
const path = '/api/culqi'

router.get(
    `${path}/suscripciones/get/:pId`,
    validarJwt,
    controller.getSuscripcionId
)
router.get(
    `${path}/order/get/:pId`,
    validarJwt,
    controller.getOrderId
)

module.exports = router;