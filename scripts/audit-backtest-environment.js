/* Read-only audit, runnable through stdin in an existing Heroku dyno.
 * Does not register models, create collections/indexes, or write documents.
 * Never prints config values, credentials, URIs, hosts or sample records.
 */
const KEY = { match_id: 1, mercado: 1, periodo: 1, segmento: 1, version_politica: 1, tipo_evaluacion: 1 };
async function auditConnection(connection, expectedDatabase) {
    if (!expectedDatabase) throw new Error('An independently confirmed expected database name is required');
    const db = connection.db;
    const info = await db.admin().command({ buildInfo: 1 });
    const version = String(info.version).split('.').map(Number);
    const exists = await db.listCollections({ name: 'backtestAprobados' }, { nameOnly: true }).hasNext();
    const result = {
        database: db.databaseName, expected_database_matches: db.databaseName === expectedDatabase,
        mongo_pipeline_updates_supported: version[0] > 4 || version[0] === 4 && version[1] >= 2,
        collection_exists: exists, unique_identity_index_present: false, approved_records: 0
    };
    if (exists) {
        const collection = db.collection('backtestAprobados');
        const indexes = await collection.listIndexes().toArray();
        result.unique_identity_index_present = indexes.some(index => index.unique === true && JSON.stringify(index.key) === JSON.stringify(KEY));
        result.approved_records = await collection.countDocuments({});
    }
    return result;
}
async function main() {
    const expected = process.env.BACKTEST_EXPECTED_DB_NAME || process.argv[2];
    if (!expected) throw new Error('Pass the independently confirmed expected database name');
    const { conectionManager } = require(require('path').join(process.cwd(), 'app/config/connection'));
    const connection = conectionManager({});
    if (!connection) throw new Error('Connection configuration unavailable');
    try {
        await connection.asPromise();
        const report = await auditConnection(connection, expected);
        console.log(JSON.stringify({
            app_metadata: process.env.HEROKU_APP_NAME || null,
            commit_metadata: process.env.HEROKU_SLUG_COMMIT || null,
            environment_presence: Object.fromEntries(['USR_NAME', 'PSS_WORD', 'CLU', 'BETTICS_ETL_TOKEN'].map(key => [key, Boolean(process.env[key])])),
            ...report
        }, null, 2));
        if (!report.expected_database_matches || !report.mongo_pipeline_updates_supported) process.exitCode = 1;
    } finally {
        await connection.close().catch(() => {});
    }
}
module.exports = { auditConnection };
if (!module.parent) main().catch(() => { console.error('Read-only backtest environment verification failed; no data was changed.'); process.exitCode = 1; });
