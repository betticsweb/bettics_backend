'use strict';
const jwt = require('jsonwebtoken');
module.exports = (req,res,next) => {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
    const key = process.env.BETTICS_READ_JWT_SECRET || process.env.KEY_JWT;
    if (!match || !key) return res.sendStatus(401);
    try {
        const payload = jwt.verify(match[1], key, { algorithms: ['HS256'] });
        if (!payload.usuario || !payload.exp) return res.sendStatus(401);
        req.usuarioConectado = payload.usuario; next();
    } catch (_) { res.sendStatus(401); }
};
