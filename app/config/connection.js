const mongoose = require('mongoose')
const consta = require('../config/constantes')
require('dotenv').config()

const conectionManager = (req, db) => {

    try {
        // Validate required environment variables
        if (!process.env.USR_NAME || !process.env.PSS_WORD || !process.env.CLU) {
            const missing = [];
            if (!process.env.USR_NAME) missing.push('USR_NAME');
            if (!process.env.PSS_WORD) missing.push('PSS_WORD');
            if (!process.env.CLU) missing.push('CLU');
            console.error(`Missing required environment variables: ${missing.join(', ')}`);
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        const dbname = db ? db : `DB_Analytic_Bet`;
        const options = {
            useUnifiedTopology: true,
            useNewUrlParser: true
        }
        const conn = mongoose.createConnection(`mongodb+srv://${process.env.USR_NAME}:${process.env.PSS_WORD}@${process.env.CLU}.mongodb.net/${dbname}?retryWrites=true&w=majority`, options)
        conn.on('open', () => console.log('DB connection open'))
        conn.on('error', err => {
            console.error(`DB connection error: ${err.message}`);
            if (err.message.includes('undefined')) {
                console.error('ERROR: MongoDB cluster (CLU) environment variable is not set correctly');
            }
        })
        conn.on('close', () => console.log('DB connection closed'))
        return conn;

    } catch (error) {
        console.error('Connection manager error:', error.message);
        return null;
    }
}

const getModel = (conn, schemaName, req) => {
    return conn.model(schemaName, require(`../models/${schemaName}`), schemaName);
}

const dbConnection = async(req, res, next) => {
    try {
        // Validate required environment variables
        if (!process.env.USR_NAME || !process.env.PSS_WORD || !process.env.CLU) {
            const missing = [];
            if (!process.env.USR_NAME) missing.push('USR_NAME');
            if (!process.env.PSS_WORD) missing.push('PSS_WORD');
            if (!process.env.CLU) missing.push('CLU');
            console.error(`Missing required environment variables: ${missing.join(', ')}`);
            return res.status(500).json({
                error: `Server configuration error: Missing required environment variables: ${missing.join(', ')}`
            });
        }

        const dbname = `FE_${req.headers.grupocompania}_${req.headers.companiaid}`;
        console.log(dbname);
        await mongoose.connect(`mongodb+srv://${process.env.USR_NAME}:${process.env.PSS_WORD}@${process.env.CLU}.mongodb.net/${dbname}`, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Base de datos online');
        next();
    } catch (error) {
        console.error('Database connection error:', error.message);
        if (error.message.includes('undefined')) {
            console.error('ERROR: MongoDB cluster (CLU) environment variable is not set correctly');
        }
        return res.status(500).json({
            error: 'Error connecting to database'
        });
    }
}

module.exports = {
    dbConnection,
    conectionManager,
    getModel
}