const errorMiddleware = require('../middleware/errors')
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes')
const bcryptjs = require('bcryptjs')
const { replaceAll, reverse } = require('../shared/util')
let cacheProvider = require('../shared/cache-provider')


const normalizeTeam = value => String(value || '')
  .replace(/Ã¡/g,'á').replace(/Ã©/g,'é').replace(/Ã­/g,'í').replace(/Ã³/g,'ó').replace(/Ãº/g,'ú')
  .replace(/Ã±/g,'ñ').replace(/Ã£/g,'ã').replace(/Ã§/g,'ç').replace(/Ã¨/g,'è')
  .replace(/Ã¢/g,'â').replace(/Ãª/g,'ê').replace(/Ã´/g,'ô')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();
const dateOnly = value => {
  const str = String(value || '');
  const iso = str.match(/^\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const d = str.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  return d ? d[3] + '-' + d[2].padStart(2, '0') + '-' + d[1].padStart(2, '0') : '';
};
const keyFor = (liga, home, away, date) =>
  [normalizeTeam(liga), normalizeTeam(home), normalizeTeam(away), dateOnly(date)].join('|');
const count = n => typeof n === 'number' && Number.isInteger(n) && n >= 0;
const verdict = (won, explanation) => ({estado:won?'ACIERTO':'FALLO',detalle:explanation});
const noData = explanation => ({estado:'SIN_DATOS',detalle:explanation});
const evaluate = (bet, match) => {
  if (!match) return noData('Partido no encontrado de forma inequívoca');
  // Bettics ETL convention: an active row in eventosLigaProb with the
  // required match statistics represents a completed match.
  // The match must still be uniquely identified; missing statistics stay SIN_DATOS.
  const label = normalizeTeam(bet.mercadoApuesta).replace(/\s+n\d+\w*$/, '');
  const choice = normalizeTeam(bet.opcionApuesta).replace(/\s+[12]$/, '');
  const line = Number(bet.valorOpcionApuesta);
  const home = normalizeTeam(bet.equipoLocal);
  const away = normalizeTeam(bet.equipoVisitante);
  const score = count(match.intHomeScore) && count(match.intAwayScore);
  const corners = count(match.cornerKicksHome) && count(match.cornerKicksAway);
  const compare = (n, name, resultText) => {
    if (!Number.isFinite(line)) return noData('Línea de apuesta inválida');
    if (n === line) return {estado:'DEVOLUCION',detalle:resultText+' (igual a la línea '+line+')'};
    if (choice==='mas de') return verdict(n>line,resultText);
    if (choice==='menos de') return verdict(n<line,resultText);
    return noData('Operador de apuesta desconocido');
  };
  // Only recognized production-market identities; N1-N4 indicate strategy,
  // not distinct result rules.
  if (label.startsWith('total de tiros de esquina')) {
    if (!corners) return noData('Faltan córners oficiales');
    return compare(match.cornerKicksHome+match.cornerKicksAway,'Córners totales','Córners: '+match.cornerKicksHome+' - '+match.cornerKicksAway);
  }
  if (label.startsWith('equipo con mas corners')) {
    if (!corners) return noData('Faltan córners oficiales');
    if (match.cornerKicksHome===match.cornerKicksAway) return verdict(false,'Córners: '+match.cornerKicksHome+' - '+match.cornerKicksAway+' (empate, mercado 1X2)');
    if (choice!==home && choice!==away) return noData('Selección no identificada');
    const winner=match.cornerKicksHome>match.cornerKicksAway?home:away;
    return verdict(choice===winner,'Córners: '+match.cornerKicksHome+' - '+match.cornerKicksAway);
  }
  if (label.startsWith('total de goles')) {
    if (!score) return noData('Falta marcador final');
    return compare(match.intHomeScore+match.intAwayScore,'Goles totales','Marcador: '+match.intHomeScore+' - '+match.intAwayScore);
  }
  if (label.startsWith('ambos equipos marcan')) {
    if (!score) return noData('Falta marcador final');
    if (choice!=='mas de' || line!==0.5) return noData('Selección BTTS no reconocida');
    return verdict(match.intHomeScore>0&&match.intAwayScore>0,'Marcador: '+match.intHomeScore+' - '+match.intAwayScore);
  }
  if (label.startsWith('ganador del partido')) {
    if (!score) return noData('Falta marcador final');
    if (choice!==home && choice!==away) return noData('Ganador no identificado');
    const winner=match.intHomeScore===match.intAwayScore?'empate':match.intHomeScore>match.intAwayScore?home:away;
    return verdict(choice===winner,'Marcador '+match.intHomeScore+' - '+match.intAwayScore);
  }
  return noData('Mercado sin estadística oficial compatible');
};
async function attachExistingResults(conn, groups) {
  const selections = groups.flatMap(group => group.detalle || []);
  if (!selections.length) return;
  // Match by both teams and calendar day. Require a unique event ID, never
  // rely solely on an approximate name/league match.
  const Event = getModel(conn, consta.SchemaName.eventosLigaProb);
  const dateSet=new Set(selections.map(b=>dateOnly(b.fechaJuego)).filter(Boolean));
  const events=await Event.collection.find({activo:true},{
    projection:{idEvent:1,strLeague:1,dateEvent:1,strHomeTeam:1,strAwayTeam:1,
      intHomeScore:1,intAwayScore:1,cornerKicksHome:1,cornerKicksAway:1}
  }).toArray();
  const exact=new Map(), fixture=new Map();
  const add=(map,key,event)=>{
    if (!map.has(key)) map.set(key,[]);
    map.get(key).push(event);
  };
  for (const e of events) {
    if (!dateSet.has(dateOnly(e.dateEvent))) continue;
    const basic=keyFor('',e.strHomeTeam,e.strAwayTeam,e.dateEvent);
    add(exact,keyFor(e.strLeague,e.strHomeTeam,e.strAwayTeam,e.dateEvent),e);
    add(fixture,basic,e);
  }
  const unique=rows=>{
    const seen=new Map();
    for(const row of rows) if(row.idEvent) seen.set(String(row.idEvent),row);
    return [...seen.values()];
  };
  for(const bet of selections) {
    const primary=unique(exact.get(keyFor(bet.liga,bet.equipoLocal,bet.equipoVisitante,bet.fechaJuego))||[]);
    const candidates=primary.length?primary:unique(fixture.get(keyFor('',bet.equipoLocal,bet.equipoVisitante,bet.fechaJuego))||[]);
    if(candidates.length!==1) {
      bet.evaluacionResultado=noData(candidates.length>1?'Coincidencia ambigua de partidos':'Sin cruce único por equipos y fecha');
      continue;
    }
    bet.evaluacionResultado=evaluate(bet,candidates[0]);
    bet.resultadoReferencia={matchId:String(candidates[0].idEvent)};
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
        if (recomentacionesCache) {
            await attachExistingResults(conn, recomentacionesCache);
            return res.send({
                resStatus: 'ok',
                resResult: recomentacionesCache
            });
        }

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
            }).select("_id id_apuesta_combinada id_apuesta_simple tipoApuesta liga equipoLocal equipoVisitante pais mercadoApuesta opcionApuesta valorOpcionApuesta cuotaSimple cuotaCombinada fechaRegistro fechaJuego match_id mercadoCodigo operadorCodigo seleccionCodigo lineaNumero").lean()
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