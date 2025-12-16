const errorMiddleware = require('../middleware/errors')
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes')
const bcryptjs = require('bcryptjs')
const { replaceAll, reverse } = require('../shared/util')

const options = {
    page: 1,
    limit: 10,
    select: '_id nombre tipoApuesta id_apuesta_combinada id_apuesta_simple liga equipoLocal equipoVisitante pais mercadoApuesta opcionApuesta valorOpcionApuesta cuotaSimple cuotaCombinada fechaJuego'
}

exports.eventos = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        console.log(req.body)
            // const Recomendaciones = getModel(conn, consta.SchemaName.recomendaciones);
            // const data = req.body;

        // const result = await Recomendaciones.insertMany(data)
        return res.json('result')
    } catch (err) {
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

const controlarMensualidadPorPagoUnico = async(req, res, next, UsuarioModel, usuario) => {
    let dateNow = new Date();
    console.log(dateNow)
    if (usuario.billeteraMovilPagadoFecha < dateNow) {

        await UsuarioModel.updateOne({ _id: usuario.userId }, {
            $set: {
                billeteraMovilPagadoId: null,
                billeteraMovilPagadoFecha: null
            }
        }, { new: true });
        const user = await UsuarioModel.findById({ _id: usuario.userId }).select('_id foto nombres apellidos correoElectronico tipoCliente activo informacion password clienteCulquiId tarjetaCulquiId suscripcionCulquiId billeteraMovilPagadoId billeteraMovilPagadoFecha');
        return user;
    } else {
        return usuario;
    }

}