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
  Loader2,
  ChevronLeft,
  MoreVertical,
  RefreshCw,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Briefing {
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
  const res = await fetch(`${BASE}/api/projects/${projectId}/briefing`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to generate briefing");
  return res.json();
}

async function patchUpdateApi(id: number, content: string) {
  const res = await fetch(`${BASE}/api/updates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Failed to edit");
  return res.json();
}

async function deleteUpdateApi(id: number) {
  const res = await fetch(`${BASE}/api/updates/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
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
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BriefingSkeleton() {
  return (
    <div className="space-y-5">
      {[80, 60, 90, 50].map((w, i) => (
        <div key={i} className="h-3 rounded-full bg-muted/20 animate-pulse" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

interface BriefingViewProps {
  briefing: Briefing;
  generatedAt: string;
  onRegenerate: () => void;
  regenerating: boolean;
}

function BriefingView({ briefing, generatedAt, onRegenerate, regenerating }: BriefingViewProps) {
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
                <span className="text-muted-foreground/20 shrink-0 select-none">·</span>
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
                <span className="text-primary/40 shrink-0 select-none mt-0.5">›</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <span className="text-[11px] text-muted-foreground/20 font-mono">
          {briefing.confidenceLabel
            ? briefing.confidenceLabel
            : `generated ${timeAgo(generatedAt)}`}
        </span>
        <button
          onClick={onRegenerate}
          disabled={regenerating}
          className="text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors disabled:opacity-30"
          title="Regenerate brief"
        >
          <RefreshCw className={`w-3 h-3 ${regenerating ? "animate-spin" : ""}`} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ThreadDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const threadId = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingGeneratedAt, setBriefingGeneratedAt] = useState<string>("");
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState(false);
  const [briefingRequested, setBriefingRequested] = useState(false);

  const [logExpanded, setLogExpanded] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: number } | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const { data: thread, isLoading: threadLoading } = useGetProject(threadId, {
    query: { enabled: !!threadId, queryKey: getGetProjectQueryKey(threadId) },
  });

  const { data: entries, isLoading: entriesLoading } = useListProjectUpdates(threadId, {
    query: { enabled: !!threadId, queryKey: getListProjectUpdatesQueryKey(threadId) },
  });

  const updateThread = useUpdateProject();
  const deleteThread = useDeleteProject();

  // Scroll → title fade
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handle = () => {
      const el = titleRef.current;
      if (!el) return;
      setScrolled(el.getBoundingClientRect().bottom < 60);
    };
    container.addEventListener("scroll", handle, { passive: true });
    return () => container.removeEventListener("scroll", handle);
  }, []);

  useEffect(() => {
    const dismiss = () => { setShowActions(false); setCtxMenu(null); };
    document.addEventListener("click", dismiss);
    return () => document.removeEventListener("click", dismiss);
  }, []);

  // ── Brief generation ───────────────────────────────────────────────────────

  const generateBrief = useCallback(() => {
    if (!threadId) return;
    setBriefingLoading(true);
    setBriefingError(false);
    setBriefingRequested(true);
    fetchBriefing(threadId)
      .then((b) => {
        setBriefing(b);
        setBriefingGeneratedAt(new Date().toISOString());
        setBriefingLoading(false);
      })
      .catch(() => {
        setBriefingError(true);
        setBriefingLoading(false);
      });
  }, [threadId]);

  // ── Edit / Delete entries ──────────────────────────────────────────────────

  const saveEdit = async () => {
    if (editingId === null) return;
    try {
      await patchUpdateApi(editingId, editContent.trim());
      queryClient.invalidateQueries({ queryKey: getListProjectUpdatesQueryKey(threadId) });
    } catch { /* silent */ }
    setEditingId(null);
  };

  const handleDelete = async (id: number) => {
    setCtxMenu(null);
    try {
      await deleteUpdateApi(id);
      queryClient.invalidateQueries({ queryKey: getListProjectUpdatesQueryKey(threadId) });
    } catch { /* silent */ }
  };

  // ── Long press ─────────────────────────────────────────────────────────────

  const startLongPress = (e: React.TouchEvent | React.MouseEvent, id: number) => {
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    longPressTimer.current = setTimeout(() => setCtxMenu({ x: clientX, y: clientY, id }), 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  // ── Thread actions ─────────────────────────────────────────────────────────

  const handleArchive = () => {
    setShowActions(false);
    updateThread.mutate(
      { id: threadId, data: { title: thread!.title, description: thread!.description ?? "", status: "dark" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          setLocation("/projects");
        },
      }
    );
  };

  const handleDeleteThread = () => {
    setShowActions(false);
    if (!confirm(`Permanently delete "${thread?.title}" and all its entries?`)) return;
    deleteThread.mutate(
      { id: threadId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          setLocation("/projects");
        },
      }
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (threadLoading) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <div className="h-14 border-b border-border/40 flex items-center px-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-40 mx-auto" />
        </div>
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-1/2" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-3 rounded-full" style={{ width: `${[75, 55, 85][i - 1]}%` }} />)}
          </div>
        </div>
      </div>
    );
  }

  if (!thread) return null;

  // Entries in ascending order for the log view
  const ascEntries = entries ? [...entries].reverse() : [];

  return (
    <div
      className="flex flex-col h-screen bg-background"
      onClick={() => { setShowActions(false); setCtxMenu(null); }}
    >
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background border-b border-border/40 h-14 flex items-center px-4 shrink-0">
        <button
          onClick={() => history.back()}
          className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-sm shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {scrolled && (
          <span className="absolute left-1/2 -translate-x-1/2 font-serif text-base truncate max-w-[50%] text-center animate-in fade-in duration-200">
            {thread.title}
          </span>
        )}

        <div className="ml-auto relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowActions((v) => !v); }}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {showActions && (
            <div
              className="absolute right-0 top-8 z-50 bg-card border border-border/60 rounded-xl shadow-xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={handleArchive}
                className="w-full text-left px-4 py-2.5 text-sm text-foreground/80 hover:bg-muted transition-colors"
              >
                Archive thread
              </button>
              <div className="border-t border-border/30 my-1" />
              <button
                onClick={handleDeleteThread}
                className="w-full text-left px-4 py-2.5 text-sm text-destructive/80 hover:bg-muted hover:text-destructive transition-colors"
              >
                Delete thread
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Scrollable body */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 pb-16">

        {/* Thread identity */}
        <div className="pt-5 pb-5">
          <button
            onClick={() => setLocation("/projects")}
            className="text-xs text-muted-foreground/25 hover:text-muted-foreground/50 transition-colors mb-1.5 block"
          >
            Threads /
          </button>
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
            {thread.lastActivityAt && ` · last active ${timeAgo(thread.lastActivityAt.toString())}`}
          </p>
        </div>

        <div className="border-t border-border/15" />

        {/* Brief section */}
        <div className="py-6">
          {!briefingRequested ? (
            <button
              onClick={generateBrief}
              className="w-full border border-border/25 hover:border-border/50 rounded-xl py-5 px-4 text-left transition-colors group"
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
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground/35 font-serif italic">
                {ascEntries.length === 0
                  ? "No entries yet — log something in the main feed first."
                  : "Couldn't generate brief — try again."}
              </p>
              {ascEntries.length > 0 && (
                <button
                  onClick={generateBrief}
                  className="text-xs text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          ) : (
            <BriefingView
              briefing={briefing}
              generatedAt={briefingGeneratedAt}
              onRegenerate={generateBrief}
              regenerating={briefingLoading}
            />
          )}
        </div>

        <div className="border-t border-border/15" />

        {/* Source log — collapsed by default */}
        <div className="py-4">
          <button
            onClick={() => setLogExpanded((v) => !v)}
            className="flex items-center gap-2 text-xs text-muted-foreground/25 hover:text-muted-foreground/50 transition-colors select-none w-full"
          >
            {logExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            <span className="uppercase tracking-widest font-medium">Source log</span>
            <span className="opacity-60">· {ascEntries.length}</span>
          </button>

          {logExpanded && (
            <div className="mt-3 space-y-0">
              {entriesLoading ? (
                <div className="space-y-3 pt-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-3 w-full rounded-full" />)}
                </div>
              ) : ascEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground/25 font-serif italic pt-2">
                  No entries yet.
                </p>
              ) : (
                ascEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="group flex gap-3 py-2.5 hover:bg-muted/10 rounded transition-colors"
                    onMouseDown={(e) => { if (e.button === 0) startLongPress(e, entry.id); }}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={(e) => startLongPress(e, entry.id)}
                    onTouchEnd={cancelLongPress}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, id: entry.id });
                    }}
                  >
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
                          className="w-full bg-transparent text-sm text-foreground/80 leading-relaxed outline-none resize-none border-b border-primary/20 pb-1"
                        />
                        <div className="flex gap-3 mt-1.5">
                          <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground/30 hover:text-muted-foreground">Cancel</button>
                          <button onClick={saveEdit} className="text-xs text-primary/60 hover:text-primary">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                        <p className="text-sm text-foreground/70 leading-relaxed break-words">
                          {entry.content}
                        </p>
                        <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 shrink-0 pt-0.5 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingId(entry.id); setEditContent(entry.content); }}
                            className="p-1 text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors rounded"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                            className="p-1 text-muted-foreground/20 hover:text-destructive/50 transition-colors rounded"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (() => {
        const entry = ascEntries.find((e) => e.id === ctxMenu.id);
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
                if (entry) { setEditingId(entry.id); setEditContent(entry.content); }
              }}
            >
              <Pencil className="w-3 h-3 opacity-50" /> Edit
            </button>
            <button
              className="w-full text-left px-3 py-2.5 text-sm text-destructive/70 hover:bg-muted transition-colors flex items-center gap-2"
              onClick={() => handleDelete(ctxMenu.id)}
            >
              <Trash2 className="w-3 h-3 opacity-50" /> Delete
            </button>
          </div>
        );
      })()}
    </div>
  );
}
