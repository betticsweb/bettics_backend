'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {settle,metrics}=require('../app/services/backtest/results');
const {normalizeId}=require('../app/services/backtest/history');
const {compareBundesligaReference}=require('../app/services/backtest/reference');
const source=fs.readFileSync(require('node:path').join(__dirname,'../scripts/diagnose-backtest-live.js'),'utf8');
const p={match_id:'1',fecha_partido:'2025-07-01',liga:'Germany Bundesliga',temporada:'2025/2026',mercado:'CORNERS_OVER_85',periodo:'FT',seleccion:'OVER',linea:8.5,segmento:'N1',cuota:1.5,version_politica:'V1',tipo_evaluacion:'OOT'};
const m={idEvent:'1',strLeague:p.liga,dateEvent:p.fecha_partido,intHomeScore:0,intAwayScore:3,cornerKicksHome:4,cornerKicksAway:5,status:'complete',strHomeTeam:'A',strAwayTeam:'B'};
async function run(fail=false){
 const logs=[],errors=[],queries=[];let closed=0;
 const processMock={env:{BETTICS_BACKTEST_WRITES_ENABLED:'false',USR_NAME:'SECRET_CANARY'},cwd:()=>'/app'};
 const connection={asPromise:async()=>{},close:async()=>{closed++},db:{collection(name){return{find(query){queries.push({name,query});return{limit(n){assert.equal(n,100);return this},maxTimeMS(){return this},toArray:async()=>[m]}}}}}};
 const data={predictions:[p],matches:new Map([['1',[m]]]),drawRule:'pending',diagnostics:{fuentes:{}}};
 const context={process:processMock,console:{log:v=>logs.push(v),error:v=>errors.push(v)},require(name){
  if(name.endsWith('/controllers/backtest-results'))return{createLoader:()=>async()=>{if(fail)throw Error('mongodb://SECRET_CANARY');return data}};
  if(name.endsWith('/services/backtest/results'))return{settle,metrics};
  if(name.endsWith('/services/backtest/history'))return{normalizeId};
  if(name.endsWith('/services/backtest/reference'))return{compareBundesligaReference};
  if(name.endsWith('/config/connection'))return{conectionManager:()=>connection};
  throw Error('Unexpected module');
 }};
 await vm.runInNewContext(source,context);
 return{logs,errors,queries,closed,processMock};
}
test('live diagnostic only uses reads, reports actual supplied outcomes and never prints credentials',async()=>{
 const r=await run();assert.equal(r.closed,1);assert.equal(r.queries.length,3);assert.equal(r.errors.length,0);
 const line=r.logs.find(v=>v.startsWith('BETTICS_DIAGNOSTICO='));
 assert.ok(!line.includes('SECRET_CANARY'));
 const data=JSON.parse(line.slice('BETTICS_DIAGNOSTICO='.length));
 assert.equal(data.resumen.aprobados,1);assert.equal(data.resumen.roi,50);assert.equal(data.escrituras,'false');
 assert.equal(data.bundesliga[0].referencia.estado,'difiere');assert.equal(data.esquemas.eventosLigaProb.tipos.status.string,1);
});
test('live diagnostic failure is sanitized and never reports success',async()=>{
 const r=await run(true);assert.equal(r.processMock.exitCode,1);assert.equal(r.logs.length,0);assert.equal(r.queries.length,0);
 assert.ok(!r.errors.join('').includes('SECRET_CANARY'));
});
