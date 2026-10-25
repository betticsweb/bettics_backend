'use strict';
const { conectionManager } = require('../config/connection');
const { FIELDS } = require('../services/backtest/contract');
const { settle, analyze, parseQuery } = require('../services/backtest/results');
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
            const rows = predictions.map(p => settle(p, data.matches.get(String(p.match_id)) || []));
            res.set('Cache-Control','private, no-store');
            const analysis = analyze(rows,query);
            const content = section ? { [section]: analysis[section] } : analysis;
            return res.json({ ...content, opciones: options, version_politica: version, requiere_version: versions.length > 1 && !version, aviso: 'Simulación histórica retrospectiva OOT. Stake fijo de 1 unidad. Los pendientes no participan del ROI.', fuente: { coleccion: data.source, estado_configurado: data.statusConfigured }, generado: new Date().toISOString() });
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
            const source = env.BETTICS_RESULTS_COLLECTION || 'eventosLigaProb';
            const idField = env.BETTICS_RESULTS_ID_FIELD || 'idEvent';
            const statusField = env.BETTICS_RESULTS_STATUS_FIELD || 'strStatus';
            if (![source,idField,statusField].every(v => /^[a-zA-Z][a-zA-Z0-9_]{0,70}$/.test(v))) throw Error('Invalid source mapping');
            const projection = Object.fromEntries(FIELDS.map(f => [f,1])); projection._id = 0;
            const predictions = await conn.db.collection('backtestAprobados').find({ tipo_evaluacion: 'OOT' },{projection}).limit(200001).maxTimeMS(15000).toArray();
            if (predictions.length > 200000) throw Error('Dataset limit exceeded');
            const ids = [...new Set(predictions.map(p => String(p.match_id)))];
            const matches = new Map();
            const mp = Object.fromEntries([idField,statusField,'strLeague','dateEvent','strHomeTeam','strAwayTeam','intHomeScore','intAwayScore','cornerKicksHome','cornerKicksAway'].map(f => [f,1])); mp._id = 0;
            // Bounded batches, no browser-side full dataset and no per-prediction requests.
            for (let i=0; i<ids.length; i+=500) {
                const batch = ids.slice(i,i+500); const values = batch.concat(batch.filter(id => /^\d+$/.test(id) && Number.isSafeInteger(Number(id))).map(Number));
                const found = await conn.db.collection(source).find({ [idField]: { $in: values } },{projection:mp}).limit(10001).maxTimeMS(15000).toArray();
                if (found.length > 10000) throw Error('Ambiguous source limit');
                for (const m of found) { const id = String(m[idField]); if (!matches.has(id)) matches.set(id,[]); matches.get(id).push({...m,__status:m[statusField]}); }
            }
            const value = { predictions, matches, source, statusConfigured: Boolean(env.BETTICS_RESULTS_STATUS_FIELD) };
            cache = { value, expires: Date.now()+60000 }; return value;
        } finally { await conn.close().catch(()=>{}); }
    })();
    try { return await inflight; } finally { inflight = null; }
};
}
const loadRows = createLoader();
module.exports = { createHandler, createLoader, handler: createHandler(), handlers: Object.fromEntries(['resumen','ranking','segmentos','evolucion','mensual','detalle'].map(section => [section, createHandler(loadRows, section)])) };
