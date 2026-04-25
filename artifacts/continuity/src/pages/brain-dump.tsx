import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Send, Mic, MicOff, Loader2, Pencil, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import { AppHeader } from "@/components/app-header";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: number;
  content: string;
  createdAt: string;
  projectId: number | null;
  projectTitle: string | null;
  isNote: boolean;
  isNew?: boolean;
}

interface PendingEntry {
  tempId: string;
  content: string;
  timestamp: Date;
  resolved?: {
    projectId: number | null;
    projectTitle: string | null;
    isNew: boolean;
  };
  failed?: boolean;
}

interface EditState {
  id: number;
  content: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  if (!res.ok) throw new Error("Failed to submit");
  return res.json() as Promise<{
    update: { id: number; content: string; createdAt: string };
    project: { id: number; title: string } | null;
    isNew: boolean;
    isNote: boolean;
  }>;
}

async function patchEntry(id: number, content: string) {
  const res = await fetch(`${BASE}/api/updates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Failed to edit");
  return res.json();
}

async function deleteEntry(id: number) {
  const res = await fetch(`${BASE}/api/updates/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
}

function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getDateLabel(date: Date | string): string {
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

function groupByDate(entries: LogEntry[]): { date: string; entries: LogEntry[] }[] {
  const groups: { date: string; entries: LogEntry[] }[] = [];
  for (const entry of entries) {
    const label = getDateLabel(entry.createdAt);
    if (groups.length === 0 || groups[groups.length - 1].date !== label) {
      groups.push({ date: label, entries: [entry] });
    } else {
      groups[groups.length - 1].entries.push(entry);
    }
  }
  return groups;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4 select-none">
      <div className="flex-1 border-t border-border/15" />
      <span className="text-[10px] font-mono text-muted-foreground/25 uppercase tracking-widest shrink-0">
        {label}
      </span>
      <div className="flex-1 border-t border-border/15" />
    </div>
  );
}

interface ThreadTagProps {
  projectId: number | null;
  projectTitle: string | null;
  isNew?: boolean;
  onNavigate: (id: number) => void;
}

function ThreadTag({ projectId, projectTitle, isNew, onNavigate }: ThreadTagProps) {
  if (!projectTitle) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (projectId) onNavigate(projectId);
      }}
      className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors mt-1 text-left leading-none"
    >
      <span className="opacity-60">↳</span>
      {isNew && <span className="text-muted-foreground/20">new ·</span>}
      {projectTitle}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BrainDump() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entryId: number } | null>(null);

  const feedBottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  useEffect(() => {
    fetchAllEntries().then((data) => {
      setEntries(data);
      setLoading(false);
    });
  }, []);

  // Scroll to bottom when entries or pending change
  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, pending.length]);

  useEffect(() => {
    const handler = () => setCtxMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  useEffect(() => {
    if (editState && editInputRef.current) {
      editInputRef.current.focus();
      const len = editState.content.length;
      editInputRef.current.setSelectionRange(len, len);
    }
  }, [editState]);

  // ── Submit ────────────────────────────────────────────────────────────────

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
        id: result.update.id,
        content: result.update.content,
        createdAt: result.update.createdAt,
        projectId: result.project?.id ?? null,
        projectTitle: result.project?.title ?? null,
        isNote: false,
        isNew: result.isNew,
      };
      setEntries((prev) => [...prev, newEntry]);
      setPending((prev) =>
        prev.map((e) =>
          e.tempId === tempId
            ? {
                ...e,
                resolved: {
                  projectId: result.project?.id ?? null,
                  projectTitle: result.project?.title ?? null,
                  isNew: result.isNew,
                },
              }
            : e
        )
      );
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      setTimeout(() => {
        setPending((prev) => prev.filter((e) => e.tempId !== tempId));
      }, 1500);
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

  // ── Edit / Delete ─────────────────────────────────────────────────────────

  const handleEditSave = async () => {
    if (!editState) return;
    try {
      await patchEntry(editState.id, editState.content.trim());
      setEntries((prev) =>
        prev.map((e) =>
          e.id === editState.id ? { ...e, content: editState.content.trim() } : e
        )
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

  // ── Mic ───────────────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const SR =
      (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

    if (!SR) {
      setMicError("Speech recognition not supported.");
      setTimeout(() => setMicError(null), 2500);
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onstart = () => { setIsListening(true); setMicError(null); };
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let t = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        t += event.results[i][0].transcript;
      }
      setInput(t);
    };
    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") setMicError("Microphone access denied.");
      else if (event.error !== "aborted") setMicError("Mic error — try again.");
      setIsListening(false);
      setTimeout(() => setMicError(null), 2500);
    };
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
  }, [isListening]);

  // ── Long press / context menu ─────────────────────────────────────────────

  const startLongPress = (e: React.TouchEvent | React.MouseEvent, id: number) => {
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    longPressTimer.current = setTimeout(() => {
      setCtxMenu({ x: clientX, y: clientY, entryId: id });
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const dateGroups = groupByDate(entries);
  const isEmpty = !loading && entries.length === 0 && pending.length === 0;

  // Should we show a "Today" separator before pending entries?
  const todayLabel = getDateLabel(new Date());
  const lastEntryDate = entries.length > 0 ? getDateLabel(entries[entries.length - 1].createdAt) : null;
  const showTodaySeparatorForPending = pending.length > 0 && lastEntryDate !== todayLabel;

  return (
    <div className="flex flex-col h-screen bg-background" onClick={() => setCtxMenu(null)}>
      <AppHeader title="Log" />

      <div className="flex-1 overflow-y-auto pb-28 pt-1">
        {loading ? (
          <div className="flex justify-center pt-20">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/20" />
          </div>
        ) : isEmpty ? (
          <div className="flex items-center justify-center h-full pb-24">
            <p className="text-muted-foreground/20 text-sm font-mono tracking-wide">
              drop anything ↓
            </p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">

            {/* History grouped by date */}
            {dateGroups.map((group) => (
              <div key={group.date}>
                <DateSeparator label={group.date} />
                {group.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="group flex gap-3 px-4 py-2 hover:bg-muted/10 rounded transition-colors"
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
                    {/* Time */}
                    <span className="text-[11px] font-mono text-muted-foreground/25 shrink-0 w-14 pt-0.5 tabular-nums select-none">
                      {formatTime(entry.createdAt)}
                    </span>

                    {/* Content + thread tag */}
                    {editState?.id === entry.id ? (
                      <div className="flex-1">
                        <textarea
                          ref={editInputRef}
                          value={editState.content}
                          onChange={(e) =>
                            setEditState({ ...editState, content: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleEditSave();
                            }
                            if (e.key === "Escape") setEditState(null);
                          }}
                          rows={2}
                          className="w-full bg-transparent text-sm text-foreground/85 leading-relaxed outline-none resize-none border-b border-primary/20 pb-1"
                        />
                        <div className="flex gap-3 mt-1.5">
                          <button
                            onClick={() => setEditState(null)}
                            className="text-xs text-muted-foreground/35 hover:text-muted-foreground"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleEditSave}
                            className="text-xs text-primary/70 hover:text-primary"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground/80 leading-relaxed break-words">
                          {entry.content}
                        </p>
                        <ThreadTag
                          projectId={entry.projectId}
                          projectTitle={entry.projectTitle}
                          isNew={entry.isNew}
                          onNavigate={(id) => setLocation(`/projects/${id}`)}
                        />
                      </div>
                    )}

                    {/* Hover actions (desktop) */}
                    {editState?.id !== entry.id && (
                      <div className="opacity-0 group-hover:opacity-100 flex items-start gap-0.5 shrink-0 pt-0.5 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditState({ id: entry.id, content: entry.content });
                          }}
                          className="p-1.5 text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors rounded"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(entry.id);
                          }}
                          className="p-1.5 text-muted-foreground/20 hover:text-destructive/50 transition-colors rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {/* Separator before pending entries if they're a new day */}
            {showTodaySeparatorForPending && <DateSeparator label={todayLabel} />}

            {/* Pending entries — optimistic, dimmed, thread tag loading */}
            {pending.map((entry) => (
              <div key={entry.tempId} className="flex gap-3 px-4 py-2 opacity-40">
                <span className="text-[11px] font-mono text-muted-foreground/25 shrink-0 w-14 pt-0.5 tabular-nums select-none">
                  {formatTime(entry.timestamp)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground/80 leading-relaxed break-words">
                    {entry.content}
                  </p>
                  {entry.resolved ? (
                    <ThreadTag
                      projectId={entry.resolved.projectId}
                      projectTitle={entry.resolved.projectTitle}
                      isNew={entry.resolved.isNew}
                      onNavigate={(id) => setLocation(`/projects/${id}`)}
                    />
                  ) : entry.failed ? (
                    <span className="text-[11px] font-mono text-destructive/40 mt-1 block">
                      failed to save
                    </span>
                  ) : (
                    <div className="h-2 w-20 bg-muted/20 rounded-full animate-pulse mt-1.5" />
                  )}
                </div>
              </div>
            ))}

            <div ref={feedBottomRef} />
          </div>
        )}
      </div>

      {/* Context menu (mobile long press / desktop right click) */}
      {ctxMenu && (() => {
        const entry = entries.find((e) => e.id === ctxMenu.entryId);
        return (
          <div
            className="fixed z-50 bg-card border border-border/50 rounded-lg shadow-xl py-1 min-w-[130px] animate-in fade-in zoom-in-95 duration-100"
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - 150),
              top: Math.min(ctxMenu.y, window.innerHeight - 90),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2.5 text-sm text-foreground/70 hover:bg-muted transition-colors flex items-center gap-2"
              onClick={() => {
                setCtxMenu(null);
                if (entry) setEditState({ id: entry.id, content: entry.content });
              }}
            >
              <Pencil className="w-3 h-3 opacity-50" /> Edit
            </button>
            <button
              className="w-full text-left px-3 py-2.5 text-sm text-destructive/70 hover:bg-muted transition-colors flex items-center gap-2"
              onClick={() => handleDelete(ctxMenu.entryId)}
            >
              <Trash2 className="w-3 h-3 opacity-50" /> Delete
            </button>
          </div>
        );
      })()}

      {micError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-destructive/90 text-destructive-foreground text-xs px-3 py-2 rounded-full shadow-lg animate-in fade-in duration-200">
          {micError}
        </div>
      )}

      {/* Input bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-8 pb-4 px-4">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-2 bg-card border border-border/40 rounded-xl px-3 py-2.5 focus-within:border-border/60 transition-colors">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
              }}
              placeholder={isListening ? "Listening…" : "Drop anything…"}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/20 outline-none"
              autoFocus
            />
            <button
              className={`shrink-0 transition-colors ${
                isListening
                  ? "text-primary animate-pulse"
                  : "text-muted-foreground/20 hover:text-muted-foreground"
              }`}
              onClick={toggleMic}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || submitting}
              className="shrink-0 text-muted-foreground/20 hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
