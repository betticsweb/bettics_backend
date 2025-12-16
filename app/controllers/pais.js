const errorMiddleware = require('../middleware/errors')
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes')

exports.getAllData = async(req, res, next) => {
    const conn = conectionManager(req);
    try {
        const Pais = getModel(conn, consta.SchemaName.pais);
        const data = await Pais.find({}).select("_id codigo nombre") 
        res.json(data);
    } catch (err) {
        return errorMiddleware(err, req, res, next);
    } finally { conn.close(); }
}