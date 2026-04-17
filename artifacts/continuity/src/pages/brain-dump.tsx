import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Send, Mic, MicOff, Loader2 } from "lucide-react";
import { useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { AppHeader } from "@/components/app-header";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoricalEntry {
  id: number;
  content: string;
  createdAt: string;
  projectId: number | null;
  projectTitle: string | null;
  isNote: boolean;
}

interface PendingEntry {
  tempId: string;
  content: string;
  timestamp: Date;
  resolved?: {
    projectId: number | null;
    projectTitle: string | null;
    isNew: boolean;
    isNote: boolean;
  };
  failed?: boolean;
}

interface ContextMenu {
  x: number;
  y: number;
  entryId: number | string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchAllUpdates(): Promise<HistoricalEntry[]> {
  const res = await fetch(`${BASE}/api/updates`);
  if (!res.ok) return [];
  const raw = await res.json();
  return raw.map((e: HistoricalEntry & { isNote?: boolean }) => ({
    ...e,
    isNote: e.isNote ?? false,
    projectId: e.projectId ?? null,
    projectTitle: e.projectTitle ?? null,
  }));
}

async function postBrainDump(content: string) {
  const res = await fetch(`${BASE}/api/brain-dump`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Failed to submit");
  return res.json() as Promise<{
    update: { id: number; content: string; createdAt: string };
    project: { id: number; title: string } | null;
    isNew: boolean;
    isNote: boolean;
  }>;
}

function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ActivityLog({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-2 px-1">
      <span className="text-muted-foreground/20 text-[10px] tracking-widest select-none">───</span>
      <span className="text-muted-foreground/35 text-[11px] font-mono">{label}</span>
      <span className="text-muted-foreground/20 text-[10px] tracking-widest select-none">───</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BrainDump() {
  const [history, setHistory] = useState<HistoricalEntry[]>([]);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const feedBottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRefs = useRef<Map<number | string, HTMLDivElement>>(new Map());

  const { data: dashboard } = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const activeCount = (dashboard?.activeProjects ?? 0) + (dashboard?.coastingProjects ?? 0);

  useEffect(() => {
    fetchAllUpdates().then((data) => {
      setHistory(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, pending]);

  useEffect(() => {
    const handler = () => setContextMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const content = input.trim();
    if (!content || submitting) return;

    const tempId = `temp-${Date.now()}`;
    setPending((prev) => [...prev, { tempId, content, timestamp: new Date() }]);
    setInput("");
    setSubmitting(true);

    try {
      const result = await postBrainDump(content);
      const newEntry: HistoricalEntry = {
        id: result.update.id,
        content: result.update.content,
        createdAt: result.update.createdAt,
        projectId: result.project?.id ?? null,
        projectTitle: result.project?.title ?? null,
        isNote: result.isNote ?? false,
      };
      setHistory((prev) => [...prev, newEntry]);
      setPending((prev) =>
        prev.map((e) =>
          e.tempId === tempId
            ? {
                ...e,
                resolved: {
                  projectId: result.project?.id ?? null,
                  projectTitle: result.project?.title ?? null,
                  isNew: result.isNew,
                  isNote: result.isNote ?? false,
                },
              }
            : e
        )
      );
      setTimeout(() => {
        setPending((prev) => prev.filter((e) => e.tempId !== tempId));
      }, 2500);
    } catch {
      setPending((prev) =>
        prev.map((e) => (e.tempId === tempId ? { ...e, failed: true } : e))
      );
      setTimeout(() => {
        setPending((prev) => prev.filter((e) => e.tempId !== tempId));
      }, 2000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ── Mic / Web Speech API ──────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const SpeechRecognitionClass =
      (window as Window & typeof globalThis).SpeechRecognition ||
      (window as Window & typeof globalThis & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setMicError("Speech recognition not supported in this browser.");
      setTimeout(() => setMicError(null), 3000);
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setMicError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") {
        setMicError("Microphone access denied.");
      } else if (event.error !== "aborted") {
        setMicError("Mic error — please try again.");
      }
      setIsListening(false);
      setTimeout(() => setMicError(null), 3000);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening]);

  // ── Long-press context menu ───────────────────────────────────────────────

  const startLongPress = (
    e: React.TouchEvent | React.MouseEvent,
    id: number | string
  ) => {
    const clientX =
      "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY =
      "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    longPressTimer.current = setTimeout(() => {
      setContextMenu({ x: clientX, y: clientY, entryId: id });
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleShowSource = (entryId: number | string) => {
    setContextMenu(null);
    const el = messageRefs.current.get(entryId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("highlight-pulse");
      setTimeout(() => el.classList.remove("highlight-pulse"), 1500);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const isEmpty = !loading && history.length === 0 && pending.length === 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background" onClick={() => setContextMenu(null)}>
      <AppHeader title="Brain Dump" />

      {activeCount > 0 && isEmpty && (
        <div className="px-4 pt-3">
          <Link
            href="/projects"
            className="inline-block text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            You have {activeCount} active project{activeCount !== 1 ? "s" : ""}
          </Link>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-32 pt-4">
        {loading ? (
          <div className="flex items-center justify-center pt-20">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/30" />
          </div>
        ) : isEmpty ? (
          <div className="flex items-center justify-center h-full pb-24">
            <p className="text-muted-foreground/30 text-sm font-serif italic">Drop anything…</p>
          </div>
        ) : (
          <div className="space-y-1">
            {history.map((entry) => (
              <div key={entry.id} className="space-y-1">
                {/* Bubble — LEFT aligned */}
                <div
                  ref={(el) => {
                    if (el) messageRefs.current.set(entry.id, el);
                    else messageRefs.current.delete(entry.id);
                  }}
                  className="max-w-[85%] bg-card border border-border/40 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-foreground/90 leading-relaxed cursor-pointer select-none transition-colors hover:border-border/60"
                  onMouseDown={(e) => startLongPress(e, entry.id)}
                  onMouseUp={cancelLongPress}
                  onMouseLeave={cancelLongPress}
                  onTouchStart={(e) => startLongPress(e, entry.id)}
                  onTouchEnd={cancelLongPress}
                  onTouchCancel={cancelLongPress}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, entryId: entry.id });
                  }}
                >
                  {entry.content}
                </div>

                {/* Activity log */}
                {entry.isNote ? (
                  <ActivityLog label={`Note saved · ${formatTime(entry.createdAt)}`} />
                ) : entry.projectTitle ? (
                  <ActivityLog label={`${entry.projectTitle} · ${formatTime(entry.createdAt)}`} />
                ) : null}
              </div>
            ))}

            {pending.map((entry) => (
              <div key={entry.tempId} className="space-y-1">
                <div
                  ref={(el) => {
                    if (el) messageRefs.current.set(entry.tempId, el);
                    else messageRefs.current.delete(entry.tempId);
                  }}
                  className="max-w-[85%] bg-card border border-border/40 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-foreground/90 leading-relaxed opacity-60"
                >
                  {entry.content}
                </div>

                {entry.resolved ? (
                  entry.resolved.isNote ? (
                    <ActivityLog label={`Note saved · ${formatTime(entry.timestamp)}`} />
                  ) : entry.resolved.projectTitle ? (
                    <ActivityLog
                      label={
                        entry.resolved.isNew
                          ? `Project Created: ${entry.resolved.projectTitle} · ${formatTime(entry.timestamp)}`
                          : `Project Updated: ${entry.resolved.projectTitle} · ${formatTime(entry.timestamp)}`
                      }
                    />
                  ) : null
                ) : entry.failed ? (
                  <ActivityLog label="Failed to save" />
                ) : (
                  <div className="flex items-center gap-2 my-2 px-1">
                    <span className="text-muted-foreground/20 text-[10px] tracking-widest">───</span>
                    <div className="h-2 w-24 bg-border/20 rounded-full animate-pulse" />
                    <span className="text-muted-foreground/20 text-[10px] tracking-widest">───</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div ref={feedBottomRef} />
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border/60 rounded-xl shadow-xl py-1 min-w-[140px] animate-in fade-in zoom-in-95 duration-150"
          style={{ left: contextMenu.x, top: contextMenu.y, transform: "translateY(-100%)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-4 py-2.5 text-sm text-foreground/80 hover:bg-muted hover:text-foreground transition-colors"
            onClick={() => handleShowSource(contextMenu.entryId)}
          >
            Show source
          </button>
        </div>
      )}

      {/* Mic error toast */}
      {micError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-destructive/90 text-destructive-foreground text-xs px-3 py-2 rounded-full shadow-lg animate-in fade-in duration-200">
          {micError}
        </div>
      )}

      {/* Input bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-8 pb-4 px-4">
        <div className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 focus-within:border-border/60 transition-colors">
          <button
            className={`shrink-0 transition-colors ${
              isListening
                ? "text-primary animate-pulse"
                : "text-muted-foreground/30 hover:text-muted-foreground"
            }`}
            onClick={toggleMic}
            title={isListening ? "Stop listening" : "Speak"}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? "Listening…" : "Drop anything…"}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/30 outline-none"
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || submitting}
            className="shrink-0 text-muted-foreground/40 hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes highlight-pulse {
          0%   { box-shadow: 0 0 0 0 hsl(var(--primary) / 0.5); }
          50%  { box-shadow: 0 0 0 6px hsl(var(--primary) / 0.15); }
          100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0); }
        }
        .highlight-pulse {
          animation: highlight-pulse 1.2s ease-out;
        }
      `}</style>
    </div>
  );
}
