import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Send, Mic, MicOff, Loader2, Pencil, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import { AppHeader } from "@/components/app-header";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoricalEntry {
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
    isNote: boolean;
  };
  failed?: boolean;
}

interface ContextMenu {
  x: number;
  y: number;
  entryId: number;
}

interface EditState {
  id: number;
  content: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

async function patchUpdate(id: number, content: string) {
  const res = await fetch(`${BASE}/api/updates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Failed to edit");
  return res.json();
}

async function deleteUpdate(id: number) {
  const res = await fetch(`${BASE}/api/updates/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
}

function formatTime(date: Date | string) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Activity Log Component ───────────────────────────────────────────────────
// Desktop: floats in left margin aligned to bubble
// Mobile: inline below bubble, smaller + lighter

interface ActivityLogProps {
  isNote: boolean;
  isNew?: boolean;
  projectTitle: string | null;
  projectId: number | null;
  time: string;
  failed?: boolean;
  pending?: boolean;
}

function ActivityLog({ isNote, isNew, projectTitle, projectId, time, failed, pending }: ActivityLogProps) {
  const [, setLocation] = useLocation();

  const handleClick = () => {
    if (projectId) setLocation(`/projects/${projectId}`);
  };

  if (pending) {
    return (
      <>
        {/* Desktop: left margin */}
        <div className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 items-center pr-3 pointer-events-none"
          style={{ right: "calc(100% - 0px)", whiteSpace: "nowrap" }}>
          <div className="h-2 w-20 bg-border/15 rounded-full animate-pulse" />
        </div>
        {/* Mobile: inline */}
        <div className="md:hidden flex justify-end mt-0.5">
          <div className="h-1.5 w-16 bg-border/15 rounded-full animate-pulse" />
        </div>
      </>
    );
  }

  if (failed) {
    return (
      <>
        <div className="hidden md:block absolute text-[10px] text-destructive/40 font-mono"
          style={{ right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)", whiteSpace: "nowrap" }}>
          Failed to save
        </div>
        <div className="md:hidden flex justify-end mt-0.5">
          <span className="text-[9px] text-destructive/40 font-mono">Failed to save</span>
        </div>
      </>
    );
  }

  let label: React.ReactNode;
  const isClickable = !!projectId;

  if (isNote) {
    label = <span className="text-muted-foreground/30">Note saved · {time}</span>;
  } else if (projectTitle) {
    const prefix = isNew ? "New project: " : "Logged to: ";
    label = (
      <span className={isClickable ? "text-muted-foreground/40 cursor-pointer hover:text-muted-foreground/60 transition-colors" : "text-muted-foreground/30"} onClick={isClickable ? handleClick : undefined}>
        {prefix}<strong className="font-semibold">{projectTitle}</strong> · {time}
      </span>
    );
  } else {
    return null;
  }

  return (
    <>
      {/* Desktop: absolutely positioned in left margin */}
      <div className="hidden md:block absolute text-[10px] font-mono select-none"
        style={{ right: "calc(100% + 12px)", top: "50%", transform: "translateY(-50%)", whiteSpace: "nowrap" }}>
        {label}
      </div>
      {/* Mobile: inline below bubble */}
      <div className="md:hidden flex justify-end mt-0.5 pr-0.5">
        <span className="text-[9px] font-mono text-muted-foreground/30 select-none">
          {isNote ? `Note · ${time}` : projectTitle ? (
            <span className={isClickable ? "cursor-pointer" : ""} onClick={isClickable ? handleClick : undefined}>
              {isNew ? "New: " : ""}<strong>{projectTitle}</strong> · {time}
            </span>
          ) : null}
        </span>
      </div>
    </>
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
  const [editState, setEditState] = useState<EditState | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const feedBottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

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
    const handler = () => { if (contextMenu) setContextMenu(null); };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [contextMenu]);

  useEffect(() => {
    if (editState && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.setSelectionRange(editState.content.length, editState.content.length);
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
      const result = await postBrainDump(content);
      const newEntry: HistoricalEntry = {
        id: result.update.id,
        content: result.update.content,
        createdAt: result.update.createdAt,
        projectId: result.project?.id ?? null,
        projectTitle: result.project?.title ?? null,
        isNote: result.isNote ?? false,
        isNew: result.isNew,
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
      // Invalidate projects list so sidebar recents update
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
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
    if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
  };

  // ── Edit / Delete ─────────────────────────────────────────────────────────

  const handleEdit = (entry: HistoricalEntry) => {
    setContextMenu(null);
    setEditState({ id: entry.id, content: entry.content });
  };

  const handleEditSave = async () => {
    if (!editState) return;
    try {
      await patchUpdate(editState.id, editState.content.trim());
      setHistory((prev) =>
        prev.map((e) => (e.id === editState.id ? { ...e, content: editState.content.trim() } : e))
      );
    } catch { /* silent */ }
    setEditState(null);
  };

  const handleDelete = async (id: number) => {
    setContextMenu(null);
    try {
      await deleteUpdate(id);
      setHistory((prev) => prev.filter((e) => e.id !== id));
    } catch { /* silent */ }
  };

  // ── Mic ───────────────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const SR =
      (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

    if (!SR) { setMicError("Speech recognition not supported."); setTimeout(() => setMicError(null), 3000); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onstart = () => { setIsListening(true); setMicError(null); };
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let t = "";
      for (let i = event.resultIndex; i < event.results.length; i++) t += event.results[i][0].transcript;
      setInput(t);
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") setMicError("Microphone access denied.");
      else if (event.error !== "aborted") setMicError("Mic error — please try again.");
      setIsListening(false);
      setTimeout(() => setMicError(null), 3000);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening]);

  // ── Context menu ──────────────────────────────────────────────────────────

  const openContextMenu = (x: number, y: number, id: number) => setContextMenu({ x, y, entryId: id });

  const startLongPress = (e: React.TouchEvent | React.MouseEvent, id: number) => {
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    longPressTimer.current = setTimeout(() => openContextMenu(clientX, clientY, id), 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const isEmpty = !loading && history.length === 0 && pending.length === 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background" onClick={() => setContextMenu(null)}>
      <AppHeader title="Brain Dump" />

      <div className="flex-1 overflow-y-auto pb-32 pt-3">
        {loading ? (
          <div className="flex items-center justify-center pt-20">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/30" />
          </div>
        ) : isEmpty ? (
          <div className="flex items-center justify-center h-full pb-24">
            <p className="text-muted-foreground/25 text-sm font-serif italic">Drop anything…</p>
          </div>
        ) : (
          /* Message column: on desktop cap width and centre, leaving left margin for logs */
          <div className="mx-auto w-full max-w-2xl">
            <div className="space-y-0.5 px-4 md:pl-48 md:pr-6">
              {history.map((entry) => (
                <div key={entry.id} className="relative">
                  {/* Bubble */}
                  <div className="flex justify-end">
                    {editState?.id === entry.id ? (
                      <div className="max-w-[80%] w-full bg-card border border-primary/30 rounded-xl rounded-br-sm px-3 py-2">
                        <textarea
                          ref={editInputRef}
                          value={editState.content}
                          onChange={(e) => setEditState({ ...editState, content: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSave(); }
                            if (e.key === "Escape") setEditState(null);
                          }}
                          rows={2}
                          className="w-full bg-transparent text-xs text-foreground/90 leading-relaxed outline-none resize-none"
                        />
                        <div className="flex justify-end gap-2 mt-1.5">
                          <button onClick={() => setEditState(null)} className="text-xs text-muted-foreground/50 hover:text-muted-foreground">Cancel</button>
                          <button onClick={handleEditSave} className="text-xs text-primary hover:opacity-80">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        ref={(el) => { if (el) messageRefs.current.set(entry.id, el); else messageRefs.current.delete(entry.id); }}
                        className="max-w-[80%] bg-primary/10 border border-primary/15 rounded-xl rounded-br-sm px-3 py-1.5 text-xs text-foreground/85 leading-relaxed select-none transition-colors"
                        onMouseDown={(e) => { if (e.button === 0) startLongPress(e, entry.id); }}
                        onMouseUp={cancelLongPress}
                        onMouseLeave={cancelLongPress}
                        onTouchStart={(e) => startLongPress(e, entry.id)}
                        onTouchEnd={cancelLongPress}
                        onTouchCancel={cancelLongPress}
                        onContextMenu={(e) => { e.preventDefault(); openContextMenu(e.clientX, e.clientY, entry.id); }}
                      >
                        {entry.content}
                      </div>
                    )}
                  </div>

                  {/* Activity log */}
                  <ActivityLog
                    isNote={entry.isNote}
                    isNew={entry.isNew}
                    projectTitle={entry.projectTitle}
                    projectId={entry.projectId}
                    time={formatTime(entry.createdAt)}
                  />
                </div>
              ))}

              {pending.map((entry) => (
                <div key={entry.tempId} className="relative">
                  <div className="flex justify-end">
                    <div className="max-w-[80%] bg-primary/10 border border-primary/15 rounded-xl rounded-br-sm px-3 py-1.5 text-xs text-foreground/85 leading-relaxed opacity-40">
                      {entry.content}
                    </div>
                  </div>
                  {entry.resolved ? (
                    <ActivityLog
                      isNote={entry.resolved.isNote}
                      isNew={entry.resolved.isNew}
                      projectTitle={entry.resolved.projectTitle}
                      projectId={entry.resolved.projectId}
                      time={formatTime(entry.timestamp)}
                    />
                  ) : entry.failed ? (
                    <ActivityLog isNote={false} projectTitle={null} projectId={null} time="" failed />
                  ) : (
                    <ActivityLog isNote={false} projectTitle={null} projectId={null} time="" pending />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        <div ref={feedBottomRef} />
      </div>

      {/* Context menu */}
      {contextMenu && (() => {
        const entry = history.find((e) => e.id === contextMenu.entryId);
        return (
          <div
            className="fixed z-50 bg-card border border-border/60 rounded-xl shadow-xl py-1 min-w-[140px] animate-in fade-in zoom-in-95 duration-150"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 160),
              top: Math.min(contextMenu.y, window.innerHeight - 100),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-4 py-2.5 text-sm text-foreground/80 hover:bg-muted hover:text-foreground transition-colors flex items-center gap-2"
              onClick={() => entry && handleEdit(entry)}
            >
              <Pencil className="w-3 h-3 opacity-50" /> Edit
            </button>
            <button
              className="w-full text-left px-4 py-2.5 text-sm text-destructive/80 hover:bg-muted hover:text-destructive transition-colors flex items-center gap-2"
              onClick={() => handleDelete(contextMenu.entryId)}
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
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 focus-within:border-border/60 transition-colors">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? "Listening…" : "Drop anything…"}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/25 outline-none"
              autoFocus
            />
            <button
              className={`shrink-0 transition-colors ${isListening ? "text-primary animate-pulse" : "text-muted-foreground/25 hover:text-muted-foreground"}`}
              onClick={toggleMic}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || submitting}
              className="shrink-0 text-muted-foreground/30 hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}