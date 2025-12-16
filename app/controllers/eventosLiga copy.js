const errorMiddleware = require('../middleware/errors')
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes')
const bcryptjs = require('bcryptjs')
const { replaceAll, reverse } = require('../shared/util')
let cacheProvider = require('../shared/cache-provider')

const options = {
    page: 1,
    limit: 100,
    select: 'dateEvent strHomeTeam strAwayTeam intHomeScore intAwayScore cornerKicksHome cornerKicksAway',
    sort: { dateEvent: -1 }
}

const optionsUltimos6 = {
    page: 1,
    limit: 6,
    select: 'dateEvent strHomeTeam strAwayTeam intHomeScore intAwayScore cornerKicksHome cornerKicksAway',
    sort: { dateEvent: -1 }
}

exports.insertDataMasivo = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const EventosLiga = getModel(conn, consta.SchemaName.eventosLiga);
        const data = req.body;

        await EventosLiga.deleteMany({});

        const result = await EventosLiga.insertMany(data)

        const cacheKey = consta.cacheController.eventosLiga.maestros;
        cacheProvider.instance().del(cacheKey);
        return res.json(result)
    } catch (err) {
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.getCriterio = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const EventosLiga = getModel(conn, consta.SchemaName.eventosLiga);

        let filtroInit = {}
        if (req.query.strSeason != null && req.query.strSeason != 'null') {
            filtroInit = {
                activo: true,
                strLeague: req.query.strLeague,
                strSeason: req.query.strSeason,
                "$and": [
                    { idHomeTeam: { $in: [req.query.idHomeTeam, req.query.idAwayTeam] } },
                    { idAwayTeam: { $in: [req.query.idHomeTeam, req.query.idAwayTeam] } }
                ]
            }
        } else {
            filtroInit = {
                activo: true,
                strLeague: req.query.strLeague,
                "$and": [
                    { idHomeTeam: { $in: [req.query.idHomeTeam, req.query.idAwayTeam] } },
                    { idAwayTeam: { $in: [req.query.idHomeTeam, req.query.idAwayTeam] } }
                ]
            }
        }

        console.log('filtroInit')
        console.log(filtroInit)

        let filtro1 = {
            activo: true,
            strLeague: req.query.strLeague,
            "$or": [
                { idHomeTeam: req.query.idHomeTeam },
                { idAwayTeam: req.query.idHomeTeam }
            ]
        }
        if (req.query.strSeason != null && req.query.strSeason != 'null')
            filtro1.strSeason = req.query.strSeason

        let filtro2 = {
            activo: true,
            strLeague: req.query.strLeague,
            // strSeason: req.query.strSeason,
            "$or": [
                { idHomeTeam: req.query.idAwayTeam },
                { idAwayTeam: req.query.idAwayTeam }
            ]
        }

        let filtro3 = {
            activo: true,
            strLeague: req.query.strLeague,
            idHomeTeam: req.query.idHomeTeam
        }

        let filtro4 = {
            activo: true,
            strLeague: req.query.strLeague,
            idAwayTeam: req.query.idAwayTeam
        }

        if (req.query.strSeason != null && req.query.strSeason != 'null')
            filtro2.strSeason = req.query.strSeason

        if (req.query.strSeason != null && req.query.strSeason != 'null')
            filtro3.strSeason = req.query.strSeason

        if (req.query.strSeason != null && req.query.strSeason != 'null')
            filtro4.strSeason = req.query.strSeason

        console.log(req.query)
        console.log(req.query)
        const [partidosLosDosEquipos, ultimos6Home, ultimos6Away, soloLocal, soloVisita] = await Promise.all([
            EventosLiga.find(filtroInit).select("strSeason dateEvent idAwayTeam idHomeTeam strHomeTeam strAwayTeam intHomeScore intAwayScore cornerKicksHome cornerKicksAway")
            .sort({ dateEvent: -1 }),
            // Ultimos 6 partidos
            EventosLiga.find(filtro1).select("dateEvent idAwayTeam idHomeTeam strHomeTeam strAwayTeam intHomeScore intAwayScore cornerKicksHome cornerKicksAway")
            .sort({ dateEvent: -1 }),
            // Ultimos 6 partidos
            EventosLiga.find(filtro2).select("dateEvent idAwayTeam idHomeTeam strHomeTeam strAwayTeam intHomeScore intAwayScore cornerKicksHome cornerKicksAway")
            .sort({ dateEvent: -1 }),
            EventosLiga.find(filtro3).select("dateEvent idAwayTeam idHomeTeam strHomeTeam strAwayTeam intHomeScore intAwayScore cornerKicksHome cornerKicksAway")
            .sort({ dateEvent: -1 }),
            EventosLiga.find(filtro4).select("dateEvent idAwayTeam idHomeTeam strHomeTeam strAwayTeam intHomeScore intAwayScore cornerKicksHome cornerKicksAway")
            .sort({ dateEvent: -1 })
        ])

        return res.send({
            resStatus: 'ok',
            partidosLosDosEquipos: partidosLosDosEquipos,
            ultimos6Home: ultimos6Home,
            ultimos6Away: ultimos6Away,
            soloLocal: soloLocal,
            soloVisita: soloVisita
        })

    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.getMaestros = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const EventosLiga = getModel(conn, consta.SchemaName.eventosLiga);

        // Primero validamos que tenga una suscripcion.
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

        const cacheKey = consta.cacheController.eventosLiga.maestros;
        const maestrosCache = await cacheProvider.instance().get(cacheKey);
        if (maestrosCache)
            return res.send({
                resStatus: 'ok',
                strLeague: maestrosCache
            });

        const query = { activo: true };

        const [strLeague] = await Promise.all([
            EventosLiga.distinct("strLeague", query)
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

exports.getEquipos = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const EventosLiga = getModel(conn, consta.SchemaName.eventosLiga);

        const query = { activo: true };

        let filtro = {
            "activo": true,
            "strLeague": req.query.strLeague
        }
        console.log(req.query.strSeason)
        if (req.query.strSeason != null && req.query.strSeason != 'null')
            filtro.strSeason = req.query.strSeason

        const [strHomeTeam, strAwayTeam] = await Promise.all([
            EventosLiga.aggregate(
                [
                    { $match: filtro },
                    { $group: { "_id": { strHomeTeam: "$strHomeTeam", idHomeTeam: "$idHomeTeam" } } }
                ]
            ),
            EventosLiga.aggregate(
                [
                    { $match: filtro },
                    { $group: { "_id": { strAwayTeam: "$strAwayTeam", idAwayTeam: "$idAwayTeam" } } }
                ]
            )
        ])

        res.send({
            resStatus: 'ok',
            strHomeTeam: strHomeTeam,
            strAwayTeam: strAwayTeam

        });

    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.getTemporadas = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const EventosLiga = getModel(conn, consta.SchemaName.eventosLiga);

        const query = { activo: true, strLeague: req.query.strLeague };

        const [strSeason] = await Promise.all([
            EventosLiga.distinct("strSeason", query)
        ])

        res.send({
            resStatus: 'ok',
            strSeason: strSeason,

        });

    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}