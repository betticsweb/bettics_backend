const jwt = require('jsonwebtoken');

const generarJWT = (usuario) => {
    return new Promise((resolve, reject) => {
        const payload = { usuario };
        jwt.sign(payload, process.env.KEY_JWT, {
            expiresIn: '4h'
        }, (err, token) => {
            if (err) {
                console.log(err);
                reject('No se pudo generar el token')
            } else {
                resolve(token);
            }
        })
    })
}


const generarJWTRecuperarCuenta = (usuario) => {
    return new Promise((resolve, reject) => {
        const payload = { id: usuario._id };
        jwt.sign(payload, process.env.KEY_JWT, {
            expiresIn: '1h'
        }, (err, token) => {
            if (err) {
                console.log(err);
                reject('No se pudo generar el token')
            } else {
                resolve(token);
            }
        })
    })
}

module.exports = {
    generarJWT,
    generarJWTRecuperarCuenta
}