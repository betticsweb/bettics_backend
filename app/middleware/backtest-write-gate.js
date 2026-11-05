// Separate authorization of a deployment from authorization of an ETL write.
// Disabled unless the operator explicitly sets the exact value "true".
module.exports = function backtestWriteGate(req, res, next) {
    if (process.env.BETTICS_BACKTEST_WRITES_ENABLED !== 'true') {
        return res.status(423).json({ estado: 'bloqueado', codigo: 'CARGA_DESHABILITADA', escrituras: false });
    }
    next();
};
