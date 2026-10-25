'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeId, normalizeScore, normalizeDate, normalizeText, statusOf, sourceConfiguration, readHistory } = require('../app/services/backtest/history');
const { settle, analyze, parseQuery, metrics } = require('../app/services/backtest/results');
const { compareBundesligaReference } = require('../app/services/backtest/reference');
const { createHandler } = require('../app/controllers/backtest-results');
const p = { match_id: '7811554',fecha_partido: '2025-07-01',liga:'Finland Veikkausliiga',temporada:'2025',mercado:'CORNERS_OVER_85',periodo:'FT',seleccion:'OVER',linea:8.5,segmento:'N1',cuota:1.6,version_politica:'V1',tipo_evaluacion:'OOT' };
const m = { idEvent: 7811554,dateEvent:p.fecha_partido,strLeague:p.liga,strHomeTeam:'A',strAwayTeam:'B',intHomeScore:0,intAwayScore:3,cornerKicksHome:4,cornerKicksAway:5,status:'complete' };
function dbFixture(sources) {
 const queries=[];
 return { queries, collection(name) { return { find(query,{projection}) {
   queries.push({name,query,projection});
   return { limit(){return this}, maxTimeMS(){return this}, async *[Symbol.asyncIterator]() {
     for (const raw of sources[name] || []) yield Object.fromEntries(Object.keys(projection).filter(key=>key!=='_id' && Object.hasOwn(raw,key)).map(key=>[key,raw[key]]));
   } };
 } }; } };
}
test('safe ID normalization handles strings, numeric values and formatting without rounding',()=>{
 for(const value of [7811554,'7811554',' 07811554 ','7811554.0']) assert.equal(normalizeId(value),'7811554');
 assert.equal(normalizeId('9007199254740993'),'9007199254740993');
 for(const value of [9007199254740993,0,-1,null,undefined,'','1e3','1.2',true,{}]) assert.equal(normalizeId(value),null);
});
test('numeric score strings are parsed strictly, preserving zero and rejecting missing sentinels',()=>{
 for(const value of [0,'0',' 0.0 ']) assert.equal(normalizeScore(value),0);
 for(const value of [null,undefined,'',' ','-',-1,'-1',NaN,Infinity,'1e3','0x10','2.5',false]) assert.equal(normalizeScore(value),null);
});
test('calendar dates, BSON dates and league accents normalize without inventing country aliases',()=>{
 assert.equal(normalizeDate(new Date('2025-07-01T00:00:00Z')),p.fecha_partido);
 assert.equal(normalizeDate('2025-07-01T00:00:00.000Z'),p.fecha_partido);
 assert.equal(normalizeDate('2025-02-30T00:00:00Z'),null);
 assert.equal(normalizeDate('01/07/2025'),null);
 assert.equal(normalizeText(' Perú  Primera División '),'peru primera division');
 assert.notEqual(normalizeText('Peru Primera Division'),normalizeText('Primera Division'));
});
test('real provider status fields are consulted; conflicting or unknown statuses stay pending',()=>{
 assert.equal(statusOf(m),'FT');assert.equal(settle(p,[m]).estado,'acierto');
 assert.equal(settle(p,[{...m,status:'complete',strStatus:'SUSP'}]).estado,'pendiente');
 assert.equal(settle(p,[{...m,status:'unknown'}]).estado,'pendiente');
 assert.equal(settle(p,[{...m,status:'AET'}]).estado,'pendiente');
});
test('missing strStatus is not replaced by an invented FT; an explicit source contract can confirm legacy final fields',()=>{
 const legacy={...m,status:undefined};
 assert.equal(settle(p,[legacy]).codigo_pendiente,'final_no_confirmado');
 assert.equal(settle(p,[{...legacy,__finalFieldsConfirmed:true}]).estado,'acierto');
 assert.equal(settle(p,[{...legacy,__finalFieldsConfirmed:true,status:'SUSP'}]).estado,'pendiente');
 assert.equal(settle(p,[{...legacy,__finalFieldsConfirmed:true,cornerKicksHome:null}]).estado,'pendiente');
});
test('duplicate equivalent snapshots coalesce; conflicting scores or teams never resolve by input order',()=>{
 assert.equal(settle(p,[m,{...m,idEvent:String(m.idEvent)}]).estado,'acierto');
 const partial={...m,intHomeScore:undefined};
 assert.equal(settle(p,[partial,m]).estado,'acierto');
 for(const other of [{...m,cornerKicksAway:7},{...m,strHomeTeam:'Different'}]){
  assert.equal(settle(p,[m,other]).codigo_pendiente,'cruce_ambiguo');
  assert.equal(settle(p,[other,m]).codigo_pendiente,'cruce_ambiguo');
 }
});
test('metadata disambiguates an ID collision and never falls back to date/league without an ID',()=>{
 assert.equal(settle(p,[{...m,strLeague:'Other'},m]).estado,'acierto');
 assert.equal(settle(p,[{...m,dateEvent:'2025-07-02'}]).codigo_pendiente,'metadatos_no_coinciden');
 assert.equal(settle(p,[{...m,__idConflict:true}]).codigo_pendiente,'identificadores_contradictorios');
});
test('HOME tie follows the confirmed rule: loss, void, or pending; void is never an acierto',()=>{
 const home={...p,mercado:'CORNERS_LOCAL_GANA',seleccion:'HOME',linea:null};
 const tied={...m,cornerKicksHome:5};
 assert.equal(settle(home,[tied]).estado,'pendiente');
 const loss=settle(home,[tied],{drawRule:'loss'});assert.equal(loss.ganancia,-1);assert.equal(metrics([loss]).roi,-100);
 const refunded=settle(home,[tied],{drawRule:'void'});const result=metrics([refunded]);
 assert.equal(refunded.estado,'anulado');assert.equal(result.aciertos,0);assert.equal(result.anulados,1);assert.equal(result.pendientes,0);assert.equal(result.ganancia,0);assert.equal(result.roi,null);
});
test('raw schemas, match coverage and missing necessary fields are reported using only streamed reads',async()=>{
 const db=dbFixture({eventosLigaProb:[{...m,idEvent:undefined,match_id:'07811554.0',status:'complete'}, {...m,idEvent:99}],eventosLiga:[{...m,idEvent:'7811554'}]});
 const data=await readHistory(db,[p],sourceConfiguration());
 assert.equal(db.queries.length,2);assert.equal(data.matches.get(p.match_id).length,2);
 assert.equal(data.diagnostics.ids_con_alguna_coincidencia,1);
 assert.equal(data.diagnostics.fuentes.eventosLigaProb.claves_con_coincidencia.match_id,1);
 assert.equal(data.diagnostics.fuentes.eventosLigaProb.campos.strStatus,undefined);
 assert.equal(data.diagnostics.fuentes.eventosLigaProb.campos.status.string,2);
 assert.equal(settle(p,data.matches.get(p.match_id)).estado,'acierto');
});
test('metadata without an identifier cannot invent a join; conflicts across ID namespaces remain pending',async()=>{
 const other={...p,match_id:'2'};
 const db=dbFixture({eventosLigaProb:[{...m,idEvent:undefined},{...m,match_id:2}]});
 const data=await readHistory(db,[p,other],sourceConfiguration());
 assert.equal(settle(p,data.matches.get(p.match_id)).estado,'pendiente');
 assert.equal(settle(other,data.matches.get('2')).codigo_pendiente,'identificadores_contradictorios');
 assert.equal(data.diagnostics.fuentes.eventosLiga.sin_clave_reconocida,true);
});
test('stream size limits reject incomplete coverage instead of silently reporting partial ROI',async()=>{
 await assert.rejects(readHistory(dbFixture({eventosLigaProb:[m,m]}),[p],sourceConfiguration(),1),/limit/);
});
test('source confirmations and tie rules are server configuration, not query-supplied overrides',()=>{
 assert.throws(()=>sourceConfiguration({BETTICS_RESULTS_FINAL_FIELDS_CONFIRMED:'matchStatistics'}));
 assert.throws(()=>sourceConfiguration({BETTICS_RESULTS_HOME_CORNERS_DRAW_RULE:'win'}));
 assert.throws(()=>parseQuery({drawRule:'loss'}));
 assert.deepEqual(sourceConfiguration({BETTICS_RESULTS_FINAL_FIELDS_CONFIRMED:'eventosLigaProb'}).confirmedSources,['eventosLigaProb']);
});
test('all summary views reconcile with outcome counts and pending causes',()=>{
 const win=settle(p,[m]),loss=settle({...p,segmento:'N2'},[{...m,cornerKicksAway:0}]),pending=settle({...p,match_id:'2'},[]);
 const result=analyze([win,loss,pending],parseQuery({}));
 assert.equal(result.resumen.evaluados,2);assert.equal(result.resumen.pendientes,1);assert.equal(result.resumen.aciertos,1);assert.equal(result.resumen.efectividad,50);
 assert.ok(Math.abs(result.resumen.roi-(-20))<1e-10);
 assert.equal(result.conciliacion.motivos_pendientes.sin_cruce,1);
 assert.equal(result.ranking[0].ganancia,result.resumen.ganancia);
 assert.equal(result.mensual[0].roi,result.resumen.roi);
 assert.equal(result.evolucion[0].roi,result.resumen.roi);
});
test('Bundesliga reference is never asserted over the complete history or an unspecified season',()=>{
 assert.equal(compareBundesligaReference([],{mercado:'CORNERS_OVER_85',liga:'Germany Bundesliga'}).estado,'no_comparable');
 assert.equal(compareBundesligaReference([],{mercado:'CORNERS_OVER_85',liga:'Germany Bundesliga',temporada:'2025/2026'}).estado,'incompleto');
 const germany={...p,liga:'Germany Bundesliga',temporada:'2025/2026'};
 const rows=[settle(germany,[{...m,strLeague:germany.liga}])];
 const result=compareBundesligaReference(rows,{mercado:germany.mercado,liga:germany.liga,temporada:germany.temporada});
 assert.equal(result.estado,'difiere');assert.equal(result.total_observado,1);assert.equal(result.total_esperado,30);
 assert.equal(result.segmentos.N1.esperado.aprobados,18);assert.equal(result.segmentos.N1.esperado.roi,19.6);assert.equal(result.segmentos.N2.esperado.roi,29.9);
 assert.equal(metrics(rows).aprobados,1); // Expected report numbers never overwrite actual statistics.
});
test('diagnostic endpoint retains authenticated access and exposes true raw coverage, not expected report values',async()=>{
 const { createLoader }=require('../app/controllers/backtest-results');
 const db=dbFixture({eventosLigaProb:[m]});
 const readCollection=db.collection.bind(db);
 db.collection=name=>name==='backtestAprobados'?{find(){return{limit(){return this},maxTimeMS(){return this},toArray:async()=>[p]}}}:readCollection(name);
 let closed=0;
 const load=createLoader(()=>({asPromise:async()=>{},close:async()=>{closed++},db}),{});
 let body;
 await createHandler(load,'conciliacion')({query:{}},{set(){return this},json(b){body=b},status(){return this}});
 assert.equal(closed,1);assert.equal(body.conciliacion.cruces_confirmados,1);
 assert.equal(body.conciliacion.cobertura.fuentes.eventosLigaProb.campos_coincidentes.status.string,1);
 assert.equal(body.conciliacion.cobertura.fuentes.eventosLigaProb.estados_coincidentes.final,1);
 assert.equal(body.conciliacion.referencia_bundesliga.estado,'no_comparable');
 assert.equal(body.detalle,undefined);
});
test('30 approved rows with the expected segment counts do not validate the report while outcomes are pending',()=>{
 const base={...p,liga:'Germany Bundesliga',temporada:'2025/2026'};
 const pending=Array.from({length:30},(_,i)=>settle({...base,match_id:String(i+1),segmento:i<18?'N1':'N2'},[]));
 const result=compareBundesligaReference(pending,{liga:base.liga,temporada:base.temporada,mercado:base.mercado});
 assert.equal(result.estado,'incompleto');assert.equal(result.segmentos.N1.observado.aprobados,18);
 assert.equal(result.segmentos.N1.observado.roi,null);assert.equal(result.segmentos.N2.observado.roi,null);
 assert.equal(metrics(pending).pendientes,30);
});
test('a confirmed snapshot never lends FT confirmation to missing scores supplied only by an unconfirmed snapshot',()=>{
 const confirmed={...m,cornerKicksHome:undefined,cornerKicksAway:undefined};
 const unconfirmed={...m,status:undefined};
 assert.equal(settle(p,[confirmed,unconfirmed]).codigo_pendiente,'marcador_final_no_confirmado');
 const goals={...p,mercado:'GOLES_OVER_25',linea:2.5};
 assert.equal(settle(goals,[confirmed,unconfirmed]).estado,'acierto');
});
