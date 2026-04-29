import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetProject,
  getGetProjectQueryKey,
  useListProjectUpdates,
  getListProjectUpdatesQueryKey,
  useUpdateProject,
  useDeleteProject,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  MoreVertical,
  RefreshCw,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Briefing {
  id: number;
  lastKnownState: string;
  confidenceLevel: "high" | "medium" | "low";
  confidenceLabel: string;
  blockers?: string[];
  nextActions?: string[];
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchBriefing(projectId: number): Promise<Briefing> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/briefing`, { method: "POST" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function patchUpdateApi(id: number, content: string) {
  const res = await fetch(`${BASE}/api/updates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function deleteUpdateApi(id: number) {
  await fetch(`${BASE}/api/updates/${id}`, { method: "DELETE" });
}

function timeAgo(date: string | null | undefined): string {
  if (!date) return "";
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / (86400 * 7))}w ago`;
  return `${Math.floor(diff / (86400 * 30))}mo ago`;
}

function formatTs(date: string): string {
  return new Date(date).toLocaleString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const TYPE_LABELS: Record<string, string> = {
  project: "Project", idea: "Idea", admin: "Admin",
  reminder: "Reminder", reference: "Reference",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active", early: "Early", stalled: "Stalled", urgent: "Urgent",
  waiting: "Waiting", reference: "Reference", needs_you: "Needs You", dark: "Archived",
};

// ─── Briefing skeleton ────────────────────────────────────────────────────────

function BriefingSkeleton() {
  return (
    <div className="space-y-4 py-2">
      {[75, 55, 85, 45].map((w, i) => (
        <div key={i} className="h-3 rounded-full bg-muted/20 animate-pulse" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

// ─── Briefing view ────────────────────────────────────────────────────────────

function BriefingView({
  briefing,
  onRegenerate,
  regenerating,
  sourceEntryIds,
  onViewSources,
}: {
  briefing: Briefing;
  onRegenerate: () => void;
  regenerating: boolean;
  sourceEntryIds: number[];
  onViewSources: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium select-none">
          Where you are
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed">{briefing.lastKnownState}</p>
      </div>

      {briefing.blockers && briefing.blockers.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium select-none">
            Blockers
          </p>
          <ul className="space-y-1">
            {briefing.blockers.map((b, i) => (
              <li key={i} className="text-sm text-foreground/70 leading-relaxed flex gap-2">
                <span className="text-muted-foreground/20 shrink-0 select-none mt-0.5">·</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {briefing.nextActions && briefing.nextActions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium select-none">
            Next
          </p>
          <ul className="space-y-1.5">
            {briefing.nextActions.map((a, i) => (
              <li key={i} className="text-sm text-foreground/85 leading-relaxed flex gap-2">
                <span className="text-muted-foreground/30 shrink-0 select-none mt-0.5">›</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-4 pt-1">
        <span className="text-[11px] text-muted-foreground/20 font-mono">
          {timeAgo(briefing.createdAt)}
        </span>
        <button
          onClick={onRegenerate}
          disabled={regenerating}
          className="text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors disabled:opacity-20"
          title="Regenerate"
        >
          <RefreshCw className={`w-3 h-3 ${regenerating ? "animate-spin" : ""}`} />
        </button>
        <button
          onClick={onViewSources}
          className="text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors flex items-center gap-1 text-[11px] font-mono"
          title="View source entries"
        >
          <ExternalLink className="w-3 h-3" />
          view sources
        </button>
      </div>
    </div>
  );
}

// ─── Stalled prompt ───────────────────────────────────────────────────────────

function StalledPrompt({
  onBackBurner,
  onDone,
  onCancel,
}: {
  onBackBurner: () => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border border-border/30 rounded-xl px-4 py-3.5 mb-4">
      <p className="text-sm text-muted-foreground/50 mb-3 leading-snug">
        This thread hasn't had activity in a while.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={onBackBurner}
          className="text-xs border border-border/40 rounded-full px-3 py-1.5 hover:bg-muted transition-colors"
        >
          Back burner
        </button>
        <button
          onClick={onDone}
          className="text-xs border border-border/40 rounded-full px-3 py-1.5 hover:bg-muted transition-colors"
        >
          Mark done
        </button>
        <button
          onClick={onCancel}
          className="text-xs text-muted-foreground/30 hover:text-muted-foreground transition-colors px-1"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ThreadDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const threadId = Number(params.id);
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"timeline" | "docs">("timeline");
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState(false);
  const [briefingRequested, setBriefingRequested] = useState(false);

  const [showStalledPrompt, setShowStalledPrompt] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: number } | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Source highlighting — which entry ids to highlight when viewing sources
  const [highlightedIds, setHighlightedIds] = useState<Set<number>>(new Set());
  const [viewingSources, setViewingSources] = useState(false);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const { data: thread, isLoading: threadLoading } = useGetProject(threadId, {
    query: { enabled: !!threadId, queryKey: getGetProjectQueryKey(threadId) },
  });

  const { data: entries, isLoading: entriesLoading } = useListProjectUpdates(threadId, {
    query: { enabled: !!threadId, queryKey: getListProjectUpdatesQueryKey(threadId) },
  });

  const updateThread = useUpdateProject();
  const deleteThread = useDeleteProject();

  // Detect stalled status
  useEffect(() => {
    if (thread?.status === "stalled") setShowStalledPrompt(true);
  }, [thread?.status]);

  // Title fade on scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const h = () => {
      const title = titleRef.current;
      if (title) setScrolled(title.getBoundingClientRect().bottom < 60);
    };
    el.addEventListener("scroll", h, { passive: true });
    return () => el.removeEventListener("scroll", h);
  }, []);

  useEffect(() => {
    const dismiss = () => { setShowActions(false); setCtxMenu(null); };
    document.addEventListener("click", dismiss);
    return () => document.removeEventListener("click", dismiss);
  }, []);

  // ── Brief ──────────────────────────────────────────────────────────────────

  const generateBrief = useCallback(() => {
    setBriefingLoading(true);
    setBriefingError(false);
    setBriefingRequested(true);
    fetchBriefing(threadId)
      .then((b) => { setBriefing(b); setBriefingLoading(false); })
      .catch(() => { setBriefingError(true); setBriefingLoading(false); });
  }, [threadId]);

  // ── Source highlight ───────────────────────────────────────────────────────

  const handleViewSources = () => {
    if (!entries) return;
    // Highlight the 20 most recent entries (same limit as briefing engine)
    const ids = new Set(
      [...entries].slice(0, 20).map((e) => e.id)
    );
    setHighlightedIds(ids);
    setViewingSources(true);
    setTab("timeline");
  };

  // ── Edit / delete entries ──────────────────────────────────────────────────

  const saveEdit = async () => {
    if (editingId === null) return;
    try {
      await patchUpdateApi(editingId, editContent.trim());
      queryClient.invalidateQueries({ queryKey: getListProjectUpdatesQueryKey(threadId) });
    } catch { /* silent */ }
    setEditingId(null);
  };

  const handleDeleteEntry = async (id: number) => {
    setCtxMenu(null);
    try {
      await deleteUpdateApi(id);
      queryClient.invalidateQueries({ queryKey: getListProjectUpdatesQueryKey(threadId) });
    } catch { /* silent */ }
  };

  const startLongPress = (e: React.TouchEvent | React.MouseEvent, id: number) => {
    const x = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const y = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    longPressTimer.current = setTimeout(() => setCtxMenu({ x, y, id }), 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  // ── Thread status actions ──────────────────────────────────────────────────

  const setStatus = (status: string) => {
    if (!thread) return;
    updateThread.mutate(
      { id: threadId, data: { title: thread.title, description: thread.description ?? "", status } as any },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() }) }
    );
  };

  const handleDeleteThread = () => {
    setShowActions(false);
    if (!confirm(`Delete "${thread?.title}" and all its entries?`)) return;
    deleteThread.mutate(
      { id: threadId },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() }); setLocation("/projects"); } }
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (threadLoading) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <div className="h-14 border-b border-border/40 flex items-center px-4">
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    );
  }

  if (!thread) return null;

  const ascEntries = entries ? [...entries].reverse() : [];
  const isProject = thread.threadType === "project";

  return (
    <div
      className="flex flex-col h-screen bg-background"
      onClick={() => { setShowActions(false); setCtxMenu(null); }}
    >
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background border-b border-border/30 h-14 flex items-center px-4 shrink-0">
        <button
          onClick={() => history.back()}
          className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-sm shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {scrolled && (
          <span className="absolute left-1/2 -translate-x-1/2 text-sm font-medium truncate max-w-[50%] animate-in fade-in duration-200">
            {thread.title}
          </span>
        )}

        <div className="ml-auto relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowActions((v) => !v); }}
            className="text-muted-foreground/40 hover:text-foreground transition-colors p-1"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showActions && (
            <div
              className="absolute right-0 top-8 z-50 bg-card border border-border/50 rounded-xl shadow-xl py-1 min-w-[170px] animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {["active", "stalled", "waiting", "dark"].map((s) => (
                <button
                  key={s}
                  onClick={() => { setStatus(s); setShowActions(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-muted ${thread.status === s ? "text-foreground" : "text-muted-foreground/60"}`}
                >
                  Mark {STATUS_LABELS[s] ?? s}
                </button>
              ))}
              <div className="border-t border-border/30 my-1" />
              <button
                onClick={handleDeleteThread}
                className="w-full text-left px-4 py-2.5 text-sm text-destructive/70 hover:bg-muted hover:text-destructive transition-colors"
              >
                Delete thread
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Scrollable body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-16">

        {/* Thread identity */}
        <div className="pt-5 pb-4">
          <p className="text-xs text-muted-foreground/20 mb-1.5 font-mono">
            {TYPE_LABELS[thread.threadType] ?? thread.threadType}
            {" · "}
            {STATUS_LABELS[thread.status] ?? thread.status}
          </p>
          <h1 ref={titleRef} className="font-serif text-3xl leading-tight text-foreground">
            {thread.title}
          </h1>
          {thread.description && (
            <p className="text-muted-foreground/40 text-sm mt-1.5 leading-relaxed">
              {thread.description}
            </p>
          )}
          <p className="text-muted-foreground/20 text-xs font-mono mt-2">
            {ascEntries.length} {ascEntries.length === 1 ? "entry" : "entries"}
            {thread.lastActivityAt && ` · ${timeAgo(thread.lastActivityAt.toString())}`}
          </p>
        </div>

        {/* Stalled prompt */}
        {showStalledPrompt && (
          <StalledPrompt
            onBackBurner={() => { setStatus("dark"); setShowStalledPrompt(false); }}
            onDone={() => { setStatus("dark"); setShowStalledPrompt(false); }}
            onCancel={() => setShowStalledPrompt(false)}
          />
        )}

        {/* Tab bar — only show if project */}
        {isProject && (
          <div className="flex gap-5 border-b border-border/20 mb-5">
            {(["timeline", "docs"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setViewingSources(false); setHighlightedIds(new Set()); }}
                className={`text-sm pb-2.5 border-b-2 transition-colors capitalize ${
                  tab === t
                    ? "border-foreground/50 text-foreground/80"
                    : "border-transparent text-muted-foreground/35 hover:text-muted-foreground/60"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* ── Timeline tab ───────────────────────────────────────────────── */}
        {(!isProject || tab === "timeline") && (
          <div>
            {viewingSources && (
              <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground/40">
                <span>Showing sources used for briefing</span>
                <button
                  onClick={() => { setViewingSources(false); setHighlightedIds(new Set()); }}
                  className="hover:text-muted-foreground transition-colors"
                >
                  Clear
                </button>
              </div>
            )}

            {entriesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-3 rounded-full w-full" />)}
              </div>
            ) : ascEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground/25 font-serif italic">No entries yet.</p>
            ) : (
              <div className="space-y-0">
                {ascEntries.map((entry) => {
                  const isHighlighted = highlightedIds.has(entry.id);
                  return (
                    <div
                      key={entry.id}
                      className={`group flex gap-3 py-2.5 rounded transition-colors ${
                        isHighlighted ? "bg-muted/15" : "hover:bg-muted/8"
                      }`}
                      onMouseDown={(e) => { if (e.button === 0) startLongPress(e, entry.id); }}
                      onMouseUp={cancelLongPress}
                      onMouseLeave={cancelLongPress}
                      onTouchStart={(e) => startLongPress(e, entry.id)}
                      onTouchEnd={cancelLongPress}
                      onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, id: entry.id }); }}
                    >
                      {/* Timestamp */}
                      <span className="text-[11px] font-mono text-muted-foreground/20 shrink-0 w-28 pt-0.5 tabular-nums select-none">
                        {formatTs(entry.createdAt)}
                      </span>

                      {editingId === entry.id ? (
                        <div className="flex-1">
                          <textarea
                            autoFocus
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            rows={2}
                            className="w-full bg-transparent text-sm text-foreground/80 leading-relaxed outline-none resize-none border-b border-border/30 pb-1"
                          />
                          <div className="flex gap-3 mt-1.5">
                            <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground/25 hover:text-muted-foreground">Cancel</button>
                            <button onClick={saveEdit} className="text-xs text-foreground/40 hover:text-foreground">Save</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                          <p className="text-sm text-foreground/75 leading-relaxed break-words">{entry.content}</p>
                          <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 shrink-0 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingId(entry.id); setEditContent(entry.content); }}
                              className="p-1 text-muted-foreground/20 hover:text-muted-foreground/50 rounded transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry.id); }}
                              className="p-1 text-muted-foreground/20 hover:text-destructive/50 rounded transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Docs tab (project threads only) ───────────────────────────── */}
        {isProject && tab === "docs" && (
          <div>
            {!briefingRequested ? (
              <button
                onClick={generateBrief}
                className="w-full border border-border/25 hover:border-border/50 rounded-xl py-5 px-4 text-left transition-colors group mb-4"
              >
                <p className="text-sm text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors font-serif italic">
                  Generate reentry brief
                </p>
                <p className="text-xs text-muted-foreground/20 mt-1">
                  Summarises where you left off and what to do next
                </p>
              </button>
            ) : briefingLoading ? (
              <BriefingSkeleton />
            ) : briefingError || !briefing ? (
              <div className="space-y-2 py-2">
                <p className="text-sm text-muted-foreground/35 font-serif italic">
                  {ascEntries.length === 0
                    ? "Log something first — there's nothing to summarise yet."
                    : "Couldn't generate brief."}
                </p>
                {ascEntries.length > 0 && (
                  <button onClick={generateBrief} className="text-xs text-muted-foreground/30 hover:text-muted-foreground transition-colors">
                    Retry
                  </button>
                )}
              </div>
            ) : (
              <BriefingView
                briefing={briefing}
                onRegenerate={generateBrief}
                regenerating={briefingLoading}
                sourceEntryIds={ascEntries.slice(0, 20).map((e) => e.id)}
                onViewSources={handleViewSources}
              />
            )}
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (() => {
        const entry = ascEntries.find((e) => e.id === ctxMenu.id);
        return (
          <div
            className="fixed z-50 bg-card border border-border/50 rounded-xl shadow-xl py-1 min-w-[130px] animate-in fade-in zoom-in-95 duration-100"
            style={{ left: Math.min(ctxMenu.x, window.innerWidth - 150), top: Math.min(ctxMenu.y, window.innerHeight - 90) }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2.5 text-sm text-foreground/70 hover:bg-muted flex items-center gap-2 transition-colors"
              onClick={() => {
                setCtxMenu(null);
                if (entry) { setEditingId(entry.id); setEditContent(entry.content); }
              }}
            >
              <Pencil className="w-3 h-3 opacity-50" /> Edit
            </button>
            <button
              className="w-full text-left px-3 py-2.5 text-sm text-muted-foreground/50 hover:bg-muted flex items-center gap-2 transition-colors"
              onClick={() => {
                setCtxMenu(null);
                setLocation(`/dump#entry-${ctxMenu.id}`);
              }}
            >
              <ExternalLink className="w-3 h-3 opacity-50" /> View in log
            </button>
            <button
              className="w-full text-left px-3 py-2.5 text-sm text-destructive/70 hover:bg-muted flex items-center gap-2 transition-colors"
              onClick={() => handleDeleteEntry(ctxMenu.id)}
            >
              <Trash2 className="w-3 h-3 opacity-50" /> Delete
            </button>
          </div>
        );
      })()}
    </div>
  );
}
