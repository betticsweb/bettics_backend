'use strict';
// Pure validation endpoint only. Never calls registrarMasivo or opens MongoDB.
(async()=>{
 if(process.env.BETTICS_BACKTEST_WRITES_ENABLED!=='false')throw Error('Writes are not disabled');
 const token=process.env.BETTICS_ETL_TOKEN;
 if(!token)throw Error('ETL token unavailable in Heroku');
 const registros=[['BTTS_YES','YES'],['FT_HOME_WIN','HOME'],['FT_AWAY_WIN','AWAY']].flatMap(([mercado,seleccion])=>['N1','N2','N3'].map(segmento=>({match_id:'1',fecha_partido:'2026-01-01',liga:'VALIDACION SIN CARGA',temporada:'2026',mercado,periodo:'FT',seleccion,linea:null,segmento,cuota:1.8,version_politica:'BETTICS_20261024_V1',tipo_evaluacion:'OOT'})));
 const https=require('https');
 const response=await new Promise((resolve,reject)=>{
  const payload=JSON.stringify({registros});
  const req=https.request('https://apianabet.herokuapp.com/api/backtest/validarMasivo',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),Authorization:'Bearer '+token}},res=>{
   let text='';res.on('data',chunk=>{text+=chunk;if(text.length>100000)req.destroy(Error('Response too large'));});
   res.on('end',()=>{try{resolve({http:res.statusCode,body:JSON.parse(text)});}catch(_){reject(Error('Invalid validation response'));}});
  });
  req.setTimeout(30000,()=>req.destroy(Error('Validation timeout')));req.on('error',reject);req.end(payload);
 });
 const b=response.body;
 if(response.http!==200||b.escrituras!==false||b.resumen?.recibidos!==9||b.resumen?.validos!==9||b.resumen?.rechazados!==0)throw Error('Production validation rejected the expected FT contract');
 console.log('BETTICS_FT_VALIDACION='+JSON.stringify({http:response.http,resumen:b.resumen,escrituras:false,mercados:['BTTS_YES','FT_HOME_WIN','FT_AWAY_WIN']}));
})().catch(()=>{console.error('No se confirmo la validacion FT de produccion. No se muestran credenciales.');process.exitCode=1;});
