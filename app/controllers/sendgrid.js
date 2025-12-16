const errorMiddleware = require('../middleware/errors')
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes')
const sgMail = require('../shared/sendgrid')

exports.enviarmensajesoporte = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const MensajeEmail = getModel(conn, consta.SchemaName.mensajeEmail);
        let data = req.body;
        data.htmlTemplate = 'Soporte';
        data.from = 'support@bettics.com.pe';

        const result = await MensajeEmail.create(data)
        console.log(req.body);
        const { to, subject, text, html, sandboxMode = false } = req.body;

        const msg = {
            to: 'support@bettics.com.pe',
            from: 'support@bettics.com.pe',
            subject: subject,
            text: `Mensaje de Soporte. <br>Nombre: ${req.body.name} <br> Email: ${req.body.to}<br>Mensaje: ${text} `,
            html: `Mensaje de Soporte. <br>Nombre: ${req.body.name} <br> Email: ${req.body.to}<br>Mensaje: ${text} `

        };
        const user = {
            to,
            from: 'support@bettics.com.pe',
            subject,
            text: 'Estimado usuario, hemos revisido su mensaje, pronto no podremos en contacto con usted para darle mayor detalle.'
        };

        try {
            const [bettics, usuarios] = await Promise.all([
                sgMail.send(msg),
                sgMail.send(user)
            ])
        } catch (err) {
            console.log(err)
            return res.status(err.code).send(err.message);
        }

        res.status(201).send({ success: true });

    } catch (err) {
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}