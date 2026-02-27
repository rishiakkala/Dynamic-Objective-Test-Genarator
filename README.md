# DOTG — Dynamic Online Teaching & Grading

An adaptive learning platform that generates intelligent MCQs from uploaded documents using multi-agent AI.

## Stack
- **Frontend**: Next.js 14 (App Router) · TypeScript
- **Backend**: FastAPI · Python 3.11
- **AI**: CrewAI · ChromaDB · LangChain (OpenRouter)

## Folder Structure
```
DOTG_update/
├── backend.py            # FastAPI app
├── Agents.py             # CrewAI agent definitions
├── tasks.py              # Phase 1 (knowledge) & Phase 2 (question) tasks
├── utils.py              # Document parsing, OCR, table/image extraction
├── vector_store.py       # ChromaDB wrapper
├── evaluation_metrics.py # MCQ quality metrics
├── userProfile.py        # User progress tracking
├── data/
│   ├── users/            # User profile JSON files (gitignored)
│   └── samples/          # Reference question/knowledge files
├── docs/                 # Project documentation
├── uploaded_docs/        # Session files — PDFs, knowledge bases, questions (gitignored)
├── frontend/             # Next.js app
└── requirements.txt
```

## Setup

### Backend
```bash
pip install -r requirements.txt
uvicorn backend:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Environment
Copy `.env.example` to `.env` and fill in:
```
OPENROUTER_API_KEY=your_key_here
```

## Usage
1. Open `http://localhost:3000`
2. Upload a PDF/DOCX on the **Learn** page
3. Wait for processing, then start an **Adaptive Session** (3 rounds)
4. View your **Profile** analysis after completing all 3 rounds