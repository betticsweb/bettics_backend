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
test('BTTS yes/no use real goals, including zero, and reject missing scores', () => {
 for (const selection of ['YES','NO']) {
 const markets=definitions({markets:[rule('BTTS',selection)]});
 assert.equal(settle({...p,seleccion:selection},history(0,2),{markets}).estado,selection==='YES'?'fallo':'acierto');
 assert.equal(settle({...p,seleccion:selection},history(1,2),{markets}).estado,selection==='YES'?'acierto':'fallo');
 assert.equal(settle({...p,seleccion:selection},history(null,2),{markets}).estado,'pendiente');
 }
});
test('winner HOME/AWAY respects historical home side; draws follow explicit rule', () => {
 for(const selection of ['HOME','AWAY']) {
 const markets=definitions({markets:[rule('FT_WINNER',selection,{drawRule:'loss'})]});
 assert.equal(settle({...p,seleccion:selection},history(0,2),{markets}).estado,selection==='AWAY'?'acierto':'fallo');
 assert.equal(settle({...p,seleccion:selection},history(1,1),{markets}).ganancia,-1);
 }
});
test('HT with final scores only is pending and has no ROI', () => {
 const markets=definitions({markets:[rule('HT_WINNER','HOME',{drawRule:'loss'})]});
 const row=settle({...p,periodo:'HT',seleccion:'HOME'},history(3,0),{markets});
 assert.equal(row.codigo_pendiente,'ht_no_disponible'); assert.equal(metrics([row]).roi,null);
 assert.throws(()=>definitions({markets:[rule('HT_GOALS','OVER',{linea:undefined,pushRule:'void'})]}));
});
