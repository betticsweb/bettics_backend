'use strict';
const { conectionManager } = require('../config/connection');
const { configured } = require('../services/backtest/market-policies');
const { FIELDS } = require('../services/backtest/contract');
const { settle, analyze, parseQuery } = require('../services/backtest/results');
const { normalizeId, sourceConfiguration, readHistory } = require('../services/backtest/history');
const { compareBundesligaReference } = require('../services/backtest/reference');
function createHandler(load = loadRows, section) {
    return async (req,res) => {
        let query;
        try { query = parseQuery(req.query); } catch (e) { return res.status(400).json({ mensaje: e.message }); }
        try {
            const data = await load();
            const versions = [...new Set(data.predictions.map(p => p.version_politica))].sort();
            const version = query.version_politica || (versions.length === 1 ? versions[0] : null);
            const options = { mercados: [...new Set(data.predictions.map(p => p.mercado))].sort(), ligas: [...new Set(data.predictions.map(p => p.liga))].sort(), temporadas: [...new Set(data.predictions.map(p => p.temporada))].sort(), versiones: versions };
            const predictions = data.predictions.filter(p => p.version_politica === version);
            const rows = predictions.map(p => settle(p, data.matches.get(normalizeId(p.match_id)) || [], { drawRule: data.drawRule }));
            res.set('Cache-Control','private, no-store');
            const analysis = analyze(rows,query);
            analysis.conciliacion.alcance = { version_politica: version, tipo_evaluacion: 'OOT', ...Object.fromEntries(['mercado','segmento','liga','temporada','desde','hasta'].map(key => [key, query[key] || null])) };
            analysis.conciliacion.cobertura = data.diagnostics || null;
            analysis.conciliacion.regla_empate_local = data.drawRule || 'pending';
            analysis.conciliacion.referencia_bundesliga = compareBundesligaReference(rows, query);
            const content = section ? { [section]: analysis[section] } : analysis;
            return res.json({ ...content, catalogo_mercados: configured.map(r => Object.fromEntries(['mercado','version_politica','family','periodo','seleccion','linea','segmentos'].map(k => [k,r[k]]))), opciones: options, version_politica: version, requiere_version: versions.length > 1 && !version, aviso: 'Simulación histórica retrospectiva OOT. Stake fijo de 1 unidad. Los pendientes no participan del ROI.', fuente: { coleccion: data.source, colecciones_consultadas: data.diagnostics ? Object.keys(data.diagnostics.fuentes) : [data.source], estado_configurado: data.statusConfigured }, generado: new Date().toISOString() });
        } catch (_) { return res.status(503).json({ mensaje: 'No se pudieron consultar los resultados históricos. Inténtalo nuevamente.' }); }
    };
}
function createLoader(connect = () => conectionManager({}), env = process.env) {
let cache, inflight;
return async function loadRows() {
    if (cache && cache.expires > Date.now()) return cache.value;
    if (inflight) return inflight;
    inflight = (async () => {
        const conn = connect();
        if (!conn) throw Error('Database unavailable');
        try {
            await conn.asPromise();
            const config = sourceConfiguration(env);
            const projection = Object.fromEntries(FIELDS.map(f => [f,1])); projection._id = 0;
            const predictions = await conn.db.collection('backtestAprobados').find({ tipo_evaluacion: 'OOT' },{projection}).limit(200001).maxTimeMS(15000).toArray();
            if (predictions.length > 200000) throw Error('Dataset limit exceeded');
            const history = await readHistory(conn.db, predictions, config);
            const value = { predictions, matches: history.matches, diagnostics: history.diagnostics, drawRule: config.drawRule, source: config.primary, statusConfigured: Boolean(env.BETTICS_RESULTS_STATUS_FIELD) };
            cache = { value, expires: Date.now()+60000 }; return value;
        } finally { await conn.close().catch(()=>{}); }
    })();
    try { return await inflight; } finally { inflight = null; }
};
}
const loadRows = createLoader();
module.exports = { createHandler, createLoader, handler: createHandler(), handlers: Object.fromEntries(['resumen','ranking','segmentos','evolucion','mensual','detalle','conciliacion'].map(section => [section, createHandler(loadRows, section)])) };
