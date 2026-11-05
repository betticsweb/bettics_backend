const crypto = require('crypto');
const digest = value => crypto.createHash('sha256').update(value).digest();
module.exports = function backtestEtlAuth(req, res, next) {
    const expected = process.env.BETTICS_ETL_TOKEN;
    if (!expected || !expected.trim()) return res.status(503).json({ estado: 'error', codigo: 'ETL_AUTH_NO_CONFIGURADA' });
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
    if (!match || !crypto.timingSafeEqual(digest(match[1]), digest(expected))) {
        res.set('WWW-Authenticate', 'Bearer realm="bettics-backtest-etl"');
        return res.status(401).json({ estado: 'error', codigo: 'ETL_NO_AUTORIZADO' });
    }
    next();
};
