import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetProject,
  getGetProjectQueryKey,
  useCreateUpdate,
  useListProjectUpdates,
  getListProjectUpdatesQueryKey,
  useUpdateProject,
  useDeleteProject,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  Eye,
  Loader2,
  ChevronLeft,
  Settings,
  Trash2,
  Pencil,
  Send,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ViewMode = "pretty" | "chat";

// ─── Auto Briefing ────────────────────────────────────────────────────────────
// Derives a structured summary purely from user-provided updates — no AI button.

interface DerivedBriefing {
  summary: string;
  lastEntry: string | null;
  entryCount: number;
  daysSinceActivity: number | null;
}

function deriveBriefing(
  updates: Array<{ content: string; createdAt: string }>,
  lastActivityAt?: string | null
): DerivedBriefing {
  if (!updates || updates.length === 0) {
    return { summary: "", lastEntry: null, entryCount: 0, daysSinceActivity: null };
  }

  const sorted = [...updates].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const lastEntry = sorted[0].content;
  const entryCount = updates.length;

  // Build a plain-text summary from the last few entries
  const recent = sorted.slice(0, 5).map((u) => u.content.trim());
  const summary = recent.join(" · ");

  const daysSinceActivity = lastActivityAt
    ? Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / 86400000)
    : null;

  return { summary, lastEntry, entryCount, daysSinceActivity };
}

// ─── Context menu ─────────────────────────────────────────────────────────────

interface CtxMenu {
  x: number;
  y: number;
  target: "title" | "description" | "update";
  updateId?: number;
  sourceMessageIndex?: number;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const projectId = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [mode, setMode] = useState<ViewMode>("pretty");
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const updateRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "coasting" | "dark">("active");

  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{ field: "title" | "description"; value: string } | null>(null);

  const { data: project, isLoading: isProjectLoading } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) },
  });

  const { data: updates, isLoading: isUpdatesLoading } = useListProjectUpdates(projectId, {
    query: { enabled: !!projectId, queryKey: getListProjectUpdatesQueryKey(projectId) },
  });

  const createUpdate = useCreateUpdate();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const briefing = project && updates ? deriveBriefing(updates, project.lastActivityAt) : null;

  useEffect(() => {
    if (project) {
      setEditTitle(project.title);
      setEditDescription(project.description ?? "");
      setEditStatus(project.status);
    }
  }, [project]);

  useEffect(() => {
    if (mode === "chat") {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [updates, mode]);

  useEffect(() => {
    const dismiss = () => setCtxMenu(null);
    document.addEventListener("click", dismiss);
    return () => document.removeEventListener("click", dismiss);
  }, []);

  // ── Context menu helpers ──────────────────────────────────────────────────

  const openCtx = (e: React.MouseEvent | React.TouchEvent, target: CtxMenu["target"], updateId?: number) => {
    e.preventDefault?.();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    setCtxMenu({ x: clientX, y: clientY, target, updateId });
  };

  const startLongPress = (e: React.TouchEvent | React.MouseEvent, target: CtxMenu["target"], updateId?: number) => {
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    longPressTimer.current = setTimeout(() => {
      setCtxMenu({ x: clientX, y: clientY, target, updateId });
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  const handleShowSource = (updateId: number) => {
    setCtxMenu(null);
    setMode("chat");
    setTimeout(() => {
      const el = updateRefs.current.get(updateId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("highlight-pulse");
        setTimeout(() => el.classList.remove("highlight-pulse"), 1400);
      }
    }, 100);
  };

  // ── Inline editing of title / description ────────────────────────────────

  const startInlineEdit = (field: "title" | "description") => {
    setCtxMenu(null);
    setInlineEdit({ field, value: field === "title" ? (project?.title ?? "") : (project?.description ?? "") });
  };

  const saveInlineEdit = () => {
    if (!inlineEdit) return;
    const data =
      inlineEdit.field === "title"
        ? { title: inlineEdit.value, description: project?.description ?? "", status: project?.status ?? "active" }
        : { title: project?.title ?? "", description: inlineEdit.value, status: project?.status ?? "active" };
    updateProject.mutate(
      { id: projectId, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          setInlineEdit(null);
        },
      }
    );
  };

  // ── Chat submit ───────────────────────────────────────────────────────────

  const handleChatSubmit = () => {
    const content = chatInput.trim();
    if (!content) return;
    createUpdate.mutate(
      { id: projectId, data: { content, sourceType: "text" } },
      {
        onSuccess: () => {
          setChatInput("");
          queryClient.invalidateQueries({ queryKey: getListProjectUpdatesQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      }
    );
  };

  // ── Settings save / delete ────────────────────────────────────────────────

  const handleUpdateProject = () => {
    updateProject.mutate(
      { id: projectId, data: { title: editTitle, description: editDescription, status: editStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          setIsSettingsOpen(false);
          toast({ title: "Saved" });
        },
      }
    );
  };

  const handleDeleteProject = () => {
    if (!confirm("Delete this project?")) return;
    deleteProject.mutate(
      { id: projectId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          setLocation("/projects");
        },
      }
    );
  };

  // ── Loading / empty ───────────────────────────────────────────────────────

  if (isProjectLoading) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <div className="h-14 border-b border-border/40 flex items-center px-4 gap-4">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!project) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background" onClick={() => setCtxMenu(null)}>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background border-b border-border/40 h-14 flex items-center px-4 shrink-0">
        <button
          onClick={() => setLocation("/projects")}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <span className="absolute left-1/2 -translate-x-1/2 font-serif text-base truncate max-w-[60%] text-center">
          {project.title}
        </span>

        <div className="ml-auto flex items-center gap-3">
          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <Settings className="w-4 h-4" />
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader><DialogTitle>Project Settings</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <label className="text-sm text-muted-foreground">Title</label>
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm text-muted-foreground">Description</label>
                  <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} className="resize-none" />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm text-muted-foreground">Status</label>
                  <Select value={editStatus} onValueChange={(v: "active" | "coasting" | "dark") => setEditStatus(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="coasting">Coasting</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="flex justify-between">
                <Button variant="destructive" size="sm" onClick={handleDeleteProject}>
                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                </Button>
                <Button size="sm" onClick={handleUpdateProject} disabled={updateProject.isPending}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <button
            onClick={() => setMode(mode === "pretty" ? "chat" : "pretty")}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={mode === "pretty" ? "View raw inputs" : "View summary"}
          >
            {mode === "pretty" ? <MessageSquare className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ── Pretty View ── */}
      {mode === "pretty" && (
        <div className="flex-1 overflow-y-auto px-5 pt-6 pb-10 space-y-6">

          {/* Title */}
          <div>
            {inlineEdit?.field === "title" ? (
              <div className="space-y-1">
                <input
                  autoFocus
                  value={inlineEdit.value}
                  onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") saveInlineEdit(); if (e.key === "Escape") setInlineEdit(null); }}
                  className="font-serif text-3xl leading-tight bg-transparent border-b border-primary/40 outline-none w-full"
                />
                <div className="flex gap-2 text-xs">
                  <button onClick={saveInlineEdit} className="text-primary">Save</button>
                  <button onClick={() => setInlineEdit(null)} className="text-muted-foreground/50">Cancel</button>
                </div>
              </div>
            ) : (
              <h1
                className="font-serif text-3xl leading-tight cursor-pointer select-none"
                onMouseDown={(e) => { if (e.button === 0) startLongPress(e, "title"); }}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onTouchStart={(e) => startLongPress(e, "title")}
                onTouchEnd={cancelLongPress}
                onContextMenu={(e) => openCtx(e, "title")}
              >
                {project.title}
              </h1>
            )}

            {/* Description */}
            {inlineEdit?.field === "description" ? (
              <div className="mt-2 space-y-1">
                <textarea
                  autoFocus
                  value={inlineEdit.value}
                  onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Escape") setInlineEdit(null); }}
                  rows={3}
                  className="w-full text-sm text-muted-foreground bg-transparent border-b border-primary/30 outline-none resize-none leading-relaxed"
                />
                <div className="flex gap-2 text-xs">
                  <button onClick={saveInlineEdit} className="text-primary">Save</button>
                  <button onClick={() => setInlineEdit(null)} className="text-muted-foreground/50">Cancel</button>
                </div>
              </div>
            ) : project.description ? (
              <p
                className="text-muted-foreground text-sm mt-1 leading-relaxed cursor-pointer select-none"
                onMouseDown={(e) => { if (e.button === 0) startLongPress(e, "description"); }}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onTouchStart={(e) => startLongPress(e, "description")}
                onTouchEnd={cancelLongPress}
                onContextMenu={(e) => openCtx(e, "description")}
              >
                {project.description}
              </p>
            ) : null}
          </div>

          {/* Auto briefing from user input */}
          {briefing && briefing.entryCount > 0 ? (
            <div className="space-y-5 border-t border-border/30 pt-5">

              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40">Last Update</p>
                <p className="text-sm text-foreground/85 leading-relaxed">{briefing.lastEntry}</p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40">Activity</p>
                <p className="text-xs text-muted-foreground/60">
                  {briefing.entryCount} update{briefing.entryCount !== 1 ? "s" : ""}
                  {briefing.daysSinceActivity === 0
                    ? " · last active today"
                    : briefing.daysSinceActivity === 1
                    ? " · last active yesterday"
                    : briefing.daysSinceActivity !== null
                    ? ` · last active ${briefing.daysSinceActivity} days ago`
                    : ""}
                </p>
              </div>

              {briefing.summary && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40">Context</p>
                  <p className="text-sm text-muted-foreground/70 leading-relaxed line-clamp-4">{briefing.summary}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="border border-dashed border-border/40 rounded-2xl p-6 text-center">
              <p className="text-muted-foreground/50 text-sm font-serif italic">No updates yet — add one below.</p>
            </div>
          )}

          {/* Quick-add in pretty view */}
          <div className="pt-2">
            <div className="flex items-center gap-2 bg-card border border-border rounded-2xl px-4 py-3 focus-within:border-border/60 transition-colors">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleChatSubmit(); }}
                placeholder="Add to this project…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/30 outline-none"
              />
              <button
                onClick={handleChatSubmit}
                disabled={!chatInput.trim() || createUpdate.isPending}
                className="shrink-0 text-muted-foreground/40 hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                {createUpdate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Chat View ── */}
      {mode === "chat" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 space-y-1">
            {isUpdatesLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-3/4 rounded-2xl" />
                <Skeleton className="h-12 w-1/2 rounded-2xl" />
              </div>
            ) : updates && updates.length > 0 ? (
              [...updates].reverse().map((update) => (
                <div key={update.id} className="space-y-0.5">
                  <div className="flex justify-end">
                    <div
                      ref={(el) => { if (el) updateRefs.current.set(update.id, el); else updateRefs.current.delete(update.id); }}
                      className="max-w-[85%] bg-primary/10 border border-primary/20 rounded-2xl rounded-br-sm px-4 py-3 text-sm text-foreground/90 leading-relaxed cursor-pointer select-none"
                      onMouseDown={(e) => { if (e.button === 0) startLongPress(e, "update", update.id); }}
                      onMouseUp={cancelLongPress}
                      onMouseLeave={cancelLongPress}
                      onTouchStart={(e) => startLongPress(e, "update", update.id)}
                      onTouchEnd={cancelLongPress}
                      onContextMenu={(e) => openCtx(e, "update", update.id)}
                    >
                      {update.content}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <p className="text-[10px] text-muted-foreground/30 mr-1">
                      {new Date(update.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground/40 text-sm text-center pt-16 font-serif italic">No inputs yet.</p>
            )}
            <div ref={chatBottomRef} />
          </div>

          <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-8 pb-4 px-4">
            <div className="flex items-center gap-2 bg-card border border-border rounded-2xl px-4 py-3 focus-within:border-border/60 transition-colors">
              <button
                onClick={handleChatSubmit}
                disabled={!chatInput.trim() || createUpdate.isPending}
                className="shrink-0 text-muted-foreground/40 hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                {createUpdate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleChatSubmit(); }}
                placeholder="Add to this project…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Context menu ── */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-card border border-border/60 rounded-xl shadow-xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: Math.min(ctxMenu.x, window.innerWidth - 180),
            top: Math.min(ctxMenu.y, window.innerHeight - 120),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Show source only on pretty-view fields */}
          {(ctxMenu.target === "title" || ctxMenu.target === "description") && (
            <button
              className="w-full text-left px-4 py-2.5 text-sm text-foreground/80 hover:bg-muted transition-colors flex items-center gap-2"
              onClick={() => {
                setCtxMenu(null);
                if (updates && updates.length > 0) {
                  const first = updates[updates.length - 1];
                  handleShowSource(first.id);
                }
              }}
            >
              <Eye className="w-3 h-3 opacity-50" /> Show source
            </button>
          )}
          <button
            className="w-full text-left px-4 py-2.5 text-sm text-foreground/80 hover:bg-muted transition-colors flex items-center gap-2"
            onClick={() => {
              if (ctxMenu.target === "title") startInlineEdit("title");
              else if (ctxMenu.target === "description") startInlineEdit("description");
              else setIsSettingsOpen(true); // update editing goes to settings for now
              setCtxMenu(null);
            }}
          >
            <Pencil className="w-3 h-3 opacity-50" /> Edit
          </button>
        </div>
      )}

      <style>{`
        @keyframes highlight-pulse {
          0%   { box-shadow: 0 0 0 0 hsl(var(--primary) / 0.5); }
          50%  { box-shadow: 0 0 0 6px hsl(var(--primary) / 0.15); }
          100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0); }
        }
        .highlight-pulse { animation: highlight-pulse 1.3s ease-out; }
      `}</style>
    </div>
  );
}
