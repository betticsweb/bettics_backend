(async()=>{
const {createLoader}=require(process.cwd()+'/app/controllers/backtest-results');
const {settle,metrics}=require(process.cwd()+'/app/services/backtest/results');
const {normalizeId}=require(process.cwd()+'/app/services/backtest/history');
const {compareBundesligaReference}=require(process.cwd()+'/app/services/backtest/reference');
const data=await createLoader()();
const rows=data.predictions.map(p=>settle(p,data.matches.get(normalizeId(p.match_id))||[],{drawRule:data.drawRule}));
const reasons={};for(const r of rows)if(r.estado==='pendiente')reasons[r.codigo_pendiente]=(reasons[r.codigo_pendiente]||0)+1;
const versions=[...new Set(rows.map(r=>r.version_politica))];
const summary=versions.length===1?metrics(rows):{aprobados:rows.length,roi:null,nota:'Separar versiones de politica'};
const report={resumen:summary,por_version:Object.fromEntries(versions.map(v=>[v,metrics(rows.filter(r=>r.version_politica===v))])),motivos:reasons,cobertura:data.diagnostics,regla_empate:data.drawRule,escrituras:process.env.BETTICS_BACKTEST_WRITES_ENABLED,muestra_aprobados:data.predictions.slice(0,2),esquemas:{},bundesliga:[]};
const groups=new Map();
for(const row of rows.filter(r=>r.mercado==='CORNERS_OVER_85'&&/bundesliga/i.test(r.liga))){const key=JSON.stringify([row.liga,row.temporada,row.version_politica]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
for(const g of groups.values()){const p=g[0];report.bundesliga.push({liga:p.liga,temporada:p.temporada,version:p.version_politica,ultima_fecha:g.map(r=>r.fecha_partido).sort().pop(),resumen:metrics(g),referencia:compareBundesligaReference(g,{liga:p.liga,temporada:p.temporada,mercado:p.mercado})});}
const conn=require(process.cwd()+'/app/config/connection').conectionManager({});
if(!conn)throw Error('connection');
try{
await conn.asPromise();
for(const name of ['eventosLigaProb','eventosLiga','matchStatistics']){
const docs=await conn.db.collection(name).find({}).limit(100).maxTimeMS(15000).toArray();
const types={};for(const d of docs)for(const [k,v]of Object.entries(d)){types[k]||={};const t=v===null?'null':v instanceof Date?'date':typeof v;types[k][t]=(types[k][t]||0)+1;}
const samples=docs.slice(0,2).map(d=>Object.fromEntries(Object.entries(d).filter(([k,v])=>k!=='_id'&&/(event|match|league|season|date|fecha|home|away|corner|goal|goles|esquina|local|visita|equipo|score|status|estado|activo|^id$)/i.test(k)&&(v===null||['string','number','boolean'].includes(typeof v)||v instanceof Date))));
report.esquemas[name]={muestra_hasta_100:docs.length,tipos:types,ejemplos:samples};
}
}finally{await conn.close();}
console.log('BETTICS_DIAGNOSTICO='+JSON.stringify(report).replace(/[^\x20-\x7E]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));
})().catch(()=>{console.error('Fallo el diagnostico de solo lectura; no se muestran credenciales.');process.exitCode=1;});
