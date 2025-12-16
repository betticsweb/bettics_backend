const errorMiddleware = require('../middleware/errors')
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes')
var axios = require('axios');
const qs = require('qs');
var mongoose = require('mongoose');

const options = {
    page: 1,
    limit: 10,
    select: '_id nombres apellidos correoElectronico tipoCliente informacion'
}

const auth = { user: process.env.PAYPAL_CLIENT_ID, pass: process.env.PAYPAL_CLIENT_SECRET }

exports.crearSuscripcion = async (req, res, next) => {

    const conn = conectionManager(req);

    try {
        const currency_code = 'USD';
        const amount_value = '3.00';

        let data = {
            "plan_id": req.body.plan_id,
            "start_time": req.body.start_time,
            "quantity": "1",
            "shipping_amount": {
                "currency_code": currency_code,
                "value": amount_value
            },
            "subscriber": {
                "name": {
                    "given_name": req.body.given_name,
                    "surname": req.body.surname
                },
                "usuario_id": req.body.usuario_id,
                "email_address": req.body.email_address,
                "shipping_address": {
                    "name": {
                        "full_name": req.body.given_name + " " + req.body.surname
                    },
                    "address": {
                        "address_line_1": req.body.address_line_1,
                        "admin_area_1": "CA",
                        "postal_code": req.body.postal_code,
                        "country_code": req.body.country_code
                    }
                }
            },
            "application_context": {
                "brand_name": "Bettics Sac",
                "locale": "es-PE",
                "shipping_preference": "SET_PROVIDED_ADDRESS",
                "user_action": "SUBSCRIBE_NOW",
                "payment_method": {
                    "payer_selected": "PAYPAL",
                    "payee_preferred": "IMMEDIATE_PAYMENT_REQUIRED"
                },
                "return_url": process.env.PAYPAL_SUCESSS_URL,
                "cancel_url": process.env.PAYPAL_ERROR_URL
            }
        };

        const accessToken = await getTokenPaypal();

        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: process.env.PAYPAL_URL + '/v1/billing/subscriptions',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Prefer': 'return=representation'
            } 
        };

        const resSuscription = await axios.post(
            `${process.env.PAYPAL_URL}/v1/billing/subscriptions`,
            data,
            config
        );

        console.log(resSuscription.data)
        // Guardamos en la DB

        const dataSuscripcion = {
            _id : new mongoose.Types.ObjectId(),
            correoElectronico: req.body.email_address,
            webhookId : "",
            suscriptionId : resSuscription.data.id,
            event_type : "",
            shipping_amount_currency_code:  currency_code,
            shipping_amount_value: amount_value,
            estado: resSuscription.data.status,
            create_time: resSuscription.data.create_time,
            plan_id: resSuscription.data.plan_id,
            usuarioId: req.usuarioConectado._id
        }
        const SuscripcionModel = getModel(conn, consta.SchemaName.suscripcion);
        const resultDB = await SuscripcionModel.updateOne(
            { 
                suscriptionId: resSuscription.data.id
            }, {
            $set: dataSuscripcion
        }, {upsert: true, setDefaultsOnInsert: true})

        return res.json({
            resultado: 'ok',
            data: resSuscription.data
        })
    } catch (err) {
        console.log("err.data.details");
        if (err.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.log(err.response.data);
            console.log(err.response.status);
            console.log(err.response.headers);
          } else if (err.request) {
            // The request was made but no response was received
            // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
            // http.ClientRequest in node.js
            console.log(err.request);
          } else {
            // Something happened in setting up the request that triggered an Error
            console.log('Error', err.message);
          }

        // console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close();}
}


exports.webhook = async (req, res, next) => {
    const conn = conectionManager(req);
    try {
        console.log(req.body.event_type);
        console.log(req.body);
        if(req.body.event_type == "BILLING.SUBSCRIPTION.ACTIVATED"){

            console.log("BILLING.SUBSCRIPTION.ACTIVATED");
            const email = req.body.resource.subscriber.email_address;

            const dataSuscripcion = {
                correoElectronico: email,
                webhookId : req.body.id,
                suscriptionId : req.body.resource.id,
                event_type : req.body.event_type,
                shipping_amount_currency_code:  req.body.resource.shipping_amount.currency_code,
                shipping_amount_value:req.body.resource.shipping_amount.value,
                estado: req.body.resource.status,
                create_time: req.body.resource.create_time,
            }
            console.log("dataSuscripcion");
            console.log(dataSuscripcion);

            const suscripcionDataDB = await getSuscripcionDB(conn, dataSuscripcion.suscriptionId);

            const SuscripcionModel = getModel(conn, consta.SchemaName.suscripcion);
            const UsuarioModel = getModel(conn, consta.SchemaName.usuario);

            const [resultadoSuscripcion, updUsuario] = await Promise.all([ 
                SuscripcionModel.updateOne(
                    { 
                        suscriptionId: req.body.resource.id
                    }, {
                    $set: dataSuscripcion
                }),
                UsuarioModel.findOneAndUpdate({
                    _id: suscripcionDataDB.usuarioId,
                    activo: true
                }, {
                    $set: {
                        suscripcionPaypalId: dataSuscripcion.suscriptionId,
                        suscription_next_billing_time: req.body.resource.next_billing_time, 
                        suscription_create_time: req.body.resource.create_time 
                    }
                }).select("_id")
            ]);
        }

        if(
            req.body.event_type == "BILLING.SUBSCRIPTION.CANCELLED" ||
            req.body.event_type == "BILLING.SUBSCRIPTION.EXPIRED" || 
            req.body.event_type == "BILLING.SUBSCRIPTION.SUSPENDED"
        ){
            console.log("BILLING.SUBSCRIPTION.CANCELLED IF");

            const dataSuscripcion = {
                estado: "CANCELLED",
                event_type : req.body.event_type,
                reason_cancel: req.body.resource.status_change_note
            }

            const suscripcionDataDB = await getSuscripcionDB(conn, req.body.resource.id);
            const SuscripcionModel = getModel(conn, consta.SchemaName.suscripcion);
            const UsuarioModel = getModel(conn, consta.SchemaName.usuario);

            const [resultadoSuscripcion, updUsuario] = await Promise.all([ 
                SuscripcionModel.updateOne(
                    { 
                        suscriptionId: req.body.resource.id
                    }, {
                    $set: dataSuscripcion
                }),
                UsuarioModel.findOneAndUpdate({
                    _id: suscripcionDataDB.usuarioId,
                    activo: true
                }, {
                    $set: {
                        suscripcionPaypalId: null,
                        suscription_next_billing_time: null, 
                        suscription_create_time: null
                    }
                }).select("_id")
            ]);
            
        }
        return res.json({
            resultado: 'ok'
        })
    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}


const getTokenPaypal = async () => {

    let data = qs.stringify({
        'grant_type': 'client_credentials'
    });

    var basicAuth = 'Basic ' + btoa(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_CLIENT_SECRET);

    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': basicAuth
        },
        data: data
    };
    const response = await axios.post(process.env.PAYPAL_URL + '/v1/oauth2/token', data, config);

    console.log("response access_token");
    console.log(response.data.access_token);

    return response.data.access_token
}

exports.getSuscripcion = async (req, res, next) => {

    try {
        console.log("req.params.suscriptionId")
        console.log(req.params.suscriptionId)
        const responseGet = await getSuscripcion(req.params.suscriptionId);
        return res.json(responseGet);

    } catch (err) {
        console.log("err.data.details");
        console.log(err);
        if (err.response) {
            console.log(err.response.data);
            console.log(err.response.status);
            console.log(err.response.headers);
          } else if (err.request) {
            console.log(err.request);
          } else {
            console.log('Error', err.message);
          }

        return errorMiddleware(err, req, res, next);
    } finally { }
}


const getSuscripcion = async (suscriptionId) => { 
    
    const accessToken = await getTokenPaypal();

    let config = {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        } 
    };

    const responseGet = await axios.get( process.env.PAYPAL_URL + '/v1/billing/subscriptions/'  + suscriptionId, config);
    console.log("responseGet")
    return responseGet.data;
}

const getSuscripcionDB = async (conn, suscriptionId) => { 
 
    const SuscripcionModel = getModel(conn, consta.SchemaName.suscripcion);
    const suscriptionBD = await SuscripcionModel.findOne({
        suscriptionId: suscriptionId
    }).select("_id suscriptionId usuarioId");
    
    console.log("suscriptionBD")
    console.log(suscriptionBD)

    return suscriptionBD;
}

exports.getSuscripcionDB = async (req, res, next) => {

    const conn = conectionManager(req);
    try {
        const responseGet = await getSuscripcionDB(conn, req.params.suscriptionId);
        return res.json(responseGet);

    } catch (err) {
        console.log("err.data.details");
        console.log(err);
        if (err.response) {
            console.log(err.response.data);
            console.log(err.response.status);
            console.log(err.response.headers);
          } else if (err.request) {
            console.log(err.request);
          } else {
            console.log('Error', err.message);
          }

        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}


exports.cancelarSuscripcion = async (req, res, next) => {

    const conn = conectionManager(req);

    try {

        const accessToken = await getTokenPaypal();

        let config = {
            method: 'post',
            maxBodyLength: Infinity,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Prefer': 'return=representation'
            } 
        };
        console.log("antes de.data")

        const resSuscription = await axios.post(
            `${process.env.PAYPAL_URL}/v1/billing/subscriptions/${req.params.suscriptionId}/cancel`,
            req.body,
            config
        );

        console.log("resSuscription.data")
        console.log(resSuscription)
        console.log(resSuscription.data)
        // Guardamos en la DB

        if(resSuscription.status == 204){

            const dataSuscripcion = {
                estado: "CANCELLED",
                reason_cancel: req.body.reason
            }

            const suscripcionDataDB = await getSuscripcionDB(conn, req.params.suscriptionId);
            const SuscripcionModel = getModel(conn, consta.SchemaName.suscripcion);
            const UsuarioModel = getModel(conn, consta.SchemaName.usuario);

            const [resultadoSuscripcion, updUsuario] = await Promise.all([ 
                SuscripcionModel.updateOne(
                    { 
                        suscriptionId: req.params.suscriptionId,
                    }, {
                    $set: dataSuscripcion
                }),
                UsuarioModel.findOneAndUpdate({
                    _id: suscripcionDataDB.usuarioId,
                    activo: true
                }, {
                    $set: {
                        suscripcionPaypalId: null,
                        suscription_next_billing_time: null, 
                        suscription_create_time: null
                    }
                }).select("_id")
            ]);

            return res.json({
                resultado: 'ok'
            })
        }

        return res.json({
            resultado: 'noOk2'
        })

    } catch (err) {
        console.log("err.data.details");
        if (err.response) {
            // that falls out of the range of 2xx
            console.log(err.response.data);
            console.log(err.response.status);
            console.log(err.response.headers);
          } else if (err.request) {
            console.log(err.request);
          } else {
            console.log('Error', err.message);
          }

        // console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close();}
}
