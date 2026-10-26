'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');
const code=fs.readFileSync(require.resolve('../scripts/verify-ft-live.js'),'utf8');
async function run(flag='false',http=200){
 const calls=[],output=[],errors=[];
 const context={process:{env:{BETTICS_BACKTEST_WRITES_ENABLED:flag,BETTICS_ETL_TOKEN:'TEST NEVER PRINT'}},Buffer,console:{log:x=>output.push(x),error:x=>errors.push(x)},require:name=>{
  assert.equal(name,'https');return {request:(url,options,callback)=>{
   const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=e=>req.emit('error',e);
   req.end=payload=>{calls.push({url,options,payload:JSON.parse(payload)});queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=http;callback(res);res.emit('data',JSON.stringify({escrituras:false,resumen:{recibidos:9,validos:9,rechazados:0}}));res.emit('end');});};
   return req;
  }};
 }};
 await vm.runInNewContext(code,context);return {calls,output,errors,exitCode:context.process.exitCode};
}
test('production check only posts to validarMasivo and never prints the token',async()=>{
 const r=await run();assert.equal(r.calls.length,1);assert.equal(r.calls[0].url,'https://apianabet.herokuapp.com/api/backtest/validarMasivo');assert.equal(r.calls[0].options.method,'POST');
 assert.deepEqual([...new Set(r.calls[0].payload.registros.map(x=>x.mercado))],['BTTS_YES','FT_HOME_WIN','FT_AWAY_WIN']);
 assert.equal(r.calls[0].payload.registros.length,9);assert.ok(r.output[0].startsWith('BETTICS_FT_VALIDACION='));assert.ok(!r.output.join('').includes('TEST NEVER PRINT'));assert.equal(r.errors.length,0);
});
test('production check fails closed if writes are enabled or authentication fails',async()=>{
 const enabled=await run('true');assert.equal(enabled.calls.length,0);assert.equal(enabled.exitCode,1);
 const unauthorized=await run('false',401);assert.equal(unauthorized.exitCode,1);assert.equal(unauthorized.output.length,0);assert.ok(!unauthorized.errors.join('').includes('TEST NEVER PRINT'));
});
