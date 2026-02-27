# ============ TASK CREATION FUNCTIONS ============
from Agents import (
    document_parser, multimodal_extractor, topic_researcher,
    knowledge_structurer, question_generator, distractor_specialist,
    user_analyzer, difficulty_adapter
)
from crewai import Agent, Task, Crew, Process
import json
from userProfile import UserProfile


def create_knowledge_tasks(input_type: str, input_data: str, file_path: str = None):
    """
    Create Phase 1 tasks: parse → multimodal extraction → structure.
    Returns a (tasks_list, agents_list) tuple.
    """
    if input_type == "document":
        # ── Task 1: Parse all content types ──
        parse_task = Task(
            description=f"""COMPREHENSIVELY analyze the following pre-processed document content.

The content may contain tagged blocks — treat EVERY block as equally important:
  • [PAGE N]              → Regular text content
  • [PAGE N — OCR]        → Text extracted via OCR from scanned pages
  • [TABLE SUMMARY — Page N] → Plain-English summary of a table; extract all facts/comparisons
  • [IMAGE CAPTION — Page N, Image M] → Description of a figure/diagram; extract visual concepts
  • [EQUATIONS FOUND IN DOCUMENT] → List of equations described in plain text; extract formulas as concepts

DOCUMENT CONTENT:
{input_data[:5000]}{'...(truncated)' if len(input_data) > 5000 else ''}

SYSTEMATIC ANALYSIS PROCESS:
1. Read through ALL tagged blocks without skipping any type
2. From TEXT / OCR blocks: extract definitions, facts, procedures, principles
3. From TABLE SUMMARY blocks: extract comparisons, rankings, trends, numeric relationships
4. From IMAGE CAPTION blocks: identify the concept illustrated, labels, and its educational purpose
5. From EQUATION blocks: identify each formula's name, variables, and application context
6. Preserve document structure (chapter/section organization)
7. Tag each extracted fact with its source type (text/ocr/table/image/equation)

IMPORTANT: Extract ONLY from the provided content. Do not add external knowledge.
Your output must be comprehensive enough to generate questions from ALL content types.""",
            agent=document_parser,
            expected_output=(
                "Complete multimodal extraction covering text, OCR, table facts, "
                "image concepts, and equation explanations — all organized by document structure"
            )
        )

        # ── Task 2: Integrate multimodal blocks ──
        multimodal_task = Task(
            description="""Using the extracted content from the previous task, focus specifically on
the non-text content types and produce testable knowledge bullets:

For each [TABLE SUMMARY] found:
  - List 3-5 specific factual statements (e.g., "First Normal Form requires atomic values in each column")
  - Highlight any comparisons or rankings in the table

For each [IMAGE CAPTION] found:
  - State what concept the image illustrates
  - List any labeled components or processes shown
  - Write one test-worthy fact a student should know from this figure

For each [EQUATION] found:
  - Name the equation/formula if possible
  - Explain what each variable represents
  - State when/where this formula is applied

Label each bullet clearly as: [TABLE] / [IMAGE] / [EQUATION] / [TEXT]
These bullets will be merged with text-based knowledge for question generation.""",
            agent=multimodal_extractor,
            expected_output=(
                "A clean, labelled set of testable knowledge bullets from tables, "
                "images, and equations — ready for inclusion in the knowledge base"
            ),
            context=[parse_task]
        )

        context = [parse_task, multimodal_task]
        agents = [document_parser, multimodal_extractor, knowledge_structurer]

    else:  # topic-based
        parse_task = Task(
            description=f"""Research topic: {input_data}
Gather: core concepts, principles, examples, applications.
Create learning progression from basics to advanced.
Include any important formulas, comparisons, and visual/diagram concepts where relevant.""",
            agent=topic_researcher,
            expected_output="Comprehensive topic research with concepts, examples, and formulas"
        )
        multimodal_task = None
        context = [parse_task]
        agents = [topic_researcher, knowledge_structurer]

    # ── Task 3: Structure into knowledge base ──
    structure_task = Task(
        description="""Structure ALL extracted content — from text, OCR, tables, images, and equations —
into a comprehensive, well-organized knowledge base.

CRITICAL: Process and organize ALL content. Do not omit any section or content type.

COMPREHENSIVE ORGANIZATION:
- Create knowledge chunks from ALL document sections
- Include facts derived from tables, image captions, and equations
- Ensure BROAD topic coverage across the entire document
- Tag content by difficulty (easy/medium/hard) based on document progression
- Assign Bloom's taxonomy levels to different content types
- Preserve document structure and section relationships

CONTENT DISTRIBUTION:
- Foundational concepts from early sections (easy)
- Intermediate topics and table-derived comparisons (medium)
- Advanced concepts, equation applications, and image-based analysis (hard)

QUALITY ASSURANCE:
- Every major table in the document should contribute at least 2 knowledge items
- Every image caption should contribute at least 1 knowledge item
- Every equation should contribute at least 1 knowledge item
- Verify comprehensive coverage of all document parts

Use ONLY the content extracted from the document. Do not add external information.""",
        agent=knowledge_structurer,
        expected_output=(
            "Comprehensive, multi-level knowledge base covering ALL content types — "
            "text, OCR, tables, images, equations — organized for broad topic coverage"
        ),
        context=context
    )

    all_tasks = [parse_task]
    if multimodal_task:
        all_tasks.append(multimodal_task)
    all_tasks.append(structure_task)

    return all_tasks, agents


def build_sectioned_context(knowledge_base: str, max_chars: int = 8000) -> str:
    """
    Guarantee text, table, and image sections each get a proportional budget
    slice instead of a hard [:8000] prefix that loses non-text content.
    Budget: 50% text · 25% table · 15% image · 10% equations
    """
    import re

    def extract_tagged(tag_prefix: str) -> str:
        pattern = rf'\[{tag_prefix}[^\]]*\].*?(?=\[|\Z)'
        return '\n'.join(re.findall(pattern, knowledge_base, re.DOTALL | re.IGNORECASE))

    text_section  = extract_tagged('PAGE')
    table_section = extract_tagged('TABLE')
    image_section = extract_tagged('IMAGE')
    eq_section    = extract_tagged('EQUATION')

    budgets = {
        'text':  int(max_chars * 0.50),
        'table': int(max_chars * 0.25),
        'image': int(max_chars * 0.15),
        'eq':    int(max_chars * 0.10),
    }

    parts = [
        text_section[:budgets['text']],
        table_section[:budgets['table']],
        image_section[:budgets['image']],
        eq_section[:budgets['eq']],
    ]
    # If no tagged sections found (plain KB), fall back to raw slice
    combined = '\n\n'.join(p for p in parts if p.strip())
    return combined if combined.strip() else str(knowledge_base)[:max_chars]


def create_question_tasks(knowledge_base, difficulty: str, count: int = 5,
                          vector_context: str = ""):
    """
    Create Phase 2 tasks.
    vector_context: pre-retrieved relevant chunks from ChromaDB (injected as priority context).
    Uses sectioned KB to guarantee proportional representation of text/table/image content.
    """
    kb_text = build_sectioned_context(str(knowledge_base), max_chars=8000)

    # Combine vector-retrieved context with sectioned knowledge base
    if vector_context.strip():
        combined_context = (
            f"=== VECTOR-RETRIEVED RELEVANT CONTEXT (Priority) ===\n"
            f"{vector_context}\n\n"
            f"=== FULL KNOWLEDGE BASE (Supplementary) ===\n"
            f"{kb_text}"
        )
    else:
        combined_context = kb_text

    # ── Detect which content types exist in the KB ──
    has_table    = '[TABLE' in combined_context or 'TABLE SUMMARY' in combined_context.upper()
    has_image    = '[IMAGE' in combined_context or 'IMAGE CAPTION' in combined_context.upper()
    has_equation = '[EQUATION' in combined_context or 'EQUATION' in combined_context.upper()

    # ── Build slot requirements ──
    slots = []
    remaining = count
    if has_table and count >= 3:
        table_slots = max(1, count // 4)
        slots.append(
            f"- REQUIRED: Exactly {table_slots} question(s) that test SPECIFIC FACTS from the [TABLE SUMMARY] sections "
            f"(e.g., comparisons between rows, specific values, rankings, or differences between items in the table). "
            f"Base these ONLY on what the table summaries state."
        )
        remaining -= table_slots
    if has_image and count >= 2:
        slots.append(
            f"- REQUIRED: Exactly 1 question that tests a CONCEPT described in an [IMAGE CAPTION] section. "
            f"Write the question as a factual question about the concept — do NOT say 'as shown in the figure' or 'referring to the diagram'."
        )
        remaining -= 1
    if has_equation:
        slots.append(
            f"- OPTIONAL: 1 question about an equation or formula if present in the knowledge base."
        )
    slots.append(f"- Fill the remaining {remaining} question(s) from general text content.")

    slot_block = '\n'.join(slots)

    generate_task = Task(
        description=f"""Your job is to write EXACTLY {count} multiple-choice quiz questions.

CONTENT TYPE REQUIREMENTS — follow these or the output will be rejected:
{slot_block}

UNIVERSAL RULES:
1. Each question text MUST be a full, complete sentence (≥ 10 words) that makes sense on its own.
2. FORBIDDEN: Do NOT write Bloom's taxonomy labels like "(TEXT - Synthesizing)" or "(TABLE - Evaluating)" as question text.
3. FORBIDDEN: Do NOT say "Looking at the image", "Refer to the diagram", or "As shown in the figure".
4. FORBIDDEN: Do NOT use placeholder text like "*(Provide image description here)*".
5. ALL questions must come from the knowledge base below. Do not invent facts.
6. For {difficulty} difficulty: {"ask about basic definitions and key concepts" if difficulty == 'easy' else "ask about applications, comparisons, and cause-effect relationships" if difficulty == 'medium' else "ask about analysis, design decisions, and complex trade-offs"}.

OUTPUT FORMAT — follow exactly, no extra lines between sections:
Question 1: [Complete question sentence]
A) [Option text]
B) [Option text]
C) [Option text]
D) [Option text]
Correct answer: [A, B, C, or D]

Question 2: [Complete question sentence]
... (repeat for all {count} questions)

Knowledge base:
{combined_context}""",
        agent=question_generator,
        expected_output=(
            f"{count} complete MCQs covering the required content types, "
            f"each with a real question sentence, 4 options, and a correct answer."
        )
    )

    distractor_task = Task(
        description=f"""Take the {count} questions from the previous task and create EXACTLY 4 OPTIONS (A, B, C, D) for EACH.

MANDATORY REQUIREMENTS:
- Process ALL {count} questions
- Each question MUST have exactly 4 options labeled A, B, C, D
- Each question MUST have a clear "Correct answer:" line
- Each question MUST have a detailed "Explanation:" section

STRICT FORMAT FOR EACH QUESTION:
Question [number]: [complete question text]
A) [full option text]
B) [full option text]
C) [full option text]
D) [full option text]
Correct answer: [A/B/C/D]
Explanation: [2-3 sentences: why the correct answer is right AND briefly why others are wrong]

OPTION REQUIREMENTS:
- Write complete option text — never truncate with "..."
- Each option should be 1–2 sentences for readability
- Options must be grammatically parallel
- 3 distractors must represent plausible misconceptions
- 1 option must be clearly correct

Generate all {count} questions following this exact format.""",
        agent=distractor_specialist,
        expected_output=(
            f"All {count} complete MCQs with exactly 4 options, "
            "correct answers marked, and detailed explanations"
        ),
        context=[generate_task]
    )

    return [generate_task, distractor_task]



def create_adaptive_tasks(user_profile: UserProfile):
    """Create Phase 3 adaptive analysis tasks."""
    stats = user_profile.get_stats()

    analyze_task = Task(
        description=f"""Analyze user performance and capability:

User Stats:
- Skill Level: {stats['skill_level']}
- Accuracy: {stats['accuracy_rate']:.1%}
- Avg Response Time: {stats['avg_response_time']:.1f}s
- Topics Mastery: {stats['topics_mastery']}
- Questions Answered: {stats['total_questions']}

Recent Performance:
{json.dumps(user_profile.performance_history[-5:], indent=2)}

Provide:
1. Current capability assessment
2. Strengths and weaknesses
3. Learning patterns
4. Confidence calibration
5. Recommended difficulty level""",
        agent=user_analyzer,
        expected_output="Comprehensive user capability analysis"
    )

    adapt_task = Task(
        description="""Based on user analysis, determine:

1. Optimal next difficulty level (easy/medium/hard)
2. Topics to focus on
3. Question types to prioritize
4. Pacing recommendations
5. Specific adjustments needed

Apply adaptive algorithms:
- If accuracy > 80%: increase difficulty
- If accuracy < 50%: decrease difficulty
- If time < average: may need harder questions
- Consider confidence vs accuracy for calibration

Maintain Zone of Proximal Development.""",
        agent=difficulty_adapter,
        expected_output="Adaptive difficulty recommendation",
        context=[analyze_task]
    )

    return [analyze_task, adapt_task]