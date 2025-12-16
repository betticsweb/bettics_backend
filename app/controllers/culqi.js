const errorMiddleware = require('../middleware/errors')
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes')
var axios = require('axios');

exports.getSuscripcionId = async(req, res, next) => {
    try {

        let config = {
            headers: {
                'Content-type': 'application/json',
                'Authorization': 'Bearer ' + process.env.SK_CULQUI
            }
        }

        let resTarjeta = await axios.get('https://api.culqi.com/v2/subscriptions/' + req.params.pId, config);

        res.json(resTarjeta.data)

    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally {}
}

exports.getOrderId = async(req, res, next) => {
    try {

        let config = {
            headers: {
                'Content-type': 'application/json',
                'Authorization': 'Bearer ' + process.env.SK_CULQUI
            }
        }

        let orden = await axios.get('https://api.culqi.com/v2/orders/' + req.params.pId, config);

        res.json(orden.data)

    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally {}
}