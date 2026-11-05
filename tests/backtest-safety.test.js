const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const fixture = require('./helpers/backtest-fixture');
const { createController } = require('../app/controllers/backtest');
const routes = require('../app/routes/backtest');
let server, url, storeCalls;
const original = { token: process.env.BETTICS_ETL_TOKEN, gate: process.env.BETTICS_BACKTEST_WRITES_ENABLED };
const token = crypto.randomBytes(32).toString('hex');
before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/backtest', routes.bodyError);
    app.use(routes.createRouter(createController(async (_req, action) => {
        storeCalls++;
        // Only a fake storage interface; no driver/connection/collection is used.
        return action({ collection: { createIndex: async () => {} }, bulkWrite: async () => ({ upsertedCount: 1, matchedCount: 0, modifiedCount: 0 }) });
    })));
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    url = 'http://127.0.0.1:' + server.address().port;
});
beforeEach(() => { storeCalls = 0; process.env.BETTICS_ETL_TOKEN = token; delete process.env.BETTICS_BACKTEST_WRITES_ENABLED; });
after(async () => {
    if (original.token === undefined) delete process.env.BETTICS_ETL_TOKEN; else process.env.BETTICS_ETL_TOKEN = original.token;
    if (original.gate === undefined) delete process.env.BETTICS_BACKTEST_WRITES_ENABLED; else process.env.BETTICS_BACKTEST_WRITES_ENABLED = original.gate;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
});
async function post(path, registros = [fixture], authorization = 'Bearer ' + token) {
    const response = await fetch(url + '/api/backtest/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authorization }, body: JSON.stringify({ registros }) });
    return { status: response.status, body: await response.json() };
}
test('default-disabled import never opens storage for a valid approved record', async () => {
    const result = await post('registrarMasivo');
    assert.equal(result.status, 423); assert.equal(result.body.escrituras, false); assert.equal(storeCalls, 0);
});
test('only explicit lowercase true opens the write gate, and authentication remains mandatory', async () => {
    for (const flag of ['false', 'TRUE', '1', '']) {
        process.env.BETTICS_BACKTEST_WRITES_ENABLED = flag;
        assert.equal((await post('registrarMasivo')).status, 423);
    }
    assert.equal(storeCalls, 0);
    process.env.BETTICS_BACKTEST_WRITES_ENABLED = 'true';
    assert.equal((await post('registrarMasivo', [fixture], '')).status, 401);
    assert.equal(storeCalls, 0);
    assert.equal((await post('registrarMasivo')).status, 200);
    assert.equal(storeCalls, 1); // fake storage only
});
test('authenticated validation preserves HOME/null without opening storage', async () => {
    const home = { ...fixture, mercado: 'CORNERS_LOCAL_GANA', seleccion: 'HOME', linea: null };
    const result = await post('validarMasivo', [fixture, home]);
    assert.equal(result.status, 200); assert.equal(result.body.estado, 'validado');
    assert.deepEqual(result.body.resumen, { recibidos: 2, validos: 2, rechazados: 0 });
    assert.equal(result.body.escrituras, false); assert.equal(storeCalls, 0);
});
test('validation still never opens storage when the global write gate is enabled', async () => {
    process.env.BETTICS_BACKTEST_WRITES_ENABLED = 'true';
    assert.equal((await post('validarMasivo')).status, 200); assert.equal(storeCalls, 0);
});
test('read-only validation reports invalid rows and duplicate conflicts without writes', async () => {
    const result = await post('validarMasivo', [fixture, { ...fixture, cuota: 0 }]);
    assert.equal(result.status, 207); assert.equal(result.body.resumen.rechazados, 1);
    const conflict = await post('validarMasivo', [fixture, { ...fixture, cuota: 2 }]);
    assert.equal(conflict.status, 422); assert.equal(conflict.body.resumen.rechazados, 2); assert.equal(storeCalls, 0);
});
test('validation rejects authentication failures and empty batches without opening storage', async () => {
    assert.equal((await post('validarMasivo', [fixture], '')).status, 401);
    assert.equal((await post('validarMasivo', [])).status, 400); assert.equal(storeCalls, 0);
});
