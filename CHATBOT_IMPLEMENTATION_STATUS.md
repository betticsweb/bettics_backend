# Betina Chatbot Implementation Status

## ✅ Phase 1: Backend API Foundation - COMPLETED

### Created Files

#### Models
- ✅ `backend/app/models/chatbotFAQ.js` - FAQ schema for chatbot
- ✅ `backend/app/models/chatbotKnowledgeBase.js` - Knowledge base schema for educational content

#### Services
- ✅ `backend/app/services/nlp-service.js` - NLP service for intent classification and entity extraction
- ✅ `backend/app/services/recommendation-search.service.js` - Fuzzy matching and recommendation search
- ✅ `backend/app/services/csv-processor.service.js` - CSV parsing and validation

#### Controllers
- ✅ `backend/app/controllers/chatbot.js` - Main chatbot query processing
- ✅ `backend/app/controllers/chatbot-admin.js` - Admin CSV upload functionality

#### Routes
- ✅ `backend/app/routes/chatbot.js` - Public chatbot endpoints
- ✅ `backend/app/routes/chatbot-admin.js` - Admin endpoints for CSV upload

#### Updated Files
- ✅ `backend/app/config/constantes.js` - Added chatbot schema names
- ✅ `backend/server.js` - Registered chatbot routes

#### Installed Packages
- ✅ `fuse.js` - Fuzzy search library
- ✅ `string-similarity` - String comparison
- ✅ `csv-parse` - CSV file parsing
- ✅ `multer` - File upload handling

---

## 📋 API Endpoints Created

### Public Chatbot Endpoints

1. **POST /api/chatbot/query**
   - Main chat endpoint
   - Processes user messages and returns responses
   - Handles intents: greeting, search_recommendation, ask_faq, learn_betting, platform_info

2. **GET /api/chatbot/search**
   - Direct recommendation search
   - Query params: `local`, `visitor`, `date`, `league`

3. **GET /api/chatbot/faqs**
   - Get list of FAQs
   - Query params: `category`, `limit`

4. **GET /api/chatbot/knowledge-base**
   - Get knowledge base articles
   - Query params: `topic`, `limit`

### Admin Endpoints

5. **POST /api/chatbot/admin/upload-csv**
   - Upload and import CSV file with recommendations
   - Multipart form data with `csvFile` field

6. **POST /api/chatbot/admin/preview-csv**
   - Preview CSV before importing
   - Validates and shows preview without saving

7. **GET /api/chatbot/admin/csv-template**
   - Get expected CSV format and sample data

---

## 🔧 Features Implemented

### NLP & Intent Classification
- ✅ Intent extraction (greeting, search, FAQ, educational, platform info, fallback)
- ✅ Entity extraction (teams, dates, leagues)
- ✅ Team name normalization
- ✅ Date parsing (hoy, mañana, specific dates)

### Recommendation Search
- ✅ Fuzzy team name matching using string-similarity
- ✅ MongoDB query building from entities
- ✅ Response formatting for chat
- ✅ Handles partial matches and variations

### CSV Processing
- ✅ CSV file parsing
- ✅ Data validation
- ✅ Error reporting
- ✅ Bulk import to MongoDB
- ✅ Cache clearing after import

---

## ⏭️ Next Steps - Phase 2: Frontend Chat Widget

### TODO
1. Create chat widget component in Angular
2. Create chat service for API calls
3. Create chat models (message, response)
4. Integrate widget globally in app.component
5. Add styling and animations
6. Implement message history (optional: localStorage)

### Files to Create
```
frontend/src/app/
├── shared/
│   ├── components/
│   │   └── betina-chat-widget/
│   │       ├── betina-chat-widget.component.ts
│   │       ├── betina-chat-widget.component.html
│   │       └── betina-chat-widget.component.css
│   └── service/
│       └── betina-chat.service.ts
└── core/
    └── models/
        ├── chat-message.model.ts
        ├── chat-response.model.ts
        └── chatbot-intent.model.ts
```

---

## 🧪 Testing the Backend

### Test the main query endpoint:
```bash
curl -X POST http://localhost:3010/api/chatbot/query \
  -H "Content-Type: application/json" \
  -d '{"message": "Hola"}'
```

### Test recommendation search:
```bash
curl -X POST http://localhost:3010/api/chatbot/query \
  -H "Content-Type: application/json" \
  -d '{"message": "Recomendaciones para Alianza vs Universitario"}'
```

### Test direct search:
```bash
curl "http://localhost:3010/api/chatbot/search?local=Alianza&visitor=Universitario"
```

---

## 📝 Notes

- All endpoints are currently **public** (no authentication required)
- For production, consider adding authentication to admin endpoints
- The chatbot uses rule-based NLP (no LLM required)
- Team name matching uses fuzzy matching (similarity threshold: 0.5)
- CSV import replaces all existing recommendations (deleteMany + insertMany)

---

## 🔗 Database Collections

The following collections need to be created in MongoDB:
- `chatbotFAQ` - For FAQ entries
- `chatbotKnowledgeBase` - For educational content

You can add initial data using MongoDB Compass or mongoose scripts.

