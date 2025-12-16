const errorMiddleware = require('../middleware/errors');
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes');
const nlpService = require('../services/nlp-service');
const recommendationSearch = require('../services/recommendation-search.service');
const matchStatisticsService = require('../services/match-statistics.service');
const responseTemplate = require('../services/response-template.service');
const conversationController = require('./chatbot-conversation');

/**
 * Process chat query - Main endpoint
 */
exports.processQuery = async (req, res, next) => {
    const conn = conectionManager(req);
    const startTime = Date.now();
    
    try {
        const { message, sessionId } = req.body;
        
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }
        
        // Extract intent
        const intent = nlpService.extractIntent(message);
        
        // Extract entities
        const entities = nlpService.extractEntities(message);
        
        let response = {
            success: true,
            intent: intent,
            response: '',
            recommendations: [],
            hasMore: false
        };
        
        // Handle different intents
        switch (intent) {
            case 'greeting':
                response.response = "¡Hola! Soy Betina 🎯, tu asesora experta en recomendaciones de apuestas deportivas.\n\n¿Qué te gustaría consultar hoy?\n\n• ⚽ Pronósticos de partidos\n• 🥅 Predicciones de goles\n• 📊 Análisis de corners\n• 🔥 Ambos equipos marcarán\n• Explicación sobre jugada de valor\n\n¡Dime de qué partido quieres hablar!";
                break;
                
            case 'search_recommendation':
                // Search for recommendations
                const query = nlpService.buildMongoQuery(entities);
                const recommendations = await recommendationSearch.searchRecommendations(
                    conn,
                    query,
                    { teams: entities.teams },
                    5 // Limit to 5 recommendations
                );
                
                if (recommendations && recommendations.length > 0) {
                    response.recommendations = recommendations;
                    response.response = recommendationSearch.formatRecommendationResponse(recommendations);
                } else {
                    response.response = "Lo siento, no tengo recomendaciones para ese partido en mi base de datos actual. ¿Te gustaría buscar otro partido? Puedes preguntarme por ejemplo: '¿Recomendaciones para Alianza vs Universitario?'";
                }
                break;
                
            case 'ask_faq':
                // Search FAQs
                const FAQ = getModel(conn, consta.SchemaName.chatbotFAQ);
                const faqs = await FAQ.find({
                    active: true,
                    $or: [
                        { question: { $regex: message, $options: 'i' } },
                        { keywords: { $in: message.toLowerCase().split(/\s+/) } }
                    ]
                })
                .sort({ priority: -1 })
                .limit(3)
                .lean();
                
                if (faqs && faqs.length > 0) {
                    response.response = faqs.map(faq => `**${faq.question}**\n\n${faq.answer}`).join('\n\n---\n\n');
                } else {
                    response.response = "No encontré una respuesta específica para tu pregunta. ¿Podrías reformularla o consultar nuestra sección de ayuda? También puedo ayudarte con recomendaciones de partidos.";
                }
                break;
                
            case 'learn_betting':
                // Search knowledge base
                const KnowledgeBase = getModel(conn, consta.SchemaName.chatbotKnowledgeBase);
                const kbArticles = await KnowledgeBase.find({
                    active: true,
                    $or: [
                        { topic: { $regex: message, $options: 'i' } },
                        { keywords: { $in: message.toLowerCase().split(/\s+/) } }
                    ]
                })
                .limit(1)
                .lean();
                
                if (kbArticles && kbArticles.length > 0) {
                    const article = kbArticles[0];
                    let content = `**${article.title}**\n\n${article.content}`;
                    if (article.examples && article.examples.length > 0) {
                        content += `\n\n**Ejemplos:**\n${article.examples.map(ex => `- ${ex}`).join('\n')}`;
                    }
                    response.response = content;
                } else {
                    response.response = "Puedo ayudarte a aprender sobre apuestas deportivas. Puedes preguntarme sobre conceptos básicos, estrategias de valor, o cómo funcionan las cuotas. ¿Qué te gustaría saber específicamente?";
                }
                break;
                
            case 'pronostico_ganador':
                await handleWinnerPrediction(conn, entities, message, response);
                break;
                
            case 'prediccion_goles':
                await handleGoalsPrediction(conn, entities, message, response);
                break;
                
            case 'prediccion_corners':
                await handleCornersPrediction(conn, entities, message, response);
                break;
                
            case 'ambos_marcan':
                await handleBTTSPrediction(conn, entities, message, response);
                break;
                
            case 'explicar_jugada_valor':
                await handleValueBetExplanation(conn, message, response);
                break;
                
            case 'platform_info':
                response.response = "Somos una plataforma de recomendaciones deportivas que ofrece análisis y sugerencias de apuestas. Nuestro servicio incluye:\n- Recomendaciones de partidos\n- Análisis de cuotas\n- Estrategias de valor\n\n¿Te gustaría conocer más sobre nuestros servicios o suscribirte?";
                break;
                
            default: // fallback
                response.response = "No estoy segura de entender. ¿Podrías reformular tu pregunta? Puedo ayudarte con:\n- Pronósticos de partidos (ej: '¿Quién ganará entre Barcelona vs Real Madrid?')\n- Predicciones de goles\n- Análisis de corners\n- Ambos equipos marcarán\n- Información sobre nuestros servicios";
                break;
        }
        
        // Calculate processing time
        const processingTime = Date.now() - startTime;
        
        // Log conversation (non-blocking)
        conversationController.saveConversation(req, {
            sessionId: sessionId || `session_${Date.now()}`,
            query: message,
            intent: intent,
            confidence: 0.85, // Default confidence, can be enhanced
            entities: entities,
            response: response.response,
            recommendations: response.recommendations || [],
            processingTime: processingTime
        }).catch(err => {
            console.error('Error saving conversation:', err);
            // Don't fail the request if logging fails
        });
        
        return res.json(response);
        
    } catch (err) {
        console.error('Error processing chatbot query:', err);
        
        // Log error conversation
        conversationController.saveConversation(req, {
            sessionId: sessionId || `session_${Date.now()}`,
            query: message,
            intent: intent || 'error',
            confidence: 0,
            entities: entities || {},
            response: 'Error processing request',
            error: err.message,
            processingTime: Date.now() - startTime
        }).catch(logErr => {
            console.error('Error saving error conversation:', logErr);
        });
        
        return errorMiddleware(err, req, res, next);
    } finally {
        if (conn) conn.close();
    }
};

/**
 * Direct search endpoint for recommendations
 */
exports.searchRecommendations = async (req, res, next) => {
    const conn = conectionManager(req);
    
    try {
        const { local, visitor, date, league } = req.query;
        
        if (!local && !visitor) {
            return res.status(400).json({
                success: false,
                error: 'At least one team name (local or visitor) is required'
            });
        }
        
        const query = {
            activo: true
        };
        
        if (local && visitor) {
            query.$or = [
                {
                    equipoLocal: { $regex: local, $options: 'i' },
                    equipoVisitante: { $regex: visitor, $options: 'i' }
                },
                {
                    equipoLocal: { $regex: visitor, $options: 'i' },
                    equipoVisitante: { $regex: local, $options: 'i' }
                }
            ];
        } else if (local) {
            query.$or = [
                { equipoLocal: { $regex: local, $options: 'i' } },
                { equipoVisitante: { $regex: local, $options: 'i' } }
            ];
        } else if (visitor) {
            query.$or = [
                { equipoLocal: { $regex: visitor, $options: 'i' } },
                { equipoVisitante: { $regex: visitor, $options: 'i' } }
            ];
        }
        
        if (date) {
            query.fechaJuego = date;
        }
        
        if (league) {
            query.liga = { $regex: league, $options: 'i' };
        }
        
        const recommendations = await recommendationSearch.searchRecommendations(
            conn,
            query,
            { teams: [local, visitor].filter(Boolean) },
            10
        );
        
        return res.json({
            success: true,
            count: recommendations.length,
            recommendations: recommendations
        });
        
    } catch (err) {
        console.error('Error searching recommendations:', err);
        return errorMiddleware(err, req, res, next);
    } finally {
        if (conn) conn.close();
    }
};

/**
 * Get FAQs
 */
exports.getFAQs = async (req, res, next) => {
    const conn = conectionManager(req);
    
    try {
        const FAQ = getModel(conn, consta.SchemaName.chatbotFAQ);
        const { category, limit = 20 } = req.query;
        
        const query = { active: true };
        if (category) {
            query.category = category;
        }
        
        const faqs = await FAQ.find(query)
            .sort({ priority: -1, createdAt: -1 })
            .limit(parseInt(limit))
            .select('question answer category keywords')
            .lean();
        
        return res.json({
            success: true,
            count: faqs.length,
            faqs: faqs
        });
        
    } catch (err) {
        console.error('Error getting FAQs:', err);
        return errorMiddleware(err, req, res, next);
    } finally {
        if (conn) conn.close();
    }
};

/**
 * Get knowledge base articles
 */
exports.getKnowledgeBase = async (req, res, next) => {
    const conn = conectionManager(req);
    
    try {
        const KnowledgeBase = getModel(conn, consta.SchemaName.chatbotKnowledgeBase);
        const { topic, limit = 10 } = req.query;
        
        const query = { active: true };
        if (topic) {
            query.topic = { $regex: topic, $options: 'i' };
        }
        
        const articles = await KnowledgeBase.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .select('topic title content examples relatedTopics')
            .lean();
        
        return res.json({
            success: true,
            count: articles.length,
            articles: articles
        });
        
    } catch (err) {
        console.error('Error getting knowledge base:', err);
        return errorMiddleware(err, req, res, next);
    } finally {
        if (conn) conn.close();
    }
};

/**
 * Handle winner prediction intent
 */
async function handleWinnerPrediction(conn, entities, message, response) {
    try {
        // Check if we have team names
        if (!entities.teams || entities.teams.length < 2) {
            response.response = "Para darte un pronóstico del ganador, necesito que me digas los dos equipos. Por ejemplo: '¿Quién ganará entre Barcelona vs Real Madrid?'";
            return;
        }
        
        // Find upcoming match
        const PartidosJugar = getModel(conn, consta.SchemaName.partidosJugar);
        const match = await PartidosJugar.findOne({
            $or: [
                {
                    equipoLocal: { $regex: entities.teams[0], $options: 'i' },
                    equipoVisitante: { $regex: entities.teams[1], $options: 'i' }
                },
                {
                    equipoLocal: { $regex: entities.teams[1], $options: 'i' },
                    equipoVisitante: { $regex: entities.teams[0], $options: 'i' }
                }
            ],
            activo: true
        })
        .sort({ fecha: 1 }) // Get nearest match
        .lean();
        
        if (!match) {
            response.response = `No encontré un partido programado entre ${entities.teams[0]} y ${entities.teams[1]}. ¿Podrías verificar los nombres de los equipos o preguntarme por otro partido?`;
            return;
        }
        
        // Get match statistics
        const fechaJuego = match.fecha ? new Date(match.fecha) : new Date();
        const stats = await matchStatisticsService.getMatchStatistics(
            conn,
            match.equipoLocal || entities.teams[0],
            match.equipoVisitante || entities.teams[1],
            fechaJuego,
            match.liga
        );
        
        if (!stats || !stats.probabilities) {
            response.response = `Lo siento, no tengo suficientes estadísticas para analizar el partido entre ${match.equipoLocal} y ${match.equipoVisitante}. ¿Te gustaría una recomendación general?`;
            return;
        }
        
        // Format response using template
        const template = `🔮 **ANÁLISIS DE GANADOR: $equipo_local vs $equipo_visitante**

**Fundamentos:**

• $equipo_local: Lleva ganando ${stats.localStats?.wins || 0} de ${stats.localStats?.matchesPlayed || 0} partidos de local${stats.localStats?.losses ? ` y ${stats.localStats.losses} derrota${stats.localStats.losses > 1 ? 's' : ''}` : ''}${stats.localStats?.draws ? ` y ${stats.localStats.draws} empate${stats.localStats.draws > 1 ? 's' : ''}` : ''}

• $equipo_visitante: Lleva ${stats.visitorStats?.wins ? `ganando ${stats.visitorStats.wins} de ${stats.visitorStats.matchesPlayed || 0} partidos de visitante` : `perdiendo ${stats.visitorStats?.losses || 0} de ${stats.visitorStats?.matchesPlayed || 0} partidos de visitante`}${stats.visitorStats?.draws ? ` y ${stats.visitorStats.draws} empate${stats.visitorStats.draws > 1 ? 's' : ''}` : ''}

• $equipo_local tiene un **${stats.probabilities.localWin}%** de probabilidades de victoria

• $equipo_visitante tiene un **${stats.probabilities.visitorWin}%** de probabilidades${stats.probabilities.draw ? `\n• Empate tiene un **${stats.probabilities.draw}%** de probabilidades` : ''}

**Recomendación:** Apuesta a victoria de ${stats.analysis?.winnerRecommendation === 'local' ? match.equipoLocal : stats.analysis?.winnerRecommendation === 'visitor' ? match.equipoVisitante : 'Empate'}${stats.recommendedOdds?.localWin || stats.recommendedOdds?.visitorWin ? ` con cuota estimada de ${responseTemplate.formatNumber(stats.recommendedOdds?.localWin || stats.recommendedOdds?.visitorWin || 0)}` : ''}

¿Quieres que analice otros aspectos del partido?`;
        
        response.response = responseTemplate.formatTemplate(template, {
            equipo_local: match.equipoLocal,
            equipo_visitante: match.equipoVisitante
        });
        
    } catch (error) {
        console.error('Error in handleWinnerPrediction:', error);
        response.response = "Lo siento, ocurrió un error al analizar el pronóstico. Por favor, intenta de nuevo.";
    }
}

/**
 * Handle goals prediction intent
 */
async function handleGoalsPrediction(conn, entities, message, response) {
    try {
        // Check if we have team names
        if (!entities.teams || entities.teams.length < 2) {
            response.response = "Para darte una predicción de goles, necesito que me digas los dos equipos. Por ejemplo: '¿Cuántos goles habrá en Barcelona vs Real Madrid?'";
            return;
        }
        
        // Find upcoming match
        const PartidosJugar = getModel(conn, consta.SchemaName.partidosJugar);
        const match = await PartidosJugar.findOne({
            $or: [
                {
                    equipoLocal: { $regex: entities.teams[0], $options: 'i' },
                    equipoVisitante: { $regex: entities.teams[1], $options: 'i' }
                },
                {
                    equipoLocal: { $regex: entities.teams[1], $options: 'i' },
                    equipoVisitante: { $regex: entities.teams[0], $options: 'i' }
                }
            ],
            activo: true
        })
        .sort({ fecha: 1 })
        .lean();
        
        if (!match) {
            response.response = `No encontré un partido programado entre ${entities.teams[0]} y ${entities.teams[1]}. ¿Podrías verificar los nombres de los equipos?`;
            return;
        }
        
        // Get match statistics
        const fechaJuego = match.fecha ? new Date(match.fecha) : new Date();
        const stats = await matchStatisticsService.getMatchStatistics(
            conn,
            match.equipoLocal || entities.teams[0],
            match.equipoVisitante || entities.teams[1],
            fechaJuego,
            match.liga
        );
        
        if (!stats || !stats.probabilities) {
            response.response = `Lo siento, no tengo suficientes estadísticas para predecir los goles del partido entre ${match.equipoLocal} y ${match.equipoVisitante}.`;
            return;
        }
        
        // Format response
        const template = `🥅 **PREDICCIÓN DE GOLES: $equipo_local vs $equipo_visitante**

**Total de goles esperado:** ${stats.averages.totalGoalsAvg >= 2.5 ? 'Se espera un partido con muchos goles' : stats.averages.totalGoalsAvg >= 1.5 ? 'Se espera un partido con goles moderados' : 'Se espera un partido con pocos goles'}

**Fundamentos:**

• $equipo_local: Promedio ${responseTemplate.formatNumber(stats.averages.localGoalsAvg, 1)} goles por partido de local

• $equipo_visitante: Promedio ${responseTemplate.formatNumber(stats.averages.visitorGoalsAvg, 1)} goles por partido de visita

**Mercados recomendados:**

${stats.probabilities.over15Goals >= 70 ? '✅' : stats.probabilities.over15Goals >= 50 ? '⚠️' : '❌'} **Over 1.5 goles** - ${stats.probabilities.over15Goals >= 70 ? 'Alta' : stats.probabilities.over15Goals >= 50 ? 'Buena' : 'Baja'} probabilidad (${stats.probabilities.over15Goals}%)${stats.recommendedOdds?.over15Goals ? ` con cuota ${responseTemplate.formatNumber(stats.recommendedOdds.over15Goals)}` : ''}

${stats.probabilities.over25Goals >= 60 ? '✅' : stats.probabilities.over25Goals >= 40 ? '⚠️' : '❌'} **Over 2.5 goles** - ${stats.probabilities.over25Goals >= 60 ? 'Alta' : stats.probabilities.over25Goals >= 40 ? 'Buena' : 'Baja'} probabilidad (${stats.probabilities.over25Goals}%)${stats.recommendedOdds?.over25Goals ? ` con cuota ${responseTemplate.formatNumber(stats.recommendedOdds.over25Goals)}` : ''}`;
        
        response.response = responseTemplate.formatTemplate(template, {
            equipo_local: match.equipoLocal,
            equipo_visitante: match.equipoVisitante
        });
        
    } catch (error) {
        console.error('Error in handleGoalsPrediction:', error);
        response.response = "Lo siento, ocurrió un error al predecir los goles. Por favor, intenta de nuevo.";
    }
}

/**
 * Handle corners prediction intent
 */
async function handleCornersPrediction(conn, entities, message, response) {
    try {
        // Check if we have team names
        if (!entities.teams || entities.teams.length < 2) {
            response.response = "Para darte una predicción de corners, necesito que me digas los dos equipos. Por ejemplo: '¿Cuántos corners habrá en Barcelona vs Real Madrid?'";
            return;
        }
        
        // Find upcoming match
        const PartidosJugar = getModel(conn, consta.SchemaName.partidosJugar);
        const match = await PartidosJugar.findOne({
            $or: [
                {
                    equipoLocal: { $regex: entities.teams[0], $options: 'i' },
                    equipoVisitante: { $regex: entities.teams[1], $options: 'i' }
                },
                {
                    equipoLocal: { $regex: entities.teams[1], $options: 'i' },
                    equipoVisitante: { $regex: entities.teams[0], $options: 'i' }
                }
            ],
            activo: true
        })
        .sort({ fecha: 1 })
        .lean();
        
        if (!match) {
            response.response = `No encontré un partido programado entre ${entities.teams[0]} y ${entities.teams[1]}. ¿Podrías verificar los nombres de los equipos?`;
            return;
        }
        
        // Get match statistics
        const fechaJuego = match.fecha ? new Date(match.fecha) : new Date();
        const stats = await matchStatisticsService.getMatchStatistics(
            conn,
            match.equipoLocal || entities.teams[0],
            match.equipoVisitante || entities.teams[1],
            fechaJuego,
            match.liga
        );
        
        if (!stats || !stats.probabilities) {
            response.response = `Lo siento, no tengo suficientes estadísticas para predecir los corners del partido entre ${match.equipoLocal} y ${match.equipoVisitante}.`;
            return;
        }
        
        // Format response
        const template = `📊 **PREDICCIÓN DE CORNERS: $equipo_local vs $equipo_visitante**

**Corners esperados:** ${stats.averages.totalCornersAvg >= 10 ? 'Se espera un partido con muchos tiros de esquina' : stats.averages.totalCornersAvg >= 8 ? 'Se espera un partido con tiros de esquina moderados' : 'Se espera un partido con pocos tiros de esquina'}

**Fundamentos:**

• $equipo_local: Promedio ${responseTemplate.formatNumber(stats.averages.localCornersAvg, 1)} corners por partido de local

• $equipo_visitante: Promedio ${responseTemplate.formatNumber(stats.averages.visitorCornersAvg, 1)} corners por partido de visita

**Recomendación:**

${stats.probabilities.over85Corners >= 70 ? '✅' : stats.probabilities.over85Corners >= 50 ? '⚠️' : '❌'} **Over 8.5 corners** - ${stats.probabilities.over85Corners >= 70 ? 'Buena opción' : stats.probabilities.over85Corners >= 50 ? 'Opción moderada' : 'Riesgo alto'} (${stats.probabilities.over85Corners}% probabilidad)${stats.recommendedOdds?.over85Corners ? ` a cuota ${responseTemplate.formatNumber(stats.recommendedOdds.over85Corners)}` : ''}

${stats.probabilities.over105Corners >= 50 ? '⚠️' : '❌'} **Over 10.5 corners** - ${stats.probabilities.over105Corners >= 50 ? 'Riesgo medio' : 'Riesgo alto'} (${stats.probabilities.over105Corners}% probabilidad)${stats.recommendedOdds?.over105Corners ? ` a cuota ${responseTemplate.formatNumber(stats.recommendedOdds.over105Corners)}` : ''}`;
        
        response.response = responseTemplate.formatTemplate(template, {
            equipo_local: match.equipoLocal,
            equipo_visitante: match.equipoVisitante
        });
        
    } catch (error) {
        console.error('Error in handleCornersPrediction:', error);
        response.response = "Lo siento, ocurrió un error al predecir los corners. Por favor, intenta de nuevo.";
    }
}

/**
 * Handle BTTS (Both Teams To Score) prediction intent
 */
async function handleBTTSPrediction(conn, entities, message, response) {
    try {
        // Check if we have team names
        if (!entities.teams || entities.teams.length < 2) {
            response.response = "Para darte una predicción de BTTS, necesito que me digas los dos equipos. Por ejemplo: '¿Ambos equipos marcarán en Barcelona vs Real Madrid?'";
            return;
        }
        
        // Find upcoming match
        const PartidosJugar = getModel(conn, consta.SchemaName.partidosJugar);
        const match = await PartidosJugar.findOne({
            $or: [
                {
                    equipoLocal: { $regex: entities.teams[0], $options: 'i' },
                    equipoVisitante: { $regex: entities.teams[1], $options: 'i' }
                },
                {
                    equipoLocal: { $regex: entities.teams[1], $options: 'i' },
                    equipoVisitante: { $regex: entities.teams[0], $options: 'i' }
                }
            ],
            activo: true
        })
        .sort({ fecha: 1 })
        .lean();
        
        if (!match) {
            response.response = `No encontré un partido programado entre ${entities.teams[0]} y ${entities.teams[1]}. ¿Podrías verificar los nombres de los equipos?`;
            return;
        }
        
        // Get match statistics
        const fechaJuego = match.fecha ? new Date(match.fecha) : new Date();
        const stats = await matchStatisticsService.getMatchStatistics(
            conn,
            match.equipoLocal || entities.teams[0],
            match.equipoVisitante || entities.teams[1],
            fechaJuego,
            match.liga
        );
        
        if (!stats || !stats.probabilities) {
            response.response = `Lo siento, no tengo suficientes estadísticas para analizar BTTS del partido entre ${match.equipoLocal} y ${match.equipoVisitante}.`;
            return;
        }
        
        // Format response
        const bttsProbability = stats.probabilities.btts || 0;
        const bttsYes = bttsProbability >= 50;
        
        const template = `🔥 **AMBOS EQUIPOS MARCARÁN: $equipo_local vs $equipo_visitante**

**Probabilidad BTTS (Both Teams To Score):** ${bttsProbability}% ${bttsYes ? '✅ SÍ' : '❌ NO'}

**Fundamentos:**

• ${bttsYes ? 'Ambas' : 'Al menos una'} defensas con vulnerabilidades.

• ${bttsYes ? 'Ambas' : 'Al menos una'} ofensivas en buen momento.

${stats.localStats?.matchesPlayed && stats.visitorStats?.matchesPlayed ? `• Historial: Basado en ${stats.localStats.matchesPlayed} partidos locales y ${stats.visitorStats.matchesPlayed} partidos visitantes.` : ''}

**Recomendación:**

🎯 **BTTS - ${bttsYes ? 'SÍ' : 'NO'}** - ${bttsYes ? 'Apuesta de alto valor' : 'No recomendado'} con probabilidad al ${bttsProbability}%.

${stats.recommendedOdds?.bttsYes ? `💰 **Cuota estimada:** La cuota en el mercado es de ${responseTemplate.formatNumber(stats.recommendedOdds.bttsYes)}.` : ''}

¿Te interesa algún otro análisis del partido?`;
        
        response.response = responseTemplate.formatTemplate(template, {
            equipo_local: match.equipoLocal,
            equipo_visitante: match.equipoVisitante
        });
        
    } catch (error) {
        console.error('Error in handleBTTSPrediction:', error);
        response.response = "Lo siento, ocurrió un error al analizar BTTS. Por favor, intenta de nuevo.";
    }
}

/**
 * Handle value bet explanation intent
 */
async function handleValueBetExplanation(conn, message, response) {
    try {
        // Search knowledge base for value bet content
        const KnowledgeBase = getModel(conn, consta.SchemaName.chatbotKnowledgeBase);
        const kbArticles = await KnowledgeBase.find({
            active: true,
            $or: [
                { topic: { $regex: /jugada.*valor|value.*bet/i } },
                { title: { $regex: /jugada.*valor|value.*bet/i } },
                { keywords: { $in: ['valor', 'value', 'bet', 'jugada', 'apuesta'] } }
            ]
        })
        .limit(1)
        .lean();
        
        if (kbArticles && kbArticles.length > 0) {
            const article = kbArticles[0];
            let content = `**${article.title}**\n\n${article.content}`;
            if (article.examples && article.examples.length > 0) {
                content += `\n\n**Ejemplos:**\n${article.examples.map(ex => `- ${ex}`).join('\n')}`;
            }
            response.response = content;
        } else {
            // Default explanation if no KB article found
            response.response = `**¿Qué es una Jugada de Valor (Value Bet)?**

Una jugada de valor es una apuesta donde las probabilidades reales de que ocurra un evento son mayores que las probabilidades implícitas en las cuotas del bookmaker.

**Fórmula básica:**
Valor = (Probabilidad Real × Cuota) - 1

Si el resultado es positivo, hay valor en la apuesta.

**Ejemplo:**
- Probabilidad real de victoria: 50%
- Cuota ofrecida: 2.50
- Valor = (0.50 × 2.50) - 1 = 0.25 (25% de valor positivo)

**Características de una buena jugada de valor:**
• Probabilidad real > Probabilidad implícita en la cuota
• Análisis fundamentado en estadísticas
• Consideración de factores contextuales
• Gestión adecuada del bankroll

¿Te gustaría que analice algún partido específico para encontrar jugadas de valor?`;
        }
    } catch (error) {
        console.error('Error in handleValueBetExplanation:', error);
        response.response = "Lo siento, ocurrió un error al explicar las jugadas de valor. Por favor, intenta de nuevo.";
    }
}

