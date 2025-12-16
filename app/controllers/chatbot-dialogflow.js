/**
 * Dialogflow Webhook Controller
 * Handles webhook requests from Dialogflow and processes them using existing services
 */

const errorMiddleware = require('../middleware/errors');
const { getModel, conectionManager } = require('../config/connection');
const consta = require('../config/constantes');
const dialogflowAdapter = require('../services/dialogflow-adapter.service');
const recommendationSearch = require('../services/recommendation-search.service');
const nlpService = require('../services/nlp-service');

/**
 * Main webhook endpoint - Processes Dialogflow webhook requests
 * POST /api/chatbot/dialogflow-webhook
 */
exports.webhook = async (req, res, next) => {
    const conn = conectionManager(req);
    
    try {
        // Log incoming request for debugging
        console.log('Dialogflow webhook received:', JSON.stringify(req.body, null, 2));
        
        // Parse Dialogflow request
        const parsedRequest = dialogflowAdapter.parseDialogflowRequest(req.body);
        
        console.log('Parsed request:', {
            intent: parsedRequest.intent,
            entities: parsedRequest.entities,
            queryText: parsedRequest.queryText
        });
        
        // Handle different intents
        let internalResponse = {
            response: '',
            recommendations: [],
            faqs: [],
            knowledgeBase: null
        };
        
        switch (parsedRequest.intent) {
            case 'greeting':
                internalResponse.response = "¡Hola! 👋 Soy Betina, tu asistente de recomendaciones deportivas. ¿En qué puedo ayudarte? Puedo ayudarte con:\n- Recomendaciones de partidos\n- Información sobre apuestas\n- Preguntas sobre nuestros servicios";
                break;
                
            case 'search_recommendation':
                await handleSearchRecommendation(conn, parsedRequest, internalResponse);
                break;
                
            case 'ask_faq':
                await handleAskFAQ(conn, parsedRequest, internalResponse);
                break;
                
            case 'learn_betting':
                await handleLearnBetting(conn, parsedRequest, internalResponse);
                break;
                
            case 'platform_info':
                internalResponse.response = "Somos una plataforma de recomendaciones deportivas que ofrece análisis y sugerencias de apuestas. Nuestro servicio incluye:\n- Recomendaciones de partidos\n- Análisis de cuotas\n- Estrategias de valor\n\n¿Te gustaría conocer más sobre nuestros servicios o suscribirte?";
                break;
                
            default: // fallback
                internalResponse.response = "No estoy segura de entender. ¿Podrías reformular tu pregunta? Puedo ayudarte con:\n- Recomendaciones de partidos (ej: 'Recomendaciones para Alianza vs Universitario')\n- Preguntas sobre apuestas\n- Información sobre nuestros servicios";
                break;
        }
        
        // Format response for Dialogflow
        const dialogflowResponse = dialogflowAdapter.formatDialogflowResponse(internalResponse);
        
        // Return Dialogflow webhook response
        return res.json(dialogflowResponse);
        
    } catch (err) {
        console.error('Error processing Dialogflow webhook:', err);
        
        // Return error response in Dialogflow format
        const errorResponse = dialogflowAdapter.formatDialogflowError(
            'Lo siento, ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo.'
        );
        
        return res.status(500).json(errorResponse);
    } finally {
        if (conn) {
            conn.close();
        }
    }
};

/**
 * Handle search recommendation intent
 */
async function handleSearchRecommendation(conn, parsedRequest, internalResponse) {
    try {
        const { entities, queryText } = parsedRequest;
        
        // Build MongoDB query from entities
        const query = nlpService.buildMongoQuery(entities);
        
        // Search for recommendations
        const recommendations = await recommendationSearch.searchRecommendations(
            conn,
            query,
            { teams: entities.teams },
            5 // Limit to 5 recommendations
        );
        
        if (recommendations && recommendations.length > 0) {
            internalResponse.recommendations = recommendations;
            internalResponse.response = recommendationSearch.formatRecommendationResponse(recommendations);
        } else {
            // No recommendations found
            internalResponse.response = "Lo siento, no tengo recomendaciones para ese partido en mi base de datos actual. ¿Te gustaría buscar otro partido? Puedes preguntarme por ejemplo: '¿Recomendaciones para Alianza vs Universitario?'";
        }
    } catch (error) {
        console.error('Error in handleSearchRecommendation:', error);
        internalResponse.response = "Lo siento, ocurrió un error al buscar recomendaciones. Por favor, intenta de nuevo.";
    }
}

/**
 * Handle FAQ intent
 */
async function handleAskFAQ(conn, parsedRequest, internalResponse) {
    try {
        const { queryText } = parsedRequest;
        const FAQ = getModel(conn, consta.SchemaName.chatbotFAQ);
        
        // Search FAQs
        const faqs = await FAQ.find({
            active: true,
            $or: [
                { question: { $regex: queryText, $options: 'i' } },
                { answer: { $regex: queryText, $options: 'i' } },
                { keywords: { $in: queryText.toLowerCase().split(/\s+/) } }
            ]
        })
        .sort({ priority: -1 })
        .limit(3)
        .lean();
        
        if (faqs && faqs.length > 0) {
            internalResponse.faqs = faqs;
            internalResponse.response = faqs.map(faq => `**${faq.question}**\n\n${faq.answer}`).join('\n\n---\n\n');
        } else {
            internalResponse.response = "No encontré una respuesta específica para tu pregunta. ¿Podrías reformularla o consultar nuestra sección de ayuda? También puedo ayudarte con recomendaciones de partidos.";
        }
    } catch (error) {
        console.error('Error in handleAskFAQ:', error);
        internalResponse.response = "Lo siento, ocurrió un error al buscar información. Por favor, intenta de nuevo.";
    }
}

/**
 * Handle learn betting intent
 */
async function handleLearnBetting(conn, parsedRequest, internalResponse) {
    try {
        const { queryText } = parsedRequest;
        const KnowledgeBase = getModel(conn, consta.SchemaName.chatbotKnowledgeBase);
        
        // Search knowledge base
        const kbArticles = await KnowledgeBase.find({
            active: true,
            $or: [
                { topic: { $regex: queryText, $options: 'i' } },
                { title: { $regex: queryText, $options: 'i' } },
                { content: { $regex: queryText, $options: 'i' } },
                { keywords: { $in: queryText.toLowerCase().split(/\s+/) } }
            ]
        })
        .limit(1)
        .lean();
        
        if (kbArticles && kbArticles.length > 0) {
            const article = kbArticles[0];
            internalResponse.knowledgeBase = article;
            
            let content = `**${article.title}**\n\n${article.content}`;
            if (article.examples && article.examples.length > 0) {
                content += `\n\n**Ejemplos:**\n${article.examples.map(ex => `- ${ex}`).join('\n')}`;
            }
            if (article.relatedTopics && article.relatedTopics.length > 0) {
                content += `\n\n**Temas relacionados:** ${article.relatedTopics.join(', ')}`;
            }
            internalResponse.response = content;
        } else {
            internalResponse.response = "Puedo ayudarte a aprender sobre apuestas deportivas. Puedes preguntarme sobre conceptos básicos, estrategias de valor, o cómo funcionan las cuotas. ¿Qué te gustaría saber específicamente?";
        }
    } catch (error) {
        console.error('Error in handleLearnBetting:', error);
        internalResponse.response = "Lo siento, ocurrió un error al buscar información educativa. Por favor, intenta de nuevo.";
    }
}

