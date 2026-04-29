import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type RefObject,
} from "react";
import { useLocation } from "wouter";
import { Send, Mic, MicOff, Loader2, Pencil, Trash2, ChevronDown, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import { AppHeader } from "@/components/app-header";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: number;
  content: string;
  createdAt: string;
  projectId: number | null;
  projectTitle: string | null;
  threadType: string | null;
  clarificationStatus: string | null;
  clarificationQuestion: string | null;
  clarificationAnswer: string | null;
}

interface PendingEntry {
  tempId: string;
  content: string;
  timestamp: Date;
  resolved?: {
    projectId: number | null;
    projectTitle: string | null;
    isNew: boolean;
    isAmbiguous: boolean;
    clarificationQuestion: string | null;
  };
  failed?: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchAllEntries(): Promise<LogEntry[]> {
  const res = await fetch(`${BASE}/api/updates`);
  if (!res.ok) return [];
  return res.json();
}

async function postEntry(content: string) {
  const res = await fetch(`${BASE}/api/brain-dump`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Failed");
  return res.json() as Promise<{
    update: LogEntry;
    project: { id: number; title: string } | null;
    isNew: boolean;
    isAmbiguous: boolean;
    clarificationQuestion: string | null;
  }>;
}

async function patchEntry(id: number, content: string) {
  const res = await fetch(`${BASE}/api/updates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function deleteEntry(id: number) {
  await fetch(`${BASE}/api/updates/${id}`, { method: "DELETE" });
}

async function clarifyEntry(id: number, action: "answer" | "dismiss", answer?: string) {
  const res = await fetch(`${BASE}/api/updates/${id}/clarify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, answer }),
  });
  if (!res.ok) throw new Error("Failed");
  return res.json() as Promise<LogEntry>;
}

function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getDateLabel(date: Date | string) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

function groupByDate(entries: LogEntry[]) {
  const groups: { date: string; entries: LogEntry[] }[] = [];
  for (const entry of entries) {
    const label = getDateLabel(entry.createdAt);
    if (!groups.length || groups[groups.length - 1].date !== label) {
      groups.push({ date: label, entries: [entry] });
    } else {
      groups[groups.length - 1].entries.push(entry);
    }
  }
  return groups;
}

// ─── Clarification card ────────────────────────────────────────────────────────

interface ClarificationCardProps {
  entry: LogEntry;
  onAnswer: (answer: string) => void;
  onDismiss: () => void;
  cardRef?: RefObject<HTMLDivElement | null>;
}

function ClarificationCard({ entry, onAnswer, onDismiss, cardRef }: ClarificationCardProps) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");

  return (
    <div
      ref={cardRef}
      className="mx-4 mb-1 mt-0.5 rounded-xl border border-border/40 bg-card px-4 py-3 text-sm"
      data-clarification-id={entry.id}
    >
      <p className="text-foreground/60 leading-snug mb-2.5">{entry.clarificationQuestion}</p>
      {typing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim()) onAnswer(text.trim());
              if (e.key === "Escape") setTyping(false);
            }}
            placeholder="Type your answer…"
            className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground/30"
          />
          <button
            onClick={() => text.trim() && onAnswer(text.trim())}
            className="text-xs text-foreground/40 hover:text-foreground transition-colors"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAnswer("Yes")}
            className="text-xs border border-border/50 rounded-full px-3 py-1 hover:bg-muted transition-colors"
          >
            Yes
          </button>
          <button
            onClick={() => onAnswer("No")}
            className="text-xs border border-border/50 rounded-full px-3 py-1 hover:bg-muted transition-colors"
          >
            No
          </button>
          <button
            onClick={() => setTyping(true)}
            className="text-xs border border-border/50 rounded-full px-3 py-1 hover:bg-muted transition-colors"
          >
            Type something…
          </button>
          <button
            onClick={onDismiss}
            className="ml-auto text-muted-foreground/25 hover:text-muted-foreground transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Banner ────────────────────────────────────────────────────────────────────

interface BannerProps {
  absorbed: LogEntry[];
  onAnswer: (entry: LogEntry, answer: string) => void;
  onDismiss: (entry: LogEntry) => void;
}

function ClarificationBanner({ absorbed, onAnswer, onDismiss }: BannerProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<LogEntry | null>(null);

  if (absorbed.length === 0) return null;

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/30">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
      >
        <span>{absorbed.length} note{absorbed.length > 1 ? "s" : ""} need context</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2 border-t border-border/20 pt-2">
          {absorbed.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setActive(entry)}
              className="w-full text-left text-xs text-foreground/50 hover:text-foreground/80 py-1.5 border-b border-border/10 last:border-0 transition-colors truncate"
            >
              "{entry.content.slice(0, 60)}{entry.content.length > 60 ? "…" : ""}"
            </button>
          ))}
        </div>
      )}

      {/* Modal for answering from banner */}
      {active && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-background/60 backdrop-blur-sm"
          onClick={() => setActive(null)}
        >
          <div
            className="w-full max-w-lg mb-8 mx-4 rounded-2xl border border-border/50 bg-card p-5 shadow-2xl animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-muted-foreground/40 mb-1 truncate">
              "{active.content.slice(0, 80)}"
            </p>
            <p className="text-sm text-foreground/70 mb-4 leading-snug">
              {active.clarificationQuestion}
            </p>
            <ClarificationCard
              entry={active}
              onAnswer={(ans) => { onAnswer(active, ans); setActive(null); }}
              onDismiss={() => { onDismiss(active); setActive(null); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function BrainDump() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editState, setEditState] = useState<{ id: number; content: string } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entryId: number } | null>(null);

  // Clarification tracking
  // Cards that have scrolled above the viewport are "absorbed" into the banner
  const [absorbedIds, setAbsorbedIds] = useState<Set<number>>(new Set());
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const feedBottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchAllEntries().then((data) => { setEntries(data); setLoading(false); });
  }, []);

  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, pending.length]);

  useEffect(() => {
    const h = () => setCtxMenu(null);
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  // ── IntersectionObserver for clarification cards ────────────────────────────
  useEffect(() => {
    // Clean up previous observer
    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (observations) => {
        setAbsorbedIds((prev) => {
          const next = new Set(prev);
          for (const obs of observations) {
            const id = Number((obs.target as HTMLElement).dataset.clarificationId);
            if (!id) continue;
            if (!obs.isIntersecting && obs.boundingClientRect.top < 0) {
              // Card scrolled above viewport — absorb into banner
              next.add(id);
            } else if (obs.isIntersecting) {
              // Card back in view — remove from banner
              next.delete(id);
            }
          }
          return next;
        });
      },
      { threshold: 0, rootMargin: "0px 0px 0px 0px" }
    );

    // Observe all pending clarification cards
    const pendingEntries = entries.filter(
      (e) => e.clarificationStatus === "pending"
    );
    for (const e of pendingEntries) {
      const el = cardRefs.current.get(e.id);
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, [entries]);

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const content = input.trim();
    if (!content || submitting) return;
    const tempId = `temp-${Date.now()}`;
    setPending((prev) => [...prev, { tempId, content, timestamp: new Date() }]);
    setInput("");
    setSubmitting(true);
    try {
      const result = await postEntry(content);
      const newEntry: LogEntry = {
        ...result.update,
        projectId: result.project?.id ?? null,
        projectTitle: result.project?.title ?? null,
        threadType: null,
        clarificationStatus: result.isAmbiguous ? "pending" : null,
        clarificationQuestion: result.clarificationQuestion,
        clarificationAnswer: null,
      };
      setEntries((prev) => [...prev, newEntry]);
      setPending((prev) =>
        prev.map((e) =>
          e.tempId === tempId
            ? { ...e, resolved: { projectId: result.project?.id ?? null, projectTitle: result.project?.title ?? null, isNew: result.isNew, isAmbiguous: result.isAmbiguous, clarificationQuestion: result.clarificationQuestion } }
            : e
        )
      );
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      setTimeout(() => setPending((prev) => prev.filter((e) => e.tempId !== tempId)), 1800);
    } catch {
      setPending((prev) => prev.map((e) => e.tempId === tempId ? { ...e, failed: true } : e));
      setTimeout(() => setPending((prev) => prev.filter((e) => e.tempId !== tempId)), 2500);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Clarification handlers ──────────────────────────────────────────────────

  const handleClarifyAnswer = async (entry: LogEntry, answer: string) => {
    try {
      const updated = await clarifyEntry(entry.id, "answer", answer);
      setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, ...updated } : e));
      setAbsorbedIds((prev) => { const next = new Set(prev); next.delete(entry.id); return next; });
    } catch { /* silent */ }
  };

  const handleClarifyDismiss = async (entry: LogEntry) => {
    try {
      const updated = await clarifyEntry(entry.id, "dismiss");
      setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, ...updated } : e));
      setAbsorbedIds((prev) => { const next = new Set(prev); next.delete(entry.id); return next; });
    } catch { /* silent */ }
  };

  // ── Edit / Delete ───────────────────────────────────────────────────────────

  const handleEditSave = async () => {
    if (!editState) return;
    try {
      await patchEntry(editState.id, editState.content.trim());
      setEntries((prev) =>
        prev.map((e) => e.id === editState.id ? { ...e, content: editState.content.trim() } : e)
      );
    } catch { /* silent */ }
    setEditState(null);
  };

  const handleDelete = async (id: number) => {
    setCtxMenu(null);
    try {
      await deleteEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch { /* silent */ }
  };

  // ── Mic ─────────────────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setMicError("Not supported."); setTimeout(() => setMicError(null), 2500); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onstart = () => { setIsListening(true); setMicError(null); };
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      setInput(t);
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "not-allowed") setMicError("Mic denied.");
      else if (e.error !== "aborted") setMicError("Mic error.");
      setIsListening(false);
      setTimeout(() => setMicError(null), 2500);
    };
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
  }, [isListening]);

  // ── Long press ──────────────────────────────────────────────────────────────

  const startLongPress = (e: React.TouchEvent | React.MouseEvent, id: number) => {
    const x = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const y = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    longPressTimer.current = setTimeout(() => setCtxMenu({ x, y, entryId: id }), 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const pendingClarifications = entries.filter(
    (e) => e.clarificationStatus === "pending" && absorbedIds.has(e.id)
  );

  const dateGroups = groupByDate(entries);
  const isEmpty = !loading && entries.length === 0 && pending.length === 0;
  const todayLabel = getDateLabel(new Date());
  const lastEntryDate = entries.length > 0 ? getDateLabel(entries[entries.length - 1].createdAt) : null;
  const showTodaySepForPending = pending.length > 0 && lastEntryDate !== todayLabel;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background" onClick={() => setCtxMenu(null)}>
      <AppHeader title="Log" />

      <ClarificationBanner
        absorbed={pendingClarifications}
        onAnswer={handleClarifyAnswer}
        onDismiss={handleClarifyDismiss}
      />

      <div className="flex-1 overflow-y-auto pb-28 pt-1">
        {loading ? (
          <div className="flex justify-center pt-20">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/20" />
          </div>
        ) : isEmpty ? (
          <div className="flex items-center justify-center h-full pb-24">
            <p className="text-muted-foreground/25 text-sm font-mono">drop anything ↓</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            {dateGroups.map((group) => (
              <div key={group.date}>
                {/* Date separator — tertiary */}
                <div className="flex items-center gap-3 px-4 py-4 select-none">
                  <div className="flex-1 border-t border-border/15" />
                  <span className="text-[10px] font-mono text-muted-foreground/20 uppercase tracking-widest shrink-0">
                    {group.date}
                  </span>
                  <div className="flex-1 border-t border-border/15" />
                </div>

                {group.entries.map((entry) => (
                  <div key={entry.id}>
                    {/* Entry row */}
                    <div
                      className="group flex gap-3 px-4 py-2 hover:bg-muted/8 rounded transition-colors"
                      onMouseDown={(e) => { if (e.button === 0) startLongPress(e, entry.id); }}
                      onMouseUp={cancelLongPress}
                      onMouseLeave={cancelLongPress}
                      onTouchStart={(e) => startLongPress(e, entry.id)}
                      onTouchEnd={cancelLongPress}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setCtxMenu({ x: e.clientX, y: e.clientY, entryId: entry.id });
                      }}
                    >
                      {/* Timestamp — tertiary */}
                      <span className="text-[11px] font-mono text-muted-foreground/20 shrink-0 w-14 pt-0.5 tabular-nums select-none">
                        {formatTime(entry.createdAt)}
                      </span>

                      {/* Content — primary */}
                      {editState?.id === entry.id ? (
                        <div className="flex-1">
                          <textarea
                            autoFocus
                            value={editState.content}
                            onChange={(e) => setEditState({ ...editState, content: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSave(); }
                              if (e.key === "Escape") setEditState(null);
                            }}
                            rows={2}
                            className="w-full bg-transparent text-sm text-foreground/85 leading-relaxed outline-none resize-none border-b border-border/30 pb-1"
                          />
                          <div className="flex gap-3 mt-1.5">
                            <button onClick={() => setEditState(null)} className="text-xs text-muted-foreground/30 hover:text-muted-foreground">Cancel</button>
                            <button onClick={handleEditSave} className="text-xs text-foreground/40 hover:text-foreground">Save</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          {/* The note text — primary */}
                          <p className="text-sm text-foreground/85 leading-relaxed break-words">
                            {entry.content}
                          </p>
                          {/* Thread tag — tertiary */}
                          {entry.projectTitle && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (entry.projectId) setLocation(`/projects/${entry.projectId}`);
                              }}
                              className="text-[11px] font-mono text-muted-foreground/20 hover:text-muted-foreground/45 transition-colors mt-0.5 block leading-none"
                            >
                              ↳ {entry.projectTitle}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Hover actions */}
                      {editState?.id !== entry.id && (
                        <div className="opacity-0 group-hover:opacity-100 flex items-start gap-0.5 shrink-0 pt-0.5 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditState({ id: entry.id, content: entry.content });
                            }}
                            className="p-1.5 text-muted-foreground/20 hover:text-muted-foreground/50 rounded transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                            className="p-1.5 text-muted-foreground/20 hover:text-destructive/50 rounded transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Clarification card — inline, viewport-tracked */}
                    {entry.clarificationStatus === "pending" && !absorbedIds.has(entry.id) && (
                      <ClarificationCard
                        entry={entry}
                        cardRef={{ current: null } as any}
                        onAnswer={(ans) => handleClarifyAnswer(entry, ans)}
                        onDismiss={() => handleClarifyDismiss(entry)}
                      />
                    )}
                    {/* Sentinel for IntersectionObserver when absorbed */}
                    {entry.clarificationStatus === "pending" && absorbedIds.has(entry.id) && (
                      <div
                        ref={(el) => {
                          if (el) cardRefs.current.set(entry.id, el);
                          else cardRefs.current.delete(entry.id);
                        }}
                        data-clarification-id={entry.id}
                        className="h-0 w-full"
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}

            {showTodaySepForPending && (
              <div className="flex items-center gap-3 px-4 py-4 select-none">
                <div className="flex-1 border-t border-border/15" />
                <span className="text-[10px] font-mono text-muted-foreground/20 uppercase tracking-widest shrink-0">{todayLabel}</span>
                <div className="flex-1 border-t border-border/15" />
              </div>
            )}

            {/* Pending optimistic entries */}
            {pending.map((p) => (
              <div key={p.tempId} className="flex gap-3 px-4 py-2 opacity-40">
                <span className="text-[11px] font-mono text-muted-foreground/20 shrink-0 w-14 pt-0.5 tabular-nums select-none">
                  {formatTime(p.timestamp)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground/80 leading-relaxed break-words">{p.content}</p>
                  {p.failed ? (
                    <span className="text-[11px] font-mono text-destructive/40 mt-0.5 block">failed</span>
                  ) : p.resolved ? (
                    p.resolved.projectTitle && (
                      <span className="text-[11px] font-mono text-muted-foreground/20 mt-0.5 block">
                        ↳ {p.resolved.isNew && <span className="opacity-60">new · </span>}{p.resolved.projectTitle}
                      </span>
                    )
                  ) : (
                    <div className="h-1.5 w-16 bg-muted/20 rounded-full animate-pulse mt-1.5" />
                  )}
                </div>
              </div>
            ))}
            <div ref={feedBottomRef} />
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (() => {
        const entry = entries.find((e) => e.id === ctxMenu.entryId);
        return (
          <div
            className="fixed z-50 bg-card border border-border/50 rounded-xl shadow-xl py-1 min-w-[130px] animate-in fade-in zoom-in-95 duration-100"
            style={{ left: Math.min(ctxMenu.x, window.innerWidth - 150), top: Math.min(ctxMenu.y, window.innerHeight - 90) }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2.5 text-sm text-foreground/70 hover:bg-muted flex items-center gap-2 transition-colors"
              onClick={() => { setCtxMenu(null); if (entry) setEditState({ id: entry.id, content: entry.content }); }}
            >
              <Pencil className="w-3 h-3 opacity-50" /> Edit
            </button>
            <button
              className="w-full text-left px-3 py-2.5 text-sm text-destructive/70 hover:bg-muted flex items-center gap-2 transition-colors"
              onClick={() => handleDelete(ctxMenu.entryId)}
            >
              <Trash2 className="w-3 h-3 opacity-50" /> Delete
            </button>
          </div>
        );
      })()}

      {micError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-destructive/90 text-destructive-foreground text-xs px-3 py-2 rounded-full shadow-lg animate-in fade-in">
          {micError}
        </div>
      )}

      {/* Input bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-8 pb-4 px-4">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-2 bg-card border border-border/40 rounded-xl px-3 py-2.5 focus-within:border-border/70 transition-colors">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
              placeholder={isListening ? "Listening…" : "Drop anything…"}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/25 outline-none"
              autoFocus
            />
            <button
              onClick={toggleMic}
              className={`shrink-0 transition-colors ${isListening ? "text-foreground animate-pulse" : "text-muted-foreground/25 hover:text-muted-foreground"}`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || submitting}
              className="shrink-0 text-muted-foreground/25 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
