const jwt = require('jsonwebtoken')
require('dotenv').config()

exports.validarJwt = async(req, res, next) => {
    const authorization = req.headers.authorization;
    if (authorization) {
        const token = authorization.split(" ")[1];
        jwt.verify(token, process.env.KEY_JWT, (err, authData) => {
            if (err) {
                const isTokenExpired = (token) => (Date.now() >= JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).exp * 1000)
                if (isTokenExpired) {
                    return res.status(401).json({
                        resError: 'El token utilizado ha vencido, vuelva a solicitar otro enlace hacia su correo.',
                        resStatus: 'timeout'
                    });
                }
                res.sendStatus(401);
            } else {
                req.usuarioConectado = authData.usuario;
                req.token = token;
                next();
            }
        });
    } else {
        res.sendStatus(401);
    }
}

exports.validarJwtResetPassword = async(req, res, next) => {
    const authorization = req.body.tokenResetPassword;
    if (authorization) {

        const token = authorization;
        jwt.verify(token, process.env.KEY_JWT, (err, authData) => {
            if (err) {
                console.log(JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).exp);

                const isTokenExpired = (token) => (Date.now() >= JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).exp * 1000)
                if (isTokenExpired) {
                    return res.status(401).json({
                        msg: 'El token utilizado ha vencido, vuelva a solicitar otro enlace hacia su correo.',
                        resStatus: 'timeout'
                    });
                }
                res.sendStatus(401);
            } else {
                req.usuarioConectado = authData.usuario;
                req.token = token;
                next();
            }
        });
    } else {
        res.sendStatus(401);
    }
}