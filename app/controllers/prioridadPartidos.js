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

        const PrioridadPartidos = getModel(conn, consta.SchemaName.prioridadPartidos);

        const cacheKey = consta.cacheController.prioridadPartidos.byGetCriterio;
        const prioridadPartidosCache = await cacheProvider.instance().get(cacheKey);
        if (prioridadPartidosCache)
            return res.send({
                resStatus: 'ok',
                resResult: prioridadPartidosCache
            })

        if (req.query.pageNumber != undefined) options.page = req.query.pageNumber;
        if (req.query.pageSize != undefined) options.limit = req.query.pageSize;
        
        let fechaActual = new Date();
        console.log("fechaActual")
        console.log(fechaActual.getTime())
        // fechaActual =  new Date(fechaActual - (fechaActual % 86400000));
        let now_utc = new Date(fechaActual.toUTCString().slice(0, -4));
        console.log(now_utc.getTime())
        now_utc.setHours(0,0,0,0)
        console.log(now_utc.getTime())

        const data = await PrioridadPartidos.find({
            prioridad: "1",
            activo: true,
            date_partido: {
                $gte: now_utc.getTime()
            }
        }).select("_id competition_id id homeID awayID season status game_week home_name away_name date_unix home_image away_image probabilidad mercado pais_imagen prioridad liga")
 
        cacheProvider.instance().set(cacheKey, data, 7200); // 2 horas de cache

        return res.send({
                resStatus: 'ok',
                resResult: data
            })
            
    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.insertDataMasivo = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const PrioridadPartidos = getModel(conn, consta.SchemaName.prioridadPartidos);
        const data = req.body;

        data.forEach(element => {
            const [day, month, year] = element.date_unix.split('/')
            console.log(element.away_name)
            console.log("day")
            console.log(day)
            console.log(+day)
            console.log("month")
            console.log(month)
            console.log("year")
            console.log(year)
            const dateObj = new Date(+year, + month - 1,  day )
            console.log(dateObj)
            console.log(new Date(element.date_unix))
            let d = element.date_unix.split("/");
            let dat = new Date(d[2] + '/' + d[1] + '/' + d[0]);
            console.log(dat)
            console.log(dat.getTime())
            element.date_partido = dateObj.getTime()
        });

        console.log("data")
        // console.log(data)
        await PrioridadPartidos.deleteMany({});

        const result = await PrioridadPartidos.insertMany(data);

        const cacheKey = consta.cacheController.prioridadPartidos.byGetCriterio;
        cacheProvider.instance().del(cacheKey);

        return res.json(result)
    } catch (err) {
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}