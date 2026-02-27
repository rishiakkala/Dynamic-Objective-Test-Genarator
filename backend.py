"""
DOTG FastAPI Backend
Exposes all Python pipeline functionality as REST endpoints.
"""

import os
import sys
import json
import asyncio
import uuid
from datetime import datetime
from typing import Optional
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from pydantic import BaseModel

# Add parent dir to path so we can import existing modules
sys.path.insert(0, str(Path(__file__).parent))

import vector_store
from utils import parse_document, extract_correct_answer, extract_reasoning
from userProfile import UserProfile

app = FastAPI(title="DOTG API", version="2.0.0")

# Allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(__file__).parent / "uploaded_docs"
UPLOAD_DIR.mkdir(exist_ok=True)

# In-memory job tracker for background tasks
jobs: dict = {}


def restore_sessions_from_disk():
    """On startup: reload any previously processed sessions from disk so they
    survive uvicorn --reload restarts without requiring re-upload."""
    restored = 0
    for kb_file in UPLOAD_DIR.glob("*_knowledge_base.txt"):
        # filename pattern: {session_id}_knowledge_base.txt
        session_id = kb_file.stem.replace("_knowledge_base", "")
        if session_id in jobs:
            continue  # already loaded
        try:
            knowledge_base = kb_file.read_text(encoding="utf-8")
            # Try to find the original uploaded file
            uploaded_files = list(UPLOAD_DIR.glob(f"{session_id}_*"))
            file_path = next(
                (str(f) for f in uploaded_files
                 if f.suffix in (".pdf", ".docx", ".txt") and "_knowledge" not in f.name and "_questions" not in f.name),
                None
            )
            # Restore extracted images/tables metadata from disk
            images_dir = UPLOAD_DIR / f"{session_id}_images"
            saved_images = []
            if images_dir.exists():
                for img_file in sorted(images_dir.glob("*.png")):
                    # Reconstruct metadata from filename (page{N}_img{M}.png)
                    import re as _re
                    m = _re.match(r"page(\d+)_img(\d+)", img_file.stem)
                    if m:
                        page, idx = int(m.group(1)), int(m.group(2))
                        saved_images.append({
                            "id": f"p{page}_i{idx}",
                            "page": page, "index": idx,
                            "filename": img_file.name,
                            "path": str(img_file),
                            "url": f"/session/{session_id}/images/{img_file.name}"
                        })

            jobs[session_id] = {
                "status": "ready",
                "filename": file_path,
                "file": file_path,
                "progress": {"restored": True},
                "knowledge_base": knowledge_base,
                "error": None,
                "extracted_images": saved_images,
                "extracted_tables": [],
            }
            restored += 1
        except Exception as e:
            print(f"[WARN] Could not restore session {session_id}: {e}")

    if restored:
        print(f"[STARTUP] Restored {restored} session(s) from disk.")


@app.on_event("startup")
async def startup_event():
    restore_sessions_from_disk()


# ─────────────────────────────────────────────
#  MODELS
# ─────────────────────────────────────────────

class GenerateRequest(BaseModel):
    session_id: str
    difficulty: str = "medium"
    count: int = 5
    topic_hint: str = ""

class TopicGenerateRequest(BaseModel):
    topic: str
    difficulty: str = "medium"
    count: int = 5

class TopicGenerateRequest(BaseModel):
    topic: str
    difficulty: str = "medium"
    count: int = 5

class AnswerRequest(BaseModel):
    user_id: str
    question_id: str
    user_answer: str
    correct_answer: str
    time_taken: float
    difficulty: str
    topic: str
    confidence: int = 3


# ─────────────────────────────────────────────
#  HEALTH
# ─────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "ok", "service": "DOTG API v2.0"}

@app.get("/health")
async def health():
    stats = vector_store.get_stats()
    return {"status": "healthy", "vector_db": stats}


# ─────────────────────────────────────────────
#  DOCUMENT UPLOAD & PROCESSING
# ─────────────────────────────────────────────

@app.post("/upload")
async def upload_document(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Upload a PDF — saves it and triggers multimodal parse + vector DB update."""
    if not file.filename.lower().endswith((".pdf", ".docx", ".txt")):
        raise HTTPException(400, "Only PDF, DOCX, and TXT files are supported.")

    session_id = str(uuid.uuid4())[:8]
    save_path = UPLOAD_DIR / f"{session_id}_{file.filename}"

    contents = await file.read()
    with open(save_path, "wb") as f:
        f.write(contents)

    jobs[session_id] = {
        "status": "queued",
        "file": str(save_path),
        "filename": file.filename,
        "progress": {},
        "knowledge_base": None,
        "error": None,
    }

    background_tasks.add_task(process_document_job, session_id, str(save_path))

    return {"session_id": session_id, "filename": file.filename}


def extract_and_save_images(session_id: str, file_path: str) -> list:
    """Extract images from PDF and save them to the session folder."""
    import fitz  # pymupdf
    from PIL import Image
    import io
    
    images_dir = UPLOAD_DIR / f"{session_id}_images"
    images_dir.mkdir(exist_ok=True)
    
    saved_images = []
    try:
        doc = fitz.open(file_path)
        for page_num, page in enumerate(doc, start=1):
            image_list = page.get_images(full=True)
            for img_idx, img_info in enumerate(image_list):
                xref = img_info[0]
                base_image = doc.extract_image(xref)
                img_bytes = base_image["image"]
                
                # Save image
                img_filename = f"page{page_num}_img{img_idx + 1}.png"
                img_path = images_dir / img_filename
                
                try:
                    pil_img = Image.open(io.BytesIO(img_bytes))
                    # Convert to RGB if necessary
                    if pil_img.mode in ('RGBA', 'P'):
                        pil_img = pil_img.convert('RGB')
                    pil_img.save(img_path, "PNG")
                    saved_images.append({
                        "id": f"p{page_num}_i{img_idx + 1}",
                        "page": page_num,
                        "index": img_idx + 1,
                        "filename": img_filename,
                        "path": str(img_path),
                        "url": f"/session/{session_id}/images/{img_filename}"
                    })
                except Exception as e:
                    print(f"Error saving image {img_filename}: {e}")
        doc.close()
    except Exception as e:
        print(f"Error extracting images: {e}")
    
    return saved_images


def extract_and_save_tables(session_id: str, file_path: str) -> list:
    """Extract tables from PDF and save them as images."""
    import fitz
    from PIL import Image
    
    tables_dir = UPLOAD_DIR / f"{session_id}_tables"
    tables_dir.mkdir(exist_ok=True)
    
    saved_tables = []
    try:
        doc = fitz.open(file_path)
        for page_num, page in enumerate(doc, start=1):
            tables = page.find_tables()
            if tables and tables.tables:
                for tab_idx, table in enumerate(tables.tables, start=1):
                    try:
                        # Get table bounding box
                        bbox = table.bbox
                        # Render page and crop to table
                        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x zoom for better quality
                        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                        
                        # Crop to table (multiply by 2 due to zoom)
                        left = int(bbox[0] * 2)
                        top = int(bbox[1] * 2)
                        right = int(bbox[2] * 2)
                        bottom = int(bbox[3] * 2)
                        
                        table_img = img.crop((left, top, right, bottom))
                        
                        table_filename = f"page{page_num}_table{tab_idx}.png"
                        table_path = tables_dir / table_filename
                        table_img.save(table_path, "PNG")
                        
                        saved_tables.append({
                            "id": f"p{page_num}_t{tab_idx}",
                            "page": page_num,
                            "index": tab_idx,
                            "filename": table_filename,
                            "path": str(table_path),
                            "url": f"/session/{session_id}/tables/{table_filename}"
                        })
                    except Exception as e:
                        print(f"Error saving table {tab_idx} on page {page_num}: {e}")
        doc.close()
    except Exception as e:
        print(f"Error extracting tables: {e}")
    
    return saved_tables


def process_document_job(session_id: str, file_path: str):
    """Background task: parse document and update vector DB."""
    job = jobs[session_id]
    try:
        job["status"] = "processing"

        # Step 1: Parse
        job["progress"]["parse"] = "running"
        doc_result = parse_document(file_path)
        if "error" in doc_result:
            raise Exception(doc_result["error"])

        content = doc_result.get("content", "")
        job["progress"]["parse"] = "done"
        job["progress"]["pages"] = doc_result.get("pages", 0)
        job["progress"]["tables"] = doc_result.get("tables_found", 0)
        job["progress"]["images"] = doc_result.get("images_found", 0)
        job["progress"]["equations"] = doc_result.get("equations_found", 0)

        # Step 2: Extract and save images, tables
        job["progress"]["extract_assets"] = "running"
        saved_images = extract_and_save_images(session_id, file_path)
        saved_tables = extract_and_save_tables(session_id, file_path)
        job["extracted_images"] = saved_images
        job["extracted_tables"] = saved_tables
        job["progress"]["extract_assets"] = "done"
        job["progress"]["extracted_images_count"] = len(saved_images)
        job["progress"]["extracted_tables_count"] = len(saved_tables)

        # Step 3: Vector DB
        job["progress"]["vector_db"] = "running"
        chunks = vector_store.upsert_document(file_path, content)
        job["progress"]["vector_db"] = "done"
        job["progress"]["chunks"] = chunks

        # Step 4: CrewAI knowledge structuring
        job["progress"]["agents"] = "running"
        from tasks import create_knowledge_tasks
        from Agents import document_parser, multimodal_extractor, knowledge_structurer
        from crewai import Crew, Process

        tasks, agents = create_knowledge_tasks("document", content, file_path=file_path)
        crew = Crew(agents=agents, tasks=tasks, process=Process.sequential, verbose=False)
        result = crew.kickoff()

        kb_path = UPLOAD_DIR / f"{session_id}_knowledge_base.txt"
        # CrewAI v0.51+ returns CrewOutput; extract .raw text
        kb_text = result.raw if hasattr(result, 'raw') and result.raw else str(result)
        with open(kb_path, "w", encoding="utf-8") as f:
            f.write(kb_text)

        job["progress"]["agents"] = "done"
        job["knowledge_base"] = kb_text
        job["status"] = "ready"

    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)
        import traceback
        traceback.print_exc()


@app.get("/session/{session_id}/status")
async def session_status(session_id: str):
    """Poll the processing status of a session."""
    if session_id not in jobs:
        raise HTTPException(404, "Session not found")
    job = jobs[session_id]
    return {
        "session_id": session_id,
        "status": job["status"],
        "filename": job.get("filename"),
        "progress": job.get("progress", {}),
        "error": job.get("error"),
    }


@app.get("/session/{session_id}/stream")
async def session_stream(session_id: str):
    """Server-Sent Events stream for live progress updates."""
    async def event_generator():
        prev = None
        for _ in range(300):   # max ~5 min polling
            if session_id not in jobs:
                break
            job = jobs[session_id]
            current = {
                "status": job["status"],
                "progress": job.get("progress", {}),
                "error": job.get("error"),
            }
            if current != prev:
                yield f"data: {json.dumps(current)}\n\n"
                prev = current
            if job["status"] in ("ready", "error"):
                break
            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ─────────────────────────────────────────────
#  QUESTION GENERATION
# ─────────────────────────────────────────────

import re as _re

_PLACEHOLDER_RE = _re.compile(
    r'^\(?(?:text|table|image|equation|figure|diagram)'
    r'\s*[-\u2013]\s*(?:remembering|understanding|applying|analyzing|evaluating|creating|synthesizing)\)?[*]*$',
    _re.IGNORECASE
)

_TABLE_KW  = {'table', 'column', 'row', 'normal form', 'comparison', 'ranking', 'compared to',
               'higher', 'lower', 'first normal', 'second normal', 'third normal'}
_IMAGE_KW  = {'diagram', 'figure', 'illustrates', 'entity', 'relationship', 'architecture',
               'labeled', 'component', 'model', 'structure'}
_EQ_KW     = {'formula', 'equation', 'variable', 'coefficient', 'calculate', 'expression'}


def is_placeholder_question(text: str) -> bool:
    """Return True if the question text is a taxonomy label or too short to be real."""
    t = text.strip().rstrip('*').strip()
    if len(t) < 15:
        return True
    if _PLACEHOLDER_RE.match(t):
        return True
    low = t.lower()
    return any(s in low for s in [
        "provide the actual", "provide image description",
        "refer to the diagram", "looking at the presented image",
        "insert question", "[question text]", "(provide",
    ])


def classify_content_type(question_text: str) -> str:
    """Classify whether a question stems from text, table, image, or equation content."""
    low = question_text.lower()
    if any(k in low for k in _TABLE_KW):   return "table"
    if any(k in low for k in _IMAGE_KW):   return "image"
    if any(k in low for k in _EQ_KW):      return "equation"
    return "text"


def parse_question_block_enhanced(block: str, index: int, session_images: list = None, session_tables: list = None) -> dict:
    """Parse a question block to extract all components including image references."""
    import re
    
    # Check if question references an image
    image_keywords = ['image', 'diagram', 'figure', 'picture', 'chart', 'graph', 'illustration']
    has_image_reference = any(keyword in block.lower() for keyword in image_keywords)
    
    # Extract question text (everything before options)
    # Handle both "Question X:" and "**Question X:**" formats
    question_match = re.search(r'(?:\*\*)?Question\s*\d+:(?:\*\*)?\s*(.+?)(?=[ABCD]\)|$)', block, re.DOTALL)
    question_text = ""
    if question_match:
        question_text = question_match.group(1).strip()
    
    # Extract options with better regex
    options = []
    option_pattern = r'([ABCD])\)\s*(.+?)(?=(?:[ABCD]\)|Correct|Answer|Explanation|$))'
    option_matches = re.findall(option_pattern, block, re.DOTALL)
    for opt_letter, opt_text in option_matches:
        # Clean up the option text
        clean_text = opt_text.strip().replace('\n', ' ')
        # Remove any trailing newlines or extra spaces
        clean_text = ' '.join(clean_text.split())
        options.append({"key": opt_letter, "text": clean_text})
    
    # Find relevant images/tables based on question content
    relevant_images = []
    relevant_tables = []
    question_lower = question_text.lower()  # define once, used in both image + table checks

    if session_images and has_image_reference:
        for img in session_images:
            relevant_images.append(img)

    if session_tables and ('table' in question_lower or 'data' in question_lower or 'row' in question_lower):
        for table in session_tables:
            relevant_tables.append(table)

    return {
        "id": index + 1,
        "block": block.strip(),
        "question_text": question_text,
        "options": options,
        "correct_answer": extract_correct_answer(block),
        "reasoning": extract_reasoning(block),
        "content_type": classify_content_type(question_text),
        "has_image_reference": has_image_reference,
        "images": relevant_images[:3],
        "tables": relevant_tables[:2],
    }


@app.post("/generate")
async def generate_questions(req: GenerateRequest):
    """Generate MCQs from a session's knowledge base."""
    if req.session_id not in jobs:
        raise HTTPException(404, "Session not found")

    job = jobs[req.session_id]
    if job["status"] != "ready":
        raise HTTPException(400, f"Session not ready. Status: {job['status']}")

    knowledge_base = job["knowledge_base"]
    file_path = job.get("file")

    # Vector search for relevant context
    search_query = f"{req.topic_hint} {req.difficulty} difficulty educational content"
    vector_context = vector_store.build_context_from_query(
        query_text=search_query, top_k=6, file_path=file_path
    )

    try:
        from tasks import create_question_tasks
        from Agents import question_generator as q_gen, distractor_specialist
        from crewai import Crew, Process

        tasks = create_question_tasks(knowledge_base, req.difficulty, req.count,
                                      vector_context=vector_context)
        crew = Crew(agents=[q_gen, distractor_specialist], tasks=tasks,
                    process=Process.sequential, verbose=False)
        result = crew.kickoff()

        # CrewAI v0.51+ returns a CrewOutput object, not a plain string.
        # Extract text via .raw (preferred) -> .to_dict() -> str() fallback.
        if hasattr(result, 'raw') and result.raw:
            questions_text = str(result.raw)
        elif hasattr(result, 'to_dict'):
            try:
                questions_text = str(result.to_dict())
            except Exception:
                questions_text = str(result)
        else:
            questions_text = str(result)

        if not questions_text.strip():
            raise ValueError("CrewAI returned empty output — check agent/LLM configuration.")

        # Save to file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        q_file = UPLOAD_DIR / f"{req.session_id}_questions_{req.difficulty}_{timestamp}.txt"
        with open(q_file, "w", encoding="utf-8") as f:
            f.write(questions_text)

        # Parse into structured list with enhanced parsing
        import re
        # Handle both "Question X:" and "**Question X:**" formats
        blocks = re.findall(
            r"(?:\*\*)?Question\s*\d+:(?:\*\*)?.*?(?=(?:\*\*)?Question\s*\d+:(?:\*\*)?|$)",
            questions_text, re.DOTALL
        )

        # Get session images and tables
        session_images = job.get("extracted_images", [])
        session_tables = job.get("extracted_tables", [])

        questions = []
        for i, block in enumerate(blocks):
            try:
                q = parse_question_block_enhanced(block, i, session_images, session_tables)
                if not is_placeholder_question(q.get('question_text', '')):
                    questions.append(q)
                else:
                    print(f"[FILTER] Discarded placeholder question {i}: {q.get('question_text', '')[:60]}")
            except Exception as parse_err:
                print(f"[WARN] Skipping block {i} due to parse error: {parse_err}")

        if not questions:
            raise ValueError(f"No valid questions could be parsed. Raw output (first 500 chars): {questions_text[:500]}")

        return {
            "session_id": req.session_id,
            "difficulty": req.difficulty,
            "count": len(questions),
            "questions": questions,
            "questions_file": str(q_file),
            "available_images": session_images,
            "available_tables": session_tables,
        }

    except HTTPException:
        raise  # re-raise FastAPI HTTP exceptions unchanged
    except Exception as e:
        import traceback
        err_detail = traceback.format_exc()
        print(f"\n[ERROR] /generate failed:\n{err_detail}")
        raise HTTPException(500, f"Generation failed: {str(e)}")



@app.post("/generate-topic")
async def generate_by_topic(req: TopicGenerateRequest):
    """Generate MCQs from a topic string — no uploaded session required.
    Uses vector DB if docs are indexed, otherwise generates from LLM knowledge."""
    search_query = f"{req.topic} {req.difficulty} difficulty educational questions"
    # Search all indexed docs (no file_path filter)
    vector_context = vector_store.build_context_from_query(
        query_text=search_query, top_k=8, file_path=None
    )

    # Build a knowledge base stub from the topic + any vector context
    if vector_context.strip():
        knowledge_base = (
            f"Topic: {req.topic}\n\n"
            f"=== RELEVANT CONTEXT FROM INDEXED DOCUMENTS ===\n{vector_context}"
        )
    else:
        knowledge_base = (
            f"Topic: {req.topic}\n\n"
            f"Generate questions based on your knowledge of this topic."
        )

    try:
        import re
        from tasks import create_question_tasks
        from Agents import question_generator as q_gen, distractor_specialist
        from crewai import Crew, Process

        tasks = create_question_tasks(knowledge_base, req.difficulty, req.count,
                                      vector_context=vector_context)
        crew = Crew(agents=[q_gen, distractor_specialist], tasks=tasks,
                    process=Process.sequential, verbose=False)
        result = crew.kickoff()
        questions_text = str(result)

        # Save to file for dashboard evaluation
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_topic = re.sub(r'[^a-zA-Z0-9]', '_', req.topic)[:20]
        topic_sid = f"topic_{safe_topic}"
        q_file = UPLOAD_DIR / f"{topic_sid}_questions_{req.difficulty}_{timestamp}.txt"
        with open(q_file, "w", encoding="utf-8") as f:
            f.write(questions_text)

        # Handle both "Question X:" and "**Question X:**" formats
        blocks = re.findall(r"(?:\*\*)?Question\s*\d+:(?:\*\*)?.*?(?=(?:\*\*)?Question\s*\d+:(?:\*\*)?|$)", questions_text, re.DOTALL)
        questions = [parse_question_block_enhanced(block, i) for i, block in enumerate(blocks)]
        
        return {
            "session_id": topic_sid,
            "topic": req.topic,
            "difficulty": req.difficulty,
            "count": len(questions),
            "questions": questions,
            "questions_file": str(q_file),
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Topic generation failed: {str(e)}")


# ─────────────────────────────────────────────
#  EVALUATION
# ─────────────────────────────────────────────

@app.get("/session/{session_id}/evaluate")
async def evaluate_questions(session_id: str):
    """Run evaluation metrics on the most recent questions file for a session."""
    # Find newest questions file for this session
    files = sorted(UPLOAD_DIR.glob(f"{session_id}_questions_*.txt"), key=os.path.getctime)
    if not files:
        raise HTTPException(404, "No questions file found for this session")

    q_file = str(files[-1])
    kb_file = str(UPLOAD_DIR / f"{session_id}_knowledge_base.txt")

    try:
        from evaluation_metrics import evaluate_question_set_comprehensive
        results = evaluate_question_set_comprehensive(
            questions_file=q_file,
            knowledge_base_file=kb_file if os.path.exists(kb_file) else None,
        )
        return {
            "num_questions": results.get("num_questions", 0),
            "metrics": results.get("metrics", {}),
            "questions": results.get("questions", []),
        }
    except Exception as e:
        raise HTTPException(500, f"Evaluation failed: {str(e)}")


# ─────────────────────────────────────────────
#  ASSETS (IMAGES, TABLES)
# ─────────────────────────────────────────────

@app.get("/session/{session_id}/images")
async def list_session_images(session_id: str):
    """List all extracted images for a session."""
    if session_id not in jobs:
        raise HTTPException(404, "Session not found")
    job = jobs[session_id]
    images = job.get("extracted_images", [])
    return {"session_id": session_id, "images": images}


@app.get("/session/{session_id}/images/{filename}")
async def get_session_image(session_id: str, filename: str):
    """Serve an extracted image."""
    images_dir = UPLOAD_DIR / f"{session_id}_images"
    img_path = images_dir / filename
    if not img_path.exists():
        raise HTTPException(404, "Image not found")
    return FileResponse(str(img_path), media_type="image/png")


@app.get("/session/{session_id}/tables")
async def list_session_tables(session_id: str):
    """List all extracted tables for a session."""
    if session_id not in jobs:
        raise HTTPException(404, "Session not found")
    job = jobs[session_id]
    tables = job.get("extracted_tables", [])
    return {"session_id": session_id, "tables": tables}


@app.get("/session/{session_id}/tables/{filename}")
async def get_session_table(session_id: str, filename: str):
    """Serve an extracted table image."""
    tables_dir = UPLOAD_DIR / f"{session_id}_tables"
    table_path = tables_dir / filename
    if not table_path.exists():
        raise HTTPException(404, "Table not found")
    return FileResponse(str(table_path), media_type="image/png")


# ─────────────────────────────────────────────
#  VECTOR DB
# ─────────────────────────────────────────────

@app.get("/vectordb/stats")
async def vectordb_stats():
    return vector_store.get_stats()


# ─────────────────────────────────────────────
#  USER PROFILE
# ─────────────────────────────────────────────

@app.get("/user/{user_id}")
async def get_user(user_id: str):
    profile = UserProfile.load(user_id)
    return profile.get_stats()

@app.post("/user/answer")
async def submit_answer(req: AnswerRequest):
    profile = UserProfile.load(req.user_id)
    correct = req.user_answer.upper() == req.correct_answer.upper()
    profile.add_response(
        question_id=req.question_id,
        correct=correct,
        time_taken=req.time_taken,
        difficulty=req.difficulty,
        topic=req.topic,
        confidence=req.confidence,
    )
    profile.save()
    return {"correct": correct, "stats": profile.get_stats()}


@app.get("/user/{user_id}/performance")
async def get_user_performance(user_id: str, session_id: str = None):
    """Get detailed user performance data including session history."""
    profile = UserProfile.load(user_id)
    stats = profile.get_stats()
    
    # Build session history from performance_history
    session_history = []
    for response in profile.performance_history:
        session_history.append({
            "question_id": response.get("question_id", ""),
            "correct": response.get("correct", False),
            "time_taken": response.get("time_taken", 0),
            "difficulty": response.get("difficulty", "medium"),
            "topic": response.get("topic", "general"),
            "timestamp": response.get("timestamp", ""),
        })
    
    return {
        "user_id": user_id,
        "total_questions": stats.get("total_questions", 0),
        "correct_answers": int(stats.get("total_questions", 0) * stats.get("accuracy_rate", 0)),
        "accuracy_rate": stats.get("accuracy_rate", 0),
        "avg_response_time": stats.get("avg_response_time", 0),
        "current_difficulty": stats.get("current_difficulty", "medium"),
        "skill_level": stats.get("skill_level", 0),
        "topics_mastery": stats.get("topics_mastery", {}),
        "session_history": session_history,
    }
