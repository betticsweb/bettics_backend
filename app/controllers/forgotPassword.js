const errorMiddleware = require('../middleware/errors')
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes')
const sgMail = require('../shared/sendgrid')
const { generarJWTRecuperarCuenta } = require('../shared/generar-jwt')
require('dotenv').config()
const bcryptjs = require('bcryptjs')

exports.recuperarPasswordEmail = async(req, res, next) => {
    const conn = conectionManager(req);
    try {

        if (req.body.to == '') {
            return res.status(400).json({
                message: 'El email es requerido.'
            });
        }

        const Usuario = getModel(conn, consta.SchemaName.usuario);
        const MensajeEmail = getModel(conn, consta.SchemaName.mensajeEmail);

        const usuarioActual = await Usuario.find({
            correoElectronico: req.body.to
        }).select("_id");

        console.log(usuarioActual);

        if (usuarioActual == null) {
            return res.status(404).json({
                msg: `No existe un usuario con el email ingresado`
            })
        }

        const [tokenPass] = await Promise.all([
            generarJWTRecuperarCuenta(usuarioActual[0]),
        ])

        await Usuario.findOneAndUpdate({
            _id: usuarioActual[0]._id
        }, {
            $set: {
                tokenResetPassword: tokenPass
            }
        }).select("_id")

        const { to, subject, text, html, sandboxMode = false } = req.body;
        // const urlBase = 'https://bettics.com.pe';
        const urlBase = process.env.URL_BASE_RESET_PASS;

        const msg = {
            to: req.body.to,
            from: 'support@bettics.com.pe',
            subject: 'Enlace para recuperar su cuenta Bettics.com.pe',
            // text: `${urlBase}/resetpassword/${usuarioActual[0]._id}/${tokenPass}`,
            text: `Hola. `,
            html: `<p>Estimado. <br> Hemos recibido una solicitud para <strong>restablecer su contraseña</strong> para continuar dar click en siguiente enlace:  <br><a href="${urlBase}/resetpassword/${usuarioActual[0]._id}/${tokenPass}">click aquí</a>  </p> <br> Saludos <br> Bettics.`
        };

        const mensajeCorreo = {
            ...msg,
            htmlTemplate: 'default.html'
        }

        await MensajeEmail.create(mensajeCorreo)

        try {
            await sgMail.send(msg);
        } catch (err) {
            console.log(err)
            return res.status(err.code).send(err.message);
        }

        res.send({
            resStatus: 'ok',
            strLeague: 'Revise su correo electronico, se le ha enviado un enlace para crear una nueva contraseña'
        });

    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.resetPassword = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const regExPassword = new RegExp('(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[$@$!%*?&#/]).{8,}')
        const Usuario = getModel(conn, consta.SchemaName.usuario);

        if (!regExPassword.test(req.body.password)) {
            return res.status(400).json({
                resStatus: 'error',
                msg: 'El password debe tene al menos una mayúscula, minúscula, número y caracter especial, con una longitud minima de 8.'
            });
        }

        const salt = bcryptjs.genSaltSync();
        const newPassword = bcryptjs.hashSync(req.body.password, salt);

        const resultadoUpdate = await Usuario.findOneAndUpdate({
            _id: req.body._id,
            tokenResetPassword: req.body.tokenResetPassword
        }, {
            $set: {
                password: newPassword
            }
        }).select("_id ")

        if (!resultadoUpdate) {
            return res.status(400).json({
                resStatus: 'error',
                msg: 'El proceso de cambio de contraseña no ha podido completarse, vuelva a intentarlo o comuniquese con el administrador.'
            });
        }

        res.send({
            resStatus: 'ok',
            strLeague: 'La contraseña ha sido cambiada con exito.'
        });

    } catch (err) {
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}