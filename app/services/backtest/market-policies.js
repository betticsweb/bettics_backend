'use strict';
// Structural market contract only. Approval policies remain exclusively in the existing R generator.
const configured = Object.freeze([
    {mercado:'AMBOS_MARCAN_SI',family:'BTTS',seleccion:'YES'},
    {mercado:'GANADOR_FT_LOCAL',family:'FT_WINNER',seleccion:'HOME',drawRule:'loss'},
    {mercado:'GANADOR_FT_VISITANTE',family:'FT_WINNER',seleccion:'AWAY',drawRule:'loss'}
].map(r => Object.freeze({...r, periodo:'FT',linea:null,segmentos:['N1','N2','N3']})));
function definitions(document) {
    if (!document || !Array.isArray(document.markets)) throw Error('Invalid market definitions');
    const seen = new Set();
    return document.markets.map(r => {
        if (!['BTTS','FT_WINNER'].includes(r.family) ||
            !(r.family === 'BTTS' ? r.seleccion === 'YES' : ['HOME','AWAY'].includes(r.seleccion) && r.drawRule === 'loss') ||
            r.linea !== null || r.periodo && r.periodo !== 'FT' || !Array.isArray(r.segmentos) || !r.segmentos.length ||
            r.segmentos.some(s => !['N1','N2','N3'].includes(s)) || seen.has(r.mercado)) throw Error('Invalid FT market definition');
        seen.add(r.mercado); return {...r,periodo:'FT'};
    });
}
function additionalMarket(code, version, rules = configured) {
    return rules.find(r => r.mercado === code && (!r.version_politica || r.version_politica === version));
}
module.exports = { definitions, configured, additionalMarket };
