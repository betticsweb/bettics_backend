const express = require('express')
const controller = require('../controllers/recomendaciones')
const { validarJwt } = require('../middleware/validar-jwt')

const router = express.Router()
const path = '/api/recomendaciones'

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
    `${path}/get/:pId`,
    validarJwt,
    controller.getIdData
)

module.exports = router;