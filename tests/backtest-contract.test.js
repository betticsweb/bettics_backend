const test = require('node:test');
const assert = require('node:assert/strict');
const base = require('./helpers/backtest-fixture');
const { validateRecord, MARKETS, hashOf } = require('../app/services/backtest/contract');
const { prepareBatch, operation } = require('../app/services/backtest/ingest');

test('all permitted market/segment combinations retain R decisions and exact selection', () => {
    for (const [mercado, market] of Object.entries(MARKETS)) for (const segmento of market.segmentos) {
        const record = { ...base, mercado, segmento, seleccion: market.seleccion, linea: market.linea };
        assert.deepEqual(validateRecord(record), { row: record, errors: [] });
    }
});
test('HOME accepts null, empty or omitted line, and never becomes LOCAL or 1', () => {
    for (const linea of [null, '', undefined]) {
        const record = { ...base, mercado: 'CORNERS_LOCAL_GANA', seleccion: 'HOME', linea };
        if (linea === undefined) delete record.linea;
        const result = validateRecord(record);
        assert.deepEqual(result.errors, []);
        assert.equal(result.row.linea, null);
        assert.equal(result.row.seleccion, 'HOME');
    }
    for (const seleccion of ['LOCAL', '1', 'home']) assert.ok(validateRecord({ ...base, mercado: 'CORNERS_LOCAL_GANA', seleccion, linea: null }).errors.length);
});
test('rejects invalid market, segments, odds, dates, periods, lines and extra statistical fields', () => {
    const patches = [
        { mercado: 'UNKNOWN' }, { mercado: '__proto__' }, { segmento: 'N5' },
        { mercado: 'GOLES_OVER_25', seleccion: 'OVER', linea: 2.5, segmento: 'N4' },
        { mercado: 'CORNERS_LOCAL_GANA', seleccion: 'HOME', linea: null, segmento: 'N4' },
        ...[0, 1, -1, null, NaN, Infinity, '1.25'].map(cuota => ({ cuota })),
        { fecha_partido: '2025-02-30' }, { fecha_partido: '2025-13-01' }, { fecha_partido: null },
        { periodo: '1H' }, { linea: null }, { linea: 2.5 }, { seleccion: 'UNDER' },
        { match_id: Number.MAX_SAFE_INTEGER + 1 }, { match_id: { $ne: null } },
        { aprobada: false }, { intHomeScore: 0 }, { version_politica: '' }, { tipo_evaluacion: '' }
    ];
    for (const patch of patches) assert.ok(validateRecord({ ...base, ...patch }).errors.length, JSON.stringify(patch));
    for (const value of [null, [], 'record']) assert.ok(validateRecord(value).errors.length);
});
test('preserves numeric identifiers safely, annual season and deterministic normalized hashes', () => {
    const result = validateRecord({ ...base, match_id: 7811554, temporada: 2025 });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.row, base);
    assert.equal(hashOf(result.row), hashOf(base));
});
test('validates envelope and batch limit without touching a store', () => {
    for (const body of [null, [], {}, { registros: [] }, { registros: {} }, { registros: [base], other: 1 }]) assert.throws(() => prepareBatch(body), error => error.status === 400);
    assert.throws(() => prepareBatch({ registros: Array(251).fill(base) }), error => error.status === 413);
    assert.equal(prepareBatch({ registros: Array(250).fill(base) }).received, 250);
});
test('identical duplicates are grouped but conflicting duplicates reject every conflicting input', () => {
    const identical = prepareBatch({ registros: [base, { ...base }] });
    assert.equal(identical.groups.length, 1);
    assert.equal(identical.groups[0].indices.length, 2);
    const conflict = prepareBatch({ registros: [base, { ...base, cuota: 1.3 }] });
    assert.equal(conflict.groups.length, 0);
    assert.equal(conflict.rejected.length, 2);
});
test('updates are literal-valued pipelines with exact natural identity, not deletion or replacement', () => {
    const batch = prepareBatch({ registros: [{ ...base, liga: '$untrustedField' }] });
    const op = operation(batch.groups[0]).updateOne;
    assert.equal(op.upsert, true);
    assert.equal(op.update[0].$set.liga.$literal, '$untrustedField');
    assert.equal(op.filter.match_id, base.match_id);
    assert.equal(Object.keys(op.filter).length, 6);
});
