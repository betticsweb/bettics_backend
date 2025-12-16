# Phase 1 Implementation - Betina Chatbot Foundation

## ✅ Completed Components

### 1. Match Statistics Model (`backend/app/models/matchStatistics.js`)

**Purpose:** Store calculated statistics and probabilities for matches to support Betina's predictions.

**Key Features:**
- Historical performance tracking (last 6 matches)
- Calculated averages (goals, corners, etc.)
- Probability calculations (win, BTTS, over/under)
- Recommended odds calculation
- Analysis summaries

**Schema Fields:**
- Match identification (teams, league, date)
- Local/visitor statistics (wins, losses, goals, corners)
- Averages (goals per match, corners per match)
- Probabilities (0-100 scale)
- Recommended odds
- Analysis recommendations

---

### 2. Response Template Engine (`backend/app/services/response-template.service.js`)

**Purpose:** Dynamic response generation with variable substitution for Betina's responses.

**Key Features:**
- Template variable replacement (`$variable` syntax)
- Number and percentage formatting
- Specialized formatters for:
  - Winner predictions
  - Goals predictions
  - Corners predictions
  - BTTS predictions

**Usage Example:**
```javascript
const template = "🔮 **ANÁLISIS DE GANADOR: $equipo_local vs $equipo_visitante**";
const data = { equipo_local: "Barcelona", equipo_visitante: "Real Madrid" };
const response = formatTemplate(template, data);
// Result: "🔮 **ANÁLISIS DE GANADOR: Barcelona vs Real Madrid**"
```

---

### 3. Enhanced NLP Service (`backend/app/services/nlp-service.js`)

**Purpose:** Improved intent classification and entity extraction for new Betina intents.

**New Intents Supported:**
- `pronostico_ganador` - Winner prediction
- `prediccion_goles` - Goals prediction
- `prediccion_corners` - Corners prediction
- `ambos_marcan` - BTTS (Both Teams To Score)
- `explicar_jugada_valor` - Value bet explanation

**Enhanced Entity Extraction:**
- Better team name extraction from complex patterns
- Handles "quién ganará entre X vs Y" patterns
- Improved date parsing
- League extraction

---

### 4. Match Statistics Service (`backend/app/services/match-statistics.service.js`)

**Purpose:** Calculate and aggregate match statistics from historical data.

**Key Functions:**
- `getMatchStatistics()` - Get or calculate stats for a match
- `calculateMatchStatistics()` - Calculate from historical data
- `calculateTeamStats()` - Aggregate team performance
- `calculateProbabilities()` - Convert stats to probabilities
- `calculateRecommendedOdds()` - Convert probabilities to odds
- `generateAnalysis()` - Create analysis summaries

**Data Sources:**
- `resultados` collection (historical match results)
- `eventosLiga` collection (league events)
- Calculates from last 6 matches per team

---

### 5. Conversation Logging Model (`backend/app/models/chatbotConversation.js`)

**Purpose:** Store all Betina conversations for analytics and improvement.

**Key Features:**
- Session tracking
- User association (optional)
- Intent and confidence logging
- Entity extraction logging
- Response and recommendations storage
- Feedback collection (helpful, rating, comments)
- Error tracking
- Performance metrics (processing time)

**Indexes:**
- Session ID + timestamp
- Intent + timestamp
- User ID + timestamp
- Timestamp (for date range queries)

---

### 6. Conversation Controller & Routes (`backend/app/controllers/chatbot-conversation.js`)

**Purpose:** Manage conversation logging and analytics.

**Endpoints:**
- `GET /api/chatbot/conversations` - Get conversations with filters
- `GET /api/chatbot/conversations/export` - Export to CSV
- `GET /api/chatbot/conversations/analytics` - Get analytics
- `PUT /api/chatbot/conversations/:id/feedback` - Update feedback

**Features:**
- Filter by session, user, intent, date range
- CSV export with proper escaping
- Analytics aggregation (intent distribution, feedback stats)
- Pagination support

**Helper Function:**
- `saveConversation()` - Save conversation (can be called from other controllers)

---

### 7. Updated Constants (`backend/app/config/constantes.js`)

**Added Schema Names:**
- `matchStatistics` - For match statistics collection
- `chatbotConversation` - For conversation logging collection

---

## 📊 Database Collections

### New Collections Required:

1. **matchStatistics**
   - Stores calculated match statistics
   - Indexed by teams, date, league
   - Auto-calculated from historical data if not exists

2. **chatbotConversation**
   - Stores all chatbot conversations
   - Indexed for efficient queries
   - Supports analytics and export

---

## 🔌 Integration Points

### How to Use in Chatbot Controller:

```javascript
// 1. Get match statistics
const matchStats = await matchStatisticsService.getMatchStatistics(
    conn,
    equipoLocal,
    equipoVisitante,
    fechaJuego,
    liga
);

// 2. Format response using template
const template = "🔮 **ANÁLISIS: $equipo_local vs $equipo_visitante**";
const response = responseTemplate.formatWinnerPrediction(matchStats, template);

// 3. Save conversation
await conversationController.saveConversation(req, {
    sessionId: sessionId,
    query: userMessage,
    intent: 'pronostico_ganador',
    confidence: 0.85,
    entities: extractedEntities,
    response: response,
    recommendations: recommendations
});
```

---

## 📝 Next Steps (Phase 2)

1. **Implement New Intent Handlers:**
   - Update `chatbot.js` controller to handle new intents
   - Use match statistics service for predictions
   - Use response template engine for formatting

2. **Entity Synonym Management:**
   - Create entity management controller
   - Bulk import with synonyms
   - Team name normalization using synonyms

3. **Response Templates:**
   - Create template storage (database or config)
   - Support for multiple languages
   - Template versioning

4. **Testing:**
   - Unit tests for statistics calculation
   - Integration tests for intent detection
   - Template formatting tests

---

## 🚀 Usage Examples

### Example 1: Get Match Statistics
```javascript
const stats = await matchStatisticsService.getMatchStatistics(
    conn,
    "Barcelona",
    "Real Madrid",
    new Date("2024-01-20"),
    "La Liga"
);

console.log(stats.probabilities.localWin); // 65
console.log(stats.averages.totalGoalsAvg); // 2.8
```

### Example 2: Format Winner Prediction
```javascript
const template = `
🔮 **ANÁLISIS DE GANADOR: $equipo_local vs $equipo_visitante**
• $equipo_local: $local_probability probabilidad
• $equipo_visitante: $visitor_probability probabilidad
`;

const response = responseTemplate.formatWinnerPrediction(stats, template);
```

### Example 3: Save Conversation
```javascript
await conversationController.saveConversation(req, {
    sessionId: "session_123",
    query: "quién ganará entre Barcelona vs Real Madrid",
    intent: "pronostico_ganador",
    confidence: 0.92,
    entities: {
        teams: ["Barcelona", "Real Madrid"],
        date: null,
        league: null
    },
    response: formattedResponse,
    recommendations: []
});
```

---

## ⚠️ Important Notes

1. **Data Dependencies:**
   - Statistics calculation requires historical data in `resultados` collection
   - Ensure `resultados` has sufficient data (at least 6 matches per team)

2. **Performance:**
   - Statistics are cached in `matchStatistics` collection
   - First calculation may be slow, subsequent queries are fast

3. **Accuracy:**
   - Probabilities are calculated from historical data
   - For better accuracy, consider integrating external stats APIs

4. **Conversation Logging:**
   - Logging is non-blocking (errors don't break main flow)
   - Consider rate limiting for analytics endpoints

---

## 📚 Files Created/Modified

### Created:
- `backend/app/models/matchStatistics.js`
- `backend/app/models/chatbotConversation.js`
- `backend/app/services/response-template.service.js`
- `backend/app/services/match-statistics.service.js`
- `backend/app/controllers/chatbot-conversation.js`
- `backend/app/routes/chatbot-conversation.js`

### Modified:
- `backend/app/services/nlp-service.js` (enhanced intents)
- `backend/app/config/constantes.js` (new schema names)
- `backend/server.js` (new routes)

---

## ✅ Phase 1 Complete!

All foundation components are now in place. Ready to proceed with Phase 2: implementing the new intent handlers in the chatbot controller.

