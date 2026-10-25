'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { identity, validScore, inspectPrediction, reconcile } = require('../scripts/reconcile-backtest-results');
const prediction = { match_id: '7811554', fecha_partido: '2025-07-01', liga: 'Finland Veikkausliiga', mercado: 'GOLES_OVER_25', version_politica: 'V1' };
const match = { idEvent: 7811554, dateEvent: prediction.fecha_partido, strLeague: prediction.liga, intHomeScore: 0, intAwayScore: 3 };
test('IDs normalize numeric types without guessing nonnumeric IDs', () => {
    assert.equal(identity(7811554), prediction.match_id);
    for (const invalid of [null, undefined, '', '7.1', ' 7811554 ', {}, NaN]) assert.equal(identity(invalid), null);
});
test('zero is valid; absent, fractional, negative and string scores are not', () => {
    assert.equal(validScore(0), true);
    for (const value of [null, undefined, '', '0', -1, 1.2, NaN]) assert.equal(validScore(value), false);
});
test('missing, duplicate and metadata-conflicting matches remain unevaluable', () => {
    assert.equal(inspectPrediction(prediction, []), 'missing');
    assert.equal(inspectPrediction(prediction, [match, match]), 'ambiguous');
    assert.equal(inspectPrediction(prediction, [{ ...match, dateEvent: '2025-07-02' }]), 'metadata_mismatch');
});
test('scores alone never confirm settlement; market-specific fields are checked', () => {
    assert.equal(inspectPrediction(prediction, [match]), 'scores_present_not_settled');
    assert.equal(inspectPrediction({ ...prediction, mercado: 'CORNERS_OVER_85' }, [match]), 'invalid_or_missing_scores');
});
function fakeDb() {
    const rows = { backtestAprobados: [prediction], eventosLigaProb: [match] };
    return { databaseName: 'DB_Analytic_Bet', listCollections: () => ({ toArray: async () => Object.keys(rows).map(name => ({ name })) }),
        collection(name) { return { find(query, options) {
            assert.ok(options.projection); // Raw projected reads; no model or mutation methods exist.
            if (name === 'backtestAprobados') assert.deepEqual(query, { tipo_evaluacion: 'OOT' });
            return { limit() { return this; }, toArray: async () => rows[name], async *[Symbol.asyncIterator]() { yield* rows[name]; } };
        } }; } };
}
test('read-only reconciliation reports actual counts without computing ROI', async () => {
    const result = await reconcile(fakeDb());
    assert.equal(result.approved_predictions, 1);
    assert.equal(result.sources.eventosLigaProb.matched_unique_ids, 1);
    assert.equal(result.sources.eventosLigaProb.prediction_counts.scores_present_not_settled, 1);
    assert.equal(result.sources.eventosLiga.exists, false);
    assert.equal(result.mongodb_writes, false);
    assert.equal(result.roi_calculated, false);
});
test('wrong database and incomplete scans fail instead of producing partial metrics', async () => {
    await assert.rejects(reconcile({ databaseName: 'other' }), /Unexpected database/);
    await assert.rejects(reconcile(fakeDb(), 'DB_Analytic_Bet', 0), /row limit/);
});
