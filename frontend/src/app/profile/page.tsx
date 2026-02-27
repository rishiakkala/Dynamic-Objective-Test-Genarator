"use client";
import { useState, useEffect } from "react";
import { getUser } from "@/lib/api";
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer
} from "recharts";
import {
    User, Target, Clock, TrendingUp, TrendingDown, Minus,
    RotateCcw, BookOpen, CheckCircle2, AlertCircle, Zap, Brain
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────
interface RoundData { round: number; score: number; total: number; difficulty: string; }
interface Stats {
    total_questions: number; accuracy_rate: number;
    avg_response_time: number; skill_level: number;
    current_difficulty: string;
    topics_mastery: Record<string, { correct: number; total: number }>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const DIFF_COLORS: Record<string, string> = { easy: "#00E5A0", medium: "#FFD166", hard: "#FF6B6B" };
const DIFF_ORDER: Record<string, number> = { easy: 1, medium: 2, hard: 3 };

function pct(v: number) { return Math.round(v * 100); }

function diffLabel(path: string[]) {
    if (path[0] === path[path.length - 1]) return "Consistent";
    const delta = DIFF_ORDER[path[path.length - 1]] - DIFF_ORDER[path[0]];
    return delta > 0 ? `Progressed to ${path[path.length - 1]}` : `Adjusted to ${path[path.length - 1]}`;
}

function getGrade(acc: number) {
    if (acc >= 0.9) return { label: "Excellent", color: "#00E5A0", emoji: "🏆" };
    if (acc >= 0.75) return { label: "Great", color: "#00E5A0", emoji: "⭐" };
    if (acc >= 0.6) return { label: "Good", color: "#FFD166", emoji: "📚" };
    if (acc >= 0.45) return { label: "Fair", color: "#FFD166", emoji: "💪" };
    return { label: "Needs Work", color: "#FF6B6B", emoji: "🔄" };
}

function buildRecommendations(history: RoundData[], stats: Stats | null, topic: string) {
    const recs: { icon: string; text: string; priority: "high" | "medium" | "low" }[] = [];
    const totalAcc = history.reduce((s, h) => s + h.score, 0) / history.reduce((s, h) => s + h.total, 0);
    const finalDiff = history[history.length - 1]?.difficulty;

    if (totalAcc < 0.5) {
        recs.push({ icon: "📖", text: `Review core concepts of "${topic}" before attempting another session.`, priority: "high" });
        recs.push({ icon: "⏱", text: "Start with Easy difficulty in your next session to build confidence.", priority: "high" });
    } else if (totalAcc < 0.75) {
        recs.push({ icon: "🔁", text: `Revisit "${topic}" with more focus on application-level questions.`, priority: "medium" });
        if (finalDiff !== "hard")
            recs.push({ icon: "📈", text: `You're ready to push into ${DIFF_ORDER[finalDiff] >= 2 ? "Hard" : "Medium"} more consistently.`, priority: "medium" });
    } else {
        recs.push({ icon: "🚀", text: "Strong performance! Challenge yourself with a different or more advanced topic.", priority: "low" });
        recs.push({ icon: "🎯", text: "Try disabling the topic hint and answering from memory to deepen retention.", priority: "low" });
    }

    // Topic-specific recommendations from backend stats
    if (stats) {
        const weak = Object.entries(stats.topics_mastery)
            .filter(([, m]) => m.correct / m.total < 0.5)
            .map(([t]) => t);
        if (weak.length > 0) {
            recs.push({ icon: "⚠️", text: `Focus on weak topics: ${weak.slice(0, 2).join(", ")}.`, priority: "high" });
        }
    }

    return recs;
}

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: React.ReactNode }) {
    return (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-2">
            <div style={{ color }} className="opacity-70">{icon}</div>
            <div className="text-2xl font-bold font-mono" style={{ color }}>{value}</div>
            <div className="text-[11px] text-white/30 uppercase tracking-widest">{label}</div>
        </div>
    );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function ProfilePage() {
    const [userId, setUserId] = useState("");
    const [input, setInput] = useState("");
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<RoundData[]>([]);
    const [topic, setTopic] = useState("General");
    const [hasSession, setHasSession] = useState(false);

    useEffect(() => {
        const saved = sessionStorage.getItem("dotg_user") || "";
        const hist = sessionStorage.getItem("dotg_session_history");
        const top = sessionStorage.getItem("dotg_session_topic") || "General";

        setInput(saved);
        setUserId(saved);
        setTopic(top);

        if (hist) {
            try { setHistory(JSON.parse(hist)); setHasSession(true); } catch { /* ignore */ }
        }
        if (saved) loadStats(saved);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadStats = async (id: string) => {
        if (!id.trim()) return;
        setLoading(true);
        try {
            const { data } = await getUser(id);
            setStats(data); setUserId(id);
            sessionStorage.setItem("dotg_user", id);
        } catch { /* user may not have any stats yet */ }
        setLoading(false);
    };

    // ── Derived data ─────────────────────────────────────────────────────────
    const totalCorrect = history.reduce((s, h) => s + h.score, 0);
    const totalQ = history.reduce((s, h) => s + h.total, 0);
    const overallAcc = totalQ > 0 ? totalCorrect / totalQ : 0;
    const grade = getGrade(overallAcc);
    const diffPath = history.map(h => h.difficulty);
    const recs = buildRecommendations(history, stats, topic);

    // Radar data from topic mastery
    const radarData = stats
        ? Object.entries(stats.topics_mastery).slice(0, 6).map(([topic, m]) => ({
            topic: topic.split(" ")[0],
            value: Math.round((m.correct / m.total) * 100),
            fullMark: 100,
        }))
        : [];

    // Round accuracy trend
    const trendData = history.map((h, i) => ({
        name: `R${i + 1}`,
        accuracy: Math.round((h.score / h.total) * 100),
        difficulty: h.difficulty,
    }));

    // ── No session state ─────────────────────────────────────────────────────
    if (!hasSession && history.length === 0) {
        return (
            <div className="max-w-2xl mx-auto px-6 py-16 text-center">
                <div className="text-4xl mb-5">📊</div>
                <h1 className="text-2xl font-semibold mb-3">Profile & Analysis</h1>
                <p className="text-sm text-white/35 mb-10 leading-relaxed max-w-sm mx-auto">
                    Complete a learning session to see your performance analysis here.
                    Your round-by-round results, strengths, and recommendations will appear automatically.
                </p>

                {/* Manual lookup */}
                <div className="text-left bg-white/[0.02] border border-white/[0.07] rounded-2xl p-6 mb-6">
                    <div className="text-xs text-white/30 uppercase tracking-widest mb-4">Look Up Existing Profile</div>
                    <div className="flex gap-3">
                        <input value={input} onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && loadStats(input)}
                            placeholder="Enter your user ID or name…"
                            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-white/20" />
                        <button onClick={() => loadStats(input)} disabled={loading}
                            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-[#0B0E1A] disabled:opacity-40"
                            style={{ background: "linear-gradient(135deg,#00E5A0,#0B8FFF)" }}>
                            {loading ? "…" : "Load"}
                        </button>
                    </div>
                </div>

                {stats && /* show cumulative stats even without a fresh session */ (
                    <CumulativeStats stats={stats} userId={userId} />
                )}

                <a href="/" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-[#0B0E1A] mt-4"
                    style={{ background: "linear-gradient(135deg,#00E5A0,#0B8FFF)" }}>
                    <BookOpen size={15} /> Start a Session
                </a>
            </div>
        );
    }

    // ── Full analysis view ────────────────────────────────────────────────────
    return (
        <div className="max-w-[960px] mx-auto px-6 py-10">

            {/* ── Header ── */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <div className="text-[11px] text-white/25 uppercase tracking-widest mb-1">Session Complete · {topic}</div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        {grade.emoji} Performance Analysis
                    </h1>
                </div>
                <button onClick={() => window.location.href = "/"}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white/50 hover:text-white/80 transition-all">
                    <RotateCcw size={13} /> New Session
                </button>
            </div>

            {/* ── Score hero ── */}
            <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] p-8 mb-6"
                style={{ background: "linear-gradient(135deg, rgba(0,229,160,0.08) 0%, rgba(11,143,255,0.08) 100%)" }}>
                <div className="flex items-center gap-8">
                    {/* Big grade */}
                    <div className="shrink-0">
                        <div className="text-5xl mb-2">{grade.emoji}</div>
                        <div className="text-3xl font-bold font-mono" style={{ color: grade.color }}>{grade.label}</div>
                        <div className="text-sm text-white/35 mt-1">Overall Performance</div>
                    </div>
                    <div className="w-px h-20 bg-white/[0.08] shrink-0" />
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-6 flex-1">
                        <div>
                            <div className="text-3xl font-bold font-mono text-[#00E5A0]">{pct(overallAcc)}%</div>
                            <div className="text-xs text-white/30 mt-1">Overall Accuracy</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold font-mono text-white">{totalCorrect}<span className="text-lg text-white/30">/{totalQ}</span></div>
                            <div className="text-xs text-white/30 mt-1">Questions Correct</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold font-mono" style={{ color: DIFF_COLORS[diffPath[diffPath.length - 1] || "medium"] }}>
                                {(diffPath[diffPath.length - 1] || "medium").charAt(0).toUpperCase() + (diffPath[diffPath.length - 1] || "medium").slice(1)}
                            </div>
                            <div className="text-xs text-white/30 mt-1">Final Difficulty</div>
                        </div>
                    </div>
                </div>

                {/* Adaptive path indicator */}
                <div className="mt-6 pt-5 border-t border-white/[0.06] flex items-center gap-3">
                    <span className="text-[10px] text-white/25 uppercase tracking-widest">Adaptive Path</span>
                    <div className="flex items-center gap-1">
                        {diffPath.map((d, i) => (
                            <span key={i} className="flex items-center gap-1">
                                <span className="px-2.5 py-1 rounded-lg text-xs font-semibold capitalize" style={{ background: DIFF_COLORS[d] + "25", color: DIFF_COLORS[d] }}>{d}</span>
                                {i < diffPath.length - 1 && (
                                    DIFF_ORDER[diffPath[i + 1]] > DIFF_ORDER[d]
                                        ? <TrendingUp size={12} className="text-[#00E5A0]" />
                                        : DIFF_ORDER[diffPath[i + 1]] < DIFF_ORDER[d]
                                            ? <TrendingDown size={12} className="text-[#FF6B6B]" />
                                            : <Minus size={12} className="text-white/25" />
                                )}
                            </span>
                        ))}
                    </div>
                    <span className="text-xs text-white/30 ml-2">— {diffLabel(diffPath)}</span>
                </div>
            </div>

            <div className="grid grid-cols-[1fr_1fr] gap-4 mb-4">

                {/* ── Round breakdown ── */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                    <div className="text-[11px] text-white/30 font-mono uppercase tracking-widest mb-4">Round Breakdown</div>
                    <div className="space-y-3">
                        {history.map((h, i) => {
                            const acc = h.score / h.total;
                            const roundGrade = getGrade(acc);
                            return (
                                <div key={i} className="flex items-center gap-4 rounded-xl border p-3.5 transition-all"
                                    style={{ background: DIFF_COLORS[h.difficulty] + "08", borderColor: DIFF_COLORS[h.difficulty] + "22" }}>
                                    <div className="text-xl">{roundGrade.emoji}</div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="text-xs font-semibold text-white/70">Round {h.round}</span>
                                            <span className="text-[10px] px-2 py-0.5 rounded capitalize font-mono"
                                                style={{ background: DIFF_COLORS[h.difficulty] + "20", color: DIFF_COLORS[h.difficulty] }}>
                                                {h.difficulty}
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                            <div className="h-full rounded-full transition-all duration-700"
                                                style={{ width: `${pct(acc)}%`, background: roundGrade.color }} />
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="font-bold font-mono text-base" style={{ color: roundGrade.color }}>{h.score}/{h.total}</div>
                                        <div className="text-[10px] text-white/25">{pct(acc)}%</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Accuracy trend chart ── */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                    <div className="text-[11px] text-white/30 font-mono uppercase tracking-widest mb-4">Accuracy by Round</div>
                    <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                            <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(v: unknown) => [`${v}%`, "Accuracy"]}
                                contentStyle={{ background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                            <Line dataKey="accuracy" stroke="#00E5A0" strokeWidth={2.5} dot={{ fill: "#00E5A0", r: 5, strokeWidth: 0 }} activeDot={{ r: 7 }} />
                        </LineChart>
                    </ResponsiveContainer>

                    {/* Mini stat row */}
                    <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/[0.05]">
                        {[
                            { label: "Best Round", value: `${pct(Math.max(...history.map(h => h.score / h.total)))}%` },
                            { label: "Improvement", value: history.length > 1 ? `${pct(history[history.length - 1].score / history[history.length - 1].total) - pct(history[0].score / history[0].total) > 0 ? "+" : ""}${pct(history[history.length - 1].score / history[history.length - 1].total) - pct(history[0].score / history[0].total)}%` : "—" },
                            { label: "Consistency", value: history.length > 1 ? (Math.max(...history.map(h => pct(h.score / h.total))) - Math.min(...history.map(h => pct(h.score / h.total))) <= 20 ? "High" : "Variable") : "—" },
                        ].map(({ label, value }) => (
                            <div key={label} className="text-center">
                                <div className="text-sm font-bold font-mono text-[#0B8FFF]">{value}</div>
                                <div className="text-[10px] text-white/25 mt-0.5">{label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Strengths / Weaknesses + Recommendations ── */}
            <div className="grid grid-cols-[1fr_360px] gap-4 mb-4">

                {/* Recommendations */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Brain size={14} className="text-[#0B8FFF]" />
                        <div className="text-[11px] text-white/30 font-mono uppercase tracking-widest">Recommendations</div>
                    </div>
                    <div className="space-y-3">
                        {recs.map((r, i) => (
                            <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl border"
                                style={{
                                    background: r.priority === "high" ? "rgba(255,107,107,0.05)" : r.priority === "medium" ? "rgba(255,209,102,0.05)" : "rgba(0,229,160,0.05)",
                                    borderColor: r.priority === "high" ? "rgba(255,107,107,0.15)" : r.priority === "medium" ? "rgba(255,209,102,0.15)" : "rgba(0,229,160,0.15)"
                                }}>
                                <span className="text-lg shrink-0">{r.icon}</span>
                                <span className="text-sm text-white/70 leading-relaxed">{r.text}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Topic Strengths & Weaknesses — from backend stats */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Zap size={14} className="text-[#FFD166]" />
                        <div className="text-[11px] text-white/30 font-mono uppercase tracking-widest">Topic Mastery</div>
                    </div>
                    {stats && Object.keys(stats.topics_mastery || {}).length > 0 ? (
                        <div className="space-y-3">
                            {Object.entries(stats.topics_mastery)
                                .sort(([, a], [, b]) => (b.correct / b.total) - (a.correct / a.total))
                                .slice(0, 6)
                                .map(([t, m]) => {
                                    const acc = m.correct / m.total;
                                    const color = acc >= 0.75 ? "#00E5A0" : acc >= 0.5 ? "#FFD166" : "#FF6B6B";
                                    const Icon = acc >= 0.75 ? CheckCircle2 : AlertCircle;
                                    return (
                                        <div key={t} className="flex items-center gap-3">
                                            <Icon size={13} style={{ color }} className="shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-white/55 truncate">{t}</span>
                                                    <span className="font-mono font-semibold ml-2 shrink-0" style={{ color }}>{pct(acc)}%</span>
                                                </div>
                                                <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full" style={{ width: `${pct(acc)}%`, background: color }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    ) : (
                        <div className="text-xs text-white/30 text-center py-6 leading-relaxed">
                            Topic mastery data will appear here<br />after your first session.
                            {!userId && <div className="mt-3"><span className="text-[#0B8FFF]">Enter your User ID below.</span></div>}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Skill Radar (if backend data available) ── */}
            {radarData.length >= 3 && (
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 mb-4">
                    <div className="text-[11px] text-white/30 font-mono uppercase tracking-widest mb-4">Topic Coverage Radar</div>
                    <ResponsiveContainer width="100%" height={220}>
                        <RadarChart data={radarData}>
                            <PolarGrid stroke="rgba(255,255,255,0.06)" />
                            <PolarAngleAxis dataKey="topic" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} />
                            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                            <Radar dataKey="value" stroke="#0B8FFF" fill="#0B8FFF" fillOpacity={0.15} strokeWidth={2} />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* ── Cumulative backend stats ── */}
            {stats && <CumulativeStats stats={stats} userId={userId} />}

            {/* ── Manual lookup (if no stats or different user) ── */}
            {!stats && (
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 mb-4">
                    <div className="text-xs text-white/30 uppercase tracking-widest mb-3">Load Cumulative Profile</div>
                    <div className="flex gap-3">
                        <input value={input} onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && loadStats(input)}
                            placeholder="Enter your user ID…"
                            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-white/20" />
                        <button onClick={() => loadStats(input)} disabled={loading}
                            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-[#0B0E1A] disabled:opacity-40"
                            style={{ background: "linear-gradient(135deg,#00E5A0,#0B8FFF)" }}>
                            {loading ? "…" : "Load"}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Footer ── */}
            <div className="flex items-center justify-between pt-5 border-t border-white/[0.05] mt-2">
                <span className="text-[11px] text-white/20 font-mono">DOTG v2 · {topic} · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                <div className="flex gap-3">
                    <a href="/" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.05] text-sm text-white/50 hover:text-white/80 border border-white/[0.07] transition-all">
                        <RotateCcw size={13} /> New Session
                    </a>
                </div>
            </div>
        </div>
    );
}

// ── Cumulative Stats Block (reused in both states) ───────────────────────────
function CumulativeStats({ stats, userId }: { stats: Stats; userId: string }) {
    const DIFF_COLORS: Record<string, string> = { easy: "#00E5A0", medium: "#FFD166", hard: "#FF6B6B" };
    return (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-[#0B0E1A] text-base"
                    style={{ background: "linear-gradient(135deg,#00E5A0,#0B8FFF)" }}>
                    {userId[0]?.toUpperCase() || "U"}
                </div>
                <div>
                    <div className="font-semibold">{userId || "—"}</div>
                    <div className="text-xs text-white/30 font-mono capitalize">
                        Current difficulty: <span style={{ color: DIFF_COLORS[stats.current_difficulty] }}>{stats.current_difficulty}</span>
                        &nbsp;· Skill level: <span className="text-[#0B8FFF]">{Math.round(stats.skill_level)}</span>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/[0.03] rounded-xl p-4 text-center">
                    <Target size={15} className="mx-auto mb-2 text-[#00E5A0] opacity-60" />
                    <div className="text-xl font-bold font-mono text-[#00E5A0]">{stats.total_questions}</div>
                    <div className="text-[10px] text-white/25 mt-1 uppercase tracking-widest">Total Qs</div>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-4 text-center">
                    <TrendingUp size={15} className="mx-auto mb-2 text-[#0B8FFF] opacity-60" />
                    <div className="text-xl font-bold font-mono text-[#0B8FFF]">{Math.round(stats.accuracy_rate * 100)}%</div>
                    <div className="text-[10px] text-white/25 mt-1 uppercase tracking-widest">Accuracy</div>
                </div>
                <div className="bg-white/[0.03] rounded-xl p-4 text-center">
                    <Clock size={15} className="mx-auto mb-2 text-[#FFD166] opacity-60" />
                    <div className="text-xl font-bold font-mono text-[#FFD166]">{stats.avg_response_time.toFixed(1)}s</div>
                    <div className="text-[10px] text-white/25 mt-1 uppercase tracking-widest">Avg Time</div>
                </div>
            </div>
        </div>
    );
}
