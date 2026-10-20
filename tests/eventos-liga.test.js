const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const cacheKey = 'eventosliga_maestros_eventosLigaProb';
const fixture = [
    { strLeague: 'Liga A', strSeason: '2023-2024', idHomeTeam: '1', strHomeTeam: 'Local', idAwayTeam: '2', strAwayTeam: 'Visitante', dateEvent: '2023-08-11', intHomeScore: 1, intAwayScore: 2, cornerKicksHome: 3, cornerKicksAway: 7, activo: true },
    { strLeague: 'Liga A', strSeason: '2024-2025', idHomeTeam: '2', strHomeTeam: 'Visitante', idAwayTeam: '1', strAwayTeam: 'Local', dateEvent: '2024-08-11', intHomeScore: 0, intAwayScore: 1, activo: true },
    { strLeague: 'Liga oculta', strSeason: '2024-2025', idHomeTeam: '3', idAwayTeam: '4', activo: false }
];
const plain = value => JSON.parse(JSON.stringify(value));

function matches(row, filter) {
    return Object.entries(filter).every(([key, value]) => {
        if (key === '$and') return value.every(item => matches(row, item));
        if (key === '$or') return value.some(item => matches(row, item));
        if (value && value.$in) return value.$in.includes(row[key]);
        return row[key] === value;
    });
}

function harness({ rows = fixture, cached = [], user = { tipoLicencia: 'gratis' } } = {}) {
    const data = { eventosLiga: [{ ...fixture[0], strLeague: 'Liga histórica' }], eventosLigaProb: rows };
    const cache = new Map(cached);
    const reads = [], writes = [], cacheWrites = [];
    let closed = 0;
    const conn = { close() { closed++; } };
    const controller = { exports: {}, console: { log() {} }, require(name) {
        if (name === '../config/connection') return {
            conectionManager: () => conn,
            getModel(connection, collection) {
                assert.equal(connection, conn);
                if (collection === 'usuario') return { findById: () => ({ select: async () => user }) };
                const current = () => data[collection];
                return {
                    async distinct(field, filter) {
                        reads.push(collection);
                        return [...new Set(current().filter(row => matches(row, filter)).map(row => row[field]))];
                    },
                    async aggregate(stages) {
                        reads.push(collection);
                        const group = stages[1].$group._id;
                        const groups = current().filter(row => matches(row, stages[0].$match)).map(row => ({ _id: Object.fromEntries(Object.entries(group).map(([key, field]) => [key, row[field.slice(1)]])) }));
                        return [...new Map(groups.map(row => [JSON.stringify(row), row])).values()];
                    },
                    find(filter) {
                        reads.push(collection);
                        return { select: () => ({ sort: async () => current().filter(row => matches(row, filter)).slice().sort((a, b) => b.dateEvent.localeCompare(a.dateEvent)) }) };
                    },
                    async deleteMany() { writes.push(['delete', collection]); data[collection] = []; },
                    async insertMany(input) { writes.push(['insert', collection]); data[collection] = input; return input; }
                };
            }
        };
        if (name === '../config/constantes') return { SchemaName: { eventosLiga: 'eventosLiga', eventosLigaProb: 'eventosLigaProb', usuario: 'usuario' }, cacheController: { eventosLiga: { maestros: 'eventosliga_maestros_' } } };
        if (name === '../shared/cache-provider') return { instance: () => ({ get: key => cache.get(key), set(key, value, ttl) { cache.set(key, value); cacheWrites.push({ key, value, ttl }); }, del: key => cache.delete(key) }) };
        if (name === '../middleware/errors') return error => { throw error; };
        if (name === 'bcryptjs' || name === '../shared/util') return {};
        throw new Error(`Unexpected dependency ${name}`);
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/controllers/eventosLiga.js'), 'utf8'), controller);
    return { data, cache, reads, writes, cacheWrites, get closed() { return closed; }, async call(handler, query = {}, body) {
        let result, status = 200;
        const res = { send(value) { result = value; }, json(value) { result = value; }, sendStatus(value) { status = value; }, status(value) { status = value; return res; } };
        await controller.exports[handler]({ query, body, usuarioConectado: { _id: 'test-user' } }, res, () => {});
        return { status, body: plain(result ?? null) };
    } };
}

test('loads active ETL leagues instead of historical leagues and ignores legacy cache', async () => {
    const h = harness({ cached: [['eventosliga_maestros_', []], ['eventosliga_maestros_eventosLiga', ['Liga histórica']]] });
    assert.deepEqual((await h.call('getMaestros')).body, { resStatus: 'ok', strLeague: ['Liga A'] });
    assert.deepEqual(h.reads, ['eventosLigaProb']);
    assert.deepEqual(h.writes, []);
    assert.equal(h.cacheWrites[0].key, cacheKey);
    assert.equal(h.cacheWrites[0].ttl, 300);
    assert.equal(h.closed, 1);
});

test('does not retain empty lists; a later ETL insert is immediately visible', async () => {
    const h = harness({ rows: [], cached: [[cacheKey, []]] });
    assert.deepEqual((await h.call('getMaestros')).body.strLeague, []);
    assert.equal(h.cacheWrites.length, 0);
    h.data.eventosLigaProb.push(fixture[0]);
    assert.deepEqual((await h.call('getMaestros')).body.strLeague, ['Liga A']);
});

test('reuses a nonempty source-specific cache and refreshes when it expires', async () => {
    const h = harness({ cached: [[cacheKey, ['Liga cacheada']]] });
    assert.deepEqual((await h.call('getMaestros')).body.strLeague, ['Liga cacheada']);
    assert.equal(h.reads.length, 0);
    h.cache.delete(cacheKey); // Simulate expiry; no real clock or external cache.
    assert.deepEqual((await h.call('getMaestros')).body.strLeague, ['Liga A']);
});

test('returns seasons and grouped teams from the same ETL collection', async () => {
    const h = harness();
    assert.deepEqual((await h.call('getTemporadas', { strLeague: 'Liga A' })).body.strSeason, ['2023-2024', '2024-2025']);
    const result = (await h.call('getEquipos', { strLeague: 'Liga A', strSeason: '2023-2024' })).body;
    assert.deepEqual(result.strHomeTeam, [{ _id: { strHomeTeam: 'Local', idHomeTeam: '1' } }]);
    assert.deepEqual(result.strAwayTeam, [{ _id: { strAwayTeam: 'Visitante', idAwayTeam: '2' } }]);
    assert.ok(h.reads.every(collection => collection === 'eventosLigaProb'));
    assert.deepEqual(h.writes, []);
});

test('historical detail preserves season/team filtering and returns scores and corners', async () => {
    const h = harness();
    const result = (await h.call('getCriterio', { strLeague: 'Liga A', strSeason: '2023-2024', idHomeTeam: '1', idAwayTeam: '2' })).body;
    for (const key of ['partidosLosDosEquipos', 'ultimos6Home', 'ultimos6Away', 'soloLocal', 'soloVisita']) {
        assert.equal(result[key].length, 1);
        assert.equal(result[key][0].intHomeScore, 1);
        assert.equal(result[key][0].cornerKicksAway, 7);
    }
    assert.ok(h.reads.every(collection => collection === 'eventosLigaProb'));
    assert.deepEqual(h.writes, []);
    const allSeasons = (await h.call('getCriterio', { strLeague: 'Liga A', strSeason: 'null', idHomeTeam: '1', idAwayTeam: '2' })).body;
    assert.equal(allSeasons.partidosLosDosEquipos.length, 2);
});

test('membership requirement still runs before reading data or cached leagues', async () => {
    const h = harness({ user: {}, cached: [[cacheKey, ['Liga A']]] });
    const result = await h.call('getMaestros');
    assert.match(result.body.resStatus, /membresía/);
    assert.deepEqual(h.reads, []);
    assert.equal(h.closed, 1);
});

test('missing user still returns 404', async () => {
    const h = harness({ user: null });
    assert.equal((await h.call('getMaestros')).status, 404);
    assert.deepEqual(h.reads, []);
});

test('legacy import destination remains unchanged; no migration or historical writes', async () => {
    const h = harness({ cached: [[cacheKey, ['Liga anterior']]] });
    await h.call('insertDataMasivo', {}, [{ strLeague: 'Import fixture' }]);
    assert.deepEqual(h.writes, [['delete', 'eventosLigaProb'], ['insert', 'eventosLigaProb']]);
    assert.equal(h.data.eventosLiga.length, 1);
    assert.equal(h.cache.has(cacheKey), false);
});
