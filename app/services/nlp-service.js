/**
 * NLP Service for Chatbot
 * Handles intent classification and entity extraction
 */

// Basic team synonyms map for canonicalization
// Key: canonical team name (lowercase, no accents)
// Value: array of known synonyms (also lowercase, no accents)
const TEAM_SYNONYMS = {
    'fc barcelona': ['barca', 'barça', 'fc barcelona', 'blaugrana'],
    'real madrid': ['real madrid', 'real', 'madrid', 'real m', 'merengues', 'los blancos'],
    'deportivo alaves': ['deportivo alaves', 'alaves'],
    'manchester united': ['manchester united', 'man united', 'mufc', 'red devils', 'man u'],
    'liverpool': ['liverpool', 'reds', 'the reds', 'liverpool fc'],
    'bayern munich': ['bayern munich', 'bayern', 'fc bayern', 'bavarians']
};

/**
 * Classify user intent from message
 * @param {string} message - User message
 * @returns {string} - Intent type
 */
function extractIntent(message) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Remove accents for better matching
    const normalizedMessage = removeAccents(lowerMessage);
    
    // --- Explicit command-style triggers (useful for testing) ---
    if (normalizedMessage === 'pronostico_ganador') {
        return 'pronostico_ganador';
    }
    if (normalizedMessage === 'prediccion_goles') {
        return 'prediccion_goles';
    }
    if (normalizedMessage === 'prediccion_corners') {
        return 'prediccion_corners';
    }
    if (normalizedMessage === 'ambos_marcan') {
        return 'ambos_marcan';
    }
    if (normalizedMessage === 'explicar_jugada_valor') {
        return 'explicar_jugada_valor';
    }
    // ------------------------------------------------------------
    
    // IMPORTANT: Check specific intents BEFORE general ones to avoid false positives
    
    // Winner prediction patterns (pronostico_ganador) - MUST be checked early
    // Use word boundaries and more specific patterns
    if (/\b(quien|quién)\s+(ganara|ganará|gane|va\s+a\s+ganar|tiene\s+mas\s+probabilidades\s+de\s+ganar)/i.test(normalizedMessage) ||
        /\b(quien|quién)\s+crees\s+que\s+gane/i.test(normalizedMessage) ||
        /\bel\s+equipo\s+favorito\s+ganara/i.test(normalizedMessage) ||
        /\bque\s+equipo\s+va\s+a\s+ganar/i.test(normalizedMessage) ||
        /\bpronostico\s+del\s+ganador/i.test(normalizedMessage) ||
        /\badivina\s+el\s+ganador/i.test(normalizedMessage) ||
        /\bque\s+equipo\s+saldra\s+victorioso/i.test(normalizedMessage) ||
        /\bganador\s+del\s+partido/i.test(normalizedMessage)) {
        return 'pronostico_ganador';
    }
    
    // Goals prediction patterns (prediccion_goles)
    if (/\b(cuantos|cuántos)\s+goles/i.test(normalizedMessage) ||
        /\bcrees\s+que\s+habra\s+mas\s+de/i.test(normalizedMessage) ||
        /\btotal\s+de\s+goles\s+del\s+partido/i.test(normalizedMessage) ||
        /\bpronostico\s+de\s+goles/i.test(normalizedMessage) ||
        /\bhabra\s+muchos\s+goles/i.test(normalizedMessage) ||
        /\bsera\s+un\s+partido\s+goleador/i.test(normalizedMessage) ||
        /\bover.*goles/i.test(normalizedMessage) ||
        /\bmas\s+de.*goles/i.test(normalizedMessage)) {
        return 'prediccion_goles';
    }
    
    // Corners prediction patterns (prediccion_corners)
    if (/\b(cuantos|cuántos)\s+(tiros\s+de\s+esquina|corners)/i.test(normalizedMessage) ||
        /\bcrees\s+que\s+habra\s+mas\s+de.*corners/i.test(normalizedMessage) ||
        /\bcorners\s+del\s+partido/i.test(normalizedMessage) ||
        /\bpronostico\s+de\s+tiros\s+de\s+esquina/i.test(normalizedMessage) ||
        /\bhabra\s+muchos\s+tiros\s+de\s+esquina/i.test(normalizedMessage) ||
        /\bover.*corners/i.test(normalizedMessage) ||
        /\bmas\s+de.*corners/i.test(normalizedMessage)) {
        return 'prediccion_corners';
    }
    
    // BTTS patterns (ambos_marcan)
    if (/\b(crees\s+que\s+)?ambos\s+equipos\s+marc(aran|arán|en)/i.test(normalizedMessage) ||
        /\bbtts\b/i.test(normalizedMessage) ||
        /\bboth\s+teams\s+to\s+score/i.test(normalizedMessage) ||
        /\bmarcaran\s+los\s+dos\s+equipos/i.test(normalizedMessage) ||
        /\bhabra\s+goles\s+de\s+ambos\s+lados/i.test(normalizedMessage) ||
        /\blos\s+dos\s+van\s+a\s+anotar/i.test(normalizedMessage)) {
        return 'ambos_marcan';
    }
    
    // Value bet explanation (explicar_jugada_valor)
    if (/\b(que\s+es\s+una\s+jugada\s+de\s+valor|explicar\s+jugada\s+de\s+valor|que\s+significa\s+value\s+bet|como\s+identificar\s+valor\s+en\s+apuestas|jugada\s+de\s+valor|value\s+bet)/i.test(normalizedMessage)) {
        return 'explicar_jugada_valor';
    }
    
    // Greeting patterns (check AFTER specific intents to avoid false positives)
    if (/^(hola|buen\s+dia|buenas\s+tardes|buenas\s+noches|hey|saludos|buenas|hi|hello)$/i.test(normalizedMessage) ||
        /\bhola\s+betina/i.test(normalizedMessage) ||
        /\b(que\s+tal|como\s+estas)/i.test(normalizedMessage)) {
        return 'greeting';
    }
    
    // Recommendation search patterns (check AFTER specific intents)
    // Only match if it's clearly a recommendation request, not a prediction
    if (/\b(recomendaci|pronostico|prediccion)/i.test(normalizedMessage) ||
        (/\b(partido|match|juego|apuesta)/i.test(normalizedMessage) && 
         !/\b(quien|cuantos|ambos|jugada)/i.test(normalizedMessage))) {
        return 'search_recommendation';
    }
    
    // FAQ patterns
    if (/\b(que\s+es|como\s+funciona|quienes\s+somos|precio|costos|cuanto|informacion|ayuda)/i.test(normalizedMessage)) {
        return 'ask_faq';
    }
    
    // Educational content patterns
    if (/\b(aprender|enseñar|explicar|que\s+son|cuotas|estrategia|basico)/i.test(normalizedMessage)) {
        return 'learn_betting';
    }
    
    // Platform info patterns
    if (/\b(servicio|plataforma|registro|suscribir|miembro|membresia)/i.test(normalizedMessage)) {
        return 'platform_info';
    }
    
    // Default fallback
    return 'fallback';
}

/**
 * Extract entities from message (teams, dates, leagues)
 * @param {string} message - User message
 * @returns {Object} - Extracted entities
 */
function extractEntities(message) {
    const entities = {
        teams: [],
        date: null,
        league: null,
        keywords: []
    };
    
    const lowerMessage = message.toLowerCase();
    
    // Extract team names (enhanced patterns for new intents)
    const vsPatterns = [
        // English patterns: "X vs Y is playing / will play / are playing"
        /([\w\s]+?)\s+(?:vs|versus|contra)\s+([\w\s]+?)\s+(?:is|will|are|was|were)\s+(?:playing|play|going\s+to\s+play)(?:\s|$|\.|,|\?)/i,
        // Winner prediction patterns: "quién ganará el partido X vs Y" (check early for better accuracy)
        /(?:quien|quién)\s+(?:ganara|ganará|gane|va\s+a\s+ganar).*?(?:el\s+)?partido\s+([\w\s]+?)\s+(?:vs|versus|contra)\s+([\w\s]+?)(?:\s|$|\.|,|\?)/i,
        /(?:quien|quién)\s+(?:ganara|ganará|gane|va\s+a\s+ganar).*?(?:entre\s+)?([\w\s]+?)\s+(?:vs|versus|contra)\s+([\w\s]+?)(?:\s|$|\.|,|\?)/i,
        // "partido X vs Y" pattern
        /(?:partido|match|juego)\s+(?:entre\s+)?([\w\s]+?)\s+(?:vs|versus|contra)\s+([\w\s]+?)(?:\s|$|\.|,|\?)/i,
        // Standard patterns: "X vs Y", "X contra Y", "X y Y"
        /(?:^|\s)([\w\s]+?)\s+(?:vs|versus|contra|y|&)\s+([\w\s]+?)(?:\s|$|\.|,|\?)/i,
        /(?:equipo|team)\s+([\w\s]+?)\s+y\s+([\w\s]+)/i,
        // "X vs Y" in context of predictions (fallback)
        /([\w\s]+?)\s+(?:vs|versus|contra)\s+([\w\s]+?)(?:\s|$|\.|,|:|\?)/i
    ];
    
    for (const pattern of vsPatterns) {
        const match = message.match(pattern);
        if (match) {
            // Get the last two capture groups (teams)
            const team1 = match[match.length - 2]?.trim();
            const team2 = match[match.length - 1]?.trim();
            if (team1 && team2) {
                entities.teams = [
                    normalizeTeamName(team1),
                    normalizeTeamName(team2)
                ];
                break;
            }
        }
    }
    
    // If no vs pattern, try to find single team mentions
    if (entities.teams.length === 0) {
        const teamKeywords = ['equipo', 'team', 'club'];
        const teamMentions = message.match(new RegExp(`(${teamKeywords.join('|')})\\s+([\\w\\s]+)`, 'i'));
        if (teamMentions) {
            entities.teams.push(normalizeTeamName(teamMentions[2].trim()));
        }
    }
    
    // Extract dates
    const datePatterns = [
        /(hoy|today|ahora)/i,
        /(mañana|tomorrow)/i,
        /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
        /(\d{1,2}-\d{1,2}-\d{2,4})/,
        /(proxim[oa]|siguiente|next)/
    ];
    
    for (const pattern of datePatterns) {
        const match = lowerMessage.match(pattern);
        if (match) {
            entities.date = match[1];
            break;
        }
    }
    
    // Extract league mentions
    const leagueKeywords = ['liga', 'league', 'copa', 'torneo', 'campeonato'];
    for (const keyword of leagueKeywords) {
        const match = new RegExp(`${keyword}\\s+([\\w\\s]+)`, 'i').exec(lowerMessage);
        if (match) {
            entities.league = match[1].trim();
            break;
        }
    }
    
    return entities;
}

/**
 * Normalize team name for matching
 * @param {string} teamName - Team name to normalize
 * @returns {string} - Normalized team name
 */
function normalizeTeamName(teamName) {
    if (!teamName) return '';
    
    let normalized = teamName.trim();
    
    // Remove common trailing phrases (English), e.g. "is playing", "will play"
    normalized = normalized.replace(/\s+(is|will|are|was|were)\s+(playing|play|going\s+to\s+play).*$/i, '');
    
    // Remove common trailing phrases (Spanish), e.g. "juega", "jugará"
    normalized = normalized.replace(/\s+(juega|juegan|jugara|jugará).*$/i, '');
    
    // Remove common leading prepositions/articles (Spanish + generic)
    normalized = normalized.replace(/^(en|los|las|el|la|de|del|al)\s+/i, '');
    
    // Remove extra spaces
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Remove accents
    normalized = removeAccents(normalized);
    normalized = normalized.trim().toLowerCase();

    // Try to canonicalize using TEAM_SYNONYMS
    const canonical = getCanonicalTeamName(normalized);
    return canonical || normalized;
}

/**
 * Remove accents from string
 * @param {string} str - String to normalize
 * @returns {string} - String without accents
 */
function removeAccents(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Map a normalized team name to its canonical form using synonyms table
 * @param {string} normalizedName - Lowercased, accent-stripped team name
 * @returns {string|null} - Canonical team name (normalized) or null if no match
 */
function getCanonicalTeamName(normalizedName) {
    if (!normalizedName) return null;

    // Direct key match
    if (TEAM_SYNONYMS[normalizedName]) {
        return normalizedName;
    }

    // Search in synonyms lists
    for (const [canonical, synonyms] of Object.entries(TEAM_SYNONYMS)) {
        if (synonyms.includes(normalizedName)) {
            return canonical;
        }
    }

    return null;
}

/**
 * Check if message contains team names (simple heuristic)
 * @param {string} message - User message
 * @returns {boolean} - True if likely contains team names
 */
function containsTeamNames(message) {
    const lowerMessage = message.toLowerCase();
    
    // Common patterns that indicate team names
    const teamIndicators = [
        /\bvs\b|\bversus\b|\bcontra\b/,
        /\bequipo\b|\bteam\b|\bclub\b/,
        /\b[\w\s]+\s+y\s+[\w\s]+/ // "X y Y" pattern
    ];
    
    return teamIndicators.some(pattern => pattern.test(lowerMessage));
}

/**
 * Build MongoDB query from extracted entities
 * @param {Object} entities - Extracted entities
 * @returns {Object} - MongoDB query object
 */
function buildMongoQuery(entities) {
    const query = {
        activo: true
    };
    
    // Add team filters
    if (entities.teams && entities.teams.length > 0) {
        if (entities.teams.length >= 2) {
            // Both teams specified - search for either as local or visitor
            query.$or = [
                {
                    equipoLocal: { $regex: entities.teams[0], $options: 'i' },
                    equipoVisitante: { $regex: entities.teams[1], $options: 'i' }
                },
                {
                    equipoLocal: { $regex: entities.teams[1], $options: 'i' },
                    equipoVisitante: { $regex: entities.teams[0], $options: 'i' }
                }
            ];
        } else if (entities.teams.length === 1) {
            // Single team - search in either field
            query.$or = [
                { equipoLocal: { $regex: entities.teams[0], $options: 'i' } },
                { equipoVisitante: { $regex: entities.teams[0], $options: 'i' } }
            ];
        }
    }
    
    // Add league filter
    if (entities.league) {
        query.liga = { $regex: entities.league, $options: 'i' };
    }
    
    // Add date filter (basic - can be enhanced)
    if (entities.date) {
        const dateQuery = parseDateQuery(entities.date);
        if (dateQuery) {
            query.fechaJuego = dateQuery;
        }
    }
    
    return query;
}

/**
 * Parse date query string to MongoDB date query
 * @param {string} dateStr - Date string (hoy, mañana, or date)
 * @returns {Object|null} - MongoDB date query or null
 */
function parseDateQuery(dateStr) {
    if (!dateStr) return null;
    
    const lowerDate = dateStr.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (lowerDate === 'hoy' || lowerDate === 'today') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return {
            $gte: today.toISOString().split('T')[0],
            $lt: tomorrow.toISOString().split('T')[0]
        };
    }
    
    if (lowerDate === 'mañana' || lowerDate === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfter = new Date(tomorrow);
        dayAfter.setDate(dayAfter.getDate() + 1);
        return {
            $gte: tomorrow.toISOString().split('T')[0],
            $lt: dayAfter.toISOString().split('T')[0]
        };
    }
    
    // Try to parse date format
    const dateMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dateMatch) {
        // Handle date parsing
        return dateStr; // Return as-is, will be matched as string
    }
    
    return null;
}

module.exports = {
    extractIntent,
    extractEntities,
    normalizeTeamName,
    removeAccents,
    getCanonicalTeamName,
    containsTeamNames,
    buildMongoQuery
};

