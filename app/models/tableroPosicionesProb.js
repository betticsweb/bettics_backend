const { Schema } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2')
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

const tableroPosicionesSchema = new Schema({

    fecha: {
        type: String,
        required: true
    },
    hora: {
        type: String,
        required: true
    },
    liga: {
        type: String
    },
    equipoLocal: {
        type: String
    },
    equipoVisitante: {
        type: String,
        required: true
    },
    posicionLocal: {
        type: Number,
        required: true
    },
    posicionVisita: {
        type: Number,
        required: true
    },
    cornersProbabilidadMas6: {
        type: Number
    },
    cornersProbabilidadMas7: {
        type: Number
    },
    cornersProbabilidadMas8: {
        type: Number
    },
    cornersProbabilidadMas9: {
        type: Number
    },
    golesProbabilidadMas1: {
        type: Number
    }, 
    tirosaporteriaProb6: {
        type: Number
    },
    tirosaporteriaProb7: {
        type: Number
    },
    tirosaporteriaProb8: {
        type: Number
    },
    tirosaporteriaProb9: {
        type: Number
    },
    tarjetasProbabilidad3: {
        type: Number
    },
    tarjetasProbabilidad4: {
        type: Number
    },
    tarjetasProbabilidad5: {
        type: Number
    },
    cornersLocalProbMas5: {
        type: Number
    },
    golesLocalProbMas1: {
        type: Number
    },
    tirosaporteriaLocalProb5: {
        type: Number
    },
    tarjetasLocalProb2: {
        type: Number
    },
    cornersHechoTotalesLocalVisita: {
        type: Number
    },
    golesHechoTotalesLocalVisita: {
        type: Number
    },
    tirosaporteriaTotalProm: {
        type: Number
    },
    tarjetasTotalProm: {
        type: Number
    },

    idAwayTeam: {
        type: String,
        required: true
    },
    idHomeTeam: {
        type: String,
        required: true
    },
    idEvent: {
        type: String,
        required: true
    },
    activo: {
        type: Boolean,
        default: true
    },
    // Nuevo 2024 06 09
    cornersVisitaProbMas3: {
        type: Number
    },
    golesVisitaProbMas0: {
        type: Number
    },
    tirosaporteriaVisitaProb3: {
        type: Number
    },
    tarjetasVisitaProb1: {
        type: Number
    },

    // Probabilidad Goles All
    totalPartido: {
        ambosEquipos:{
            goles: {
                mas1 : { type: Number },
                mas2 : { type: Number },
                mas3 : { type: Number },
                aem: { type: Number }
            },
            corners: {
                mas7 : { type: Number },
                mas8 : { type: Number },
                mas9 : { type: Number },
                mas10 : { type: Number }
            },
            tarjetas: {
                mas2 : { type: Number },
                mas3 : { type: Number },
                mas4 : { type: Number },
                aem : { type: Number }
            },
            tirosArco: {
                mas6 : { type: Number },
                mas7 : { type: Number },
                mas8 : { type: Number },
                mas9 : { type: Number }
            },
            
        },
        local: {
            goles: {
                mas0 : { type: Number },
                mas1 : { type: Number }
            },
            corners: {
                mas3 : { type: Number },
                mas4 : { type: Number },
                mas5 : { type: Number }
            },
            tarjetas: {
                mas1 : { type: Number },
                mas2 : { type: Number }
            },
            tirosArco: {
                mas3 : { type: Number },
                mas4 : { type: Number },
                mas5 : { type: Number }
            }
        },
        visita: {
            goles: {
                mas0 : { type: Number },
                mas1 : { type: Number }
            },
            corners: {
                mas3 : { type: Number },
                mas4 : { type: Number },
                mas5 : { type: Number }
            },
            tarjetas: {
                mas1 : { type: Number },
                mas2 : { type: Number }
            },
            tirosArco: {
                mas3 : { type: Number },
                mas4 : { type: Number },
                mas5 : { type: Number }
            }
        },
        unox2: {
            local_uno: { type: Number },
            emp_x : { type: Number },
            visita_dos : { type: Number }
        },
        doble_chance: {
            loe: { type: Number },
            lov : { type: Number },
            eov : { type: Number }
        }
    },
    primerTiempo: {
        ambosEquipos:{
            goles: {
                mas0 : { type: Number },
                mas1 : { type: Number }
            },
            corners: {
                mas3 : { type: Number },
                mas4 : { type: Number }
            }
        },
        local: {
            goles: {
                mas0 : { type: Number }
            },
            corners: {
                mas2 : { type: Number },
                mas3 : { type: Number }
            }
        },
        visita: {
            goles: {
                mas0 : { type: Number }
            },
            corners: {
                mas2 : { type: Number },
                mas3 : { type: Number }
            }
        },
        unox2: {
            local_uno: { type: Number },
            emp_x : { type: Number },
            visita_dos : { type: Number }
        },
        doble_chance: {
            loe: { type: Number },
            lov : { type: Number },
            eov : { type: Number }
        }
    }

}, {
    versionKey: false,
    timestamps: true
})
tableroPosicionesSchema.plugin(aggregatePaginate);
tableroPosicionesSchema.plugin(mongoosePaginate)
module.exports = tableroPosicionesSchema;