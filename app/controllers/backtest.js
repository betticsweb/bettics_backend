const { withBacktestModel } = require('../services/backtest/store');
const { additionalMarket } = require('../services/backtest/market-policies');
const { FIELDS, MARKETS } = require('../services/backtest/contract');
const { prepareBatch, ingest, initialSummary, BacktestError } = require('../services/backtest/ingest');
function readQuery(query) {
    const allowed = ['match_id', 'mercado', 'segmento', 'version_politica', 'tipo_evaluacion', 'page', 'limit'];
    if (Object.keys(query).some(key => !allowed.includes(key)) || Object.values(query).some(value => typeof value !== 'string')) throw new BacktestError(400, 'FILTROS_INVALIDOS', 'Filtros no permitidos.');
    if (!query.version_politica || !query.tipo_evaluacion) throw new BacktestError(400, 'CONTEXTO_REQUERIDO', 'Indica version_politica y tipo_evaluacion para no mezclar evaluaciones.');
    for (const key of ['version_politica', 'tipo_evaluacion']) if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(query[key])) throw new BacktestError(400, 'FILTROS_INVALIDOS', 'Contexto inválido.');
    if (query.match_id && !/^[1-9]\d{0,31}$/.test(query.match_id) || query.mercado && !Object.prototype.hasOwnProperty.call(MARKETS, query.mercado) && !additionalMarket(query.mercado, query.version_politica) || query.segmento && !['N1','N2','N3','N4'].includes(query.segmento)) throw new BacktestError(400, 'FILTROS_INVALIDOS', 'Filtro inválido.');
    const page = query.page || '1', limit = query.limit || '50';
    if (!/^[1-9]\d{0,5}$/.test(page) || !/^[1-9]\d{0,2}$/.test(limit) || Number(limit) > 250) throw new BacktestError(400, 'PAGINACION_INVALIDA', 'Página positiva y límite entre 1 y 250 requeridos.');
    const filter = Object.fromEntries(['match_id', 'mercado', 'segmento', 'version_politica', 'tipo_evaluacion'].filter(key => query[key]).map(key => [key, query[key]]));
    return { filter, page: Number(page), limit: Number(limit) };
}
function createController(withModel = withBacktestModel) {
    return {
        async validarMasivo(req, res) {
            try {
                if (!req.is('application/json')) throw new BacktestError(415, 'JSON_REQUERIDO', 'Content-Type application/json requerido.');
                const batch = prepareBatch(req.body);
                const validos = batch.received - batch.rejected.length;
                return res.status(batch.rejected.length ? (validos ? 207 : 422) : 200).json({
                    estado: batch.rejected.length ? (validos ? 'parcial' : 'rechazado') : 'validado',
                    escrituras: false,
                    resumen: { recibidos: batch.received, validos, rechazados: batch.rejected.length },
                    claves_unicas: batch.groups.length,
                    duplicados_identicos: validos - batch.groups.length,
                    rechazos: batch.rejected
                });
            } catch (error) {
                if (error instanceof BacktestError) return res.status(error.status).json({ estado: 'error', codigo: error.code, mensaje: error.message, escrituras: false });
                return res.status(500).json({ estado: 'error', codigo: 'VALIDACION_NO_DISPONIBLE', escrituras: false });
            }
        },
        async registrarMasivo(req, res) {
            let batch;
            try {
                if (!req.is('application/json')) throw new BacktestError(415, 'JSON_REQUERIDO', 'Content-Type application/json requerido.');
                batch = prepareBatch(req.body);
                // An entirely rejected batch must not open a DB connection.
                const result = batch.groups.length ? await withModel(req, model => ingest(model, batch)) : await ingest(null, batch);
                return res.status(result.status).json(result.body);
            } catch (error) {
                if (error instanceof BacktestError) return res.status(error.status).json({ estado: 'error', codigo: error.code, mensaje: error.message });
                const resumen = batch ? initialSummary(batch) : null;
                if (resumen) resumen.pendientes = batch.received - batch.rejected.length;
                return res.status(503).json({ estado: 'error', codigo: 'ALMACEN_NO_DISPONIBLE', resumen, rechazos: batch ? batch.rejected : [], reintento_seguro: true });
            }
        },
        async aprobados(req, res) {
            try {
                const { filter, page, limit } = readQuery(req.query);
                const result = await withModel(req, async model => {
                    const [total, registros] = await Promise.all([
                        model.countDocuments(filter),
                        model.find(filter).select(FIELDS.join(' ') + ' -_id').sort({ fecha_partido: 1, match_id: 1, mercado: 1, segmento: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean()
                    ]);
                    return { estado: 'ok', total, page, limit, registros };
                });
                return res.json(result);
            } catch (error) {
                if (error instanceof BacktestError) return res.status(error.status).json({ estado: 'error', codigo: error.code, mensaje: error.message });
                return res.status(503).json({ estado: 'error', codigo: 'ALMACEN_NO_DISPONIBLE' });
            }
        }
    };
}
module.exports = { ...createController(), createController, readQuery };
