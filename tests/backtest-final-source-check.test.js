'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {settle,metrics}=require('../app/services/backtest/results');
const {normalizeId}=require('../app/services/backtest/history');
const {compareBundesligaReference}=require('../app/services/backtest/reference');
const code=fs.readFileSync(path.join(__dirname,'../scripts/check-backtest-final-source.js'),'utf8');
const p={match_id:'1',fecha_partido:'2026-10-18',liga:'Germany Bundesliga',temporada:'2026/2027',mercado:'CORNERS_OVER_85',periodo:'FT',seleccion:'OVER',linea:8.5,segmento:'N1',cuota:1.5,version_politica:'BETTICS_20261024_V1',tipo_evaluacion:'OOT'};
async function run(proposed){
 const logs=[],errors=[];let received;
 const env={BETTICS_BACKTEST_WRITES_ENABLED:'false',USR_NAME:'SECRET_CANARY'};
 const processMock={env,argv:proposed?['node','-','--proposed-source']:['node','-'],cwd:()=>'/app'};
 const context={process:processMock,console:{log:x=>logs.push(x),error:x=>errors.push(x)},require(name){
  if(name.endsWith('/controllers/backtest-results'))return{createLoader:(_,candidate)=>async()=>{
   received=candidate;const confirmed=candidate.BETTICS_RESULTS_FINAL_FIELDS_CONFIRMED==='eventosLigaProb';
   return{predictions:[p],matches:new Map([['1',[{dateEvent:p.fecha_partido,strLeague:p.liga,cornerKicksHome:4,cornerKicksAway:5,__finalFieldsConfirmed:confirmed}]]]),drawRule:'pending',diagnostics:{fuentes:{eventosLigaProb:{marcadores_finales_confirmados_por_contrato:confirmed}}}};
  }};
  if(name.endsWith('/services/backtest/results'))return{settle,metrics};
  if(name.endsWith('/services/backtest/history'))return{normalizeId};
  if(name.endsWith('/services/backtest/reference'))return{compareBundesligaReference};
  throw Error('Unexpected dependency');
 }};
 await vm.runInNewContext(code,context);
 assert.equal(errors.length,0);assert.ok(!logs.join('').includes('SECRET_CANARY'));
 return{report:JSON.parse(logs[0].slice('BETTICS_FINAL_SOURCE='.length)),env,received};
}
test('preflight uses an isolated source contract without changing live process configuration',async()=>{
 const {report,env,received}=await run(true);
 assert.equal(env.BETTICS_RESULTS_FINAL_FIELDS_CONFIRMED,undefined);
 assert.equal(received.BETTICS_RESULTS_FINAL_FIELDS_CONFIRMED,'eventosLigaProb');
 assert.equal(report.modo,'preflight_sin_cambiar_configuracion');
 assert.equal(report.resumen.evaluados,1);assert.equal(report.apto_publicar,false);
 assert.equal(report.bundesliga.estado,'difiere'); // One synthetic record cannot meet the original 30-record report.
});
test('production check never treats a proposed confirmation as an activated setting',async()=>{
 const {report}=await run(false);
 assert.equal(report.modo,'produccion_actual');assert.equal(report.fuente_confirmada,false);
 assert.equal(report.resumen.evaluados,0);assert.equal(report.resumen.roi,null);
 assert.equal(report.apto_publicar,false);assert.equal(report.motivos.final_no_confirmado,1);
});
