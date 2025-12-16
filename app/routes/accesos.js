const express = require('express')
const controller = require('../controllers/accesos')
const { validarJwt } = require('../middleware/validar-jwt')

const router = express.Router()
const path = '/api/accesos'

router.get(
    `${path}/getMenuxUsuario/:pUsuarioId/:pEsAdministrador`,
    validarJwt,
    controller.getMenuxUsuario
)

router.get(
    `${path}/getAll`,
    validarJwt,
    controller.getAll
)

router.get(
    `${path}/getMenuAdministrativoCompania/:pCompaniaId/:pTipoConsulta`,
    validarJwt,
    controller.getMenuAdministrativoCompania
)

router.post(
    `${path}/editarMenuAdministrativo`,
    validarJwt,
    controller.editarMenuAdministrativo
)

router.get(
    `${path}/getMenuRol/:pRolId`,
    validarJwt,
    controller.getMenuRol
)

router.post(
    `${path}/actualizar`,
    validarJwt,
    controller.editarData
)
module.exports = router;