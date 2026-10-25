const express = require('express');
const controller = require('../controllers/backtest');
const etlAuth = require('../middleware/backtest-etl-auth');
const writeGate = require('../middleware/backtest-write-gate');
const { validarJwt } = require('../middleware/validar-jwt');
function createRouter(handlers = controller, readAuth = validarJwt) {
    const router = express.Router();
    router.post('/api/backtest/registrarMasivo', etlAuth, writeGate, handlers.registrarMasivo);
    router.post('/api/backtest/validarMasivo', etlAuth, handlers.validarMasivo);
    router.get('/api/backtest/aprobados', readAuth, handlers.aprobados);
    return router;
}
const router = createRouter();
router.createRouter = createRouter;
router.bodyError = function(err, req, res, next) {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return res.status(err.type === 'entity.too.large' ? 413 : 400).json({ estado: 'error', codigo: 'JSON_INVALIDO' });
    next(err);
};
module.exports = router;
