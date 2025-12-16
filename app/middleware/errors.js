require('dotenv').config()

module.exports = async (err, req, res, next) => {
    const error = {
        message: err.message || 'UnkwnownError',
        type: "System.FormatException" ,
        codeLine: null,
        tracingId: null
    };
    res.status(err.codeStatus || 500).json({
        resStatus: 'Error',
        resError: [ error ],
        resResult: null
    });
    
}

/*
module.exports = async(err, req, res, next) => {
    InsertLogErrores(err, req)
    const error = {
        message: err.message || 'UnkwnownError',
        type: "System.FormatException",
        codeLine: null,
        tracingId: null
    };
    return res.status(err.codeStatus || 500).json({
        resStatus: 'Error',
        resError: err,
        resResult: null
    });
}

const InsertLogErrores = async(err, req) => {

    const data = {
        companiaId: req.usuarioConectado.companiaId,
        razonSocial: req.usuarioConectado.razonSocialCompania,
        usuarioId: req.usuarioConectado._id,
        nombreUsuario: req.usuarioConectado.correoElectronico,
        message: err.message,
        description: JSON.stringify(err),
        name: err.code,
        fileName: "",
        lineNumber: "",
        queryEntry: JSON.stringify(req.query),
        bodyEntry: JSON.stringify(req.body)
    }

    var axios = require('axios');
    var config = {
        method: 'post',
        url: process.env.URI_ACCESOS + '/api/logErrores/registrar',
        headers: {
            'grupocompania': process.env.ADMIN_GRU,
            'companiaId': process.env.ADMIN_DB,
            'Authorization': req.headers.authorization,
            'Content-Type': 'application/json'
        },
        data: data
    };

    axios(config)
        .then(function(response) {
            // console.log(JSON.stringify(response.data));
        })
        .catch(function(error) {
            // console.log(error);
        });

}
*/