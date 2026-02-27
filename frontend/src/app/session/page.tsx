"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { generateQuestions, generateByTopic, submitAnswer } from "@/lib/api";
import { CheckCircle2, XCircle, Clock, Loader2, ChevronRight, RotateCcw, Search, BarChart3, TrendingUp, TrendingDown, Target } from "lucide-react";

interface Question { id: number; block: string; correct_answer: string; reasoning: string; }

// ── Parsing helpers ─────────────────────────────────────────────────────────

/** Strip the "Question N:" prefix and everything from the first option onwards */
function cleanQuestionText(block: string): string {
    // Remove leading "Question N:" or "**Question N:**"
    const noPrefix = block.replace(/^\*{0,2}Question\s*\d+[:.]\*{0,2}\s*/i, "");
    // Take everything before the first option label (A), **A), A., etc.)
    const beforeOptions = noPrefix.split(/\n\s*\*{0,2}[A-D][).]\*{0,2}\s/)[0];
    // Remove any trailing correct answer / explanation lines
    return beforeOptions
        .replace(/correct\s+answer[:\s]*[ABCD].*/gi, "")
        .replace(/explanation[:\s]*.*/gi, "")
        .replace(/\*+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/** Returns true if the question text is a useless placeholder */
function isPlaceholder(text: string): boolean {
    const lower = text.toLowerCase();
    return (
        !text ||
        text.length < 15 ||
        /^\(?(text|table|image|equation|figure|diagram)\s*[-–]\s*(remembering|understanding|applying|analyzing|evaluating|creating|synthesizing)\)?[*]*$/i.test(text.trim()) ||
        lower.includes("provide the actual") ||
        lower.includes("provide image description") ||
        lower.includes("refer to the diagram") ||
        lower.includes("looking at the presented image")
    );
}

/** Robust option parser: handles A), **A)**, A., **A.** across multiple lines */
function parseOptions(block: string): { key: string; text: string }[] {
    const opts: { key: string; text: string }[] = [];
    const cleaned = block.replace(/\*+/g, ""); // strip all markdown bold/italic markers
    ["A", "B", "C", "D"].forEach(k => {
        // Match the key (A-D) with ), ., or : followed by option text up to next key / special line
        const m = cleaned.match(
            new RegExp(
                `${k}[).:]\s*(.+?)(?=\n\s*[A-D][).:]\s|\n\s*Correct|\n\s*Answer|\n\s*Explanation|$)`,
                "is"
            )
        );
        if (m) {
            const text = m[1].replace(/\s+/g, " ").trim();
            if (text && text.length > 1) opts.push({ key: k, text });
        }
    });
    return opts;
}

// ── Constants ───────────────────────────────────────────────────────────────

const DIFF_COLORS: Record<string, string> = {
    easy: "#00E5A0", medium: "#FFD166", hard: "#FF6B6B"
};
const NEXT_DIFF: Record<string, "easy" | "medium" | "hard"> = { easy: "medium", medium: "hard", hard: "hard" };
const PREV_DIFF: Record<string, "easy" | "medium" | "hard"> = { easy: "easy", medium: "easy", hard: "medium" };

// ── Main Component ──────────────────────────────────────────────────────────
export default function SessionPage() {
    const searchParams = useSearchParams();

    // Identity
    const [sessionId, setSessionId] = useState<string>("");
    const [userId, setUserId] = useState<string>("");
    // genMode: whether this session uses /generate (document) or /generate-topic (topic-only)
    const [genMode, setGenMode] = useState<"document" | "topic">("document");

    // Config
    const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
    const [topicHint, setTopicHint] = useState("");

    // Quiz state
    const [questions, setQuestions] = useState<Question[]>([]);
    const [current, setCurrent] = useState(0);
    const [selected, setSelected] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState(false);
    const [score, setScore] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [phase, setPhase] = useState<"setup" | "quiz" | "round_summary" | "done">("setup");

    // 3-Round adaptive
    const [round, setRound] = useState(1);
    const [history, setHistory] = useState<{ round: number; score: number; total: number; difficulty: string }[]>([]);

    // Timer
    const [elapsed, setElapsed] = useState(0);
    const [startTime, setStartTime] = useState<number>(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

    useEffect(() => {
        const s = sessionStorage.getItem("dotg_session") || "";
        const u = sessionStorage.getItem("dotg_user") || "";
        const t = searchParams.get("topic") || sessionStorage.getItem("dotg_topic") || "";
        setSessionId(s);
        setUserId(u);
        setTopicHint(t);
        // If we arrived via ?topic= with no document session, default to topic mode
        if (!s && t) setGenMode("topic");
        else if (s) setGenMode("document");
    }, [searchParams]);

    useEffect(() => {
        if (phase === "quiz" && !submitted) {
            timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
        }
        return () => clearInterval(timerRef.current);
    }, [phase, current, submitted]);

    // ── fetch questions (uses genMode to choose correct endpoint) ──
    const fetchQuestions = async (diff: "easy" | "medium" | "hard", currentGenMode = genMode) => {
        setLoading(true);
        setLoadError("");
        try {
            let data: { questions: Question[]; session_id?: string };

            if (currentGenMode === "document" && sessionId) {
                const res = await generateQuestions({ session_id: sessionId, difficulty: diff, count: 5, topic_hint: topicHint });
                data = res.data as typeof data;
            } else if (topicHint) {
                const res = await generateByTopic({ topic: topicHint, difficulty: diff, count: 5 });
                data = res.data as typeof data;
                // Save topic session_id for dashboard evaluation (only on first round)
                if (data.session_id && round === 1) {
                    sessionStorage.setItem("dotg_session", data.session_id);
                    setSessionId(data.session_id);
                }
            } else {
                throw new Error("No document session or topic found. Please upload a document or enter a topic.");
            }

            // Filter out placeholder questions before showing them
            const validQuestions = (data.questions || []).filter(q => {
                const text = cleanQuestionText(q.block);
                return !isPlaceholder(text);
            });

            if (validQuestions.length === 0) {
                throw new Error("The AI didn't generate usable questions. Please try again.");
            }

            setQuestions(validQuestions);
            setCurrent(0); setScore(0); setSelected(null); setSubmitted(false);
            setPhase("quiz"); setElapsed(0); setStartTime(Date.now());
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            setLoadError(msg);
        }
        setLoading(false);
    };

    const startQuiz = () => {
        const name = userId || prompt("Enter your name/ID:") || "user";
        setUserId(name);
        sessionStorage.setItem("dotg_user", name);
        setRound(1);
        setHistory([]);
        // Determine generation mode based on what's available
        const mode: "document" | "topic" = sessionId ? "document" : "topic";
        setGenMode(mode);
        fetchQuestions(difficulty, mode);
    };

    const handleAnswer = async () => {
        if (!selected || submitted) return;
        const q = questions[current];
        const timeTaken = (Date.now() - startTime) / 1000;
        const correct = selected === q.correct_answer;
        if (correct) setScore(s => s + 1);
        setSubmitted(true);
        clearInterval(timerRef.current);
        try {
            await submitAnswer({
                user_id: userId,
                question_id: `r${round}_q${q.id}`,
                user_answer: selected,
                correct_answer: q.correct_answer,
                time_taken: timeTaken,
                difficulty,
                topic: topicHint || sessionStorage.getItem("dotg_filename") || "general",
                confidence: 3,
            });
        } catch { /* silent */ }
    };

    const next = () => {
        if (current + 1 >= questions.length) {
            const currentRoundData = { round, score: score, total: questions.length, difficulty };
            setHistory(h => [...h, currentRoundData]);
            if (round >= 3) {
                // Save full session data for profile analysis
                const finalHistory = [...history, { round, score, total: questions.length, difficulty }];
                sessionStorage.setItem("dotg_session_history", JSON.stringify(finalHistory));
                sessionStorage.setItem("dotg_session_topic", topicHint || sessionStorage.getItem("dotg_filename") || "General");
                window.location.href = "/profile";
                return;
            }
            setPhase("round_summary");
            return;
        }
        setCurrent(c => c + 1);
        setSelected(null);
        setSubmitted(false);
        setElapsed(0);
        setStartTime(Date.now());
    };

    const startNextRound = () => {
        const accuracy = score / questions.length;
        let nextDiff = difficulty;
        if (accuracy >= 0.8) nextDiff = NEXT_DIFF[difficulty];
        else if (accuracy <= 0.4) nextDiff = PREV_DIFF[difficulty];
        setDifficulty(nextDiff);
        setRound(r => r + 1);
        // IMPORTANT: preserve genMode so rounds 2/3 use the same API as round 1
        fetchQuestions(nextDiff, genMode);
    };

    const q = questions[current];
    const qText = q ? cleanQuestionText(q.block) : "";
    const opts = q ? parseOptions(q.block) : [];

    // ── Setup phase ──────────────────────────────────────────────────────────
    if (phase === "setup") return (
        <div className="max-w-xl mx-auto px-6 py-12">
            <h1 className="text-2xl font-semibold tracking-tight mb-2">Adaptive Learning Session</h1>
            <p className="text-sm text-white/35 mb-8">3 rounds of focused questions — difficulty adapts based on your accuracy.</p>
            <div className="space-y-6">
                <div>
                    <label className="text-xs text-white/40 uppercase tracking-wider block mb-3">Topic / Focus Area</label>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                        <input
                            value={topicHint}
                            onChange={e => setTopicHint(e.target.value)}
                            placeholder={sessionId ? "Narrow questions to a topic (optional)…" : "Enter a topic to study…"}
                            className="w-full pl-9 pr-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/20 outline-none focus:border-white/20 transition-colors"
                        />
                    </div>
                </div>

                <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-[#0B8FFF]/10 flex items-center justify-center text-[#0B8FFF]"><Target size={16} /></div>
                        <div className="text-sm font-medium">Session Setup</div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <div className="text-[10px] text-white/20 uppercase tracking-tight mb-2">Starting Difficulty</div>
                            <div className="flex gap-2">
                                {(["easy", "medium", "hard"] as const).map(d => (
                                    <button key={d} onClick={() => setDifficulty(d)}
                                        className={`flex-1 py-2 rounded-lg text-xs font-medium border capitalize transition-all
                                            ${difficulty === d ? "text-[#0B0E1A]" : "border-white/[0.07] bg-transparent text-white/35 hover:text-white/60"}`}
                                        style={difficulty === d ? { background: DIFF_COLORS[d], borderColor: DIFF_COLORS[d] } : {}}>
                                        {d}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-white/20 uppercase tracking-tight mb-2">Rounds</div>
                            <div className="text-2xl font-bold font-mono">3</div>
                        </div>
                    </div>
                </div>

                {!sessionId && !topicHint && (
                    <div className="bg-[#FFD166]/08 border border-[#FFD166]/20 rounded-xl p-3 text-sm text-[#FFD166]">
                        ⚠ No document indexed — enter a topic above or upload a document first.
                    </div>
                )}

                {loadError && (
                    <div className="bg-[#FF6B6B]/08 border border-[#FF6B6B]/20 rounded-xl p-3 text-sm text-[#FF6B6B]">
                        ✕ {loadError}
                    </div>
                )}

                <button onClick={startQuiz} disabled={loading || (!sessionId && !topicHint)}
                    className="w-full py-4 rounded-xl text-sm font-semibold text-[#0B0E1A] disabled:opacity-40 transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg,#00E5A0,#0B8FFF)" }}>
                    {loading ? <span className="flex items-center justify-center gap-2"><Loader2 size={18} className="animate-spin" />Preparing Round 1…</span> : "Start Adaptive Session"}
                </button>
            </div>
        </div>
    );

    // ── Round summary phase ──────────────────────────────────────────────────
    if (phase === "round_summary") {
        const accuracy = score / questions.length;
        let nextDiffLabel = difficulty;
        let Icon = BarChart3;
        let accentColor = "#FFD166";
        let changeLabel = "Difficulty stays the same";

        if (accuracy >= 0.8 && difficulty !== "hard") {
            nextDiffLabel = NEXT_DIFF[difficulty];
            Icon = TrendingUp; accentColor = "#00E5A0";
            changeLabel = `Great job! Increasing to ${nextDiffLabel} difficulty`;
        } else if (accuracy <= 0.4 && difficulty !== "easy") {
            nextDiffLabel = PREV_DIFF[difficulty];
            Icon = TrendingDown; accentColor = "#FF6B6B";
            changeLabel = `Reducing to ${nextDiffLabel} difficulty to help you improve`;
        }

        return (
            <div className="max-w-xl mx-auto px-6 py-12 text-center">
                <div className="text-5xl mb-6">{accuracy >= 0.8 ? "🏆" : accuracy >= 0.5 ? "📚" : "💪"}</div>
                <h1 className="text-2xl font-semibold mb-2">Round {round} Complete</h1>
                <p className="text-white/40 text-sm mb-8">{score} / {questions.length} correct · {Math.round(accuracy * 100)}% accuracy</p>

                <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-6 mb-8 text-left">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: accentColor + "18", color: accentColor }}>
                            <Icon size={20} />
                        </div>
                        <div>
                            <div className="text-sm font-semibold">{changeLabel}</div>
                            <div className="text-xs text-white/30">Round {round + 1} of 3</div>
                        </div>
                    </div>
                    <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
                        <div className="h-full transition-all" style={{ width: `${((round) / 3) * 100}%`, background: accentColor }} />
                    </div>
                </div>

                {loadError && (
                    <div className="bg-[#FF6B6B]/08 border border-[#FF6B6B]/20 rounded-xl p-3 text-sm text-[#FF6B6B] mb-4">
                        ✕ {loadError}
                    </div>
                )}

                <button onClick={startNextRound} disabled={loading}
                    className="w-full py-4 rounded-xl text-sm font-semibold text-[#0B0E1A] disabled:opacity-40 transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg,#00E5A0,#0B8FFF)" }}>
                    {loading ? <Loader2 size={18} className="animate-spin mx-auto" /> : `Start Round ${round + 1} →`}
                </button>
            </div>
        );
    }

    // ── Done phase ───────────────────────────────────────────────────────────
    if (phase === "done") {
        const totalCorrect = history.reduce((s, h) => s + h.score, 0);
        const totalQ = history.reduce((s, h) => s + h.total, 0);
        return (
            <div className="max-w-xl mx-auto px-6 py-12 text-center">
                <div className="text-5xl mb-4">{totalCorrect / totalQ >= 0.7 ? "🎉" : totalCorrect / totalQ >= 0.5 ? "📚" : "💪"}</div>
                <h1 className="text-2xl font-semibold mb-2">Session Complete!</h1>
                <p className="text-white/40 text-sm mb-8">Total: {totalCorrect} / {totalQ} correct across all 3 rounds</p>
                <div className="space-y-3 mb-10">
                    {history.map((h, i) => (
                        <div key={i} className="flex items-center gap-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
                            <div className="w-9 h-9 rounded-xl bg-white/[0.05] flex items-center justify-center font-bold text-white/40 text-sm">{h.round}</div>
                            <div className="text-left flex-1">
                                <div className="text-xs text-white/30 uppercase tracking-wider">Round {h.round}</div>
                                <div className="text-sm font-semibold capitalize" style={{ color: DIFF_COLORS[h.difficulty] }}>{h.difficulty}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-lg font-bold font-mono text-[#00E5A0]">{h.score}/{h.total}</div>
                                <div className="text-[10px] text-white/25">{Math.round((h.score / h.total) * 100)}%</div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex gap-3">
                    <button onClick={() => { setPhase("setup"); setRound(1); setHistory([]); setLoadError(""); }}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.06] text-sm text-white/70 hover:bg-white/10 transition-all">
                        <RotateCcw size={14} /> New Session
                    </button>
                    <button onClick={() => window.location.href = "/dashboard"}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold text-[#0B0E1A]"
                        style={{ background: "linear-gradient(135deg,#00E5A0,#0B8FFF)" }}>
                        View Dashboard →
                    </button>
                </div>
            </div>
        );
    }

    // ── Quiz phase ───────────────────────────────────────────────────────────
    return (
        <div className="max-w-2xl mx-auto px-6 py-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <div className="text-[10px] text-white/20 uppercase tracking-widest font-bold">Round {round} / 3</div>
                    <div className="text-xs font-mono capitalize mt-0.5" style={{ color: DIFF_COLORS[difficulty] }}>{difficulty} Difficulty</div>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-white/30 font-mono">Q {current + 1} / {questions.length}</span>
                    <span className="text-xs text-white/30 font-mono flex items-center gap-1"><Clock size={12} /> {elapsed}s</span>
                </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden mb-8">
                <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(current / questions.length) * 100}%`, background: DIFF_COLORS[difficulty] }} />
            </div>

            {/* Question card */}
            <div className="bg-white/[0.02] border border-white/[0.07] rounded-2xl p-7 mb-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-[0.04]"><Target size={80} /></div>
                <p className="text-white text-[17px] leading-relaxed relative z-10 whitespace-pre-wrap">{qText}</p>
            </div>

            {/* Options */}
            {opts.length === 0 ? (
                <div className="bg-[#FFD166]/08 border border-[#FFD166]/20 rounded-xl p-4 mb-6 text-sm text-[#FFD166]">
                    ⚠ Could not parse answer options for this question. Click "Next Question" to continue.
                </div>
            ) : (
                <div className="space-y-3 mb-6">
                    {opts.map(({ key, text }) => {
                        let style = "border-white/[0.07] bg-white/[0.02] text-white/70 hover:border-white/20 hover:bg-white/[0.04]";
                        if (submitted) {
                            if (key === q.correct_answer) style = "border-[#00E5A0]/60 bg-[#00E5A0]/10 text-[#00E5A0]";
                            else if (key === selected) style = "border-[#FF6B6B]/60 bg-[#FF6B6B]/10 text-[#FF6B6B]";
                            else style = "border-white/[0.04] bg-transparent text-white/25";
                        } else if (selected === key) {
                            style = "border-[#0B8FFF]/60 bg-[#0B8FFF]/10 text-[#0B8FFF]";
                        }
                        return (
                            <button key={key} onClick={() => !submitted && setSelected(key)}
                                className={`w-full text-left flex items-start gap-4 rounded-xl border p-4 transition-all duration-200 ${style}`}
                                disabled={submitted}>
                                <span className="text-xs font-mono bg-white/10 rounded px-1.5 py-0.5 mt-0.5 shrink-0">{key}</span>
                                <span className="text-[15px] leading-relaxed">{text}</span>
                                {submitted && key === q.correct_answer && <CheckCircle2 size={16} className="ml-auto shrink-0 mt-0.5" />}
                                {submitted && key === selected && key !== q.correct_answer && <XCircle size={16} className="ml-auto shrink-0 mt-0.5" />}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Explanation */}
            {submitted && q.reasoning && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 mb-6">
                    <div className="text-[10px] text-white/30 uppercase tracking-widest font-bold mb-2">Explanation</div>
                    <p className="text-sm text-white/65 leading-relaxed">{q.reasoning}</p>
                </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
                {!submitted ? (
                    <button onClick={handleAnswer} disabled={!selected || opts.length === 0}
                        className="flex-1 py-4 rounded-xl text-sm font-semibold text-[#0B0E1A] disabled:opacity-30 hover:opacity-90 transition-all active:scale-[0.98]"
                        style={{ background: "linear-gradient(135deg,#00E5A0,#0B8FFF)" }}>
                        Confirm Answer
                    </button>
                ) : (
                    <button onClick={next}
                        className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl text-sm font-semibold text-[#0B0E1A] hover:opacity-90 transition-all active:scale-[0.98]"
                        style={{ background: "linear-gradient(135deg,#00E5A0,#0B8FFF)" }}>
                        {current + 1 >= questions.length
                            ? (round >= 3 ? "Finish Session" : "Complete Round")
                            : "Next Question"}
                        <ChevronRight size={18} />
                    </button>
                )}
            </div>
        </div>
    );
}
