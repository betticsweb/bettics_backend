const express = require('express')
const controller = require('../controllers/usuario')
const { validarJwt } = require('../middleware/validar-jwt')

const router = express.Router()
const path = '/api/usuario'


router.post(
    `${path}/registrar`,
    controller.insertData
)

router.get(
    `${path}/get/:pId`,
    validarJwt,
    controller.getIdData
)
router.post(
    `${path}/actualizar`,
    validarJwt,
    controller.editarData
)

router.post(
    `${path}/eliminar`,
    validarJwt,
    controller.eliminarData
)

router.post(
    `${path}/registrarSuscripcion`,
    controller.insertSuscripcion
)

router.post(
    `${path}/cancelarSuscripcion`,
    controller.cancelarSuscripcion
)

module.exports = router;