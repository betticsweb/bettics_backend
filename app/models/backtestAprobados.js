const { configured } = require('../services/backtest/market-policies');
const { Schema } = require('mongoose');
const { MARKETS, UNIQUE_KEY, FIELDS, validateRecord } = require('../services/backtest/contract');
const schema = new Schema({
    match_id: { type: String, required: true }, fecha_partido: { type: String, required: true },
    liga: { type: String, required: true }, temporada: { type: String, required: true },
    mercado: { type: String, enum: [...Object.keys(MARKETS), ...configured.map(r => r.mercado)], required: true },
    periodo: { type: String, enum: ['FT', 'HT'], required: true },
    seleccion: { type: String, enum: ['OVER', 'UNDER', 'HOME', 'AWAY', 'YES', 'NO'], required: true },
    linea: { type: Number, default: null }, segmento: { type: String, enum: ['N1', 'N2', 'N3', 'N4'], required: true },
    cuota: { type: Number, required: true, validate: value => Number.isFinite(value) && value > 1 },
    version_politica: { type: String, required: true }, tipo_evaluacion: { type: String, required: true },
    payload_hash: { type: String, required: true }, createdAt: Date, updatedAt: Date
}, {
    collection: 'backtestAprobados', strict: 'throw', versionKey: false,
    autoIndex: false, autoCreate: false, bufferCommands: false
});
schema.index(UNIQUE_KEY, { name: 'backtest_aprobados_identity_v1', unique: true });
schema.index({ version_politica: 1, tipo_evaluacion: 1, fecha_partido: 1 });
schema.pre('validate', function(next) {
    const input = Object.fromEntries(FIELDS.map(field => [field, this[field]]));
    for (const error of validateRecord(input).errors) this.invalidate(error.campo, error.mensaje);
    next();
});
// Timestamps are set atomically by the ingestion pipeline, not automatically on
// every retry; an identical replay must remain a true no-op in MongoDB.
module.exports = schema;
