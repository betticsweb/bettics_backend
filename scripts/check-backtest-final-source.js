(async()=>{
const proposed=process.argv.includes('--proposed-source');
const env=proposed?{...process.env,BETTICS_RESULTS_FINAL_FIELDS_CONFIRMED:'eventosLigaProb'}:process.env;
const {createLoader}=require(process.cwd()+'/app/controllers/backtest-results');
const {settle,metrics}=require(process.cwd()+'/app/services/backtest/results');
const {normalizeId}=require(process.cwd()+'/app/services/backtest/history');
const {compareBundesligaReference}=require(process.cwd()+'/app/services/backtest/reference');
const data=await createLoader(undefined,env)();
const version='BETTICS_20261024_V1';
const predictions=data.predictions.filter(p=>p.version_politica===version);
const rows=predictions.map(p=>settle(p,data.matches.get(normalizeId(p.match_id))||[],{drawRule:data.drawRule}));
const reference=compareBundesligaReference(rows,{liga:'Germany Bundesliga',temporada:'2026/2027',mercado:'CORNERS_OVER_85'});
const summary=metrics(rows),reasons={};
for(const row of rows)if(row.estado==='pendiente')reasons[row.codigo_pendiente]=(reasons[row.codigo_pendiente]||0)+1;
const confirmed=data.diagnostics?.fuentes?.eventosLigaProb?.marcadores_finales_confirmados_por_contrato===true;
const report={modo:proposed?'preflight_sin_cambiar_configuracion':'produccion_actual',version,fuente_confirmada:confirmed,escrituras:process.env.BETTICS_BACKTEST_WRITES_ENABLED,resumen:summary,motivos:reasons,bundesliga:reference};
report.apto_publicar=confirmed&&process.env.BETTICS_BACKTEST_WRITES_ENABLED==='false'&&data.predictions.length===19812&&predictions.length===19812&&summary.evaluados>0&&reference.estado==='coincide';
console.log('BETTICS_FINAL_SOURCE='+JSON.stringify(report).replace(/[^\x20-\x7E]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));
})().catch(()=>{console.error('Fallo la comprobacion de solo lectura. No se muestran credenciales.');process.exitCode=1;});
