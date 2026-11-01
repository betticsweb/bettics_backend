const errorMiddleware = require('../middleware/errors')
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes')
const bcryptjs = require('bcryptjs')
const { replaceAll, reverse } = require('../shared/util')
let cacheProvider = require('../shared/cache-provider')


const normalizeTeam = value => String(value || '').normalize('NFD')
  .replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();
const dateOnly = value => {
  const str = String(value || '');
  const iso = str.match(/^\\d{4}-\\d{2}-\\d{2}/);
  if (iso) return iso[0];
  const dayFirst = str.match(/^(\\d{1,2})[\\/.-](\\d{1,2})[\\/.-](\\d{4})/);
  return dayFirst ? dayFirst[3] + '-' + dayFirst[2].padStart(2,'0') + '-' + dayFirst[1].padStart(2,'0') : '';
};
const keyFor = (liga, home, away, date) =>
  [normalizeTeam(liga), normalizeTeam(home), normalizeTeam(away), dateOnly(date)].join('|');
const validCount = n => typeof n === 'number' && Number.isInteger(n) && n >= 0;
const resultOf = (bet, match) => {
  // These historical records have no official finished status. The date or score
  // alone does not establish settlement; only expose evidence for review.
  if (!match) return {estado:'SIN_DATOS',detalle:'Sin coincidencia única de estadísticas'};
  const official = String(match.status || match.matchStatus || '').toUpperCase();
  const completed = ['FINISHED','COMPLETED','FT','FULL_TIME','FINALIZADO'].includes(official);
  if (!completed) return {estado:'PENDIENTE',detalle:'Hay estadísticas del partido, pero falta confirmar su finalización oficial',
    marcador:validCount(match.intHomeScore)&&validCount(match.intAwayScore)?[match.intHomeScore,match.intAwayScore]:null,
    corners:validCount(match.cornerKicksHome)&&validCount(match.cornerKicksAway)?[match.cornerKicksHome,match.cornerKicksAway]:null};
  return {estado:'SIN_DATOS',detalle:'Datos finales vinculados; mercado pendiente de normalización verificada'};
};
async function attachExistingResults(conn, groups) {
  const selections = groups.flatMap(group => group.detalle || []);
  if (!selections.length) return;
  const Event = getModel(conn, consta.SchemaName.eventosLigaProb);
  const leagues = [...new Set(selections.map(x=>x.liga).filter(Boolean))];
  if (!leagues.length) return;
  // One batched read; never query once per card, never write any MongoDB data.
  const events = await Event.find({activo:true, strLeague:{$in:leagues}})
    .select('idEvent strLeague dateEvent strHomeTeam strAwayTeam intHomeScore intAwayScore cornerKicksHome cornerKicksAway')
    .lean();
  const index = new Map();
  for (const event of events) {
    const key=keyFor(event.strLeague,event.strHomeTeam,event.strAwayTeam,event.dateEvent);
    if (!index.has(key)) index.set(key,[]);
    index.get(key).push(event);
  }
  for (const selection of selections) {
    const key=keyFor(selection.liga,selection.equipoLocal,selection.equipoVisitante,selection.fechaJuego);
    const matches=index.get(key)||[];
    if (matches.length !== 1 || !matches[0].idEvent) {
      selection.evaluacionResultado={estado:'SIN_DATOS',detalle:matches.length>1?'Coincidencia ambigua del partido':'Sin coincidencia única de estadísticas'};
      continue;
    }
    selection.evaluacionResultado=resultOf(selection,matches[0]);
    selection.resultadoReferencia={matchId:String(matches[0].idEvent)};
  }
}

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
            }).select("_id id_apuesta_combinada id_apuesta_simple tipoApuesta liga equipoLocal equipoVisitante pais mercadoApuesta opcionApuesta valorOpcionApuesta cuotaSimple cuotaCombinada fechaRegistro fechaJuego match_id mercadoCodigo operadorCodigo seleccionCodigo lineaNumero")
            lista_id_apuesta_combinada[index].detalle = data
        }

        await attachExistingResults(conn, lista_id_apuesta_combinada);
        cacheProvider.instance().set(cacheKey, lista_id_apuesta_combinada, 300); // 2880 segundos correspondientea 2 dias

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