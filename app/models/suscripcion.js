const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')


const suscripcionSchema = new Schema({

    correoElectronico: {
        type: String,
        required: true
    },
    suscriptionId: {
        type: String,
        required: true
    },
    webhookId: {
        type: String,
        required: true
    },
    event_type: {
        type: String,
        required: true
    },
    shipping_amount_currency_code: {
        type: String,
        required: true
    },
    shipping_amount_value: {
        type: Number,
        required: true
    },
    estado: {
        type: String,
        default: true
    },
    create_time : {
        type: String,
        required: true
    },
    plan_id : {
        type: String,
        required: true
    },
    final_payment_due_date : {
        type: String,
        required: true
    },
    last_payment_date : {
        type: String,
        required: true
    },
    usuarioId: {
        type: String,
        required: true
    },
    reason_cancel: {
        type: String,
        required: true
    },
    
}, {
    versionKey: false,
    timestamps: true
})

suscripcionSchema.plugin(mongoosePaginate)
module.exports = suscripcionSchema;