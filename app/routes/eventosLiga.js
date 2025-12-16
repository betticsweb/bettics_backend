const express = require('express')
const controller = require('../controllers/eventosLiga')
const { validarJwt } = require('../middleware/validar-jwt')

const router = express.Router()
const path = '/api/eventosLiga'

router.get(
    `${path}/getCriterio`,
    validarJwt,
    controller.getCriterio
)
router.get(
    `${path}/getDatosEventoLiga`,
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

router.get(
    `${path}/getEquipos`,
    validarJwt,
    controller.getEquipos
)

router.get(
    `${path}/getTemporadas`,
    validarJwt,
    controller.getTemporadas
)

module.exports = router;