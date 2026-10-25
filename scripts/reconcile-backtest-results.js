'use strict';
// Native read operations only. No models, index creation, settlement or ROI.
const SOURCES = ['eventosLigaProb', 'eventosLiga', 'resultados'];
const STATUS_FIELDS = ['status', 'strStatus', 'estado', 'match_status', 'statusShort'];
const SCORES = ['intHomeScore', 'intAwayScore', 'cornerKicksHome', 'cornerKicksAway'];
function identity(value) {
    if (typeof value === 'string' && /^\d+$/.test(value)) return value;
    if (Number.isSafeInteger(value) && value >= 0) return String(value);
    return null;
}
function validScore(value) { return Number.isSafeInteger(value) && value >= 0; }
function inspectPrediction(prediction, matches) {
    if (!matches.length) return 'missing';
    if (matches.length !== 1) return 'ambiguous';
    const match = matches[0];
    if (prediction.fecha_partido !== match.dateEvent || prediction.liga !== match.strLeague) return 'metadata_mismatch';
    const fields = prediction.mercado === 'GOLES_OVER_25' ? SCORES.slice(0, 2) : SCORES.slice(2);
    return fields.every(field => validScore(match[field])) ? 'scores_present_not_settled' : 'invalid_or_missing_scores';
}
async function reconcile(db, expectedDatabase = 'DB_Analytic_Bet', maxRows = 1000000) {
    if (db.databaseName !== expectedDatabase) throw new Error('Unexpected database');
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    if (!collections.some(item => item.name === 'backtestAprobados')) throw new Error('Approved collection missing');
    const predictions = await db.collection('backtestAprobados').find({ tipo_evaluacion: 'OOT' }, {
        projection: { _id: 0, match_id: 1, fecha_partido: 1, liga: 1, mercado: 1, version_politica: 1 }
    }).limit(maxRows + 1).toArray();
    if (predictions.length > maxRows) throw new Error('Audit row limit exceeded');
    const ids = new Set(predictions.map(p => identity(p.match_id)).filter(Boolean));
    const report = { database: db.databaseName, evaluation: 'OOT', approved_predictions: predictions.length,
        unique_match_ids: ids.size, invalid_match_ids: predictions.filter(p => !identity(p.match_id)).length,
        policy_versions: [...new Set(predictions.map(p => p.version_politica))], sources: {},
        settlement_verified: false, roi_calculated: false, mongodb_writes: false };
    for (const name of SOURCES) {
        if (!collections.some(item => item.name === name)) { report.sources[name] = { exists: false }; continue; }
        const projection = Object.fromEntries(['idEvent', 'match_id', 'dateEvent', 'strLeague', ...SCORES, ...STATUS_FIELDS].map(key => [key, 1]));
        projection._id = 0;
        const matches = new Map();
        const fields = {};
        let scanned = 0, alternateIdMatches = 0;
        // One projected scan avoids an unindexed lookup per approved prediction.
        for await (const row of db.collection(name).find({}, { projection }).limit(maxRows + 1)) {
            if (++scanned > maxRows) throw new Error('Audit row limit exceeded');
            const id = identity(row.idEvent);
            if (ids.has(identity(row.match_id))) alternateIdMatches++;
            if (!ids.has(id)) continue;
            if (!matches.has(id)) matches.set(id, []);
            matches.get(id).push(row);
            for (const [key, value] of Object.entries(row)) {
                const type = value === null ? 'null' : typeof value;
                fields[key] ||= {};
                fields[key][type] = (fields[key][type] || 0) + 1;
            }
        }
        const counts = {};
        for (const prediction of predictions) {
            const category = inspectPrediction(prediction, matches.get(identity(prediction.match_id)) || []);
            counts[category] = (counts[category] || 0) + 1;
        }
        report.sources[name] = { exists: true, scanned_records: scanned, join: 'match_id -> idEvent (numeric IDs normalized)',
            alternate_match_id_records: alternateIdMatches, matched_unique_ids: matches.size,
            duplicate_historical_ids: [...matches.values()].filter(rows => rows.length > 1).length,
            prediction_counts: counts, field_types_on_joined_records: fields,
            status_fields_present: STATUS_FIELDS.filter(field => fields[field]) };
    }
    return report;
}
async function main() {
    // A separate read-only Atlas user is required. Never reuse application write credentials.
    if (!process.env.BETTICS_AUDIT_MONGODB_URI) throw new Error('Read-only audit connection required');
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.BETTICS_AUDIT_MONGODB_URI, { serverSelectionTimeoutMS: 15000, appName: 'bettics-readonly-reconciliation' });
    try {
        await client.connect();
        console.log(JSON.stringify(await reconcile(client.db('DB_Analytic_Bet')), null, 2));
    } finally { await client.close(); }
}
module.exports = { identity, validScore, inspectPrediction, reconcile };
if (require.main === module) main().catch(() => {
    console.error('Read-only reconciliation failed. Check access, database and row limit locally; credentials are not logged.');
    process.exitCode = 1;
});
