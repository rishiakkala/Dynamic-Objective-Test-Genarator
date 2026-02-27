"""
Utility functions for document processing
Supports: Text, OCR, Tables (summarized), Images (captioned), Equations (recognized)
"""

import os
import re
from typing import Dict, List, Any


# ─────────────────────────────────────────────
#  OCR HELPERS
# ─────────────────────────────────────────────

def ocr_page_image(pil_image) -> str:
    """Run OCR on a PIL image and return extracted text."""
    try:
        import pytesseract
        text = pytesseract.image_to_string(pil_image, lang="eng")
        return text.strip()
    except ImportError:
        pass

    # Fallback: easyocr
    try:
        import easyocr
        import numpy as np
        reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        result = reader.readtext(np.array(pil_image), detail=0)
        return " ".join(result)
    except Exception:
        return ""


def render_pdf_page_as_image(file_path: str, page_number: int):
    """Render a single PDF page as a PIL image (requires pdf2image / poppler)."""
    try:
        from pdf2image import convert_from_path
        images = convert_from_path(file_path, first_page=page_number,
                                   last_page=page_number, dpi=200)
        return images[0] if images else None
    except Exception:
        return None


# ─────────────────────────────────────────────
#  TABLE HELPERS
# ─────────────────────────────────────────────

def extract_tables_from_pdf(file_path: str) -> list:
    """Extract tables from PDF as structured rows using pdfplumber."""
    try:
        import pdfplumber
        tables = []
        with pdfplumber.open(file_path) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                page_tables = page.extract_tables()
                for table in page_tables:
                    if table and len(table) > 1:
                        tables.append({"page": page_num, "rows": table})
        return tables
    except Exception:
        return []


def summarize_table_with_llm(table: dict) -> str:
    """
    Send a raw table to the LLM and get back a plain-English summary.
    Falls back to a simple row-join if LLM is unavailable.
    """
    rows = table.get("rows", [])
    page = table.get("page", "?")

    # Build a human-readable markdown version of the table
    md_rows = []
    for row in rows:
        clean_row = [str(cell).strip() if cell else "" for cell in row]
        md_rows.append(" | ".join(clean_row))
    table_md = "\n".join(md_rows)

    try:
        from langchain_openai import ChatOpenAI
        from dotenv import load_dotenv
        load_dotenv()

        api_key = os.getenv("OPENROUTER_API_KEY")
        llm = ChatOpenAI(
            model="google/gemma-2-9b-it",
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            max_tokens=300,
        )
        prompt = (
            f"Summarize the following table (from page {page}) "
            f"into 2-4 clear, factual sentences. "
            f"Focus on key comparisons, trends, and values.\n\n"
            f"TABLE:\n{table_md}\n\nSUMMARY:"
        )
        response = llm.invoke(prompt)
        summary = response.content.strip() if hasattr(response, "content") else str(response).strip()
        return f"[TABLE SUMMARY — Page {page}]\n{summary}"
    except Exception:
        # Fallback: plain row dump
        return f"[TABLE DATA — Page {page}]\n{table_md}"


# ─────────────────────────────────────────────
#  IMAGE HELPERS
# ─────────────────────────────────────────────

def extract_images_from_pdf(file_path: str) -> list:
    """Extract embedded images from a PDF using pymupdf (fitz). Returns list of PIL Images."""
    images = []
    try:
        import fitz  # pymupdf
        from PIL import Image
        import io

        doc = fitz.open(file_path)
        for page_num, page in enumerate(doc, start=1):
            image_list = page.get_images(full=True)
            for img_idx, img_info in enumerate(image_list):
                xref = img_info[0]
                base_image = doc.extract_image(xref)
                img_bytes = base_image["image"]
                pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                images.append({"page": page_num, "index": img_idx, "image": pil_img})
    except Exception:
        pass
    return images


def caption_image_with_llm(pil_image, page: int, index: int) -> str:
    """
    Send an image to LLM vision (if available) and get a descriptive caption.
    Falls back to a placeholder if vision API is unavailable.
    """
    try:
        import base64
        import io
        from langchain_openai import ChatOpenAI
        from dotenv import load_dotenv
        load_dotenv()

        # Convert PIL image to base64
        buffer = io.BytesIO()
        pil_image.save(buffer, format="JPEG")
        b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

        api_key = os.getenv("OPENROUTER_API_KEY")

        # Use a vision-capable model
        llm = ChatOpenAI(
            model="google/gemini-flash-1.5",
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            max_tokens=200,
        )

        from langchain_core.messages import HumanMessage
        message = HumanMessage(
            content=[
                {"type": "text", "text": (
                    "Describe this image from an educational document in 2-3 sentences. "
                    "Focus on what it illustrates, any labels, and its educational significance."
                )},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ]
        )
        response = llm.invoke([message])
        caption = response.content.strip() if hasattr(response, "content") else str(response).strip()
        return f"[IMAGE CAPTION — Page {page}, Image {index + 1}]\n{caption}"
    except Exception:
        return f"[IMAGE — Page {page}, Image {index + 1}]\n(Image present but could not be captioned automatically)"


# ─────────────────────────────────────────────
#  EQUATION HELPERS
# ─────────────────────────────────────────────

def extract_equations_from_text(text: str) -> list:
    """
    Detect LaTeX-style equations and inline math from extracted text.
    Returns a list of found equations.
    """
    patterns = [
        r'\$\$(.+?)\$\$',           # Display math: $$...$$
        r'\$(.+?)\$',               # Inline math: $...$
        r'\\begin\{equation\}(.+?)\\end\{equation\}',
        r'\\begin\{align\}(.+?)\\end\{align\}',
        r'\\[(.+?)\\]',             # \[...\]
        r'\\((.+?)\\)',             # \(...\)
    ]
    found = []
    for pat in patterns:
        matches = re.findall(pat, text, re.DOTALL)
        found.extend([m.strip() for m in matches if m.strip()])
    return found


def describe_equation(eq_text: str) -> str:
    """
    Convert a LaTeX or plain-text equation into a readable description.
    Uses LLM if available, otherwise returns a cleaned version.
    """
    try:
        from langchain_openai import ChatOpenAI
        from dotenv import load_dotenv
        load_dotenv()

        api_key = os.getenv("OPENROUTER_API_KEY")
        llm = ChatOpenAI(
            model="google/gemma-2-9b-it",
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            max_tokens=150,
        )
        prompt = (
            f"Explain this mathematical equation or formula in one clear sentence "
            f"suitable for a student:\n\n{eq_text}\n\nExplanation:"
        )
        response = llm.invoke(prompt)
        return response.content.strip() if hasattr(response, "content") else str(response).strip()
    except Exception:
        # Return cleaned equation text itself
        return eq_text.replace("\\", "").strip()


# ─────────────────────────────────────────────
#  MASTER PARSE FUNCTION
# ─────────────────────────────────────────────

def parse_pdf_full(file_path: str) -> Dict[str, Any]:
    """
    Full multimodal PDF parser:
    1. Text extraction (PyPDF2)
    2. OCR fallback for pages with little/no text (pytesseract/easyocr)
    3. Table extraction → LLM summarization
    4. Image extraction → LLM captioning
    5. Equation detection → plain-text description
    Returns a unified tagged content string.
    """
    if not os.path.exists(file_path):
        return {"error": "File not found"}

    try:
        import PyPDF2
        content_parts = []
        total_pages = 0
        tables_found = 0
        images_found = 0
        equations_found = 0

        # ── Step 1 & 2: Text + OCR per page ──
        with open(file_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            total_pages = len(reader.pages)

            for page_num, page in enumerate(reader.pages, start=1):
                page_text = page.extract_text() or ""

                # If page text is too short, fall back to OCR
                if len(page_text.strip()) < 80:
                    print(f"  [OCR] Page {page_num} has little text, running OCR...")
                    pil_image = render_pdf_page_as_image(file_path, page_num)
                    if pil_image:
                        page_text = ocr_page_image(pil_image)
                        if page_text:
                            content_parts.append(f"[PAGE {page_num} — OCR]\n{page_text}")
                    # If OCR also fails, skip the page silently
                else:
                    content_parts.append(f"[PAGE {page_num}]\n{page_text}")

        # ── Step 3: Table Extraction + LLM Summarization ──
        print("  [Tables] Extracting and summarizing tables...")
        tables = extract_tables_from_pdf(file_path)
        tables_found = len(tables)
        for table in tables:
            summary = summarize_table_with_llm(table)
            content_parts.append(summary)

        # ── Step 4: Image Extraction + Captioning ──
        print("  [Images] Extracting and captioning images...")
        images = extract_images_from_pdf(file_path)
        images_found = len(images)
        for img_info in images:
            caption = caption_image_with_llm(img_info["image"], img_info["page"], img_info["index"])
            content_parts.append(caption)

        # ── Step 5: Equation Detection ──
        full_raw_text = " ".join(content_parts)
        equations = extract_equations_from_text(full_raw_text)
        equations_found = len(equations)
        if equations:
            eq_descriptions = []
            print(f"  [Equations] Found {equations_found} equations, describing them...")
            for eq in equations[:20]:  # cap at 20 to avoid LLM overload
                desc = describe_equation(eq)
                eq_descriptions.append(f"  • {desc}")
            content_parts.append("[EQUATIONS FOUND IN DOCUMENT]\n" + "\n".join(eq_descriptions))

        unified_content = "\n\n".join(content_parts)

        return {
            "content": unified_content,
            "pages": total_pages,
            "tables_found": tables_found,
            "images_found": images_found,
            "equations_found": equations_found,
            "type": "pdf_full",
        }

    except Exception as e:
        return {"error": f"Error in full PDF parse: {str(e)}"}


def parse_pdf(file_path: str) -> Dict[str, Any]:
    """Entry point: Use full multimodal parse if possible."""
    return parse_pdf_full(file_path)


def parse_docx(file_path: str) -> Dict[str, Any]:
    """Extract text and tables from DOCX files."""
    try:
        from docx import Document
        doc = Document(file_path)
        text_parts = []

        for para in doc.paragraphs:
            if para.text.strip():
                text_parts.append(para.text)

        # Extract tables from DOCX
        for table_idx, table in enumerate(doc.tables, start=1):
            rows = []
            for row in table.rows:
                rows.append([cell.text.strip() for cell in row.cells])
            table_dict = {"page": f"Table {table_idx}", "rows": rows}
            summary = summarize_table_with_llm(table_dict)
            text_parts.append(summary)

        return {
            "content": "\n\n".join(text_parts),
            "paragraphs": len(doc.paragraphs),
            "type": "docx",
        }
    except ImportError:
        return {"error": "python-docx not installed. Run: pip install python-docx"}
    except Exception as e:
        return {"error": f"Error parsing DOCX: {str(e)}"}


def parse_text(file_path: str) -> Dict[str, Any]:
    """Extract text from plain text files."""
    try:
        with open(file_path, "r", encoding="utf-8") as file:
            text = file.read()
        return {"content": text, "lines": len(text.split("\n")), "type": "text"}
    except Exception as e:
        return {"error": f"Error parsing text file: {str(e)}"}


def parse_document(file_path: str) -> Dict[str, Any]:
    """Auto-detect file type and parse accordingly."""
    if not os.path.exists(file_path):
        return {"error": "File not found"}

    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        return parse_pdf(file_path)
    elif ext == ".docx":
        return parse_docx(file_path)
    elif ext in [".txt", ".md"]:
        return parse_text(file_path)
    else:
        return {"error": f"Unsupported file type: {ext}"}


# ─────────────────────────────────────────────
#  TEXT CHUNKING & METADATA
# ─────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """Split text into overlapping chunks for vector embedding."""
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i: i + chunk_size])
        if chunk.strip():
            chunks.append(chunk)
    return chunks


def extract_keywords(text: str, top_n: int = 10) -> List[str]:
    """Extract top keywords from text (frequency-based)."""
    stopwords = {
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to",
        "for", "of", "with", "by", "from", "as", "is", "was", "are",
        "were", "be", "been", "being", "have", "has", "had", "do", "does",
        "did", "will", "would", "could", "should", "may", "might", "can",
        "this", "that",
    }
    words = text.lower().split()
    word_freq: Dict[str, int] = {}
    for word in words:
        word = word.strip(".,!?;:()[]{}\"'")
        if word and word not in stopwords and len(word) > 3:
            word_freq[word] = word_freq.get(word, 0) + 1
    sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
    return [word for word, _ in sorted_words[:top_n]]


def create_metadata(text: str, chunk_id: int) -> Dict[str, Any]:
    """Create metadata for a text chunk."""
    return {
        "chunk_id": chunk_id,
        "word_count": len(text.split()),
        "char_count": len(text),
        "keywords": extract_keywords(text, 5),
        "difficulty": "medium",
    }


# ─────────────────────────────────────────────
#  ANSWER / QUESTION UTILITIES
# ─────────────────────────────────────────────

def extract_correct_answer(question_text: str):
    """Extract the correct answer letter from a generated question block."""
    patterns = [
        r"correct\s+answer[:\s]*([ABCD])",
        r"answer[:\s]*([ABCD])",
        r"correct[:\s]*([ABCD])",
        r"\*\*([ABCD])\*\*",
        r"([ABCD])\s*is\s*correct",
        r"option\s*([ABCD])\s*is\s*correct",
    ]
    for pattern in patterns:
        match = re.search(pattern, question_text, re.IGNORECASE)
        if match:
            return match.group(1).upper()
    print(f"\nDEBUG: No correct answer found:\n{question_text[:500]}")
    return None


def extract_reasoning(question_text: str) -> str:
    """Extract explanation/reasoning from a question block."""
    explanation_match = re.search(
        r"explanation[:\s]*(.+?)(?=\n\s*question|$)", question_text, re.IGNORECASE | re.DOTALL
    )
    if explanation_match:
        explanation = explanation_match.group(1).strip()
        explanation = re.sub(r"\n+", " ", explanation)
        return re.sub(r"\s+", " ", explanation)

    fallback_patterns = [
        r"reasoning[:\s]*(.+?)(?=\n\s*question|$)",
        r"why[:\s]*(.+?)(?=\n\s*question|$)",
        r"because[:\s]*(.+?)(?=\n\s*question|$)",
    ]
    for pattern in fallback_patterns:
        match = re.search(pattern, question_text, re.IGNORECASE | re.DOTALL)
        if match:
            text = match.group(1).strip()
            text = re.sub(r"\n+", " ", text)
            return re.sub(r"\s+", " ", text)

    return "No explanation provided for this question."


def clean_question_for_display(question_text: str) -> str:
    """Remove correct answer and explanation from a question before showing to user."""
    parts = re.split(r"correct\s+answer[:\s]*", question_text, flags=re.IGNORECASE)

    if len(parts) > 1:
        cleaned_text = parts[0].strip()
    else:
        cleaned_text = question_text
        patterns_to_remove = [
            r"answer[:\s]*[ABCD].*$",
            r"the\s+correct\s+answer\s+is[:\s]*.*$",
            r"\([ABCD]\)\s*correct.*$",
            r"\*\*[ABCD]\*\*.*$",
            r"[ABCD]\)\s*\*.*$",
            r"explanation[:\s]*.*$",
            r"reasoning[:\s]*.*$",
        ]
        for pattern in patterns_to_remove:
            cleaned_text = re.sub(
                pattern, "", cleaned_text, flags=re.IGNORECASE | re.MULTILINE | re.DOTALL
            )

    cleaned_text = re.sub(r"\n\s*\n", "\n", cleaned_text).strip()

    option_pattern = r"[ABCD]\)\s*.+"
    options_found = re.findall(option_pattern, cleaned_text)
    if len(options_found) < 4:
        return f"[WARNING: Only {len(options_found)} options found]\n{cleaned_text}"

    return cleaned_text