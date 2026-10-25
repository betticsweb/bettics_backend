'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {settle,metrics,analyze,parseQuery} = require('../app/services/backtest/results');
const {createHandler} = require('../app/controllers/backtest-results');
const p={match_id:'1',fecha_partido:'2025-01-01',liga:'Liga',temporada:'2025',mercado:'CORNERS_OVER_85',periodo:'FT',seleccion:'OVER',linea:8.5,segmento:'N1',cuota:1.5,version_politica:'V1',tipo_evaluacion:'OOT'};
const m={dateEvent:p.fecha_partido,strLeague:p.liga,cornerKicksHome:4,cornerKicksAway:5,intHomeScore:0,intAwayScore:3,__status:'FT'};
test('four market boundaries, zero and HOME/null are evaluated correctly',()=>{
 assert.equal(settle(p,[m]).ganancia,.5);
 assert.equal(settle(p,[{...m,cornerKicksAway:4}]).ganancia,-1);
 const under={...p,mercado:'CORNERS_UNDER_105',seleccion:'UNDER',linea:10.5};
 assert.equal(settle(under,[{...m,cornerKicksAway:6}]).estado,'acierto');
 assert.equal(settle(under,[{...m,cornerKicksAway:7}]).estado,'fallo');
 const goals={...p,mercado:'GOLES_OVER_25',linea:2.5};
 assert.equal(settle(goals,[m]).estado,'acierto');
 assert.equal(settle(goals,[{...m,intAwayScore:0}]).estado,'fallo');
 const home={...p,mercado:'CORNERS_LOCAL_GANA',seleccion:'HOME',linea:null};
 assert.equal(settle(home,[m]).estado,'fallo');
 assert.equal(settle(home,[{...m,cornerKicksHome:6}]).estado,'acierto');
 assert.equal(settle(home,[{...m,cornerKicksHome:5}]).estado,'pendiente');
});
test('missing, ambiguous, invalid, unsupported and non-final results never lose stake',()=>{
 for(const matches of [[],[m,m],[{...m,__status:undefined}],[{...m,__status:'SUSP'}],[{...m,__status:'CANC'}],[{...m,__status:'AET'}],[{...m,cornerKicksHome:null}],[{...m,cornerKicksHome:'0'}],[{...m,cornerKicksHome:-1}],[{...m,dateEvent:'2025-01-02'}],[{...m,strLeague:'Other'}]]){
  const result=settle(p,matches);assert.equal(result.estado,'pendiente');assert.equal(result.ganancia,null);assert.equal(result.unidades,0);
 }
 for(const change of [{cuota:null},{cuota:NaN},{mercado:'UNKNOWN'},{periodo:'HT'},{segmento:'N8'},{seleccion:'HOME'},{linea:7.5}]) assert.equal(settle({...p,...change},[m]).estado,'pendiente');
});
test('ROI denominator excludes pending; empty metrics are null rather than zero',()=>{
 const rs=[settle(p,[m]),settle({...p,segmento:'N2'},[{...m,cornerKicksAway:0}]),settle({...p,match_id:'2'},[])];
 const result=metrics(rs);assert.equal(result.aprobados,3);assert.equal(result.partidos,2);assert.equal(result.evaluados,2);assert.equal(result.aciertos,1);assert.equal(result.efectividad,50);assert.equal(result.ganancia,-.5);assert.equal(result.roi,-25);
 assert.equal(metrics([]).roi,null);assert.equal(metrics([rs[2]]).efectividad,null);
});
test('filters, ranking, monthly and cumulative returns reconcile with paginated detail',()=>{
 const rs=[settle(p,[m]),settle({...p,match_id:'2',fecha_partido:'2025-02-01'},[{...m,dateEvent:'2025-02-01',cornerKicksAway:0}])];
 const all=analyze(rs,parseQuery({limit:'1'}));assert.equal(all.resumen.roi,-25);assert.equal(all.detalle.registros.length,1);assert.equal(all.detalle.total,2);assert.equal(all.evolucion[1].ganancia,-.5);assert.equal(all.mensual[0].roi,50);assert.equal(all.mensual[1].roi,-100);
 assert.equal(analyze(rs,parseQuery({desde:'2025-02-01',temporada:'2025'})).resumen.aprobados,1);
 assert.equal(analyze(rs,parseQuery({liga:'Other'})).resumen.roi,null);
});
test('invalid query injection, arrays, dates, pages and incompatible segments are rejected',()=>{
 for(const q of [{liga:{$ne:''}},{liga:['x']},{page:'0'},{page:'1.5'},{limit:'101'},{orden:'password'},{desde:'2025-02-30'},{desde:'2026-01-01',hasta:'2025-01-01'},{mercado:'GOLES_OVER_25',segmento:'N4'},{x:'1'}])assert.throws(()=>parseQuery(q));
});
async function call(load,query={}){
 let status=200,body;
 const res={status(s){status=s;return this;},json(b){body=b;return this;},set(){return this;}};
 await createHandler(load)({query},res);return {status,body};
}
test('multiple policy snapshots require explicit selection and never double-count',async()=>{
 const load=async()=>({predictions:[p,{...p,version_politica:'V2'}],matches:new Map([['1',[m]]]),source:'eventosLigaProb'});
 const auto=await call(load);assert.equal(auto.body.requiere_version,true);assert.equal(auto.body.resumen.aprobados,0);assert.equal(auto.body.resumen.roi,null);
 const selected=await call(load,{version_politica:'V1'});assert.equal(selected.body.resumen.aprobados,1);
});
test('database failures return controlled errors and never disclose connection details',async()=>{
 const result=await call(async()=>{throw Error('secret connection');});assert.equal(result.status,503);assert.ok(!JSON.stringify(result.body).includes('secret'));
});
test('authenticated GET never accepts ETL secrets or malformed JWT and cannot invoke storage unauthenticated',async()=>{
 const express=require('express'),jwt=require('jsonwebtoken');
 const auth=require('../app/middleware/backtest-read-auth');
 const old=process.env.BETTICS_READ_JWT_SECRET;process.env.BETTICS_READ_JWT_SECRET='local-test-key-only';
 let reads=0;const app=express();
 app.get('/api/backtest/resultados',auth,createHandler(async()=>{reads++;return {predictions:[p],matches:new Map([['1',[m]]]),source:'eventosLigaProb'};}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try {
  const url='http://127.0.0.1:'+server.address().port+'/api/backtest/resultados';
  for(const token of ['','ETL-token','broken.jwt.value',jwt.sign({usuario:{_id:'test'}},'wrong',{expiresIn:60})])assert.equal((await fetch(url,{headers:{Authorization:'Bearer '+token}})).status,401);
  assert.equal(reads,0);
  const token=jwt.sign({usuario:{_id:'test'}},process.env.BETTICS_READ_JWT_SECRET,{expiresIn:60});
  const response=await fetch(url,{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200);assert.equal((await response.json()).resumen.roi,50);assert.equal(reads,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));if(old===undefined)delete process.env.BETTICS_READ_JWT_SECRET;else process.env.BETTICS_READ_JWT_SECRET=old;}
});
test('native loader uses projected batched reads, normalizes numeric IDs and shares cache without writes',async()=>{
 const {createLoader}=require('../app/controllers/backtest-results');let connections=0,closed=0;const queries=[];
 const conn={asPromise:async()=>{},close:async()=>{closed++;},db:{collection(name){return{find(query,{projection}){
  queries.push({name,query,projection});
  return{limit(){return this},maxTimeMS(){return this},toArray:async()=>name==='backtestAprobados'?[p]:[{...m,event_id:1,final_status:'FT'}]};
 }}}}};
 const load=createLoader(()=>{connections++;return conn;},{BETTICS_RESULTS_COLLECTION:'history',BETTICS_RESULTS_ID_FIELD:'event_id',BETTICS_RESULTS_STATUS_FIELD:'final_status'});
 const [a,b]=await Promise.all([load(),load()]);assert.equal(a,b);assert.equal(await load(),a);assert.equal(connections,1);assert.equal(closed,1);
 assert.deepEqual(queries[0].query,{tipo_evaluacion:'OOT'});assert.deepEqual(queries[1].query,{event_id:{$in:['1',1]}});assert.equal(queries[1].projection.final_status,1);assert.equal(a.matches.get('1')[0].__status,'FT');
});
test('loader closes on errors, does not cache failures and rejects unsafe mapping',async()=>{
 const {createLoader}=require('../app/controllers/backtest-results');let closed=0;
 const load=createLoader(()=>({asPromise:async()=>{},close:async()=>{closed++;}}),{BETTICS_RESULTS_COLLECTION:'$unsafe'});
 await assert.rejects(load(),/Invalid source/);await assert.rejects(load(),/Invalid source/);assert.equal(closed,2);
});
test('section endpoints expose the requested analysis without full detail payload',async()=>{
 let body;const handler=createHandler(async()=>({predictions:[p],matches:new Map([['1',[m]]]),source:'history'}),'resumen');
 await handler({query:{}},{set(){return this},json(b){body=b},status(){return this}});
 assert.equal(body.resumen.roi,50);assert.equal(body.detalle,undefined);
});
test('19,812 synthetic predictions stay server-side with only a 25-record detail page',async()=>{
 const predictions=Array.from({length:19812},(_,i)=>({...p,match_id:String(i+1)}));
 const matches=new Map(predictions.map(row=>[row.match_id,[m]]));
 const result=await call(async()=>({predictions,matches,source:'fixture'}));
 assert.equal(result.body.resumen.aprobados,19812);assert.equal(result.body.resumen.partidos,19812);assert.equal(result.body.resumen.roi,50);
 assert.equal(result.body.detalle.registros.length,25);assert.equal(result.body.detalle.total,19812);assert.ok(JSON.stringify(result.body).length<30000);
});
