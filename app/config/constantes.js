module.exports = Object.freeze({
    Estado_Contabilizado: 2,
    Tipo_Ingreso: 1,
    Tipo_Salida: 2,
    StatusCode_200: 200,
    Nombre_Anulado: "ANULADO",
    Estado_Anulado: 3,
    Path_Reserva: "Producto/ActualizarReserva",
    Path_Kardex: "Kardex/Registrar",
    GrupoAdministracion: "AC",
    ValoresTipoMenu: {
        Item: 'item',
        Collapsable: 'collapsable',
        Group: 'group',
    },
    SchemaName: {
        usuario: "usuario",
        ubigeo: "ubigeo",
        estado: "estado",
        parametro: "parametro",
        rol: "rol",
        logErrores: "logErrores",
        recomendaciones: "recomendaciones",
        eventosLiga: "eventosLiga",
        eventosLigaProb: "eventosLigaProb",
        tableroPosicionesProb: "tableroPosicionesProb",
        tableroPosiciones: "tableroPosiciones",
        mensajeEmail: "mensajeEmail",
        registroRecurrencia: "registroRecurrencia",
        prioridadPartidos: "prioridadPartidos",
        resultados: "resultados",
        partidosJugar: "partidosJugar",
        suscripcion: "suscripcion",
        chatbotFAQ: "chatbotFAQ",
        chatbotKnowledgeBase: "chatbotKnowledgeBase",
        matchStatistics: "matchStatistics",
        chatbotConversation: "chatbotConversation"
    },
    cacheController: {
        recomendaciones: {
            byGetCriterio: 'recomendaciones_criterio_'
        },
        tableroPosiciones: {
            maestros: 'tableroposiciones_maestros_',
            getCriterio: 'tableroposiciones_getcriterio_',
        },
        eventosLiga: {
            maestros: 'eventosliga_maestros_'
        },
        prioridadPartidos: {
            byGetCriterio: 'prioridadPartidos_criterio_'
        },
        resultados: {
            maestros: 'resultados_maestros_',
            getCriterio: 'resultados_getcriterio_',
        },
        partidosJugar: {
            maestros: 'partidosJugar_maestros_',
            getCriterio: 'partidosJugar_getcriterio_',
        },
    }
});