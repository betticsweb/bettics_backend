const express = require('express')
const controller = require('../controllers/resultados')
const { validarJwt } = require('../middleware/validar-jwt')

const router = express.Router()
const path = '/api/resultados'

router.get(
    `${path}/getCriterio`,
    validarJwt,
    controller.getCriterio
)
router.post(
    `${path}/registrarMasivo`,
    controller.insertDataMasivo
)

router.get(
    `${path}/getMaestros`,
    validarJwt,
    controller.getMaestros
)
module.exports = router;