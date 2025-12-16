/**
 * Dialogflow Adapter Service
 * Transforms Dialogflow webhook requests/responses to/from internal format
 */

/**
 * Parse Dialogflow webhook request and extract intent/entities
 * @param {Object} dialogflowRequest - Dialogflow webhook request
 * @returns {Object} - Parsed request with intent and entities
 */
function parseDialogflowRequest(dialogflowRequest) {
    try {
        const queryResult = dialogflowRequest.queryResult || {};
        const intent = queryResult.intent || {};
        const parameters = queryResult.parameters || {};
        
        // Get intent name (remove project path)
        const intentName = intent.displayName || 'Fallback';
        
        // Extract entities from Dialogflow parameters
        const entities = extractEntitiesFromParameters(parameters);
        
        // Get original query text
        const queryText = queryResult.queryText || '';
        
        return {
            intent: mapDialogflowIntentToInternal(intentName),
            entities: entities,
            queryText: queryText,
            sessionId: extractSessionId(dialogflowRequest.session || ''),
            originalIntent: intentName,
            allRequiredParamsPresent: queryResult.allRequiredParamsPresent || false,
            confidence: queryResult.intentDetectionConfidence || 0
        };
    } catch (error) {
        console.error('Error parsing Dialogflow request:', error);
        return {
            intent: 'fallback',
            entities: {},
            queryText: '',
            sessionId: '',
            originalIntent: 'Error',
            allRequiredParamsPresent: false,
            confidence: 0
        };
    }
}

/**
 * Extract entities from Dialogflow parameters
 * @param {Object} parameters - Dialogflow parameters object
 * @returns {Object} - Entities in internal format
 */
function extractEntitiesFromParameters(parameters) {
    const entities = {
        teams: [],
        date: null,
        league: null,
        keywords: []
    };
    
    // Extract team names
    // Dialogflow might use: team_local, team_visitor, or TeamName entity
    if (parameters.team_local) {
        entities.teams.push(normalizeTeamName(parameters.team_local));
    }
    if (parameters.team_visitor) {
        entities.teams.push(normalizeTeamName(parameters.team_visitor));
    }
    // Also check for TeamName array (Dialogflow can extract multiple)
    if (parameters.TeamName) {
        const teamNames = Array.isArray(parameters.TeamName) 
            ? parameters.TeamName 
            : [parameters.TeamName];
        teamNames.forEach(team => {
            const normalized = normalizeTeamName(team);
            if (normalized && !entities.teams.includes(normalized)) {
                entities.teams.push(normalized);
            }
        });
    }
    
    // Extract date (Dialogflow uses @sys.date)
    if (parameters.date) {
        entities.date = parseDialogflowDate(parameters.date);
    }
    
    // Extract league
    if (parameters.league) {
        entities.league = parameters.league;
    }
    if (parameters.LeagueName) {
        entities.league = parameters.LeagueName;
    }
    
    return entities;
}

/**
 * Normalize team name (remove accents, articles, etc.)
 * @param {string} teamName - Team name to normalize
 * @returns {string} - Normalized team name
 */
function normalizeTeamName(teamName) {
    if (!teamName || typeof teamName !== 'string') return '';
    
    let normalized = teamName.trim();
    
    // Remove common articles and prefixes
    normalized = normalized.replace(/^(los|las|el|la|de|del|al|cd|club|cf|fc)\s+/i, '');
    
    // Remove extra spaces
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Remove accents
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    return normalized.trim();
}

/**
 * Parse Dialogflow date format to our format
 * @param {string} dateValue - Dialogflow date value (ISO string or object)
 * @returns {string} - Date string in YYYY-MM-DD format
 */
function parseDialogflowDate(dateValue) {
    if (!dateValue) return null;
    
    // If it's already a string in the format we need, return it
    if (typeof dateValue === 'string') {
        // Check if it's an ISO date string
        if (dateValue.includes('T')) {
            return dateValue.split('T')[0];
        }
        // Check if it's already in YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
            return dateValue;
        }
        // Return as-is for relative dates like "hoy", "mañana"
        return dateValue;
    }
    
    // If it's a date object
    if (dateValue instanceof Date || (dateValue.startDate && dateValue.endDate)) {
        const dateStr = dateValue.startDate || dateValue;
        if (dateStr) {
            const date = new Date(dateStr);
            return date.toISOString().split('T')[0];
        }
    }
    
    return null;
}

/**
 * Map Dialogflow intent names to internal intent names
 * @param {string} dialogflowIntent - Dialogflow intent display name
 * @returns {string} - Internal intent name
 */
function mapDialogflowIntentToInternal(dialogflowIntent) {
    const intentMap = {
        'Greeting': 'greeting',
        'Default Welcome Intent': 'greeting',
        'SearchRecommendation': 'search_recommendation',
        'AskFAQ': 'ask_faq',
        'LearnBetting': 'learn_betting',
        'PlatformInfo': 'platform_info',
        'Fallback': 'fallback',
        'Default Fallback Intent': 'fallback'
    };
    
    return intentMap[dialogflowIntent] || 'fallback';
}

/**
 * Extract session ID from Dialogflow session string
 * @param {string} session - Dialogflow session string (e.g., "projects/xxx/agent/sessions/abc123")
 * @returns {string} - Session ID
 */
function extractSessionId(session) {
    if (!session) return '';
    
    const parts = session.split('/');
    return parts[parts.length - 1] || '';
}

/**
 * Format response for Dialogflow webhook
 * @param {Object} internalResponse - Internal response object
 * @returns {Object} - Dialogflow webhook response format
 */
function formatDialogflowResponse(internalResponse) {
    try {
        const { response, recommendations, faqs, knowledgeBase } = internalResponse;
        
        // Build fulfillment text (plain text response)
        let fulfillmentText = response || 'Lo siento, no pude procesar tu solicitud.';
        
        // Build fulfillment messages (structured format)
        const fulfillmentMessages = [
            {
                text: {
                    text: [fulfillmentText]
                }
            }
        ];
        
        // Add rich content if we have recommendations
        if (recommendations && recommendations.length > 0) {
            // Add a structured message with recommendations
            fulfillmentMessages.push({
                payload: {
                    recommendations: recommendations,
                    type: 'recommendations'
                }
            });
        }
        
        // Return Dialogflow webhook response format
        return {
            fulfillmentText: fulfillmentText,
            fulfillmentMessages: fulfillmentMessages,
            payload: {
                recommendations: recommendations || [],
                faqs: faqs || [],
                knowledgeBase: knowledgeBase || null
            }
        };
    } catch (error) {
        console.error('Error formatting Dialogflow response:', error);
        return {
            fulfillmentText: 'Lo siento, ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo.',
            fulfillmentMessages: [
                {
                    text: {
                        text: ['Lo siento, ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo.']
                    }
                }
            ]
        };
    }
}

/**
 * Format error response for Dialogflow
 * @param {string} errorMessage - Error message
 * @returns {Object} - Dialogflow error response
 */
function formatDialogflowError(errorMessage) {
    return {
        fulfillmentText: errorMessage || 'Lo siento, ocurrió un error. Por favor, intenta de nuevo.',
        fulfillmentMessages: [
            {
                text: {
                    text: [errorMessage || 'Lo siento, ocurrió un error. Por favor, intenta de nuevo.']
                }
            }
        ]
    };
}

module.exports = {
    parseDialogflowRequest,
    extractEntitiesFromParameters,
    normalizeTeamName,
    parseDialogflowDate,
    mapDialogflowIntentToInternal,
    extractSessionId,
    formatDialogflowResponse,
    formatDialogflowError
};

