const errorMiddleware = require('../middleware/errors')
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes')
const bcryptjs = require('bcryptjs')
var axios = require('axios');

const options = {
    page: 1,
    limit: 10,
    select: '_id nombres apellidos correoElectronico tipoCliente informacion'
}

exports.getIdData = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const Usuario = getModel(conn, consta.SchemaName.usuario);
        const data = await Usuario.findById(req.params.pId).select('_id nombres apellidos correoElectronico tipoCliente informacion clienteCulquiId tarjetaCulquiId suscripcionCulquiId tipoLicencia');
        if (data == null) return res.sendStatus(404);
        data.password = ''; // el password nunca se muestra
        res.json(data)
    } catch (err) {
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}
const updateUsuario = async(conn, req, res, data) => {
    const Usuario = getModel(conn, consta.SchemaName.usuario);

    const result = await Usuario.findOneAndUpdate({
        _id: req.body.usuario._id,
        activo: true
    }, {
        $set: data
    }).select("_id")
}
exports.insertData = async(req, res, next) => {
    const conn = conectionManager(req);
    try {

        const Usuario = getModel(conn, consta.SchemaName.usuario);
        const data = req.body;
        // Encriptar la contraseña
        const salt = bcryptjs.genSaltSync();
        data.password = bcryptjs.hashSync(data.password, salt);
        data.tipoLicencia = 'gratis'
        var dataUsuario = await Usuario.findOne({
            correoElectronico: data.correoElectronico,
            activo: true
        }).select("_id");
        if (dataUsuario != null) {
            return res.status(409).json({
                msg: `El email ingresado se encuentra registrado`
            })
        }

        // Gratis por ahora
        // const payload = {
        //     first_name: data.nombres,
        //     last_name: data.apellidos,
        //     email: data.correoElectronico,
        //     address: 'Lima-Peru',
        //     address_city: "Lima-Peru",
        //     country_code: 'PE',
        //     phone_number: data.celular
        // };

        // const config = {
        //     headers: {
        //         'Content-type': 'application/json',
        //         'Authorization': 'Bearer ' + process.env.SK_CULQUI
        //     }
        // }

        // let resCliente = await axios.post('https://api.culqi.com/v2/customers', payload, config);
        // if (resCliente.status != 201) return res.status(500).json({ msg: `Ocurrio un problema al registrar el usuario de la suscripción` })

        // data.flujoCreacion = 0;
        // data.clienteCulquiId = resCliente.data.id;

        const result = await Usuario.create(data)
        return res.json(result)
    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.eliminarData = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const Usuario = getModel(conn, consta.SchemaName.usuario);
        const result = await Usuario.findOneAndUpdate({ _id: req.body._id }, {
            $set: {
                activo: false,
                usuarioIdEli: req.usuarioConectado._id,
                nombreUsuarioEli: req.usuarioConectado.nombres,
                motivoEli: req.body.motivoEli,
                fechaEli: new Date()
            }
        })
        if (result == null)
            return res.status(404).json({
                msg: `El usuario a eliminar no existe`
            })
        return res.json(result)
    } catch (err) {
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.editarData = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const Usuario = getModel(conn, consta.SchemaName.usuario)
        const salt = bcryptjs.genSaltSync();
        req.body.usuarioIdAct = req.usuarioConectado._id;
        req.body.nombreUsuarioAct = req.usuarioConectado.nombres;
        req.body.password = bcryptjs.hashSync(req.body.password, salt);
        const dataActual = await Usuario.findOne({
            _id: req.body._id
        }).select("_id");
        if (dataActual == null) {
            return res.status(404).json({
                msg: `El usuario a editar no existe`
            })
        }
        const result = await Usuario.findOneAndUpdate({
            _id: req.body._id,
            activo: true
        }, {
            $set: req.body
        }).select("_id")
        res.json(result)
    } catch (err) {
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.insertSuscripcion = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        let flujoCreacion = 0
        let tarjetaCulquiId = ''
        let suscripcionCulquiId = ''

        let config = {
            headers: {
                'Content-type': 'application/json',
                'Authorization': 'Bearer ' + process.env.SK_CULQUI
            }
        }

        let payloadTarjetas = {
            customer_id: req.body.usuario.clienteCulquiId,
            token_id: req.body.token.id,
            validate: true,
            metadata: {
                card_number: req.body.token.card_number,
                card_brand: req.body.token.iin.card_brand,
                card_type: req.body.token.iin.card_type,
                issuer_country_code: req.body.token.iin.issuer.country_code,
                issuer_name: req.body.token.iin.issuer.name
            }
        };

        let resTarjeta = await axios.post('https://api.culqi.com/v2/cards', payloadTarjetas, config);

        if (resTarjeta.status != 201) {
            await updateUsuario(conn, req, res, {
                flujoCreacion: flujoCreacion,
                tarjetaCulquiId: tarjetaCulquiId,
                suscripcionCulquiId: suscripcionCulquiId
            });
            return res.status(500).json({ msg: `Ocurrio un problema al registrar la tarjeta de la suscripción` })
        }

        flujoCreacion = 2
        tarjetaCulquiId = resTarjeta.data.id
        let payloadSuscription = {
            card_id: tarjetaCulquiId,
            plan_id: 'pln_test_qkRknHjK66IyeYOG',
        };

        let resSuscription = await axios.post('https://api.culqi.com/v2/subscriptions', payloadSuscription, config);
        if (resSuscription.status != 201) {
            await updateUsuario(conn, req, res, {
                flujoCreacion: flujoCreacion,
                tarjetaCulquiId: tarjetaCulquiId,
                suscripcionCulquiId: suscripcionCulquiId
            });
            return res.status(500).json({ msg: `Ocurrio un problema al registrar la suscripción` })
        }

        flujoCreacion = 3 // Creacion completa
        suscripcionCulquiId = resSuscription.data.id

        await updateUsuario(conn, req, res, {
            flujoCreacion: flujoCreacion,
            tarjetaCulquiId: tarjetaCulquiId,
            suscripcionCulquiId: suscripcionCulquiId
        });

        return res.status(201).json({
            _id: req.body.usuario._id,
            tarjetaCulquiId: tarjetaCulquiId,
            suscripcionCulquiId: suscripcionCulquiId
        })

    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.requestPasswordReset = async(email) => {
    const user = await User.findOne({ email });
    if (!user) throw new Error("Email does not exist");

    let token = await Token.findOne({ userId: user._id });
    if (token) await token.deleteOne();

    let resetToken = crypto.randomBytes(32).toString("hex");
    const hash = await bcrypt.hash(resetToken, Number(bcryptSalt));

    await new Token({
        userId: user._id,
        token: hash,
        createdAt: Date.now(),
    }).save();

    const link = `${clientURL}/passwordReset?token=${resetToken}&id=${user._id}`;

    sendEmail(
        user.email,
        "Password Reset Request", {
            name: user.name,
            link: link,
        },
        "./template/requestResetPassword.handlebars"
    );
    return link;
};

const resetPassword = async(userId, token, password) => {
    let passwordResetToken = await Token.findOne({ userId });

    if (!passwordResetToken) {
        throw new Error("Invalid or expired password reset token");
    }

    const isValid = await bcrypt.compare(token, passwordResetToken.token);

    if (!isValid) {
        throw new Error("Invalid or expired password reset token");
    }

    const hash = await bcrypt.hash(password, Number(bcryptSalt));

    await User.updateOne({ _id: userId }, { $set: { password: hash } }, { new: true });

    const user = await User.findById({ _id: userId });

    sendEmail(
        user.email,
        "Password Reset Successfully", {
            name: user.name,
        },
        "./template/resetPassword.handlebars"
    );

    await passwordResetToken.deleteOne();

    return true;
};

exports.cancelarSuscripcion = async(req, res, next) => {
    const conn = conectionManager(req);
    try {

        const data = req.body;
        console.log(data)
        let config = {
            headers: {
                'Content-type': 'application/json',
                'Authorization': 'Bearer ' + process.env.SK_CULQUI
            }
        }

        let resTarjeta = await axios.delete('https://api.culqi.com/v2/subscriptions/' + data.suscripcionCulquiId, config);

        if (resTarjeta.status != 200) {
            return res.status(resTarjeta.status).json({ msg: `Ocurrio un problema al cancelar la suscripción` })
        } else {
            await updateUsuario(conn, req, res, {
                suscripcionCulquiId: null
            });
            return res.status(200).json('suscripcion cancelada')
        }

    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}