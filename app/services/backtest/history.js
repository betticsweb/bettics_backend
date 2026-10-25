'use strict';

const SCORE_FIELDS = ['intHomeScore', 'intAwayScore', 'cornerKicksHome', 'cornerKicksAway'];
const STATUS_FIELDS = ['strStatus', 'status', 'statusShort', 'match_status', 'estado'];
const ID_FIELDS = ['idEvent', 'match_id', 'id'];
const METADATA_FIELDS = ['dateEvent', 'strLeague', 'strSeason', 'strHomeTeam', 'strAwayTeam'];
const plainField = /^[A-Za-z][A-Za-z0-9_]{0,70}$/;

function normalizeId(value) {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
    if (value && value._bsontype === 'Long') value = value.toString();
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!/^\d{1,32}(?:\.0+)?$/.test(text)) return null;
    const id = BigInt(text.split('.')[0]);
    return id > 0n ? String(id) : null;
}
function normalizeScore(value) {
    if (typeof value === 'string' && /^\d+(?:\.0+)?$/.test(value.trim())) value = Number(value.trim());
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function normalizeText(value) {
    return typeof value === 'string' ? value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ') : '';
}
function normalizeDate(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(text)) return null;
    const calendar = new Date(text.slice(0, 10));
    if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== text.slice(0, 10)) return null;
    const date = new Date(text);
    if (!Number.isFinite(date.getTime())) return null;
    if (text.length === 10 && date.toISOString().slice(0, 10) !== text) return null;
    return date.toISOString().slice(0, 10);
}
function statusOf(row) {
    const statuses = [row.__status, ...STATUS_FIELDS.map(field => row[field])].filter(value => value !== undefined && value !== null && value !== '');
    const codes = new Set(statuses.map(value => {
        const code = normalizeText(value);
        if (['ft', 'complete', 'completed', 'finished', 'match finished', 'full time', 'finalizado'].includes(code)) return 'FT';
        return code || 'unknown';
    }));
    if (codes.size > 1) return 'CONFLICT';
    return codes.size ? [...codes][0] : null;
}
function normalizeMatch(row) {
    const result = { ...row, dateEvent: normalizeDate(row.dateEvent), strLeague: normalizeText(row.strLeague), __status: statusOf(row) };
    for (const field of SCORE_FIELDS) result[field] = normalizeScore(row[field]);
    return result;
}
function reconcileCandidates(prediction, rows) {
    if (!rows.length) return { code: 'sin_cruce', reason: 'Sin resultado asociado' };
    const matches = rows.map(normalizeMatch).filter(row => row.dateEvent === normalizeDate(prediction.fecha_partido) && row.strLeague === normalizeText(prediction.liga));
    if (!matches.length) return { code: 'metadatos_no_coinciden', reason: 'Liga o fecha sin conciliar', details: { esperado: { liga: prediction.liga, fecha: prediction.fecha_partido }, historicos: rows.slice(0, 5).map(row => ({ liga: row.strLeague ?? null, fecha: normalizeDate(row.dateEvent) })) } };
    if (matches.some(row => row.__idConflict)) return { code: 'identificadores_contradictorios', reason: 'Identificadores históricos contradictorios' };
    // Duplicate snapshots may contribute missing fields, but contradictory evidence never wins by order.
    const merged = { ...matches[0] };
    for (const field of [...SCORE_FIELDS, '__status', 'strHomeTeam', 'strAwayTeam']) {
        const values = matches.map(row => row[field]).filter(value => value !== null && value !== undefined && value !== '');
        const distinct = new Set(values.map(value => ['strHomeTeam', 'strAwayTeam'].includes(field) ? normalizeText(value) : value));
        if (distinct.size > 1) return { code: 'cruce_ambiguo', reason: 'Cruce ambiguo: históricos contradictorios' };
        merged[field] = values.length ? values[0] : null;
    }
    merged.__finalFieldsConfirmed = matches.some(row => row.__finalFieldsConfirmed === true);
    merged.__confirmedFields = Object.fromEntries(SCORE_FIELDS.map(field => [field, matches.some(row =>
        row[field] !== null && row[field] === merged[field] &&
        (row.__status === 'FT' || !row.__status && row.__finalFieldsConfirmed === true)
    )]));
    merged.__sources = [...new Set(matches.flatMap(row => row.__sources || []))];
    return { match: merged, duplicates: matches.length - 1 };
}
function sourceConfiguration(env = {}) {
    const primary = env.BETTICS_RESULTS_COLLECTION || 'eventosLigaProb';
    const sources = env.BETTICS_RESULTS_COLLECTION ? [primary] : ['eventosLigaProb', 'eventosLiga'];
    const ids = env.BETTICS_RESULTS_ID_FIELD ? [env.BETTICS_RESULTS_ID_FIELD] : ID_FIELDS;
    const statuses = [...new Set([...STATUS_FIELDS, ...(env.BETTICS_RESULTS_STATUS_FIELD ? [env.BETTICS_RESULTS_STATUS_FIELD] : [])])];
    if (![...sources, ...ids, ...statuses].every(value => plainField.test(value))) throw Error('Invalid source mapping');
    const confirmedSources = (env.BETTICS_RESULTS_FINAL_FIELDS_CONFIRMED || '').split(',').map(s => s.trim()).filter(Boolean);
    if (confirmedSources.some(source => !sources.includes(source))) throw Error('Invalid confirmed source');
    const drawRule = env.BETTICS_RESULTS_HOME_CORNERS_DRAW_RULE || 'pending';
    if (!['pending', 'loss', 'void'].includes(drawRule)) throw Error('Invalid home corners draw rule');
    return { primary, sources, ids, statuses, confirmedSources, drawRule };
}
async function readHistory(db, predictions, config, maxRows = 1000000) {
    const wanted = new Set(predictions.map(p => normalizeId(p.match_id)).filter(Boolean));
    const matches = new Map();
    const diagnostics = { alcance: 'todos_los_aprobados_OOT_cargados_en_cache', estrategia: 'lectura_proyectada_en_stream_por_coleccion', ids_aprobados_validos: wanted.size, ids_aprobados_invalidos: predictions.filter(p => !normalizeId(p.match_id)).length, fuentes: {} };
    const projection = Object.fromEntries([...new Set([...config.ids, ...config.statuses, ...SCORE_FIELDS, ...METADATA_FIELDS])].map(field => [field, 1]));
    projection._id = 0;
    for (const source of config.sources) {
        const info = { registros_leidos: 0, registros_con_id_aprobado: 0, campos: {}, campos_coincidentes: {}, estados_coincidentes: {}, claves_con_coincidencia: {}, marcadores_finales_confirmados_por_contrato: config.confirmedSources.includes(source) };
        const cursor = db.collection(source).find({}, { projection }).limit(maxRows + 1).maxTimeMS(30000);
        // A single projected stream avoids repeated collection scans when legacy IDs have no index.
        for await (const raw of cursor) {
            if (++info.registros_leidos > maxRows) throw Error('Historical source limit exceeded');
            for (const field of Object.keys(projection).filter(field => field !== '_id')) {
                if (!Object.hasOwn(raw, field)) continue;
                const type = raw[field] === null ? 'null' : raw[field] instanceof Date ? 'date' : typeof raw[field];
                info.campos[field] ||= {};
                info.campos[field][type] = (info.campos[field][type] || 0) + 1;
            }
            const ids = [...new Set(config.ids.map(field => normalizeId(raw[field])).filter(id => wanted.has(id)))];
            if (!ids.length) continue;
            info.registros_con_id_aprobado++;
            for (const field of Object.keys(projection).filter(field => field !== '_id')) {
                if (!Object.hasOwn(raw, field)) continue;
                const type = raw[field] === null ? 'null' : raw[field] instanceof Date ? 'date' : typeof raw[field];
                info.campos_coincidentes[field] ||= {};
                info.campos_coincidentes[field][type] = (info.campos_coincidentes[field][type] || 0) + 1;
            }
            for (const field of config.ids) if (ids.includes(normalizeId(raw[field]))) info.claves_con_coincidencia[field] = (info.claves_con_coincidencia[field] || 0) + 1;
            const row = { ...raw, __sources: [source], __idConflict: ids.length > 1, __finalFieldsConfirmed: config.confirmedSources.includes(source) };
            if (config.statuses.length) row.__status = statusOf({ ...raw, ...Object.fromEntries(config.statuses.filter(f => raw[f] !== undefined).map(f => [STATUS_FIELDS.includes(f) ? f : '__status', raw[f]])) });
            const observedStatus = row.__status;
            const category = !observedStatus ? 'ausente' : observedStatus === 'FT' ? 'final' : observedStatus === 'CONFLICT' ? 'contradictorio' : 'no_final_o_desconocido';
            info.estados_coincidentes[category] = (info.estados_coincidentes[category] || 0) + 1;
            for (const id of ids) {
                if (!matches.has(id)) matches.set(id, []);
                if (matches.get(id).length >= 100) throw Error('Historical duplicate limit exceeded');
                matches.get(id).push(row);
            }
        }
        info.claves_presentes = config.ids.filter(field => info.campos[field]);
        info.sin_clave_reconocida = !info.claves_presentes.length;
        info.campos_necesarios_ausentes = [...SCORE_FIELDS, 'dateEvent', 'strLeague'].filter(field => !info.campos[field]);
        info.campos_estado_presentes = config.statuses.filter(field => info.campos[field]);
        diagnostics.fuentes[source] = info;
    }
    diagnostics.ids_con_alguna_coincidencia = matches.size;
    return { matches, diagnostics };
}
module.exports = { SCORE_FIELDS, STATUS_FIELDS, normalizeId, normalizeScore, normalizeText, normalizeDate, statusOf, reconcileCandidates, sourceConfiguration, readHistory };
