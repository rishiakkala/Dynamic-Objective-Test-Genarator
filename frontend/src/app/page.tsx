"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2,
  Database, Cpu, Table2, Image, FunctionSquare, Search, ArrowLeft
} from "lucide-react";
import { uploadDocument, getSessionStatus } from "@/lib/api";
import { useRouter } from "next/navigation";

// ── Types ───────────────────────────────────────────────────────────────────
type Mode = null | "upload" | "topic";
type Step = "parse" | "vector_db" | "agents";
type StepStatus = "idle" | "running" | "done" | "error";
interface Progress {
  parse?: StepStatus; vector_db?: StepStatus; agents?: StepStatus;
  pages?: number; tables?: number; images?: number; equations?: number; chunks?: number;
}

const stepInfo = [
  { key: "parse" as Step, label: "Multimodal Parse", icon: FileText, desc: "OCR · Tables · Images · Equations" },
  { key: "vector_db" as Step, label: "Vector Database", icon: Database, desc: "Embedding & storing all chunks" },
  { key: "agents" as Step, label: "AI Agents", icon: Cpu, desc: "Structuring knowledge base" },
];

function StepRow({ step, status }: { step: typeof stepInfo[0]; status: StepStatus }) {
  const Icon = step.icon;
  const colors: Record<StepStatus, string> = {
    idle: "text-white/20", running: "text-[#0B8FFF]", done: "text-[#00E5A0]", error: "text-[#FF6B6B]",
  };
  const bg: Record<StepStatus, string> = {
    idle: "bg-white/[0.02]", running: "bg-[#0B8FFF]/08", done: "bg-[#00E5A0]/08", error: "bg-[#FF6B6B]/08",
  };
  return (
    <div className={`flex items-center gap-4 rounded-xl p-4 border border-white/[0.06] transition-all duration-500 ${bg[status]}`}>
      <div className={`transition-colors ${colors[status]}`}>
        {status === "running" ? <Loader2 size={18} className="animate-spin" /> :
          status === "done" ? <CheckCircle2 size={18} /> :
            status === "error" ? <AlertCircle size={18} /> :
              <Icon size={18} />}
      </div>
      <div className="flex-1">
        <div className={`text-sm font-medium ${status === "idle" ? "text-white/30" : "text-white"}`}>{step.label}</div>
        <div className="text-xs text-white/25 mt-0.5">{step.desc}</div>
      </div>
      <div className={`text-xs font-mono uppercase tracking-wider ${colors[status]}`}>
        {status === "running" ? "Processing" : status === "done" ? "Done" : status === "error" ? "Error" : "Waiting"}
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function LearnPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);

  // Upload state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "processing" | "ready" | "error">("idle");
  const [progress, setProgress] = useState<Progress>({});
  const [uploadError, setUploadError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Topic state
  const [topic, setTopic] = useState("");
  const [topicError, setTopicError] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [indexedFile, setIndexedFile] = useState("");

  useEffect(() => {
    const sid = sessionStorage.getItem("dotg_session");
    const fname = sessionStorage.getItem("dotg_filename") || "";
    setHasSession(!!sid);
    setIndexedFile(fname);
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const reset = () => {
    setMode(null);
    setUploadStatus("idle");
    setProgress({});
    setUploadError("");
    setTopic("");
    setTopicError("");
    setSessionId(null);
    setFilename("");
    if (pollRef.current) clearInterval(pollRef.current);
  };

  // ── Upload handlers ──────────────────────────────────────────────────────
  const onDrop = useCallback(async (files: File[]) => {
    if (!files[0]) return;
    const file = files[0];
    setFilename(file.name);
    setUploadStatus("uploading");
    setUploadError(""); setProgress({});
    try {
      const { data } = await uploadDocument(file);
      setSessionId(data.session_id);
      setUploadStatus("processing");
      pollRef.current = setInterval(async () => {
        const { data: s } = await getSessionStatus(data.session_id);
        setProgress(s.progress as Progress);
        if (s.status === "ready") {
          setUploadStatus("ready");
          clearInterval(pollRef.current);
          sessionStorage.setItem("dotg_session", data.session_id);
          sessionStorage.setItem("dotg_filename", file.name);
          sessionStorage.removeItem("dotg_topic");
          setHasSession(true); setIndexedFile(file.name);
        } else if (s.status === "error") {
          setUploadStatus("error");
          setUploadError(s.error || "Unknown error");
          clearInterval(pollRef.current);
        }
      }, 1500);
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
      setUploadStatus("error");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"], "text/plain": [".txt"] },
    maxFiles: 1, disabled: uploadStatus !== "idle",
  });

  // ── Topic handler ────────────────────────────────────────────────────────
  const startWithTopic = () => {
    if (!topic.trim()) { setTopicError("Please enter a topic."); return; }
    if (!hasSession) { setTopicError("No document indexed yet — please upload a document first."); return; }
    sessionStorage.setItem("dotg_topic", topic.trim());
    router.push(`/session?topic=${encodeURIComponent(topic.trim())}`);
  };

  // ── Choice screen ────────────────────────────────────────────────────────
  if (mode === null) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-14">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-semibold tracking-tight">Start Learning</h1>
          <p className="text-sm text-white/35 mt-2">Choose how you want to begin your session</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Upload card */}
          <button onClick={() => setMode("upload")}
            className="group relative flex flex-col items-start gap-4 p-6 rounded-2xl border border-white/[0.08] bg-white/[0.03]
              hover:border-[#00E5A0]/40 hover:bg-[#00E5A0]/[0.04] transition-all duration-200 text-left">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-all
              bg-white/[0.05] group-hover:bg-[#00E5A0]/15">
              <UploadCloud size={22} className="text-white/40 group-hover:text-[#00E5A0] transition-colors" />
            </div>
            <div>
              <div className="font-semibold text-base mb-1 group-hover:text-white transition-colors">Upload Document</div>
              <div className="text-xs text-white/35 leading-relaxed">
                Upload a PDF, DOCX, or TXT file.<br />
                Multimodal parsing — tables, images, equations.
              </div>
            </div>
            <div className="mt-auto flex items-center gap-1.5 text-xs font-mono text-white/20 group-hover:text-[#00E5A0]/60 transition-colors">
              PDF · DOCX · TXT <span className="ml-1">→</span>
            </div>
            {/* corner glow */}
            <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ boxShadow: "inset 0 0 0 1px rgba(0,229,160,0.2)" }} />
          </button>

          {/* Topic card */}
          <button onClick={() => setMode("topic")}
            className="group relative flex flex-col items-start gap-4 p-6 rounded-2xl border border-white/[0.08] bg-white/[0.03]
              hover:border-[#0B8FFF]/40 hover:bg-[#0B8FFF]/[0.04] transition-all duration-200 text-left">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center transition-all
              bg-white/[0.05] group-hover:bg-[#0B8FFF]/15">
              <Search size={22} className="text-white/40 group-hover:text-[#0B8FFF] transition-colors" />
            </div>
            <div>
              <div className="font-semibold text-base mb-1 group-hover:text-white transition-colors">Search by Topic</div>
              <div className="text-xs text-white/35 leading-relaxed">
                Enter a topic and get questions focused<br />
                on that area from your indexed document.
              </div>
            </div>
            <div className="mt-auto flex items-center gap-1.5 text-xs font-mono transition-colors">
              {hasSession
                ? <span className="text-[#00E5A0]/60 group-hover:text-[#0B8FFF]/60">✓ {indexedFile || "Document ready"} <span className="ml-1">→</span></span>
                : <span className="text-white/20 group-hover:text-[#0B8FFF]/50">General knowledge Mode <span className="ml-1">→</span></span>
              }
            </div>
            <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ boxShadow: "inset 0 0 0 1px rgba(11,143,255,0.2)" }} />
          </button>
        </div>
      </div>
    );
  }

  // ── Upload mode ──────────────────────────────────────────────────────────
  if (mode === "upload") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <button onClick={reset} className="flex items-center gap-2 text-xs text-white/30 hover:text-white/60 mb-8 transition-colors">
          <ArrowLeft size={13} /> Back
        </button>
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Upload Document</h1>
          <p className="text-sm text-white/35 mt-1">PDF, DOCX, or TXT — multimodal parsing included</p>
        </div>

        <div className="space-y-4">
          {uploadStatus === "idle" && (
            <div {...getRootProps()}
              className={`rounded-2xl border-2 border-dashed p-14 text-center cursor-pointer transition-all duration-300
                ${isDragActive ? "border-[#00E5A0]/60 bg-[#00E5A0]/5" : "border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"}`}>
              <input {...getInputProps()} />
              <UploadCloud size={36} className={`mx-auto mb-4 transition-colors ${isDragActive ? "text-[#00E5A0]" : "text-white/20"}`} />
              <p className="text-sm font-medium text-white/60">{isDragActive ? "Drop it here!" : "Drag & drop your document"}</p>
              <p className="text-xs text-white/25 mt-1">or click to browse</p>
            </div>
          )}

          {uploadStatus !== "idle" && (
            <>
              <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                <FileText size={16} className="text-white/40" />
                <div>
                  <div className="text-sm font-medium">{filename}</div>
                  {sessionId && <div className="text-xs text-white/30 font-mono mt-0.5">Session: {sessionId}</div>}
                </div>
                <div className="ml-auto">
                  {uploadStatus === "uploading" && <Loader2 size={15} className="animate-spin text-[#0B8FFF]" />}
                  {uploadStatus === "ready" && <CheckCircle2 size={15} className="text-[#00E5A0]" />}
                  {uploadStatus === "error" && <AlertCircle size={15} className="text-[#FF6B6B]" />}
                </div>
              </div>

              <div className="space-y-2">
                {stepInfo.map(step => (
                  <StepRow key={step.key} step={step} status={(progress[step.key] as StepStatus) || "idle"} />
                ))}
              </div>

              {(progress.pages || progress.tables || progress.images || progress.equations) && (
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Pages", value: progress.pages, icon: FileText },
                    { label: "Tables", value: progress.tables, icon: Table2 },
                    { label: "Images", value: progress.images, icon: Image },
                    { label: "Equations", value: progress.equations, icon: FunctionSquare },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06] text-center">
                      <Icon size={14} className="mx-auto mb-2 text-white/30" />
                      <div className="text-lg font-bold font-mono">{value ?? "—"}</div>
                      <div className="text-xs text-white/25 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              )}

              {progress.chunks && (
                <div className="flex items-center gap-3 bg-[#00E5A0]/08 rounded-xl p-3 border border-[#00E5A0]/20">
                  <Database size={14} className="text-[#00E5A0]" />
                  <span className="text-sm text-[#00E5A0] font-medium">{progress.chunks} chunks embedded in vector DB</span>
                </div>
              )}

              {uploadStatus === "error" && (
                <div className="bg-[#FF6B6B]/10 rounded-xl p-4 border border-[#FF6B6B]/20">
                  <p className="text-sm text-[#FF6B6B]">⚠ {uploadError}</p>
                </div>
              )}

              {uploadStatus === "ready" && (
                <div className="flex gap-3 pt-1">
                  <button onClick={() => router.push("/session")}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold text-[#0B0E1A] hover:opacity-90 transition-all"
                    style={{ background: "linear-gradient(135deg,#00E5A0,#0B8FFF)" }}>
                    Start Learning Session →
                  </button>
                  <button onClick={() => router.push("/dashboard")}
                    className="px-5 py-3 rounded-xl text-sm font-medium bg-white/[0.06] text-white/60 hover:bg-white/10 transition-all">
                    Dashboard
                  </button>
                </div>
              )}

              {uploadStatus !== "ready" && uploadStatus !== "error" && (
                <button onClick={reset} className="w-full py-2 text-xs text-white/25 hover:text-white/40 transition-colors">Cancel</button>
              )}
              {uploadStatus === "error" && (
                <button onClick={() => { setUploadStatus("idle"); setProgress({}); setUploadError(""); }}
                  className="w-full py-2.5 rounded-xl text-sm bg-white/[0.05] text-white/50 hover:bg-white/10 transition-all">
                  Try again
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Topic mode ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <button onClick={reset} className="flex items-center gap-2 text-xs text-white/30 hover:text-white/60 mb-8 transition-colors">
        <ArrowLeft size={13} /> Back
      </button>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Search by Topic</h1>
        <p className="text-sm text-white/35 mt-1">Generate questions focused on a specific topic from your indexed document</p>
      </div>

      <div className="space-y-4">
        {/* Document indicator */}
        {hasSession ? (
          <div className="flex items-center gap-2 bg-[#00E5A0]/06 border border-[#00E5A0]/20 rounded-xl px-4 py-3">
            <CheckCircle2 size={13} className="text-[#00E5A0] shrink-0" />
            <span className="text-xs text-[#00E5A0]">
              Using indexed document: <span className="font-semibold">{indexedFile || "your document"}</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3">
            <Search size={13} className="text-white/30 shrink-0" />
            <span className="text-xs text-white/40">
              No specific document indexed. Will use general knowledge.
            </span>
          </div>
        )}

        {/* Topic input */}
        <div>
          <label className="text-xs text-white/40 uppercase tracking-wider block mb-3">Topic</label>
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
            <input
              value={topic}
              onChange={e => { setTopic(e.target.value); setTopicError(""); }}
              onKeyDown={e => e.key === "Enter" && startWithTopic()}
              placeholder="e.g. thermodynamics, Carnot cycle, entropy…"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/20 outline-none focus:border-white/20 transition-colors"
              autoFocus
            />
          </div>
          {topicError && <p className="text-xs text-[#FF6B6B] mt-2">{topicError}</p>}
          <p className="text-[11px] text-white/20 mt-2">Enter a topic to search your document (if indexed) or general knowledge.</p>
        </div>

        <button onClick={startWithTopic}
          className="w-full py-3 rounded-xl text-sm font-semibold text-[#0B0E1A] transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg,#00E5A0,#0B8FFF)" }}>
          Search & Start Session →
        </button>
      </div>
    </div>
  );
}
