const errorMiddleware = require('../middleware/errors')
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes')
const mongoose = require('mongoose')
const { replaceAll, reverse } = require('../shared/util')

const options = {
    page: 1,
    limit: 10,
    select: '_id companiaId razonSocial usuarioId nombreUsuario message description fileName lineNumber queryEntry bodyEntry createdAt',
    sort: { createdAt: -1 },
}

exports.getCriterio = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const LogErrores = getModel(conn, consta.SchemaName.logErrores);
        if (req.query.pageNumber != undefined) options.page = req.query.pageNumber;
        if (req.query.pageSize != undefined) options.limit = req.query.pageSize;

        const fecInicio = reverse(replaceAll(req.query.fechaInicio, '/', '-'));
        const fecFin = reverse(replaceAll(req.query.fechaFin, '/', '-'));

        let filter = {
            companiaId: req.query.companiaId,
            createdAt: {
                $gte: fecInicio,
                $lte: fecFin
            }
        }
        if (req.query.usarioId && req.query.usarioId.length > 0) {
            filter['usarioId'] = req.query.usarioId
        }

        await LogErrores.paginate(filter, options, (err, result) => {
            if (err) throw err;
            return res.send({
                resStatus: 'ok',
                totalRegistros: result.totalDocs,
                cantidadPaginas: result.totalPages,
                resResult: result.docs
            })
        })
    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.getIdData = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const LogErrores = getModel(conn, consta.SchemaName.logErrores);
        const data = await LogErrores.findById(req.params.pId)
        if (data == null) return res.sendStatus(404);
        res.json(data)
    } catch (err) {
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}

exports.insertData = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const LogErrores = getModel(conn, consta.SchemaName.logErrores);
        const data = req.body;

        await LogErrores.create(data)
        return res.json('OK- creado asincronamente')
    } catch (err) {
        console.log(err)
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}