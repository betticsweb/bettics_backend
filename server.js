require('dotenv').config()
const express = require('express')
const cors = require('cors')
const app = express()

const port = process.env.PORT

// Validate required environment variables at startup
function validateEnvironment() {
    const required = ['USR_NAME', 'PSS_WORD', 'CLU'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.error('========================================');
        console.error('ERROR: Missing required environment variables:');
        missing.forEach(key => console.error(`  - ${key}`));
        console.error('========================================');
        console.error('Please set these variables in your Render dashboard:');
        console.error('  - USR_NAME: MongoDB username');
        console.error('  - PSS_WORD: MongoDB password');
        console.error('  - CLU: MongoDB cluster name (e.g., serverfe-prod.4dt1r)');
        console.error('========================================');
        // Don't exit - let it fail gracefully with better error messages
    } else {
        console.log('✓ Required environment variables validated');
    }
}

validateEnvironment();
const errorMiddleware = require('./app/middleware/errors')
const loginRouters = require('./app/routes/login')
const usuarioRouters = require('./app/routes/usuario')
const recomendacionesRouters = require('./app/routes/recomendaciones')
const webhookRouters = require('./app/routes/webhook')
const culqiRouters = require('./app/routes/culqi')
const eventosLigaRouters = require('./app/routes/eventosLiga')
const tableroPosicionesRouters = require('./app/routes/tableroPosiciones')
const emailRouters = require('./app/routes/email')
const forgorPasswordRouters = require('./app/routes/forgorPassword')
const prioridadPartidosRouters = require('./app/routes/prioridadPartidos')
const resultadosRouters = require('./app/routes/resultados')
const partidosJugarRouters = require('./app/routes/partidosJugar')
const paypalRouters = require('./app/routes/paypal')
const chatbotRouters = require('./app/routes/chatbot')
const chatbotAdminRouters = require('./app/routes/chatbot-admin')
const chatbotDialogflowRouters = require('./app/routes/chatbot-dialogflow')
const chatbotConversationRouters = require('./app/routes/chatbot-conversation')
    //const logErroresRouters = require('./app/routes/logErrores')
let cacheProvider = require('./app/shared/cache-provider')

class Server {

    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;

        // Conectar a base de datos
        // this.conectarDB();

        // Middlewares
        this.middlewares();

        // Rutas de mi aplicación
        this.routes();

        //
        this.app.use(
            express.json({
                limit: '20mb'
            })
        )
        this.app.use(
            express.urlencoded({
                limit: '20mb',
                extended: true
            })
        )
    }

    middlewares() {

        // CORS Configuration
        const corsOptions = {
            origin: function (origin, callback) {
                // Allow requests with no origin (like mobile apps, curl, Postman)
                if (!origin) return callback(null, true);
                
                // List of allowed origins
                const allowedOrigins = [
                    'https://bettics-frontend.vercel.app',
                    /^https:\/\/.*\.vercel\.app$/, // All Vercel deployments (including preview URLs)
                    /^https:\/\/bettics-frontend.*\.vercel\.app$/, // Specific Vercel preview deployments
                    'http://localhost:4200', // Local development
                    'http://localhost:3000', // Local development alternative
                ];
                
                // Check if origin matches any allowed pattern
                const isAllowed = allowedOrigins.some(allowed => {
                    if (typeof allowed === 'string') {
                        return origin === allowed;
                    } else if (allowed instanceof RegExp) {
                        return allowed.test(origin);
                    }
                    return false;
                });
                
                if (isAllowed) {
                    callback(null, true);
                } else {
                    // Log blocked origin for debugging (remove in production)
                    console.log('CORS: Blocked origin:', origin);
                    callback(null, true); // Allow for now - change to callback(new Error('Not allowed by CORS')) for stricter security
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
            exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
            preflightContinue: false,
            optionsSuccessStatus: 204
        };
        
        this.app.use(cors(corsOptions));
        
        this.app.use(
            express.json({
                limit: '20mb'
            })
        )
        this.app.use(
            express.urlencoded({
                limit: '20mb',
                extended: true
            })
        )

        // Lectura y parseo del body
        // this.app.use(express.json());

        // Directorio Público
        // this.app.use(express.static('public'));
    }

    routes() {

        // this.app.use(this.authPath, require('../routes/auth'));
        this.app.use(loginRouters, errorMiddleware)
        this.app.use(usuarioRouters, errorMiddleware)
        this.app.use(culqiRouters, errorMiddleware)
        this.app.use(recomendacionesRouters, errorMiddleware)
        this.app.use(webhookRouters, errorMiddleware)
        this.app.use(eventosLigaRouters, errorMiddleware)
        this.app.use(tableroPosicionesRouters, errorMiddleware)
        this.app.use(emailRouters, errorMiddleware)
        this.app.use(forgorPasswordRouters, errorMiddleware)
        this.app.use(prioridadPartidosRouters, errorMiddleware)
        this.app.use(resultadosRouters, errorMiddleware)
        this.app.use(partidosJugarRouters, errorMiddleware)
        this.app.use(paypalRouters, errorMiddleware)
        this.app.use(chatbotRouters, errorMiddleware)
        this.app.use(chatbotAdminRouters, errorMiddleware)
        this.app.use(chatbotDialogflowRouters, errorMiddleware)
        this.app.use(chatbotConversationRouters, errorMiddleware)
        
    }

    listen() {
        this.app.listen(this.port, () => {
            console.log('Servidor corriendo en puerto', this.port);
        });
    }

}

const server = new Server();
cacheProvider.start(function(err) {
    if (err) console.error(err)
})
server.listen();