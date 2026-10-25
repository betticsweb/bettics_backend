'use strict';
const { normalizeText } = require('./history');
const { metrics } = require('./results');
// Comparison targets only. Never used to settle a match or produce dashboard metrics.
const EXPECTED = { N1: { aprobados: 18, roi: 19.6 }, N2: { aprobados: 12, roi: 29.9 } };
function compareBundesligaReference(rows, scope) {
    if (!scope.temporada || scope.mercado !== 'CORNERS_OVER_85' || !['germany bundesliga', 'alemania bundesliga'].includes(normalizeText(scope.liga)) || scope.segmento || scope.desde || scope.hasta) {
        return { estado: 'no_comparable', motivo: 'Requiere la temporada exacta del reporte, mercado CORNERS_OVER_85, liga Bundesliga y todos sus segmentos, sin recorte de fechas.' };
    }
    const selected = rows.filter(r => r.temporada === scope.temporada && r.mercado === scope.mercado && normalizeText(r.liga) === normalizeText(scope.liga));
    const actual = metrics(selected);
    const segments = Object.fromEntries(['N1','N2'].map(segment => [segment, metrics(selected.filter(r => r.segmento === segment))]));
    const incomplete = actual.pendientes > 0 || actual.anulados > 0 || !actual.aprobados;
    const checks = Object.fromEntries(Object.entries(EXPECTED).map(([segment, expected]) => [segment, { esperado: expected, observado: segments[segment], coincide: !incomplete && segments[segment].aprobados === expected.aprobados && segments[segment].roi !== null && Math.round((segments[segment].roi + Number.EPSILON) * 10) / 10 === expected.roi }]));
    return { estado: incomplete ? 'incompleto' : actual.aprobados === 30 && Object.values(checks).every(check => check.coincide) ? 'coincide' : 'difiere', temporada: scope.temporada, total_esperado: 30, total_observado: actual.aprobados, segmentos: checks };
}
module.exports = { compareBundesligaReference };
