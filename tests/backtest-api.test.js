const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const fixture = require('./helpers/backtest-fixture');
const schema = require('../app/models/backtestAprobados');
const { createController } = require('../app/controllers/backtest');
const routerModule = require('../app/routes/backtest');
const uri = process.env.BACKTEST_TEST_MONGO_URI;
if (!uri) {
    test('MongoDB integration requires BACKTEST_TEST_MONGO_URI', { skip: 'Supply an isolated loopback MongoDB; no production default exists.' }, () => {});
} else {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search) throw new Error('Only an unauthenticated isolated loopback MongoDB is permitted for tests');
    let connection, model, server, url, withModel;
    const token = crypto.randomBytes(32).toString('hex');
    const jwtKey = crypto.randomBytes(32).toString('hex');
    const originalToken = process.env.BETTICS_ETL_TOKEN, originalJwt = process.env.KEY_JWT;
    before(async () => {
        const app = express();
        app.use(express.json({ limit: '20mb' }));
        app.use('/api/backtest', routerModule.bodyError);
        app.use(routerModule.createRouter(createController((req, action) => withModel(req, action))));
        server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
        url = 'http://127.0.0.1:' + server.address().port;
    });
    beforeEach(async () => {
        process.env.BETTICS_ETL_TOKEN = token;
        process.env.KEY_JWT = jwtKey;
        const db = 'backtest_test_' + crypto.randomBytes(8).toString('hex');
        connection = await mongoose.createConnection(uri, { dbName: db, serverSelectionTimeoutMS: 5000, autoCreate: false, autoIndex: false }).asPromise();
        model = connection.model('backtestAprobados', schema, 'backtestAprobados');
        withModel = async (_req, action) => action(model);
    });
    afterEach(async () => {
        // Only this suite's freshly generated local synthetic DB can be removed.
        assert.match(connection.name, /^backtest_test_[a-f0-9]{16}$/);
        await connection.dropDatabase();
        await connection.close();
    });
    after(async () => {
        if (originalToken === undefined) delete process.env.BETTICS_ETL_TOKEN; else process.env.BETTICS_ETL_TOKEN = originalToken;
        if (originalJwt === undefined) delete process.env.KEY_JWT; else process.env.KEY_JWT = originalJwt;
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    });
    async function post(registros, headers = {}) {
        const response = await fetch(url + '/api/backtest/registrarMasivo', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...headers }, body: JSON.stringify({ registros })
        });
        return { status: response.status, body: await response.json() };
    }
    const summary = (received, inserted, updated, unchanged, rejected, pending = 0, unknown = 0) => ({ recibidos: received, insertados: inserted, actualizados: updated, sin_cambios: unchanged, rechazados: rejected, pendientes: pending, indeterminados: unknown });

    test('loads an approved record, replays unchanged, and updates only a changed quote', async () => {
        assert.deepEqual((await post([fixture])).body.resumen, summary(1, 1, 0, 0, 0));
        const initial = await model.findOne().lean();
        assert.deepEqual((await post([fixture])).body.resumen, summary(1, 0, 0, 1, 0));
        const replay = await model.findOne().lean();
        assert.equal(replay.updatedAt.getTime(), initial.updatedAt.getTime());
        assert.equal(replay.createdAt.getTime(), initial.createdAt.getTime());
        assert.deepEqual((await post([{ ...fixture, cuota: 1.3 }])).body.resumen, summary(1, 0, 1, 0, 0));
        assert.equal((await model.findOne()).cuota, 1.3);
        assert.equal(await model.countDocuments(), 1);
    });
    test('224 synthetic approved forecasts on 207 unique matches are repeatable', async () => {
        const records = Array.from({ length: 224 }, (_, index) => ({ ...fixture, match_id: String(8000000 + index % 207), ...(index >= 207 ? { mercado: 'GOLES_OVER_25', linea: 2.5 } : {}) }));
        assert.deepEqual((await post(records)).body.resumen, summary(224, 224, 0, 0, 0));
        assert.deepEqual((await post(records)).body.resumen, summary(224, 0, 0, 224, 0));
        assert.equal(await model.countDocuments(), 224);
        assert.equal((await model.distinct('match_id')).length, 207);
    });
    test('HOME/null is stored and replayed without conversion', async () => {
        const record = { ...fixture, mercado: 'CORNERS_LOCAL_GANA', seleccion: 'HOME', linea: null, segmento: 'N3' };
        assert.equal((await post([record])).status, 200);
        const stored = await model.findOne().lean();
        assert.equal(stored.seleccion, 'HOME'); assert.equal(stored.linea, null);
        assert.deepEqual((await post([{ ...record, linea: '' }])).body.resumen, summary(1, 0, 0, 1, 0));
    });
    test('partial validation writes valid records and reports rejected input indexes', async () => {
        const result = await post([fixture, { ...fixture, cuota: 0 }, { ...fixture, mercado: 'CORNERS_LOCAL_GANA', seleccion: 'HOME', linea: null, segmento: 'N4' }]);
        assert.equal(result.status, 207);
        assert.deepEqual(result.body.resumen, summary(3, 1, 0, 0, 2));
        assert.deepEqual(result.body.rechazos.map(item => item.indice), [1, 2]);
        assert.equal(await model.countDocuments(), 1);
    });
    test('an entirely invalid batch does not open the database', async () => {
        withModel = () => { throw new Error('Must not connect'); };
        const result = await post([{ ...fixture, cuota: null }]);
        assert.equal(result.status, 422);
        assert.deepEqual(result.body.resumen, summary(1, 0, 0, 0, 1));
    });
    test('duplicate input is counted; conflicting input is rejected without arbitrarily choosing a quote', async () => {
        assert.deepEqual((await post([fixture, fixture, fixture])).body.resumen, summary(3, 1, 0, 2, 0));
        const conflict = await post([fixture, { ...fixture, cuota: 2 }]);
        assert.equal(conflict.status, 422);
        assert.deepEqual(conflict.body.resumen, summary(2, 0, 0, 0, 2));
        assert.equal((await model.findOne()).cuota, fixture.cuota);
    });
    test('unique index prevents duplicates even outside the importer', async () => {
        await post([fixture]);
        const stored = await model.findOne().lean(); delete stored._id;
        await assert.rejects(model.collection.insertOne(stored), error => error.code === 11000);
        assert.equal(await model.countDocuments(), 1);
    });
    test('concurrent identical uploads retain one unique forecast', async () => {
        const responses = await Promise.all(Array.from({ length: 5 }, () => post([fixture])));
        assert.ok(responses.every(response => response.status === 200), JSON.stringify(responses));
        assert.equal(responses.reduce((sum, response) => sum + response.body.resumen.insertados, 0), 1);
        assert.equal(await model.countDocuments(), 1);
    });
    test('distinct policy versions, evaluation contexts and valid segments remain separate', async () => {
        const rows = [fixture, { ...fixture, version_politica: 'BETTICS_V2' }, { ...fixture, tipo_evaluacion: 'OOS' }, { ...fixture, segmento: 'N2' }];
        assert.deepEqual((await post(rows)).body.resumen, summary(4, 4, 0, 0, 0));
        assert.equal(await model.countDocuments(), 4);
    });
    test('a conflicting existing collection causes a closed failure without deleting any document', async () => {
        await model.collection.insertMany([{ ...fixture }, { ...fixture }]);
        const result = await post([fixture]);
        assert.equal(result.status, 503);
        assert.equal(result.body.codigo, 'INDICE_NO_DISPONIBLE');
        assert.deepEqual(result.body.resumen, summary(1, 0, 0, 0, 0, 1));
        assert.equal(await model.countDocuments(), 2);
    });
    test('real MongoDB unordered partial failure is reported with accurate counts', async () => {
        await connection.db.createCollection('backtestAprobados', { validator: { cuota: { $lt: 1.5 } } });
        const result = await post([fixture, { ...fixture, match_id: '999', cuota: 2 }]);
        assert.equal(result.status, 207);
        assert.deepEqual(result.body.resumen, summary(2, 1, 0, 0, 1));
        assert.equal(result.body.rechazos[0].indice, 1);
        assert.equal(await model.countDocuments(), 1);
    });
    test('an unconfirmed write reports uncertainty rather than a fabricated rejection or success', async () => {
        withModel = async (_req, action) => action({ collection: model.collection, bulkWrite: async () => { throw new Error('simulated network failure'); } });
        const result = await post([fixture]);
        assert.equal(result.status, 503);
        assert.deepEqual(result.body.resumen, summary(1, 0, 0, 0, 0, 0, 1));
    });
    test('a connection failure reports pending records without leaking internal errors', async () => {
        withModel = () => { throw new Error('fake-private-connection-detail'); };
        const result = await post([fixture]);
        assert.equal(result.status, 503);
        assert.equal(result.body.resumen.pendientes, 1);
        assert.ok(!JSON.stringify(result).includes('fake-private'));
    });
    test('ETL authentication rejects absent/invalid tokens and fails closed when unconfigured', async () => {
        withModel = () => { throw new Error('Must not connect'); };
        assert.equal((await post([fixture], { Authorization: '' })).status, 401);
        assert.equal((await post([fixture], { Authorization: 'Bearer wrong' })).status, 401);
        delete process.env.BETTICS_ETL_TOKEN;
        assert.equal((await post([fixture])).status, 503);
    });
    test('malformed JSON, wrong content type and excessive batches do not reach storage', async () => {
        withModel = () => { throw new Error('Must not connect'); };
        const badJson = await fetch(url + '/api/backtest/registrarMasivo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: '{' });
        assert.equal(badJson.status, 400);
        assert.equal((await post(Array(251).fill(fixture))).status, 413);
        assert.equal((await post([fixture], { 'Content-Type': 'text/plain' })).status, 415);
    });
    test('future Results reads only the requested version/context with user JWT, not the ETL key', async () => {
        await post([fixture, { ...fixture, version_politica: 'OTHER' }]);
        const path = '/api/backtest/aprobados?version_politica=' + fixture.version_politica + '&tipo_evaluacion=OOT';
        assert.equal((await fetch(url + path)).status, 401);
        assert.equal((await fetch(url + path, { headers: { Authorization: 'Bearer ' + token } })).status, 401);
        const authorization = 'Bearer ' + jwt.sign({ usuario: { _id: 'local-test-user' } }, jwtKey, { expiresIn: 60 });
        const response = await fetch(url + path, { headers: { Authorization: authorization } });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.total, 1); assert.deepEqual(body.registros, [fixture]);
        assert.equal((await fetch(url + '/api/backtest/aprobados', { headers: { Authorization: authorization } })).status, 400);
        assert.equal((await fetch(url + path + '&match_id[$ne]=x', { headers: { Authorization: authorization } })).status, 400);
    });
    test('read-only audit verifies the local DB/index without creating a collection or changing forecasts', async () => {
        const { auditConnection } = require('../scripts/audit-backtest-environment');
        const before = await auditConnection(connection, connection.name);
        assert.equal(before.expected_database_matches, true);
        assert.equal(before.mongo_pipeline_updates_supported, true);
        assert.equal(before.collection_exists, false);
        assert.equal((await auditConnection(connection, 'different_expected_database')).expected_database_matches, false);
        await post([fixture]);
        const report = await auditConnection(connection, connection.name);
        assert.equal(report.collection_exists, true);
        assert.equal(report.unique_identity_index_present, true);
        assert.equal(report.approved_records, 1);
        assert.equal(await model.countDocuments(), 1);
    });

}
