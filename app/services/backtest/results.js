'use strict';
const { MARKETS } = require('./contract');
const number = x => typeof x === 'number' && Number.isFinite(x);
const score = x => number(x) && Number.isInteger(x) && x >= 0;
function settle(p, matches) {
    const pending = reason => ({ ...p, estado: 'pendiente', motivo: reason, ganancia: null, unidades: 0 });
    const market = MARKETS[p.mercado];
    if (!market || p.periodo !== 'FT' || p.seleccion !== market.seleccion || p.linea !== market.linea || !market.segmentos.includes(p.segmento) || !number(p.cuota) || p.cuota <= 1) return pending('Pronóstico no evaluable');
    if (matches.length !== 1) return pending(matches.length ? 'Cruce ambiguo' : 'Sin resultado asociado');
    const m = matches[0];
    if (m.strLeague !== p.liga || m.dateEvent !== p.fecha_partido) return pending('Liga o fecha sin conciliar');
    const row = { ...p, partido: [m.strHomeTeam, m.strAwayTeam].filter(Boolean).join(' — ') };
    // Only explicit, documented final status values; absent status never implies FT.
    const status = m.__status;
    if (!['FT', 'AET', 'PEN'].includes(status)) return { ...pending('Resultado final no confirmado'), partido: row.partido };
    if (status !== 'FT') return { ...pending('Período reglamentario sin confirmar'), partido: row.partido };
    const fields = p.mercado === 'GOLES_OVER_25' ? ['intHomeScore', 'intAwayScore'] : ['cornerKicksHome', 'cornerKicksAway'];
    const [h, a] = fields.map(f => m[f]);
    if (!score(h) || !score(a)) return { ...pending('Marcador ausente o inválido'), partido: row.partido };
    const win = p.mercado === 'CORNERS_OVER_85' ? h + a >= 9 : p.mercado === 'CORNERS_UNDER_105' ? h + a <= 10 : p.mercado === 'GOLES_OVER_25' ? h + a >= 3 : h > a;
    if (p.mercado === 'CORNERS_LOCAL_GANA' && h === a) return { ...pending('Empate en córners: liquidación sin confirmar'), partido: row.partido };
    return { ...row, estado: win ? 'acierto' : 'fallo', motivo: '', marcador: `${h}–${a}`, ganancia: win ? p.cuota - 1 : -1, unidades: 1 };
}
function metrics(rows) {
    const resolved = rows.filter(r => r.unidades === 1);
    const gain = resolved.reduce((s, r) => s + r.ganancia, 0);
    const wins = resolved.filter(r => r.estado === 'acierto').length;
    return { aprobados: rows.length, partidos: new Set(rows.map(r => r.match_id)).size, evaluados: resolved.length, pendientes: rows.length - resolved.length, aciertos: wins, efectividad: resolved.length ? wins / resolved.length * 100 : null, cuota_promedio: rows.filter(r => number(r.cuota)).length ? rows.filter(r => number(r.cuota)).reduce((s, r) => s + r.cuota, 0) / rows.filter(r => number(r.cuota)).length : null, ganancia: resolved.length ? gain : null, roi: resolved.length ? gain / resolved.length * 100 : null };
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
    let profit = 0, units = 0;
    const evolution = days.map(d => { profit += d.ganancia || 0; units += d.evaluados; return { fecha: d.fecha_partido, ganancia: units ? profit : null, roi: units ? profit / units * 100 : null }; });
    const monthly = grouped(filtered.map(r => ({ ...r, mes: r.fecha_partido.slice(0,7) })), ['mes']).sort((a,b) => a.mes.localeCompare(b.mes));
    const detail = [...filtered].sort((a,b) => b.fecha_partido.localeCompare(a.fecha_partido) || String(a.match_id).localeCompare(String(b.match_id)) || a.mercado.localeCompare(b.mercado) || a.segmento.localeCompare(b.segmento));
    return { resumen: metrics(filtered), ranking, segmentos: grouped(filtered, ['mercado','segmento','liga']).sort((a,b) => compare(a,b,query.orden)), evolucion: evolution, mensual: monthly, detalle: { registros: detail.slice((query.page-1)*query.limit, query.page*query.limit), total: detail.length, page: query.page, limit: query.limit } };
}
function parseQuery(q) {
    const allowed = ['mercado','segmento','liga','temporada','desde','hasta','version_politica','page','limit','orden'];
    if (Object.keys(q).some(k => !allowed.includes(k)) || Object.values(q).some(v => typeof v !== 'string' || v.length > 200)) throw Error('Filtros inválidos');
    const parsed = { ...q, page: q.page === undefined ? 1 : Number(q.page), limit: q.limit === undefined ? 25 : Number(q.limit), orden: q.orden || 'roi' };
    if (!Number.isSafeInteger(parsed.page) || parsed.page < 1 || !Number.isSafeInteger(parsed.limit) || parsed.limit < 1 || parsed.limit > 100 || !['roi','aprobados','efectividad','ganancia'].includes(parsed.orden)) throw Error('Paginación u orden inválido');
    if (q.mercado && !Object.hasOwn(MARKETS,q.mercado) || q.segmento && !['N1','N2','N3','N4'].includes(q.segmento) || q.mercado && q.segmento && !MARKETS[q.mercado].segmentos.includes(q.segmento)) throw Error('Mercado o segmento incompatible');
    for (const k of ['desde','hasta']) if (q[k] && (!/^\d{4}-\d{2}-\d{2}$/.test(q[k]) || !Number.isFinite(Date.parse(q[k])) || new Date(q[k]).toISOString().slice(0,10) !== q[k])) throw Error('Fecha inválida');
    if (q.desde && q.hasta && q.desde > q.hasta) throw Error('Rango de fechas inválido');
    return parsed;
}
module.exports = { settle, metrics, analyze, parseQuery };
