const { validationResult } = require('express-validator');

exports.validateRequestSchema = async(req, res, next) => {
    const errors = validationResult(req);
    if (errors.errors.length > 0) {
        var validationError = {}
        for (let index = 0; index < errors.array().length; index++) {
            validationError[errors.array()[index].param] = [errors.array()[index].msg];
        }
        res.status(400).json({
            errors: validationError,
            type: 'error validación',
            title: 'Validación',
            status: 400,
            traceId: 'api-accesos'
        });
    } else {
        next();
    }
}