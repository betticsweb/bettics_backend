'use strict';
const { MARKETS } = require('./contract');
const { additionalMarket, configured } = require('./market-policies');
const { normalizeId, reconcileCandidates } = require('./history');
const number = x => typeof x === 'number' && Number.isFinite(x);
const score = x => number(x) && Number.isInteger(x) && x >= 0;
function settle(p, matches, policy = {}) {
    const pending = (code, reason, extra = {}) => ({ ...p, estado: 'pendiente', cruce_confirmado: false, ...extra, codigo_pendiente: code, motivo: reason, ganancia: null, unidades: 0 });
    const market = Object.hasOwn(MARKETS, p.mercado) ? MARKETS[p.mercado] : additionalMarket(p.mercado, p.version_politica, policy.markets);
    if (!market || p.periodo !== (market.periodo || 'FT') || p.seleccion !== market.seleccion || p.linea !== market.linea || !market.segmentos.includes(p.segmento) || !number(p.cuota) || p.cuota <= 1) return pending('pronostico_invalido', 'Pronóstico no evaluable');
    const linked = reconcileCandidates(p, matches);
    if (!linked.match) return pending(linked.code, linked.reason, linked.details ? { detalle_conciliacion: linked.details } : {});
    const m = linked.match;
    const display = { cruce_confirmado: true, partido: [m.strHomeTeam, m.strAwayTeam].filter(Boolean).join(' — '), fuentes_resultado: m.__sources };
    // No HT fields have been verified in the historical source. Never fall back to FT.
    if (p.periodo === 'HT') return pending('ht_no_disponible', 'No hay marcadores HT verificados en las fuentes históricas', display);
    const status = m.__status;
    if (status && status !== 'FT') return pending('estado_no_evaluable', 'Estado no final, contradictorio o liquidación sin confirmar', display);
    // Status-less legacy fields require an explicit source contract, never just an old date or a nonzero score.
    if (!status && !m.__finalFieldsConfirmed) return pending('final_no_confirmado', 'Falta estado final o confirmación del contrato de marcadores históricos', display);
    const fields = (p.mercado === 'GOLES_OVER_25' || ['BTTS', 'FT_WINNER'].includes(market.family)) ? ['intHomeScore', 'intAwayScore'] : ['cornerKicksHome', 'cornerKicksAway'];
    const [h, a] = fields.map(f => m[f]);
    if (!score(h) || !score(a)) return pending('marcador_invalido', 'Marcador ausente o inválido: ' + fields.filter(f => !score(m[f])).join(', '), display);
    if (fields.some(field => !m.__confirmedFields[field])) return pending('marcador_final_no_confirmado', 'Sin confirmación final para: ' + fields.filter(field => !m.__confirmedFields[field]).join(', '), display);
    const row = { ...p, ...display, marcador: `${h}–${a}`, confirmacion_resultado: status ? 'estado_final' : 'contrato_historico_confirmado' };
    if (p.mercado === 'CORNERS_LOCAL_GANA' && h === a) {
        if (policy.drawRule === 'void') return { ...row, estado: 'anulado', motivo: 'Empate: devolución según regla confirmada', ganancia: 0, unidades: 0 };
        if (policy.drawRule !== 'loss') return pending('empate_sin_regla', 'Empate en córners: liquidación sin confirmar', display);
    }
    if (market.family === 'FT_WINNER' && h === a) {
        if (market.drawRule === 'void') return { ...row, estado: 'anulado', motivo: 'Empate: devolución según política verificada', ganancia: 0, unidades: 0 };
        if (market.drawRule !== 'loss') return pending('empate_sin_regla', 'Empate: liquidación sin confirmar', display);
    }
    const win = market.family === 'BTTS' ? (p.seleccion === 'YES' ? h > 0 && a > 0 : h === 0 || a === 0) : market.family === 'FT_WINNER' ? (p.seleccion === 'HOME' ? h > a : a > h) : p.mercado === 'CORNERS_OVER_85' ? h + a >= 9 : p.mercado === 'CORNERS_UNDER_105' ? h + a <= 10 : p.mercado === 'GOLES_OVER_25' ? h + a >= 3 : h > a;
    return { ...row, estado: win ? 'acierto' : 'fallo', motivo: '', ganancia: win ? p.cuota - 1 : -1, unidades: 1 };
}
function metrics(rows) {
    const resolved = rows.filter(r => r.unidades === 1);
    const voids = rows.filter(r => r.estado === 'anulado').length;
    const gain = resolved.reduce((s, r) => s + r.ganancia, 0);
    const wins = resolved.filter(r => r.estado === 'acierto').length;
    const odds = rows.filter(r => number(r.cuota) && r.cuota > 1);
    return {
        aprobados: rows.length, partidos: new Set(rows.map(r => normalizeId(r.match_id) || r.match_id)).size,
        evaluados: resolved.length, pendientes: rows.filter(r => r.estado === 'pendiente').length, anulados: voids,
        aciertos: wins, efectividad: resolved.length ? wins / resolved.length * 100 : null,
        cuota_promedio: odds.length ? odds.reduce((s, r) => s + r.cuota, 0) / odds.length : null,
        ganancia: resolved.length || voids ? gain : null, roi: resolved.length ? gain / resolved.length * 100 : null
    };
}
function compare(a, b, key) {
    if (a[key] === null && b[key] === null) return 0;
    if (a[key] === null) return 1;
    if (b[key] === null) return -1;
    return b[key] - a[key];
}
function grouped(rows, fields) {
    const groups = new Map();
    for (const r of rows) { const key = JSON.stringify(fields.map(f => r[f])); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r); }
    return [...groups.values()].map(rs => ({ ...Object.fromEntries(fields.map(f => [f, rs[0][f]])), ...metrics(rs) }));
}
function analyze(rows, query) {
    const filtered = rows.filter(r => ['mercado', 'segmento', 'liga', 'temporada'].every(f => !query[f] || r[f] === query[f]) && (!query.desde || r.fecha_partido >= query.desde) && (!query.hasta || r.fecha_partido <= query.hasta));
    const ranking = grouped(filtered, ['mercado', 'liga']);
    ranking.sort((a,b) => compare(a,b,query.orden) || a.liga.localeCompare(b.liga));
    const days = grouped(filtered, ['fecha_partido']).sort((a,b) => a.fecha_partido.localeCompare(b.fecha_partido));
    let profit = 0, units = 0, settled = 0;
    const evolution = days.map(d => { profit += d.ganancia || 0; units += d.evaluados; settled += d.evaluados + d.anulados; return { fecha: d.fecha_partido, ganancia: settled ? profit : null, roi: units ? profit / units * 100 : null }; });
    const monthly = grouped(filtered.map(r => ({ ...r, mes: r.fecha_partido.slice(0,7) })), ['mes']).sort((a,b) => a.mes.localeCompare(b.mes));
    const detail = [...filtered].sort((a,b) => b.fecha_partido.localeCompare(a.fecha_partido) || String(a.match_id).localeCompare(String(b.match_id)) || a.mercado.localeCompare(b.mercado) || a.segmento.localeCompare(b.segmento));
    const reasons = {};
    for (const row of filtered) if (row.estado === 'pendiente') reasons[row.codigo_pendiente] = (reasons[row.codigo_pendiente] || 0) + 1;
    return { conciliacion: { pronosticos: filtered.length, cruces_confirmados: filtered.filter(r => r.cruce_confirmado === true).length, motivos_pendientes: reasons }, resumen: metrics(filtered), ranking, segmentos: grouped(filtered, ['mercado','segmento','liga']).sort((a,b) => compare(a,b,query.orden)), evolucion: evolution, mensual: monthly, detalle: { registros: detail.slice((query.page-1)*query.limit, query.page*query.limit), total: detail.length, page: query.page, limit: query.limit } };
}
function parseQuery(q) {
    const allowed = ['mercado','segmento','liga','temporada','desde','hasta','version_politica','page','limit','orden'];
    if (Object.keys(q).some(k => !allowed.includes(k)) || Object.values(q).some(v => typeof v !== 'string' || v.length > 200)) throw Error('Filtros inválidos');
    const parsed = { ...q, page: q.page === undefined ? 1 : Number(q.page), limit: q.limit === undefined ? 25 : Number(q.limit), orden: q.orden || 'roi' };
    if (!Number.isSafeInteger(parsed.page) || parsed.page < 1 || !Number.isSafeInteger(parsed.limit) || parsed.limit < 1 || parsed.limit > 100 || !['roi','aprobados','efectividad','ganancia'].includes(parsed.orden)) throw Error('Paginación u orden inválido');
    const rules = [...Object.entries(MARKETS).map(([mercado,r]) => ({ mercado, ...r })), ...configured];
    const compatible = rules.filter(r => r.mercado === q.mercado && (!q.version_politica || !r.version_politica || r.version_politica === q.version_politica));
    if (q.mercado && !compatible.length || q.segmento && !['N1','N2','N3','N4'].includes(q.segmento) || q.mercado && q.segmento && !compatible.some(r => r.segmentos.includes(q.segmento))) throw Error('Mercado o segmento incompatible');
    for (const k of ['desde','hasta']) if (q[k] && (!/^\d{4}-\d{2}-\d{2}$/.test(q[k]) || !Number.isFinite(Date.parse(q[k])) || new Date(q[k]).toISOString().slice(0,10) !== q[k])) throw Error('Fecha inválida');
    if (q.desde && q.hasta && q.desde > q.hasta) throw Error('Rango de fechas inválido');
    return parsed;
}
module.exports = { settle, metrics, analyze, parseQuery };
