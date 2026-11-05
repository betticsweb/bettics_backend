const { conectionManager, getModel } = require('../../config/connection');
const { SchemaName } = require('../../config/constantes');
async function withBacktestModel(req, action) {
    const connection = conectionManager(req);
    if (!connection) throw new Error('Backtest database unavailable');
    try {
        await connection.asPromise();
        const model = getModel(connection, SchemaName.backtestAprobados);
        return await action(model);
    } finally {
        await connection.close().catch(() => {});
    }
}
module.exports = { withBacktestModel };
