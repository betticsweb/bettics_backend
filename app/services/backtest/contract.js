const crypto = require('crypto');
const FIELDS = Object.freeze(['match_id', 'fecha_partido', 'liga', 'temporada', 'mercado', 'periodo', 'seleccion', 'linea', 'segmento', 'cuota', 'version_politica', 'tipo_evaluacion']);
const KEY_FIELDS = Object.freeze(['match_id', 'mercado', 'periodo', 'segmento', 'version_politica', 'tipo_evaluacion']);
const UNIQUE_KEY = Object.freeze(Object.fromEntries(KEY_FIELDS.map(field => [field, 1])));
const MARKETS = Object.freeze({
    CORNERS_OVER_85: { seleccion: 'OVER', linea: 8.5, segmentos: ['N1', 'N2', 'N3', 'N4'] },
    CORNERS_UNDER_105: { seleccion: 'UNDER', linea: 10.5, segmentos: ['N1', 'N2', 'N3', 'N4'] },
    GOLES_OVER_25: { seleccion: 'OVER', linea: 2.5, segmentos: ['N1', 'N2', 'N3'] },
    CORNERS_LOCAL_GANA: { seleccion: 'HOME', linea: null, segmentos: ['N1', 'N2', 'N3'] }
});
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function validateRecord(input) {
    const errors = [];
    if (!plain(input)) return { errors: [{ campo: 'registro', mensaje: 'Debe ser un objeto JSON.' }] };
    const row = {};
    const invalid = (campo, mensaje) => errors.push({ campo, mensaje });
    for (const key of Object.keys(input)) if (!FIELDS.includes(key)) invalid(key, 'Campo no permitido.');
    for (const field of FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(input, field) && !(field === 'linea' && input.mercado === 'CORNERS_LOCAL_GANA')) invalid(field, 'Campo requerido.');
        row[field] = typeof input[field] === 'string' ? input[field].trim() : input[field];
    }
    if (typeof row.match_id === 'number' && Number.isSafeInteger(row.match_id) && row.match_id > 0) row.match_id = String(row.match_id);
    if (typeof row.match_id !== 'string' || !/^[1-9]\d{0,31}$/.test(row.match_id)) invalid('match_id', 'Debe ser un identificador entero positivo, sin pérdida de precisión.');
    if (typeof row.fecha_partido !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.fecha_partido) || !Number.isFinite(Date.parse(row.fecha_partido + 'T00:00:00Z')) || new Date(row.fecha_partido + 'T00:00:00Z').toISOString().slice(0, 10) !== row.fecha_partido) invalid('fecha_partido', 'Fecha de calendario válida YYYY-MM-DD requerida.');
    if (typeof row.liga !== 'string' || !row.liga || row.liga.length > 200) invalid('liga', 'Texto no vacío de hasta 200 caracteres requerido.');
    if (typeof row.temporada === 'number' && Number.isSafeInteger(row.temporada)) row.temporada = String(row.temporada);
    if (typeof row.temporada !== 'string' || !row.temporada || row.temporada.length > 32) invalid('temporada', 'Texto no vacío de hasta 32 caracteres requerido.');
    const market = typeof row.mercado === 'string' && Object.prototype.hasOwnProperty.call(MARKETS, row.mercado) ? MARKETS[row.mercado] : null;
    if (!market) invalid('mercado', 'Mercado no permitido.');
    if (row.periodo !== 'FT') invalid('periodo', 'Solo se admite FT; no se infieren datos por tiempo.');
    if (market && row.seleccion !== market.seleccion) invalid('seleccion', 'Selección incompatible con el mercado.');
    if (row.mercado === 'CORNERS_LOCAL_GANA' && (row.linea === '' || row.linea === undefined)) row.linea = null;
    if (market && row.linea !== market.linea) invalid('linea', 'Línea incompatible con el mercado; HOME requiere null.');
    if (market && !market.segmentos.includes(row.segmento)) invalid('segmento', 'Segmento no permitido para este mercado.');
    if (typeof row.cuota !== 'number' || !Number.isFinite(row.cuota) || row.cuota <= 1) invalid('cuota', 'Cuota decimal numérica, finita y mayor que 1 requerida.');
    for (const field of ['version_politica', 'tipo_evaluacion']) {
        if (typeof row[field] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(row[field])) invalid(field, 'Identificador no vacío de hasta 100 caracteres requerido.');
    }
    return { row, errors };
}
const keyOf = row => Object.fromEntries(KEY_FIELDS.map(field => [field, row[field]]));
const identityOf = row => JSON.stringify(KEY_FIELDS.map(field => row[field]));
const hashOf = row => crypto.createHash('sha256').update(JSON.stringify(FIELDS.map(field => row[field]))).digest('hex');
module.exports = { FIELDS, KEY_FIELDS, UNIQUE_KEY, MARKETS, plain, validateRecord, keyOf, identityOf, hashOf };
