const express = require('express')
const controller = require('../controllers/forgotPassword')
const { validarJwtResetPassword } = require('../middleware/validar-jwt')

const router = express.Router()
const path = '/api/forgorpassword'

router.post(
    `${path}/recuperarPasswordEmail`,
    controller.recuperarPasswordEmail
)

router.post(
    `${path}/resetPassword`,
    validarJwtResetPassword,
    controller.resetPassword
)


module.exports = router;