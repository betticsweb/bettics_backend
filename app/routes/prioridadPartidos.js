const express = require('express')
const controller = require('../controllers/prioridadPartidos')
const { validarJwt } = require('../middleware/validar-jwt')

const router = express.Router()
const path = '/api/prioridadpartidos'

router.get(
    `${path}/getCriterio`,
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