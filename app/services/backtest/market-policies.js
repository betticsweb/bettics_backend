'use strict';
// Reviewed, version-specific policies only. Empty in production until the original R/OOT sources are supplied.
const manifest = require('../../../knime/backtest-market-policies.json');
const families = Object.freeze({ BTTS: ['YES', 'NO'], FT_WINNER: ['HOME', 'AWAY'], HT_WINNER: ['HOME', 'AWAY'], HT_GOALS: ['OVER', 'UNDER'] });
function definitions(document = manifest) {
    if (!document || !Array.isArray(document.markets)) throw Error('Invalid market policy manifest');
    const seen = new Set();
    return document.markets.map(rule => {
        const key = `${rule.mercado}:${rule.version_politica}`;
        if (['CORNERS_OVER_85','CORNERS_UNDER_105','GOLES_OVER_25','CORNERS_LOCAL_GANA'].includes(rule.mercado)) throw Error('Legacy policies cannot be replaced');
        if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(rule.mercado || '') || seen.has(key) || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(rule.version_politica || '') ||
            rule.verified !== true || typeof rule.evidence !== 'string' || !rule.evidence.trim() || !families[rule.family]?.includes(rule.seleccion) ||
            !Array.isArray(rule.segmentos) || !rule.segmentos.length || new Set(rule.segmentos).size !== rule.segmentos.length || rule.segmentos.some(s => !/^N[1-4]$/.test(s)) ||
            (rule.family === 'HT_GOALS' ? typeof rule.linea !== 'number' || !Number.isFinite(rule.linea) || rule.linea < 0 || rule.linea * 2 % 1 !== 0 : rule.linea !== null) ||
            (['FT_WINNER', 'HT_WINNER'].includes(rule.family) && !['loss', 'void', 'pending'].includes(rule.drawRule)) ||
            (rule.family === 'FT_WINNER' && rule.drawRule !== 'loss') ||
            (rule.family === 'HT_GOALS' && !['void', 'pending'].includes(rule.pushRule))) throw Error('Unverified or ambiguous market policy');
        seen.add(key);
        return Object.freeze({ ...rule, periodo: rule.family.startsWith('HT_') ? 'HT' : 'FT' });
    });
}
const configured = definitions();
function additionalMarket(code, version, rules = configured) { return rules.find(r => r.mercado === code && r.version_politica === version); }
module.exports = { definitions, configured, additionalMarket };
