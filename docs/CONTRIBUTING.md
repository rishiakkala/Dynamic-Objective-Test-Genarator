# DOTG — Contributing Guide

## File Organization Rules

### Backend (Python / FastAPI)
All Python source must live in the **project root** (until migrated to `backend/`):

| File | Purpose |
|---|---|
| `backend.py` | FastAPI app, all API endpoints |
| `Agents.py` | CrewAI agent definitions |
| `tasks.py` | Phase 1 (knowledge) & Phase 2 (question) task creation |
| `utils.py` | PDF parsing, OCR, image/table extraction |
| `vector_store.py` | ChromaDB wrapper |
| `evaluation_metrics.py` | MCQ quality scoring functions |
| `userProfile.py` | User progress tracking (Elo-like rating) |

### Frontend (Next.js / TypeScript)
All TypeScript/TSX lives under `frontend/src/`:

```
frontend/src/
├── app/              ← Next.js App Router pages
│   ├── page.tsx      ← Home / document upload
│   ├── session/      ← Adaptive quiz session
│   ├── profile/      ← Post-session analysis
│   └── dashboard/    ← (legacy, kept for reference)
├── components/
│   └── Navbar.tsx
└── lib/
    └── api.ts        ← Backend API client
```

### Data / Runtime Files (gitignored)
```
data/users/           ← user_profile_*.json
data/samples/         ← reference files
uploaded_docs/        ← session PDFs, knowledge bases, question files
chroma_db/            ← vector database
```

### Docs
```
docs/                 ← project reports, diagrams, academic documents
```

---

## Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Python modules | `snake_case.py` | `vector_store.py` |
| Python classes | `PascalCase` | `UserProfile` |
| Python functions | `snake_case` | `parse_document()` |
| Next.js pages | `page.tsx` in route folder | `session/page.tsx` |
| React components | `PascalCase.tsx` | `Navbar.tsx` |
| API utility fns | `camelCase` | `getUser()`, `generateQuestions()` |
| Environment vars | `UPPER_SNAKE_CASE` | `OPENROUTER_API_KEY` |
| Session IDs | UUID hex prefix `xxxxxxxx_` | `790a28fe_knowledge_base.txt` |

---

## Pre-Commit Checklist

- [ ] No `.py` files added to project root (except `requirements.txt`)
- [ ] No `.ts`/`.tsx` files outside `frontend/`
- [ ] No `user_profile_*.json` in root — they save to `data/users/` automatically
- [ ] No `questions_*.txt` or `*_evaluation.*` committed (generated outputs)
- [ ] `.env` is in `.gitignore` and not staged
- [ ] `venv/`, `__pycache__/`, `frontend/.next/`, `uploaded_docs/` not staged
- [ ] Run `pwsh .\check_structure.ps1` — must show ✅

---

## Running the Project

```bash
# Backend (from DOTG_update/)
uvicorn backend:app --reload --port 8000

# Frontend (from DOTG_update/frontend/)
npm run dev
```

## Adding New Endpoints
1. Add the route function to `backend.py`
2. Add the corresponding API call to `frontend/src/lib/api.ts`
3. Add a Pydantic request model at the top of `backend.py` if needed

## Adding New Pages
1. Create `frontend/src/app/<route-name>/page.tsx`
2. Add a nav link in `frontend/src/components/Navbar.tsx` if user-facing
