const errorMiddleware = require('../middleware/errors')
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes')
const bcryptjs = require('bcryptjs')
const { replaceAll, reverse } = require('../shared/util')
let cacheProvider = require('../shared/cache-provider')

const options = {
    page: 1,
    limit: 50,
    select: '_id home_image away_image pais_imagen fecha hora liga equipoLocal equipoVisitante posicionLocal posicionVisita cornersHechoTotalesLocalVisita  idAwayTeam idHomeTeam idEvent'
}

exports.insertDataMasivo = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const PartidosJugar = getModel(conn, consta.SchemaName.partidosJugar);
        const data = req.body;

        await PartidosJugar.deleteMany({});
        // .deleteMany({})
        const result = await PartidosJugar.insertMany(data)

        const cacheKey = consta.cacheController.partidosJugar.maestros;
        cacheProvider.instance().del(cacheKey);
        const listCache = cacheProvider.instance().keys();
        console.log(listCache);
        for (let z = 0; z < listCache.length; z++) {
            const element = listCache[z];
            cacheProvider.instance().del(element);
        }
        return res.json(result)
    } catch (err) {
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.getMaestros = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const PartidosJugar = getModel(conn, consta.SchemaName.partidosJugar);

        // Primero validamos que tenga una suscripcion.
        const Usuario = getModel(conn, consta.SchemaName.usuario);
        const dataUsuario = await Usuario.findById(req.usuarioConectado._id).select('_id  tipoCliente clienteCulquiId tarjetaCulquiId suscripcionCulquiId billeteraMovilPagadoId tipoLicencia');
        if (dataUsuario == null) return res.sendStatus(404);
        if (
            (dataUsuario.suscripcionCulquiId == undefined || dataUsuario.suscripcionCulquiId == null || dataUsuario.suscripcionCulquiId == "") &&
            (dataUsuario.billeteraMovilPagadoId == undefined || dataUsuario.billeteraMovilPagadoId == null || dataUsuario.billeteraMovilPagadoId == "") &&
            (dataUsuario.tipoLicencia !== 'gratis')
        )
            return res.status(200).json({
                resStatus: 'Debe registrar una membresía o un pago para visualizar esta sección de información.'
            });

        const cacheKey = consta.cacheController.partidosJugar.maestros;
        const maestrosCache = await cacheProvider.instance().get(cacheKey);
        if (maestrosCache)
            return res.send({
                resStatus: 'ok',
                strLeague: maestrosCache
            });

        const query = { activo: true };

        const [strLeague] = await Promise.all([
            PartidosJugar.distinct("liga", query)
        ])

        cacheProvider.instance().set(cacheKey, strLeague, 172800); // 2880 segundos correspondientea 2 dias

        res.send({
            resStatus: 'ok',
            strLeague: strLeague
        });

    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.getCriterio = async(req, res, next) => {
    const conn = conectionManager(req);
    try {

        const PartidosJugar = getModel(conn, consta.SchemaName.partidosJugar);

        const cacheKey = consta.cacheController.partidosJugar.getCriterio + (req.query.strLeague ? req.query.strLeague : '');
        const getCriterioCache = await cacheProvider.instance().get(cacheKey);
        if (getCriterioCache)
            return res.send(getCriterioCache);

        let filtro = {
            activo: true
        }
        if (req.query.strLeague != null && req.query.strLeague != "null")
            filtro.liga = req.query.strLeague
            // if (req.query.pageNumber != undefined) options.page = req.query.pageNumber;
            // if (req.query.pageSize != undefined) options.limit = req.query.pageSize;
        await PartidosJugar.paginate(filtro, options, (err, result) => {
            if (err) throw err;

            const responseGetCriterio = {
                resStatus: 'ok',
                totalRegistros: result.totalDocs,
                cantidadPaginas: result.totalPages,
                resResult: result.docs
            }
            cacheProvider.instance().set(cacheKey, responseGetCriterio, 79240); // menos de 1 dia

            res.send(responseGetCriterio);
        })


    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}