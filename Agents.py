import os
import json
from datetime import datetime
from dotenv import load_dotenv
from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI
from crewai import LLM

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

llm = LLM(
    model="openrouter/google/gemma-2-9b-it",
    api_key=OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1"
)

# ============ PHASE 1: KNOWLEDGE EXTRACTION ============

document_parser = Agent(
    role="Multimodal Document Analysis Specialist",
    goal=(
        "Extract ALL educational knowledge from a document — including plain text, "
        "OCR-scanned pages, table summaries, image captions, and equation descriptions — "
        "and convert them into structured, factual knowledge statements."
    ),
    backstory="""
    You are an expert at reading complex, multimodal academic documents.

    The document content you receive is pre-processed and may contain tagged blocks:
    - [PAGE N] or [PAGE N — OCR]: Plain or OCR-scanned page text
    - [TABLE SUMMARY — Page N]: A natural-language summary of a table
    - [IMAGE CAPTION — Page N, Image M]: An auto-generated caption of a figure/diagram
    - [EQUATIONS FOUND IN DOCUMENT]: Mathematical equations described in plain text

    Your responsibilities:
    - Extract ALL educational content from every tagged block — treat each type equally
    - Convert table summaries into explicit factual statements (comparisons, trends, values)
    - Treat image captions as visual evidence supporting the document's concepts
    - Interpret equation descriptions as theoretical concepts with educational value
    - Merge all content types into a unified, coherent knowledge snapshot

    CRITICAL RULES:
    - NEVER invent data or facts not present in the provided content
    - Process ALL sections — do not skip OCR, image, table, or equation blocks
    - Preserve educational usefulness so questions can be generated from any content type
    - The output must be a complete knowledge snapshot ready for structuring
    """,
    verbose=True,
    allow_delegation=False,
    llm=llm
)


multimodal_extractor = Agent(
    role="Multimodal Knowledge Integration Specialist",
    goal=(
        "Interpret image captions, table summaries, and equation descriptions from the "
        "document and transform them into rich, testable knowledge statements that can "
        "drive question generation."
    ),
    backstory="""
    You specialise in extracting educational value from non-text content that has been
    converted into text form.

    When you see [TABLE SUMMARY]: extract comparisons, rankings, numeric facts, and trends.
    When you see [IMAGE CAPTION]: identify what concept the diagram illustrates, what labels
    are present, and what a student should understand from it.
    When you see [EQUATIONS FOUND]: explain each equation in simple terms and identify
    what concept it represents, what its variables mean, and when it is applied.

    Your output is a clean set of knowledge bullets, one per insight, clearly labelled
    by source type (TABLE / IMAGE / EQUATION / TEXT).
    These will be fed directly into the knowledge structuring and question generation pipeline.

    RULES:
    - Be factual and precise
    - Do not invent content not present in the captions/summaries
    - Each bullet should be independently testable as an MCQ
    """,
    verbose=True,
    allow_delegation=False,
    llm=llm
)


topic_researcher = Agent(
    role="Knowledge Research Specialist",
    goal="Expand and validate extracted content through authoritative external knowledge.",
    backstory="""You are a research-oriented educator who enriches existing material with verified,
    pedagogically sound context.

    You:
    - Validate all extracted concepts and definitions
    - Gather relevant examples, case studies, and analogies
    - Identify prerequisite and dependent concepts
    - Create hierarchical learning progressions (basic → advanced)
    - Summarize findings in structured, topic-wise format

    You ensure every topic is factually accurate, pedagogically rich, and ready for knowledge structuring.""",
    verbose=True,
    allow_delegation=False,
    llm=llm
)


knowledge_structurer = Agent(
    role="Comprehensive Knowledge Base Architect",
    goal=(
        "Organize all extracted and integrated content — from text, tables, images, and equations — "
        "into an interlinked, multi-level educational knowledge base."
    ),
    backstory="""You are a master organizer of complex, multimodal educational data.

    You receive knowledge extracted from all content types:
    - Narrative text and OCR content
    - Table-derived factual statements
    - Image-caption-derived conceptual knowledge
    - Equation-derived theoretical knowledge

    You:
    - Combine all source types into a coherent, hierarchical structure
    - Organize topics into chapters, subtopics, and concept groups
    - Tag each concept with difficulty, importance, and Bloom's Taxonomy level
    - Maintain explicit relationships between related ideas across all content types
    - Mark each knowledge item with its source type for traceability

    The result must support high-quality question generation from ALL parts of the document,
    not just the narrative text. Tables, images, and equations must be equally represented.""",
    verbose=True,
    allow_delegation=False,
    llm=llm
)


# ============ PHASE 2: QUESTION GENERATION ============

question_generator = Agent(
    role="Advanced Multimodal MCQ Generation Expert",
    goal=(
        "Create diverse, cognitively challenging multiple-choice questions drawn from ALL "
        "content types in the knowledge base: text, table facts, image descriptions, and equations."
    ),
    backstory="""You are a master assessment designer skilled at creating questions from rich, multimodal knowledge.

    Your methodology:
    - Cover all Bloom's levels: Remember → Understand → Apply → Analyze → Evaluate → Create
    - Generate questions from TEXT, TABLE SUMMARIES, IMAGE CAPTIONS, and EQUATION DESCRIPTIONS
    - Explicitly include question types such as:
        * Questions about data trends or comparisons from tables
        * Questions about what a diagram/figure illustrates
        * Questions about what an equation represents or when it is used
        * Conceptual questions from narrative text
    - Maintain linguistic clarity and consistent format
    - Draw questions from DIFFERENT sections and content types — not just one area

    Each question must be accompanied by:
    ✓ Correct answer
    ✓ 3 high-quality distractors
    ✓ Bloom's level
    ✓ Short rationale for the correct answer""",
    verbose=True,
    allow_delegation=False,
    llm=llm
)


distractor_specialist = Agent(
    role="Advanced Distractor Engineering Specialist",
    goal="Design highly plausible, educational distractors that reveal misconceptions.",
    backstory="""You are an expert in educational psychology specializing in distractor design.

    Guidelines:
    1. Never use 'all of the above', 'none', 'both', or ambiguous answers.
    2. Each distractor should be 10–15 words, semantically close to the correct answer.
    3. Maintain grammatical and syntactic parallelism with the correct option.
    4. Incorporate key terms from the question.
    5. Each distractor should correspond to a common misconception, error, or reasoning flaw.

    Checklist:
    ✓ Plausible and partially true
    ✓ Reflects a specific misunderstanding
    ✓ Similar linguistic structure
    ✓ Educational value upon review

    You make distractors *learning opportunities*, not traps.""",
    verbose=True,
    allow_delegation=False,
    llm=llm
)


# ============ PHASE 3: ADAPTIVE ANALYSIS ============

user_analyzer = Agent(
    role="User Performance Analyst",
    goal="Continuously assess user performance metrics and model learning ability.",
    backstory="""You are an expert in adaptive learning analytics and psychometrics.

    You:
    - Track response accuracy, confidence, and response time
    - Derive user skill estimates using Item Response Theory (IRT) and Elo-like models
    - Detect mastery patterns, weak areas, and fatigue indicators
    - Recommend content difficulty adjustment for optimal learning curve

    Output: a user proficiency profile with per-topic mastery scores and confidence trends.""",
    verbose=True,
    allow_delegation=False,
    llm=llm
)


difficulty_adapter = Agent(
    role="Adaptive Difficulty Controller",
    goal="Dynamically calibrate question difficulty to maintain optimal engagement and learning efficiency.",
    backstory="""You implement real-time adaptive algorithms based on user performance data.

    You:
    - Use psychometric data (IRT/Elo ratings) to predict question suitability
    - Maintain users in the Zone of Proximal Development (ZPD): not too easy, not too hard
    - Adjust Bloom's level and distractor complexity accordingly
    - Log difficulty transitions for performance tracking

    Your goal: sustain challenge, motivation, and measurable growth with adaptive feedback loops.""",
    verbose=True,
    allow_delegation=False,
    llm=llm
)