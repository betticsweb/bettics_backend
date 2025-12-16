const errorMiddleware = require('../middleware/errors')
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes')
const bcryptjs = require('bcryptjs')
const { replaceAll, reverse } = require('../shared/util')
let cacheProvider = require('../shared/cache-provider')

const options = {
    page: 1,
    limit: 10,
    select: '_id nombre tipoApuesta id_apuesta_combinada id_apuesta_simple liga equipoLocal equipoVisitante pais mercadoApuesta opcionApuesta valorOpcionApuesta cuotaSimple cuotaCombinada fechaJuego'
}

exports.getIdData = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const Recomendaciones = getModel(conn, consta.SchemaName.recomendaciones);
        const data = await Recomendaciones.findById(req.params.pId).select('_id nombre tipoApuesta liga equipoLocal equipoVisitante pais mercadoApuesta opcionApuesta valorOpcionApuesta cuotaSimple cuotaCombinada fechaRegistro fechaJuego');
        if (data == null) return res.sendStatus(404);
        res.json(data)
    } catch (err) {
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.getCriterio = async(req, res, next) => {
    const conn = conectionManager(req);
    try {

        const Recomendaciones = getModel(conn, consta.SchemaName.recomendaciones);
        const Usuario = getModel(conn, consta.SchemaName.usuario);
        const dataUsuario = await Usuario.findById(req.usuarioConectado._id).select('_id  tipoCliente clienteCulquiId tarjetaCulquiId suscripcionCulquiId billeteraMovilPagadoId tipoLicencia');
        if (dataUsuario == null) return res.sendStatus(404);
        if (
            (dataUsuario.suscripcionCulquiId == undefined || dataUsuario.suscripcionCulquiId == null || dataUsuario.suscripcionCulquiId == "") &&
            (dataUsuario.billeteraMovilPagadoId == undefined || dataUsuario.billeteraMovilPagadoId == null || dataUsuario.billeteraMovilPagadoId == "") &&
            (dataUsuario.tipoLicencia != 'gratis')
        )
            return res.status(200).json({
                resStatus: 'Debe registrar una membresía o un pago para visualizar esta sección de información.'
            });

        const cacheKey = consta.cacheController.recomendaciones.byGetCriterio;
        const recomentacionesCache = await cacheProvider.instance().get(cacheKey);
        if (recomentacionesCache)
            return res.send({
                resStatus: 'ok',
                resResult: recomentacionesCache
            })

        if (req.query.pageNumber != undefined) options.page = req.query.pageNumber;
        if (req.query.pageSize != undefined) options.limit = req.query.pageSize;

        const fecha = reverse(replaceAll(req.query.fecha, '/', '-'));

        let filter = {
            createdAt: {
                $gte: fecha
            }
        }

        const lista_id_apuesta_combinada = await Recomendaciones.aggregate(
            [
                { $match: { "activo": true } },
                {
                    $group: {
                        _id: {
                            "id_apuesta_combinada": "$id_apuesta_combinada",
                            "fechaRegistro": "$fechaRegistro",
                            "cuotaCombinada": "$cuotaCombinada",
                            "tipoApuesta": "$tipoApuesta",
                        },
                        count: { $sum: 1 } // this means that the count will increment by 1
                    }
                }

            ], options)


        for (let index = 0; index < lista_id_apuesta_combinada.length; index++) {
            const element = lista_id_apuesta_combinada[index];

            const data = await Recomendaciones.find({
                id_apuesta_combinada: element._id.id_apuesta_combinada,
                activo: true
            }).select("_id id_apuesta_combinada id_apuesta_simple tipoApuesta liga equipoLocal equipoVisitante pais mercadoApuesta opcionApuesta valorOpcionApuesta cuotaSimple cuotaCombinada fechaRegistro fechaJuego")
            lista_id_apuesta_combinada[index].detalle = data
        }

        cacheProvider.instance().set(cacheKey, lista_id_apuesta_combinada, 172800); // 2880 segundos correspondientea 2 dias

        return res.send({
                resStatus: 'ok',
                resResult: lista_id_apuesta_combinada
            })
            // return lista_id_apuesta_combinada;
            // Recomendaciones.collection.distinct('_id', { clicks: { $gt: 100 } }, function(err, result) {
            //     if (err) throw err;

        //     return res.send({
        //         resStatus: 'ok',
        //         totalRegistros: result.totalDocs,
        //         cantidadPaginas: result.totalPages,
        //         resResult: result
        //     })
        //     console.log('unique urls with more than 100 clicks', result);
        // })
    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.insertDataMasivo = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const Recomendaciones = getModel(conn, consta.SchemaName.recomendaciones);
        const data = req.body;

        await Recomendaciones.deleteMany({});

        const result = await Recomendaciones.insertMany(data)

        const cacheKey = consta.cacheController.recomendaciones.byGetCriterio;
        cacheProvider.instance().del(cacheKey);
        return res.json(result)
    } catch (err) {
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}