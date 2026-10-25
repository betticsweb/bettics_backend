'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createController}=require('../app/controllers/backtest');
const {createRouter}=require('../app/routes/backtest');
const p={match_id:'1',fecha_partido:'2026-01-01',liga:'TEST VALIDATION ONLY',temporada:'2026',periodo:'FT',linea:null,segmento:'N1',cuota:1.8,version_politica:'BETTICS_20261024_V1',tipo_evaluacion:'OOT'};
test('actual HTTP validation accepts ETL FT codes with writes disabled and never calls MongoDB',async()=>{
 const previousToken=process.env.BETTICS_ETL_TOKEN,previousFlag=process.env.BETTICS_BACKTEST_WRITES_ENABLED;
 process.env.BETTICS_ETL_TOKEN='test-ft-only-token';process.env.BETTICS_BACKTEST_WRITES_ENABLED='false';
 let calls=0;
 const app=express();app.use(express.json());app.use(createRouter(createController(async()=>{calls++;throw Error('MongoDB forbidden');})));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 try {
  const url=`http://127.0.0.1:${server.address().port}/api/backtest/`;
  const registros=[['BTTS_YES','YES'],['FT_HOME_WIN','HOME'],['FT_AWAY_WIN','AWAY']].flatMap(([mercado,seleccion])=>['N1','N2','N3'].map(segmento=>({...p,mercado,seleccion,segmento})));
  const response=await fetch(url+'validarMasivo',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-ft-only-token'},body:JSON.stringify({registros})});
  assert.equal(response.status,200);const body=await response.json();
  assert.deepEqual(body.resumen,{recibidos:9,validos:9,rechazados:0});assert.equal(body.escrituras,false);
  const blocked=await fetch(url+'registrarMasivo',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-ft-only-token'},body:JSON.stringify({registros})});
  assert.equal(blocked.status,423);assert.equal(calls,0);
 } finally {
  await new Promise(resolve=>server.close(resolve));
  if(previousToken===undefined)delete process.env.BETTICS_ETL_TOKEN;else process.env.BETTICS_ETL_TOKEN=previousToken;
  if(previousFlag===undefined)delete process.env.BETTICS_BACKTEST_WRITES_ENABLED;else process.env.BETTICS_BACKTEST_WRITES_ENABLED=previousFlag;
 }
});
