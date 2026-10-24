const { FIELDS, UNIQUE_KEY, plain, validateRecord, keyOf, identityOf, hashOf } = require('./contract');
const MAX_BATCH = 250;
class BacktestError extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function prepareBatch(body) {
    if (!plain(body) || Object.keys(body).length !== 1 || !Array.isArray(body.registros) || !body.registros.length) throw new BacktestError(400, 'LOTE_INVALIDO', 'Se requiere únicamente registros, con un arreglo JSON no vacío.');
    if (body.registros.length > MAX_BATCH) throw new BacktestError(413, 'LOTE_EXCESIVO', 'El máximo es 250 registros por lote.');
    const rejected = [], groups = new Map();
    body.registros.forEach((input, indice) => {
        const { row, errors } = validateRecord(input);
        if (errors.length) { rejected.push({ indice, codigo: 'REGISTRO_INVALIDO', errores: errors }); return; }
        const identity = identityOf(row), hash = hashOf(row);
        if (!groups.has(identity)) groups.set(identity, { row, hash, indices: [] });
        const group = groups.get(identity);
        group.indices.push(indice);
        if (hash !== group.hash) group.conflict = true;
    });
    const valid = [];
    for (const group of groups.values()) {
        if (group.conflict) for (const indice of group.indices) rejected.push({ indice, codigo: 'CLAVE_DUPLICADA_CON_DATOS_DISTINTOS' });
        else valid.push(group);
    }
    return { received: body.registros.length, groups: valid, rejected };
}
function operation(group, upsert = true) {
    const values = Object.fromEntries(FIELDS.map(field => [field, { $literal: group.row[field] }]));
    return { updateOne: {
        filter: keyOf(group.row), upsert,
        update: [{ $set: {
            ...values,
            payload_hash: { $literal: group.hash },
            createdAt: { $ifNull: ['$createdAt', '$$NOW'] },
            updatedAt: { $cond: [
                { $ne: [{ $ifNull: ['$payload_hash', null] }, { $literal: group.hash }] }, '$$NOW', '$updatedAt'
            ] }
        } }]
    } };
}
function counts(result) {
    if (!result) return null;
    const metrics = { inserted: result.upsertedCount, matched: result.matchedCount, modified: result.modifiedCount };
    return Object.values(metrics).every(value => Number.isSafeInteger(value) && value >= 0) && metrics.modified <= metrics.matched ? metrics : null;
}
function knownPartial(error, length) {
    const result = counts(error.result), errors = error.writeErrors;
    if (!result || !Array.isArray(errors) || !errors.length || error.writeConcernErrors && error.writeConcernErrors.length) return null;
    if (error.result.getWriteConcernError && error.result.getWriteConcernError()) return null;
    const indexes = errors.map(item => item.index);
    if (new Set(indexes).size !== errors.length || !indexes.every(index => Number.isInteger(index) && index >= 0 && index < length)) return null;
    if (result.inserted + result.matched + errors.length !== length) return null;
    return { result, errors };
}
async function writeGroups(model, groups) {
    try {
        const result = counts(await model.bulkWrite(groups.map(group => operation(group)), { ordered: false }));
        if (!result || result.inserted + result.matched !== groups.length) throw new Error('Unconfirmed bulk result');
        return { result, errors: [] };
    } catch (error) {
        const partial = knownPartial(error, groups.length);
        if (!partial) throw error;
        if (partial.errors.every(item => item.code === 11000)) {
            // A concurrent importer may have inserted the same unique identity.
            // Update only those existing rows once; never insert an alternative key.
            const retry = counts(await model.bulkWrite(partial.errors.map(item => operation(groups[item.index], false)), { ordered: false }));
            if (!retry || retry.inserted !== 0 || retry.matched !== partial.errors.length) throw new Error('Unconfirmed concurrent upsert');
            return { result: {
                inserted: partial.result.inserted,
                matched: partial.result.matched + retry.matched,
                modified: partial.result.modified + retry.modified
            }, errors: [] };
        }
        return partial;
    }
}
function initialSummary(batch) {
    return { recibidos: batch.received, insertados: 0, actualizados: 0, sin_cambios: 0, rechazados: batch.rejected.length, pendientes: 0, indeterminados: 0 };
}
async function ingest(model, batch) {
    const resumen = initialSummary(batch), rechazos = [...batch.rejected];
    if (!batch.groups.length) return { status: 422, body: { estado: 'rechazado', resumen, rechazos } };
    try {
        // Fail closed if the unique index cannot be established. No dropping,
        // deleting, migrating or rewriting any pre-existing collection.
        await model.collection.createIndex(UNIQUE_KEY, { name: 'backtest_aprobados_identity_v1', unique: true });
        await model.collection.createIndex({ version_politica: 1, tipo_evaluacion: 1, fecha_partido: 1 });
    } catch (_) {
        resumen.pendientes = batch.groups.reduce((total, group) => total + group.indices.length, 0);
        return { status: 503, body: { estado: 'error', codigo: 'INDICE_NO_DISPONIBLE', resumen, rechazos, reintento_seguro: true } };
    }
    try {
        const { result, errors } = await writeGroups(model, batch.groups);
        const failed = new Set(errors.map(error => error.index));
        const repeated = batch.groups.reduce((total, group, index) => total + (failed.has(index) ? 0 : group.indices.length - 1), 0);
        resumen.insertados = result.inserted;
        resumen.actualizados = result.modified;
        resumen.sin_cambios = result.matched - result.modified + repeated;
        for (const error of errors) for (const indice of batch.groups[error.index].indices) rechazos.push({ indice, codigo: 'ESCRITURA_RECHAZADA' });
        resumen.rechazados = rechazos.length;
        return { status: rechazos.length ? 207 : 200, body: { estado: rechazos.length ? 'parcial' : 'ok', resumen, rechazos } };
    } catch (_) {
        // A network/write-concern failure can happen after MongoDB wrote data.
        // Do not report those records as rejected, inserted, or unchanged.
        resumen.indeterminados = batch.groups.reduce((total, group) => total + group.indices.length, 0);
        return { status: 503, body: { estado: 'error', codigo: 'ESCRITURA_NO_CONFIRMADA', resumen, rechazos, reintento_seguro: true } };
    }
}
module.exports = { MAX_BATCH, BacktestError, prepareBatch, operation, counts, initialSummary, ingest };
