const errorMiddleware = require('../middleware/errors')
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes')
const bcryptjs = require('bcryptjs')
const { replaceAll, reverse } = require('../shared/util')
let cacheProvider = require('../shared/cache-provider')

const options = {
    page: 1,
    limit: 50,
    select: '_id fecha hora liga  equipoLocal equipoVisitante posicionLocal posicionVisita  golesProbabilidadMas1 tirosaporteriaProb6     cornersLocalProbMas5 golesLocalProbMas1 tirosaporteriaLocalProb5 tarjetasLocalProb2 cornersHechoTotalesLocalVisita golesHechoTotalesLocalVisita tirosaporteriaTotalProm tarjetasTotalProm idAwayTeam idHomeTeam idEvent cornerstotalesresultado golestotalesresultado tirosaporteriatotalresultado tarjetastotalresultado',
    sort:{
        fecha: -1 //Sort by Date Added DESC
    }
}

exports.insertDataMasivo = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const Resultados = getModel(conn, consta.SchemaName.resultados);
        const data = req.body;

        await Resultados.deleteMany({});
        // .deleteMany({})
        const result = await Resultados.insertMany(data)

        const cacheKey = consta.cacheController.resultados.maestros;
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
        const Resultados = getModel(conn, consta.SchemaName.resultados);

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

        const cacheKey = consta.cacheController.resultados.maestros;
        const maestrosCache = await cacheProvider.instance().get(cacheKey);
        if (maestrosCache){
            console.log('caeh')
            return res.send({
                ...maestrosCache,
                resStatus: 'ok'
            });

        }

        const query = { activo: true };

        const [strLeague, strFechaLigaAll] = await Promise.all([
            Resultados.distinct("liga", query),
            Resultados.aggregate( 
                [
                    {"$group": { "_id": { liga: "$liga", fecha: "$fecha" } } }
                ]
            )
        ])
        let strFecha = [];
        strFechaLigaAll.forEach((x) => {
            strFecha.push({
                liga: x._id.liga,
                fecha: x._id.fecha
            })
        });

        cacheProvider.instance().set(cacheKey, {
            strLeague: strLeague,
            strFecha: strFecha
        }, 172800); // 2880 segundos correspondientea 2 dias

        res.send({
            resStatus: 'ok',
            strLeague: strLeague,
            strFecha: strFecha
        });

    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.getCriterio = async(req, res, next) => {
    const conn = conectionManager(req);
    try {

        const Resultados = getModel(conn, consta.SchemaName.resultados);

        // const cacheKey = consta.cacheController.resultados.getCriterio + (req.query.strLeague ? req.query.strLeague : '');
        // const getCriterioCache = await cacheProvider.instance().get(cacheKey);
        // if (getCriterioCache)
        //     return res.send(getCriterioCache);

        let filtro = {
            activo: true
        }
        if (req.query.strLeague != null && req.query.strLeague != "null")
            filtro.liga = req.query.strLeague

        if (req.query.strFecha != null && req.query.strFecha != "null")
            filtro.fecha = req.query.strFecha
            // if (req.query.pageNumber != undefined) options.page = req.query.pageNumber;
            // if (req.query.pageSize != undefined) options.limit = req.query.pageSize;
        console.log("filtro")
        console.log(filtro)
        await Resultados.paginate(filtro, options, (err, result) => {
            if (err) throw err;

            const responseGetCriterio = {
                resStatus: 'ok',
                totalRegistros: result.totalDocs,
                cantidadPaginas: result.totalPages,
                resResult: result.docs
            }
            // cacheProvider.instance().set(cacheKey, responseGetCriterio, 79240); // menos de 1 dia

            res.send(responseGetCriterio);
        })


    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}