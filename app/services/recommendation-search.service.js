/**
 * Recommendation Search Service
 * Handles fuzzy matching and searching recommendations in database
 */

const Fuse = require('fuse.js');
const { compareTwoStrings } = require('string-similarity');

/**
 * Search recommendations using fuzzy matching
 * @param {Object} conn - MongoDB connection
 * @param {Object} query - MongoDB query object
 * @param {Object} searchParams - Search parameters (teams, etc.)
 * @param {number} limit - Maximum results to return
 * @returns {Promise<Array>} - Array of recommendations
 */
async function searchRecommendations(conn, query, searchParams = {}, limit = 10) {
    try {
        const consta = require('../config/constantes');
        const { getModel } = require('../config/connection');
        const Recomendaciones = getModel(conn, consta.SchemaName.recomendaciones);
        
        // First, try exact/partial match query
        let results = await Recomendaciones.find(query)
            .select('_id id_apuesta_combinada id_apuesta_simple tipoApuesta liga equipoLocal equipoVisitante pais mercadoApuesta opcionApuesta valorOpcionApuesta cuotaSimple cuotaCombinada fechaRegistro fechaJuego')
            .limit(limit * 2) // Get more for fuzzy filtering
            .lean();
        
        // If we have team names in searchParams, apply fuzzy matching
        if (searchParams.teams && searchParams.teams.length > 0 && results.length > 0) {
            results = applyFuzzyMatching(results, searchParams.teams);
        }
        
        // Limit results
        return results.slice(0, limit);
        
    } catch (error) {
        console.error('Error searching recommendations:', error);
        throw error;
    }
}

/**
 * Apply fuzzy matching to results based on team names
 * @param {Array} results - Array of recommendation documents
 * @param {Array} searchTeams - Array of team names to match
 * @returns {Array} - Filtered and sorted results by relevance
 */
function applyFuzzyMatching(results, searchTeams) {
    if (!searchTeams || searchTeams.length === 0) {
        return results;
    }
    
    // Normalize search teams
    const normalizedSearchTeams = searchTeams.map(team => normalizeTeamName(team));
    
    // Score each result based on team name similarity
    const scoredResults = results.map(result => {
        const localTeam = normalizeTeamName(result.equipoLocal || '');
        const visitorTeam = normalizeTeamName(result.equipoVisitante || '');
        
        let maxScore = 0;
        
        // Calculate similarity for each search team
        for (const searchTeam of normalizedSearchTeams) {
            // Compare with local team
            const localScore = compareTwoStrings(
                searchTeam.toLowerCase(),
                localTeam.toLowerCase()
            );
            
            // Compare with visitor team
            const visitorScore = compareTwoStrings(
                searchTeam.toLowerCase(),
                visitorTeam.toLowerCase()
            );
            
            maxScore = Math.max(maxScore, localScore, visitorScore);
        }
        
        // If we have 2 teams, check if both match (higher score)
        if (normalizedSearchTeams.length >= 2) {
            const team1Match = Math.max(
                compareTwoStrings(normalizedSearchTeams[0].toLowerCase(), localTeam.toLowerCase()),
                compareTwoStrings(normalizedSearchTeams[0].toLowerCase(), visitorTeam.toLowerCase())
            );
            const team2Match = Math.max(
                compareTwoStrings(normalizedSearchTeams[1].toLowerCase(), localTeam.toLowerCase()),
                compareTwoStrings(normalizedSearchTeams[1].toLowerCase(), visitorTeam.toLowerCase())
            );
            
            // If both teams match, boost score
            if (team1Match > 0.7 && team2Match > 0.7) {
                maxScore = Math.max(maxScore, (team1Match + team2Match) / 2 + 0.2);
            }
        }
        
        return {
            ...result,
            _relevanceScore: maxScore
        };
    });
    
    // Filter results with minimum similarity threshold (0.5)
    const filteredResults = scoredResults.filter(r => r._relevanceScore >= 0.5);
    
    // Sort by relevance score (highest first)
    filteredResults.sort((a, b) => b._relevanceScore - a._relevanceScore);
    
    // Remove the relevance score before returning
    return filteredResults.map(({ _relevanceScore, ...result }) => result);
}

/**
 * Normalize team name for matching
 * @param {string} teamName - Team name to normalize
 * @returns {string} - Normalized team name
 */
function normalizeTeamName(teamName) {
    if (!teamName) return '';
    
    let normalized = teamName.trim();
    
    // Remove common articles
    normalized = normalized.replace(/^(los|las|el|la|de|del|al|cd|club|cf|fc)\s+/i, '');
    
    // Remove extra spaces
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Remove accents
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    return normalized.trim();
}

/**
 * Format recommendation response for chat
 * @param {Array} recommendations - Array of recommendation documents
 * @returns {string} - Formatted response message
 */
function formatRecommendationResponse(recommendations) {
    if (!recommendations || recommendations.length === 0) {
        return "Lo siento, no tengo recomendaciones para ese partido en mi base de datos actual. ¿Te gustaría buscar otro partido?";
    }
    
    let response = "";
    
    if (recommendations.length === 1) {
        response = "¡Perfecto! Tengo una recomendación para ti:\n\n";
    } else {
        response = `¡Excelente! Encontré ${recommendations.length} recomendaciones:\n\n`;
    }
    
    recommendations.forEach((rec, index) => {
        response += `⚽ **${rec.equipoLocal} vs ${rec.equipoVisitante}**\n`;
        if (rec.liga) response += `📋 Liga: ${rec.liga}\n`;
        if (rec.fechaJuego) response += `📅 Fecha: ${rec.fechaJuego}\n`;
        if (rec.mercadoApuesta) response += `🎯 Mercado: ${rec.mercadoApuesta}\n`;
        if (rec.opcionApuesta) response += `✅ Opción: ${rec.opcionApuesta}\n`;
        if (rec.cuotaSimple) response += `💰 Cuota: ${rec.cuotaSimple}\n`;
        if (rec.cuotaCombinada && rec.cuotaCombinada !== rec.cuotaSimple) {
            response += `💎 Cuota Combinada: ${rec.cuotaCombinada}\n`;
        }
        response += "\n";
    });
    
    return response;
}

/**
 * Search by exact team names (no fuzzy matching)
 * @param {Object} conn - MongoDB connection
 * @param {string} localTeam - Local team name
 * @param {string} visitorTeam - Visitor team name
 * @param {string} date - Optional date filter
 * @returns {Promise<Array>} - Array of recommendations
 */
async function searchByExactMatch(conn, localTeam, visitorTeam, date = null) {
    try {
        const consta = require('../config/constantes');
        const { getModel } = require('../config/connection');
        const Recomendaciones = getModel(conn, consta.SchemaName.recomendaciones);
        
        const query = {
            activo: true,
            $or: [
                {
                    equipoLocal: { $regex: localTeam, $options: 'i' },
                    equipoVisitante: { $regex: visitorTeam, $options: 'i' }
                },
                {
                    equipoLocal: { $regex: visitorTeam, $options: 'i' },
                    equipoVisitante: { $regex: localTeam, $options: 'i' }
                }
            ]
        };
        
        if (date) {
            query.fechaJuego = date;
        }
        
        return await Recomendaciones.find(query)
            .select('_id id_apuesta_combinada id_apuesta_simple tipoApuesta liga equipoLocal equipoVisitante pais mercadoApuesta opcionApuesta valorOpcionApuesta cuotaSimple cuotaCombinada fechaRegistro fechaJuego')
            .limit(10)
            .lean();
            
    } catch (error) {
        console.error('Error in exact match search:', error);
        throw error;
    }
}

module.exports = {
    searchRecommendations,
    applyFuzzyMatching,
    normalizeTeamName,
    formatRecommendationResponse,
    searchByExactMatch
};

