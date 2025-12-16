const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')


const relacionRolesSchema = new Schema({
    rolId: {
        type: Schema.Types.ObjectId,
        default: null
    },
    activo: {
        type: Boolean,
        default: true
    }
})

const usuarioSchema = new Schema({
    nombres: {
        type: String,
        required: true
    },
    apellidos: {
        type: String,
        required: true
    },
    correoElectronico: {
        type: String,
        required: true
    },
    tipoCliente: {
        type: String,
        required: true
    },
    celular: {
        type: String,
        required: true
    },
    dialCode: {
        type: String,
        required: true
    },
    countryCode: {
        type: String,
        required: true
    },
    clienteCulquiId: {
        type: String,
        default: null
    },
    tarjetaCulquiId: {
        type: String,
        default: null
    },
    suscripcionCulquiId: {
        type: String,
        default: null
    },
    flujoCreacion: {
        type: String,
        default: null
    },
    password: {
        type: String,
        required: true
    },
    activo: {
        type: Boolean,
        default: true
    },
    informacion: {
        type: String
    },
    foto: {
        type: String,
        default: null
    },
    nombreUsuarioReg: {
        type: String,
        required: false
    },
    nombreUsuarioAct: {
        type: String,
        default: ''
    },
    motivoEli: {
        type: String
    },
    fechaEli: {
        type: Date,
        default: null
    },
    usuarioIdEli: {
        type: Schema.Types.ObjectId,
        default: null
    },
    nombreUsuarioEli: {
        type: String,
        default: ''
    },
    billeteraMovilPagadoId: {
        type: String,
        default: null
    },
    billeteraMovilPagadoFecha: {
        type: String,
        default: null
    },
    tipoLicencia: {
        type: String,
        default: ''
    },
    aceptaTerminosCondiciones: {
        type: Boolean,
        default: false
    },
    aceptaTerminosDatosPersonales: {
        type: Boolean,
        default: false
    },
    tokenResetPassword: {
        type: String,
        default: null
    },
    suscripcionPaypalId: {
        type: String,
        default: null
    },
    suscription_next_billing_time: {
        type: Date,
        default: null
    },
    suscription_create_time: {
        type: Date,
        default: null
    }
    // "relacionCompania": null,
    // "relacionComprobantes": null
}, {
    versionKey: false,
    timestamps: true
})

usuarioSchema.plugin(mongoosePaginate)
module.exports = usuarioSchema;