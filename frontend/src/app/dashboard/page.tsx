"use client";
import { useState, useEffect } from "react";
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ScatterChart, Scatter, ZAxis, Cell, Legend
} from "recharts";
import { evaluateSession, getVectorStats, getUserSessionPerformance } from "@/lib/api";
import { Loader2, RefreshCw, Database, User, Trophy, Clock, Target, TrendingUp } from "lucide-react";

// ── Utilities ──────────────────────────────────────────────────────────────
const scoreColor = (val: number, inverse = false) => {
    const v = inverse ? 1 - val : val;
    if (v >= 0.75) return "#00E5A0";
    if (v >= 0.5) return "#FFD166";
    return "#FF6B6B";
};
const scoreBg = (val: number, inverse = false) => {
    const v = inverse ? 1 - val : val;
    if (v >= 0.75) return "rgba(0,229,160,0.08)";
    if (v >= 0.5) return "rgba(255,209,102,0.08)";
    return "rgba(255,107,107,0.08)";
};
const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    approved: { label: "Approved", color: "#00E5A0", bg: "rgba(0,229,160,0.10)" },
    flagged: { label: "Flagged", color: "#FFD166", bg: "rgba(255,209,102,0.10)" },
    rejected: { label: "Rejected", color: "#FF6B6B", bg: "rgba(255,107,107,0.10)" },
};
const modalityIcon: Record<string, string> = { text: "T", table: "⊞", image: "◫", equation: "∑" };
const DIFF_COLORS: Record<string, string> = { easy: "#00E5A0", medium: "#FFD166", hard: "#FF6B6B" };
function pct(v: number) { return Math.round(v * 100); }
function avg(arr: Question[], key: keyof Question) { return arr.reduce((s, x) => s + (x[key] as number), 0) / arr.length; }

// ── Types ──────────────────────────────────────────────────────────────────
interface Question {
    id: number; text: string; topic: string; modality: string;
    dps: number; sos: number; clarity: number;
    difficulty: string; status: string;
}

interface SessionPerformance {
    session_id: string;
    total_questions: number;
    correct_answers: number;
    accuracy_rate: number;
    avg_response_time: number;
    rounds: RoundPerformance[];
}

interface RoundPerformance {
    round: number;
    difficulty: string;
    score: number;
    total: number;
    accuracy: number;
}

// ── Mock fallback (used when no real session data is available) ────────────
const MOCK: Question[] = [
    { id: 1, text: "What does entropy equation ΔS=Q/T represent?", topic: "Thermodynamics", modality: "equation", dps: 0.82, sos: 0.12, clarity: 0.91, difficulty: "hard", status: "approved" },
    { id: 2, text: "Which metal is most suitable for heat sink applications?", topic: "Thermal Props", modality: "table", dps: 0.74, sos: 0.08, clarity: 0.88, difficulty: "medium", status: "approved" },
    { id: 3, text: "What is temperature?", topic: "Thermodynamics", modality: "text", dps: 0.21, sos: 0.65, clarity: 0.72, difficulty: "easy", status: "flagged" },
    { id: 4, text: "At which stage does isothermal expansion occur?", topic: "Carnot Cycle", modality: "image", dps: 0.79, sos: 0.15, clarity: 0.85, difficulty: "hard", status: "approved" },
    { id: 5, text: "What best describes the First Law of Thermodynamics?", topic: "Thermodynamics", modality: "text", dps: 0.68, sos: 0.44, clarity: 0.90, difficulty: "medium", status: "flagged" },
    { id: 6, text: "What does the ∇p term physically represent?", topic: "Fluid Mechanics", modality: "equation", dps: 0.88, sos: 0.05, clarity: 0.76, difficulty: "hard", status: "approved" },
    { id: 7, text: "Identify the work done during the adiabatic process.", topic: "Carnot Cycle", modality: "image", dps: 0.83, sos: 0.09, clarity: 0.93, difficulty: "hard", status: "approved" },
    { id: 8, text: "What is the boiling point of water?", topic: "Thermal Props", modality: "text", dps: 0.15, sos: 0.78, clarity: 0.95, difficulty: "easy", status: "rejected" },
    { id: 9, text: "By what factor does copper outperform iron in conductivity?", topic: "Thermal Props", modality: "table", dps: 0.71, sos: 0.19, clarity: 0.87, difficulty: "medium", status: "approved" },
    { id: 10, text: "What assumption is made about the system boundary?", topic: "Thermodynamics", modality: "equation", dps: 0.86, sos: 0.07, clarity: 0.82, difficulty: "hard", status: "approved" },
    { id: 11, text: "What does the diagram show about fluid velocity?", topic: "Fluid Mechanics", modality: "image", dps: 0.77, sos: 0.11, clarity: 0.79, difficulty: "medium", status: "approved" },
    { id: 12, text: "Which statement about heat transfer is correct?", topic: "Thermal Props", modality: "text", dps: 0.33, sos: 0.52, clarity: 0.61, difficulty: "easy", status: "flagged" },
];

// ── Score Ring ─────────────────────────────────────────────────────────────
function ScoreRing({ value, label, inverse = false }: { value: number; label: string; inverse?: boolean }) {
    const size = 80; const r = size / 2 - 8; const circ = 2 * Math.PI * r;
    const fill = inverse ? 1 - value : value; const color = scoreColor(value, inverse);
    return (
        <div className="flex flex-col items-center gap-1">
            <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
                    strokeDasharray={circ} strokeDashoffset={circ * (1 - fill)} strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)" }} />
                <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
                    style={{ fill: color, fontSize: 15, fontWeight: 700, fontFamily: "monospace", transform: `rotate(90deg)`, transformOrigin: `${size / 2}px ${size / 2}px` }}>
                    {pct(value)}
                </text>
            </svg>
            <span className="text-[10px] font-mono tracking-widest uppercase text-white/35">{label}</span>
        </div>
    );
}

// ── Question Row ───────────────────────────────────────────────────────────
function QRow({ q, selected, onSelect }: { q: Question; selected: boolean; onSelect: () => void }) {
    const st = statusConfig[q.status];
    return (
        <div onClick={onSelect} className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all mb-2
      ${selected ? "border-white/15 bg-white/[0.05]" : "border-white/[0.04] hover:bg-white/[0.03]"}`}>
            <div className="w-7 h-7 rounded-md bg-white/[0.05] flex items-center justify-center text-[11px] text-white/25 font-mono shrink-0">{String(q.id).padStart(2, "0")}</div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-white/[0.05] text-white/40 font-mono">{modalityIcon[q.modality]} {q.modality}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-white/[0.05] text-white/40 font-mono">{q.topic}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded font-mono" style={{ background: st.bg, color: st.color }}>● {st.label}</span>
                </div>
                <p className="text-[13px] text-white/75 truncate">{q.text}</p>
            </div>
            <div className="flex gap-2 shrink-0">
                {([["DPS", q.dps, false], ["SOS", q.sos, true], ["CLR", q.clarity, false]] as [string, number, boolean][]).map(([l, v, i]) => (
                    <div key={l} className="text-center">
                        <div className="text-[13px] font-bold font-mono" style={{ color: scoreColor(v, i) }}>{pct(v)}</div>
                        <div className="text-[9px] text-white/25 font-mono">{l}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Detail Panel ───────────────────────────────────────────────────────────
function DetailPanel({ q, onClose }: { q: Question; onClose: () => void }) {
    const radar = [
        { metric: "DPS", value: pct(q.dps), fullMark: 100 },
        { metric: "Clarity", value: pct(q.clarity), fullMark: 100 },
        { metric: "Uniqueness", value: pct(1 - q.sos), fullMark: 100 },
    ];
    const dpsFB = q.dps >= 0.75 ? "Excellent discriminating power." : q.dps >= 0.5 ? "Moderate — consider increasing cognitive complexity." : "Low — question may not differentiate skill levels.";
    const sosFB = q.sos <= 0.2 ? "Low semantic overlap — question is unique." : q.sos <= 0.5 ? "Moderate overlap — consider rephrasing." : "High overlap — recommend replacing.";
    const clrFB = q.clarity >= 0.8 ? "High clarity — unambiguous." : q.clarity >= 0.6 ? "Acceptable — minor wording improvements suggested." : "Low clarity — recommend rewriting.";
    const st = statusConfig[q.status];
    return (
        <div className="border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-4 bg-white/[0.02]">
            <div className="flex justify-between items-start">
                <div className="text-[11px] text-white/30 font-mono uppercase tracking-widest">Question Detail</div>
                <button onClick={onClose} className="w-7 h-7 rounded-lg bg-white/[0.05] text-white/35 hover:text-white/60 flex items-center justify-center text-base transition-colors">×</button>
            </div>
            <p className="text-[13px] text-white/80 leading-relaxed bg-white/[0.03] rounded-xl px-4 py-3 border-l-2 border-white/10">{q.text}</p>
            <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radar}>
                        <PolarGrid stroke="rgba(255,255,255,0.06)" />
                        <PolarAngleAxis dataKey="metric" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "monospace" }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar dataKey="value" stroke="#00E5A0" fill="#00E5A0" fillOpacity={0.12} strokeWidth={2} />
                    </RadarChart>
                </ResponsiveContainer>
            </div>
            <div className="space-y-3">
                {([["⚡ DPS", "Discriminating Power", q.dps, false, dpsFB], ["⊕ SOS", "Semantic Overlap", q.sos, true, sosFB], ["◎ CLR", "Clarity", q.clarity, false, clrFB]] as [string, string, number, boolean, string][]).map(([icon, label, val, inv, fb]) => (
                    <div key={label} className="rounded-xl p-3 border" style={{ background: scoreBg(val, inv), borderColor: scoreColor(val, inv) + "33" }}>
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[12px] text-white/55 font-mono">{icon} {label}</span>
                            <span className="text-base font-bold font-mono" style={{ color: scoreColor(val, inv) }}>{pct(val)}%</span>
                        </div>
                        <p className="text-[11px] text-white/40 leading-snug">{fb}</p>
                    </div>
                ))}
            </div>
            <div className="rounded-xl p-3 border flex items-center gap-3" style={{ background: st.bg, borderColor: st.color + "44" }}>
                <span className="text-lg">{q.status === "approved" ? "✓" : q.status === "flagged" ? "⚠" : "✕"}</span>
                <div>
                    <div className="text-[12px] font-bold font-mono" style={{ color: st.color }}>{st.label}</div>
                    <div className="text-[11px] text-white/35">{q.status === "approved" ? "All metrics passed." : q.status === "flagged" ? "One or more metrics need attention." : "Failed validation — excluded."}</div>
                </div>
            </div>
        </div>
    );
}

// ── User Performance Types ─────────────────────────────────────────────────
interface UserPerformance {
    user_id: string;
    total_questions: number;
    correct_answers: number;
    accuracy_rate: number;
    avg_response_time: number;
    current_difficulty: string;
    skill_level: number;
    topics_mastery: Record<string, { correct: number; total: number }>;
    session_history: Array<{
        question_id: string;
        correct: boolean;
        time_taken: number;
        difficulty: string;
        topic: string;
        timestamp: string;
    }>;
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function Dashboard() {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Question | null>(null);
    const [loading, setLoading] = useState(false);
    const [dbStats, setDbStats] = useState<{ total_chunks?: number } | null>(null);
    const [isLive, setIsLive] = useState(false);
    const [noSession, setNoSession] = useState(false);

    // User performance state
    const [userPerformance, setUserPerformance] = useState<UserPerformance | null>(null);
    const [userId, setUserId] = useState<string>("");
    const [activeTab, setActiveTab] = useState<"questions" | "performance">("questions");

    useEffect(() => {
        getVectorStats().then(r => setDbStats(r.data)).catch(() => { });
        // auto-load – works for both document sessions (uuid) and topic sessions (topic_xxx)
        const sid = sessionStorage.getItem("dotg_session");
        const uid = sessionStorage.getItem("dotg_user") || "";
        setUserId(uid); // Set user ID regardless of session
        if (sid) {
            loadLiveData(sid);
        } else {
            setNoSession(true);
        }

        // Load user performance if available
        if (uid) {
            loadUserPerformance(uid, sid || undefined);
        }
    }, []);

    const loadUserPerformance = async (uid: string, sid?: string) => {
        try {
            const { data } = await getUserSessionPerformance(uid, sid);
            if (data.total_questions > 0) {
                setUserPerformance(data);
            }
        } catch (e) {
            // User may not have performance data yet
        }
    };

    const loadLiveData = async (sid?: string) => {
        const sessionId = sid ?? sessionStorage.getItem("dotg_session");
        if (!sessionId) { setNoSession(true); return; }
        setNoSession(false);
        setLoading(true);
        try {
            const { data } = await evaluateSession(sessionId);
            if (data.questions?.length) {
                setQuestions(data.questions as Question[]);
                setIsLive(true);
                setNoSession(false);
            } else {
                // Backend returned empty — keep the empty state
                setNoSession(true);
            }
        } catch {
            setNoSession(true);
        }
        setLoading(false);
    };

    const filtered = questions.filter(q => {
        const mf = filter === "all" || q.status === filter;
        const ms = q.text.toLowerCase().includes(search.toLowerCase()) || q.topic.toLowerCase().includes(search.toLowerCase());
        return mf && ms;
    });

    const approved = questions.filter(q => q.status === "approved").length;
    const flagged = questions.filter(q => q.status === "flagged").length;
    const rejected = questions.filter(q => q.status === "rejected").length;
    const avgDPS = avg(questions, "dps"); const avgSOS = avg(questions, "sos"); const avgClarity = avg(questions, "clarity");

    const topicData = [...new Set(questions.map(q => q.topic))].map(topic => {
        const qs = questions.filter(q => q.topic === topic);
        return { topic: topic.split(" ")[0], dps: Math.round(avg(qs, "dps") * 100), clarity: Math.round(avg(qs, "clarity") * 100), uniqueness: Math.round((1 - avg(qs, "sos")) * 100) };
    });

    const scatterData = questions.map(q => ({ x: pct(q.dps), y: pct(q.clarity), z: pct(1 - q.sos), status: q.status, id: q.id }));
    const modalityDist = ["text", "table", "image", "equation"].map(m => ({
        name: `${modalityIcon[m]} ${m}`,
        approved: questions.filter(q => q.modality === m && q.status === "approved").length,
        flagged: questions.filter(q => q.modality === m && q.status === "flagged").length,
        rejected: questions.filter(q => q.modality === m && q.status === "rejected").length,
    }));
    const SC = { approved: "#00E5A0", flagged: "#FFD166", rejected: "#FF6B6B" };

    // ── Empty state ────────────────────────────────────────────────────────
    if (noSession || (questions.length === 0 && !loading)) {
        return (
            <div className="max-w-[1400px] mx-auto px-8 py-8">
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">Question Quality Dashboard</h1>
                        <p className="text-sm text-white/35 mt-1">Evaluation results will appear here after you complete a session</p>
                    </div>
                    {dbStats && (
                        <div className="flex items-center gap-2 text-xs text-white/30 font-mono bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                            <Database size={12} /> {dbStats.total_chunks ?? "?"} chunks indexed
                        </div>
                    )}
                </div>
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-3xl mb-5">📊</div>
                    <h2 className="text-lg font-semibold mb-2">No session data yet</h2>
                    <p className="text-sm text-white/35 max-w-sm mb-8 leading-relaxed">
                        Complete a learning session first — upload a document, then answer some questions in the <strong className="text-white/60">Learn</strong> tab. Results will appear here automatically.
                    </p>
                    <div className="flex gap-3">
                        <a href="/" className="px-4 py-2.5 rounded-xl text-sm font-medium bg-white/[0.06] text-white/60 hover:bg-white/10 border border-white/[0.07] transition-all">↑ Upload Document</a>
                        <a href="/session" className="px-4 py-2.5 rounded-xl text-sm font-semibold text-[#0B0E1A] transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg,#00E5A0,#0B8FFF)" }}>Start Session →</a>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="max-w-[1400px] mx-auto px-8 py-8 flex items-center justify-center py-32">
                <div className="flex flex-col items-center gap-3 text-white/40">
                    <Loader2 size={28} className="animate-spin" />
                    <span className="text-sm font-mono">Loading evaluation results…</span>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1400px] mx-auto px-8 py-8">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        {activeTab === "questions" ? "Question Quality Dashboard" : "Session Performance"}
                    </h1>
                    <p className="text-sm text-white/35 mt-1">
                        {activeTab === "questions" ? (
                            <>
                                Evaluating {questions.length} questions across DPS, SOS, and Clarity
                                {isLive && <span className="ml-2 text-[#00E5A0] text-xs font-mono">● LIVE</span>}
                            </>
                        ) : (
                            <>Your learning progress and performance metrics</>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Tab Switcher */}
                    <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-lg p-1 mr-2">
                        <button
                            onClick={() => setActiveTab("questions")}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === "questions"
                                    ? "bg-white/10 text-white"
                                    : "text-white/40 hover:text-white/60"
                                }`}
                        >
                            Question Quality
                        </button>
                        <button
                            onClick={() => setActiveTab("performance")}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === "performance"
                                    ? "bg-white/10 text-white"
                                    : "text-white/40 hover:text-white/60"
                                }`}
                        >
                            My Performance
                        </button>
                    </div>
                    {dbStats && (
                        <div className="flex items-center gap-2 text-xs text-white/30 font-mono bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                            <Database size={12} /> {dbStats.total_chunks ?? "?"} chunks
                        </div>
                    )}
                    <button onClick={() => loadLiveData()} disabled={loading}
                        className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/10 border border-white/[0.07] transition-all disabled:opacity-40">
                        {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Refresh
                    </button>
                </div>
            </div>

            {/* Performance Tab Content */}
            {activeTab === "performance" && userPerformance && (
                <>
                    {/* Performance KPIs */}
                    <div className="grid grid-cols-5 gap-3 mb-5">
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                            <div className="text-2xl font-bold font-mono text-[#00E5A0]">{userPerformance.total_questions}</div>
                            <div className="text-[10px] text-white/30 mt-1 uppercase tracking-widest font-mono">Total Questions</div>
                        </div>
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                            <div className="text-2xl font-bold font-mono text-[#0B8FFF]">{userPerformance.correct_answers}</div>
                            <div className="text-[10px] text-white/30 mt-1 uppercase tracking-widest font-mono">Correct</div>
                        </div>
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                            <div className="text-2xl font-bold font-mono" style={{ color: scoreColor(userPerformance.accuracy_rate) }}>
                                {Math.round(userPerformance.accuracy_rate * 100)}%
                            </div>
                            <div className="text-[10px] text-white/30 mt-1 uppercase tracking-widest font-mono">Accuracy</div>
                        </div>
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                            <div className="text-2xl font-bold font-mono text-[#FFD166]">{userPerformance.avg_response_time.toFixed(1)}s</div>
                            <div className="text-[10px] text-white/30 mt-1 uppercase tracking-widest font-mono">Avg Time</div>
                        </div>
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                            <div className="text-2xl font-bold font-mono capitalize" style={{ color: DIFF_COLORS[userPerformance.current_difficulty] || "#fff" }}>
                                {userPerformance.current_difficulty}
                            </div>
                            <div className="text-[10px] text-white/30 mt-1 uppercase tracking-widest font-mono">Current Level</div>
                        </div>
                    </div>

                    {/* Topic Mastery */}
                    {Object.keys(userPerformance.topics_mastery).length > 0 && (
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 mb-5">
                            <div className="text-[11px] text-white/30 font-mono uppercase tracking-widest mb-4">Topic Mastery</div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {Object.entries(userPerformance.topics_mastery).map(([topic, data]) => {
                                    const accuracy = data.total > 0 ? data.correct / data.total : 0;
                                    return (
                                        <div key={topic} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
                                            <div className="text-xs text-white/60 mb-2 truncate">{topic}</div>
                                            <div className="flex items-center justify-between">
                                                <div className="text-lg font-bold font-mono" style={{ color: scoreColor(accuracy) }}>
                                                    {Math.round(accuracy * 100)}%
                                                </div>
                                                <div className="text-[10px] text-white/30 font-mono">
                                                    {data.correct}/{data.total}
                                                </div>
                                            </div>
                                            <div className="h-1 rounded-full bg-white/[0.05] mt-2 overflow-hidden">
                                                <div className="h-full rounded-full transition-all"
                                                    style={{ width: `${accuracy * 100}%`, background: scoreColor(accuracy) }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Recent Session History */}
                    {userPerformance.session_history.length > 0 && (
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                            <div className="text-[11px] text-white/30 font-mono uppercase tracking-widest mb-4">Recent Activity</div>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {userPerformance.session_history.slice().reverse().slice(0, 20).map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-4 bg-white/[0.03] rounded-lg p-3 border border-white/[0.05]">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${item.correct
                                                ? "bg-[#00E5A0]/10 text-[#00E5A0]"
                                                : "bg-[#FF6B6B]/10 text-[#FF6B6B]"
                                            }`}>
                                            {item.correct ? "✓" : "✗"}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs text-white/60 truncate">{item.topic}</div>
                                            <div className="text-[10px] text-white/30 font-mono">{item.question_id}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs font-mono capitalize" style={{ color: DIFF_COLORS[item.difficulty] || "#fff" }}>
                                                {item.difficulty}
                                            </div>
                                            <div className="text-[10px] text-white/30 font-mono">{item.time_taken.toFixed(1)}s</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {activeTab === "performance" && !userPerformance && (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-3xl mb-5">📊</div>
                    <h2 className="text-lg font-semibold mb-2">No performance data yet</h2>
                    <p className="text-sm text-white/35 max-w-sm mb-8 leading-relaxed">
                        Complete a learning session first to see your performance metrics here.
                    </p>
                    <a href="/session" className="px-4 py-2.5 rounded-xl text-sm font-semibold text-[#0B0E1A] transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg,#00E5A0,#0B8FFF)" }}>
                        Start Session →
                    </a>
                </div>
            )}

            {/* Question Quality Tab Content */}
            {activeTab === "questions" && (<>

                {/* KPI Row */}
                <div className="grid grid-cols-6 gap-3 mb-5">
                    {[
                        { label: "Total", value: questions.length, color: "#fff" },
                        { label: "Approved", value: approved, color: "#00E5A0" },
                        { label: "Flagged", value: flagged, color: "#FFD166" },
                        { label: "Rejected", value: rejected, color: "#FF6B6B" },
                        { label: "Avg Quality", value: `${Math.round(((avgDPS + (1 - avgSOS) + avgClarity) / 3) * 100)}%`, color: "#0B8FFF" },
                        { label: "Pass Rate", value: `${Math.round((approved / questions.length) * 100)}%`, color: "#00E5A0" },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                            <div className="text-2xl font-bold font-mono" style={{ color }}>{value}</div>
                            <div className="text-[10px] text-white/30 mt-1 uppercase tracking-widest font-mono">{label}</div>
                        </div>
                    ))}
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-[250px_1fr_1fr] gap-4 mb-4">
                    {/* Score Rings */}
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-4">
                        <div className="text-[11px] text-white/30 font-mono uppercase tracking-widest">Averages</div>
                        <div className="flex justify-around"><ScoreRing value={avgDPS} label="DPS" /><ScoreRing value={avgSOS} label="SOS" inverse /><ScoreRing value={avgClarity} label="Clarity" /></div>
                        <div className="border-t border-white/[0.05] pt-4 space-y-3">
                            {([['Power', avgDPS, false], ['Uniqueness', 1 - avgSOS, false], ['Clarity', avgClarity, false]] as Array<[string, number, boolean]>).map(([l, v, i]) => (
                                <div key={l}>
                                    <div className="flex justify-between text-[11px] mb-1">
                                        <span className="text-white/35 font-mono">{l}</span>
                                        <span className="font-mono font-semibold" style={{ color: scoreColor(v, i) }}>{pct(v)}%</span>
                                    </div>
                                    <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${pct(v)}%`, background: scoreColor(v, i), transition: "width 1s cubic-bezier(0.4,0,0.2,1)" }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Topic bar */}
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                        <div className="text-[11px] text-white/30 font-mono uppercase tracking-widest mb-4">Metrics by Topic</div>
                        <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={topicData} barSize={9}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                                <XAxis dataKey="topic" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                                <YAxis domain={[0, 100]} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, fontFamily: "monospace" }} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
                                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                                <Bar dataKey="dps" name="DPS" fill="#00E5A0" radius={[3, 3, 0, 0]} />
                                <Bar dataKey="clarity" name="Clarity" fill="#0B8FFF" radius={[3, 3, 0, 0]} />
                                <Bar dataKey="uniqueness" name="Uniqueness" fill="#FFD166" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Modality bar */}
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                        <div className="text-[11px] text-white/30 font-mono uppercase tracking-widest mb-4">Status by Modality</div>
                        <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={modalityDist} barSize={14}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                                <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, fontFamily: "monospace" }} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
                                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                                <Bar dataKey="approved" name="Approved" fill="#00E5A0" stackId="a" />
                                <Bar dataKey="flagged" name="Flagged" fill="#FFD166" stackId="a" />
                                <Bar dataKey="rejected" name="Rejected" fill="#FF6B6B" stackId="a" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Question list + detail / scatter */}
                <div className={`grid gap-4 ${selected ? "grid-cols-[1fr_400px]" : "grid-cols-[280px_1fr]"}`}>
                    {/* Scatter */}
                    {!selected && (
                        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                            <div className="text-[11px] text-white/30 font-mono uppercase tracking-widest mb-1">DPS vs Clarity Map</div>
                            <div className="text-[11px] text-white/20 mb-4">Bubble size = uniqueness</div>
                            <ResponsiveContainer width="100%" height={240}>
                                <ScatterChart>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                    <XAxis dataKey="x" name="DPS" domain={[0, 100]} label={{ value: "DPS %", position: "insideBottom", offset: -2, fill: "rgba(255,255,255,0.2)", fontSize: 10, fontFamily: "monospace" }} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis dataKey="y" name="Clarity" domain={[0, 100]} label={{ value: "Clarity %", angle: -90, position: "insideLeft", fill: "rgba(255,255,255,0.2)", fontSize: 10, fontFamily: "monospace" }} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <ZAxis dataKey="z" range={[40, 200]} />
                                    <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11, fontFamily: "monospace" }} cursor={{ strokeDasharray: "3 3" }} />
                                    <Scatter data={scatterData}>
                                        {scatterData.map((e, i) => <Cell key={i} fill={SC[e.status as keyof typeof SC]} fillOpacity={0.75} />)}
                                    </Scatter>
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Question list */}
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 flex flex-col overflow-hidden">
                        <div className="flex gap-2 mb-4 items-center">
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search questions or topics…"
                                className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-white/20" />
                            {["all", "approved", "flagged", "rejected"].map(f => (
                                <button key={f} onClick={() => setFilter(f)}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-mono capitalize border transition-all
                  ${filter === f ? f === "all" ? "bg-white/10 border-white/20 text-white" : `border-[${statusConfig[f]?.color}66]` : "border-white/[0.06] text-white/30 hover:text-white/50"}`}
                                    style={filter === f && f !== "all" ? { background: statusConfig[f]?.bg, borderColor: statusConfig[f]?.color + "55", color: statusConfig[f]?.color } : {}}>
                                    {f}
                                </button>
                            ))}
                        </div>
                        {/* Column labels */}
                        <div className="flex gap-3 px-3 pb-2 border-b border-white/[0.05] mb-2">
                            <div className="w-8" />
                            <div className="flex-1 text-[10px] text-white/25 font-mono uppercase tracking-wider">Question</div>
                            <div className="flex gap-4 pr-1.5 text-[10px] text-white/25 font-mono uppercase tracking-wider">
                                <span>DPS</span><span>SOS</span><span>CLR</span>
                            </div>
                        </div>
                        <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
                            {filtered.length === 0
                                ? <div className="text-center py-10 text-white/20 text-sm font-mono">No questions match</div>
                                : filtered.map(q => <QRow key={q.id} q={q} selected={selected?.id === q.id} onSelect={() => setSelected(selected?.id === q.id ? null : q)} />)
                            }
                        </div>
                    </div>

                    {/* Detail */}
                    {selected && <DetailPanel q={selected} onClose={() => setSelected(null)} />}
                </div>

                {/* Footer */}
                <div className="mt-8 pt-5 border-t border-white/[0.05] flex justify-between items-center">
                    <span className="text-[11px] text-white/20 font-mono">DOTG v2 · Evaluation Engine · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    <div className="flex gap-5 text-[11px] text-white/20 font-mono">
                        {[["DPS", "Discriminating Power"], ["SOS", "Semantic Overlap (lower=better)"], ["CLR", "Clarity Score"]].map(([a, d]) => (
                            <span key={a}><span className="text-white/40">{a}</span> = {d}</span>
                        ))}
                    </div>
                </div>
            </>)}
        </div>
    );
}
