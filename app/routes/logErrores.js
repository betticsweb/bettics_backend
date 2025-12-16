const express = require('express')
const controller = require('../controllers/logErrores')
const { validarJwt } = require('../middleware/validar-jwt')

const router = express.Router()
const path = '/api/logErrores'

router.get(
    `${path}/getCriterio`,
    validarJwt,
    controller.getCriterio
)
router.post(
    `${path}/registrar`,
    validarJwt,
    controller.insertData
)

router.get(
    `${path}/get/:pId`,
    validarJwt,
    controller.getIdData
)
module.exports = router;