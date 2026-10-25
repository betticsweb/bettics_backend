'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { definitions, configured } = require('../app/services/backtest/market-policies');
const { validateRecord } = require('../app/services/backtest/contract');
const { settle, metrics } = require('../app/services/backtest/results');
const p = {match_id:'1', fecha_partido:'2026-01-01', liga:'Liga', temporada:'2026', mercado:'TEST_BTTS', periodo:'FT', seleccion:'YES', linea:null, segmento:'N1', cuota:2, version_politica:'TEST', tipo_evaluacion:'OOT'};
const rule = (family='BTTS', seleccion='YES', extra={}) => ({mercado:p.mercado, version_politica:'TEST', family, seleccion, linea:null, segmentos:['N1'], verified:true, evidence:'TEST FIXTURE ONLY', ...extra});
const history = (h,a) => [{dateEvent:p.fecha_partido,strLeague:p.liga,intHomeScore:h,intAwayScore:a,__status:'FT'}];
test('production contains no invented additional policies; unknown imports rejected', () => {
 assert.equal(configured.length,0); assert.ok(validateRecord(p).errors.length);
});
test('version, evidence, segments and unique selection/line identity fail closed', () => {
 for (const extra of [{verified:false},{evidence:''},{segmentos:[]},{segmentos:['N5']}]) assert.throws(()=>definitions({markets:[rule('BTTS','YES',extra)]}));
 assert.throws(()=>definitions({markets:[rule(),rule('BTTS','NO')]}));
 assert.equal(validateRecord(p,definitions({markets:[rule()]})).errors.length,0);
 assert.ok(validateRecord({...p,version_politica:'OTHER'},definitions({markets:[rule()]})).errors.length);
});
test('BTTS YES uses FT goals, preserves zeros and rejects missing results', () => {
 const markets=definitions({markets:[rule()]});
 assert.equal(settle(p,history(0,2),{markets}).estado,'fallo');
 assert.equal(settle(p,history(1,2),{markets}).estado,'acierto');
 assert.equal(settle(p,history(null,2),{markets}).estado,'pendiente');
 assert.equal(settle(p,history(-1,2),{markets}).estado,'pendiente');
});
test('winner HOME/AWAY respects historical home side; draws follow explicit rule', () => {
 for(const selection of ['HOME','AWAY']) {
 const markets=definitions({markets:[rule('FT_WINNER',selection,{drawRule:'loss'})]});
 assert.equal(settle({...p,seleccion:selection},history(0,2),{markets}).estado,selection==='AWAY'?'acierto':'fallo');
 assert.equal(settle({...p,seleccion:selection},history(1,1),{markets}).ganancia,-1);
 }
});
test('HT and BTTS NO are excluded; final scores cannot evaluate HT', () => {
 assert.throws(()=>definitions({markets:[rule('HT_WINNER','HOME',{drawRule:'loss'})]}));
 assert.throws(()=>definitions({markets:[rule('BTTS','NO')]}));
 const markets=definitions({markets:[rule()]});
 const row=settle({...p,periodo:'HT'},history(3,3),{markets});
 assert.equal(row.estado,'pendiente'); assert.equal(metrics([row]).roi,null);
 assert.throws(()=>definitions({markets:[rule('BTTS','YES',{segmentos:['N4']})]}));
});
const reference = require('./fixtures/ft-report-contract.json');
test('three original report formulas agree with FT settlement for confirmed fixture scores',()=>{
 for(const report of reference.reports) {
  const markets=definitions({markets:[rule(report.family,report.selection,{mercado:report.market,...(report.family==='FT_WINNER'?{drawRule:'loss'}:{})})]});
  for(const example of report.cases) {
   const result=settle({...p,mercado:report.market,seleccion:report.selection,cuota:example.odds},history(example.home,example.away),{markets});
   assert.equal(result.ganancia,example.profit,`${report.market} ${example.home}-${example.away}`);
  }
  const absent=settle({...p,mercado:report.market,seleccion:report.selection},history(null,0),{markets});
  assert.equal(absent.estado,'pendiente');assert.equal(metrics([absent]).roi,null);
 }
});
