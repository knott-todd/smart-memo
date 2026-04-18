import { useState, useRef, useEffect, useCallback } from "react";
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
  MoreVertical,
  Send,
  Mic,
  MicOff,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type ViewMode = "pretty" | "chat";

interface Briefing {
  lastKnownState: string;
  confidenceLevel: "high" | "medium" | "low";
  confidenceLabel: string;
  blockers: string[];
  nextActions: string[];
  createdAt: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchBriefing(projectId: number): Promise<Briefing> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/briefing`, { method: "POST" });
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
  if (!date) return "No activity yet";
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / (86400 * 7))} weeks ago`;
  return `${Math.floor(diff / (86400 * 30))} months ago`;
}

function BriefingSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-2 w-20 bg-muted/30 rounded-full" />
          <div className="h-4 w-full rounded-full overflow-hidden">
            <div className="h-full w-full" style={{
              background: "linear-gradient(90deg, hsl(var(--muted)/0.15) 25%, hsl(var(--muted)/0.35) 50%, hsl(var(--muted)/0.15) 75%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite",
            }} />
          </div>
          <div className="h-4 w-2/3 rounded-full overflow-hidden">
            <div className="h-full w-full" style={{
              background: "linear-gradient(90deg, hsl(var(--muted)/0.15) 25%, hsl(var(--muted)/0.35) 50%, hsl(var(--muted)/0.15) 75%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite 0.3s",
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProjectDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const projectId = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [mode, setMode] = useState<ViewMode>("pretty");
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingError, setBriefingError] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [editingUpdateId, setEditingUpdateId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; updateId: number } | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const updateRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  const { data: project, isLoading: isProjectLoading } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) },
  });

  const { data: updates, isLoading: isUpdatesLoading } = useListProjectUpdates(projectId, {
    query: { enabled: !!projectId, queryKey: getListProjectUpdatesQueryKey(projectId) },
  });

  const createUpdate = useCreateUpdate();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  // Load briefing
  const loadBriefing = useCallback(() => {
    if (!projectId) return;
    setBriefingLoading(true);
    setBriefingError(false);
    fetchBriefing(projectId)
      .then((b) => { setBriefing(b); setBriefingLoading(false); })
      .catch(() => { setBriefingError(true); setBriefingLoading(false); });
  }, [projectId]);

  useEffect(() => { loadBriefing(); }, [loadBriefing]);

  // Scroll detection
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const titleEl = titleRef.current;
      if (!titleEl) return;
      setScrolled(titleEl.getBoundingClientRect().bottom < 60);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Dismiss menus
  useEffect(() => {
    const dismiss = () => { setShowActions(false); setCtxMenu(null); };
    document.addEventListener("click", dismiss);
    return () => document.removeEventListener("click", dismiss);
  }, []);

  // Chat scroll
  useEffect(() => {
    if (mode === "chat") chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [updates, mode]);

  // Mic
  const toggleMic = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
      setChatInput(t);
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

  // Chat submit
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
          loadBriefing();
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      }
    );
  };

  // Long press
  const startLongPress = (e: React.TouchEvent | React.MouseEvent, updateId: number) => {
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    longPressTimer.current = setTimeout(() => setCtxMenu({ x: clientX, y: clientY, updateId }), 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  // Edit
  const startEdit = (id: number, content: string) => {
    setCtxMenu(null);
    setEditingUpdateId(id);
    setEditContent(content);
  };

  const saveEdit = async () => {
    if (editingUpdateId === null) return;
    try {
      await patchUpdateApi(editingUpdateId, editContent.trim());
      queryClient.invalidateQueries({ queryKey: getListProjectUpdatesQueryKey(projectId) });
      loadBriefing();
    } catch { /* silent */ }
    setEditingUpdateId(null);
  };

  // Delete update
  const handleDeleteUpdate = async (id: number) => {
    setCtxMenu(null);
    try {
      await deleteUpdateApi(id);
      queryClient.invalidateQueries({ queryKey: getListProjectUpdatesQueryKey(projectId) });
    } catch { /* silent */ }
  };

  // Show source
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

  // Project actions
  const handlePause = () => {
    setShowActions(false);
    updateProject.mutate(
      { id: projectId, data: { title: project!.title, description: project!.description ?? "", status: "coasting" } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }); toast({ title: "Project paused" }); } }
    );
  };

  const handleResume = () => {
    setShowActions(false);
    updateProject.mutate(
      { id: projectId, data: { title: project!.title, description: project!.description ?? "", status: "active" } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }); toast({ title: "Project resumed" }); } }
    );
  };

  const handleCloseProject = () => {
    setShowActions(false);
    if (!confirm(`Mark "${project?.title}" as complete? This removes it from your active list.`)) return;
    updateProject.mutate(
      { id: projectId, data: { title: project!.title, description: project!.description ?? "", status: "dark" } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() }); setLocation("/projects"); } }
    );
  };

  const handleDeleteProject = () => {
    setShowActions(false);
    if (!confirm(`Permanently delete "${project?.title}" and all its updates? This can't be undone.`)) return;
    deleteProject.mutate(
      { id: projectId },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() }); setLocation("/projects"); } }
    );
  };

  if (isProjectLoading) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <div className="h-14 border-b border-border/40 flex items-center px-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-1/2" />
          <BriefingSkeleton />
        </div>
      </div>
    );
  }

  if (!project) return null;

  const isPaused = project.status === "coasting";

  return (
    <div className="flex flex-col h-screen bg-background" onClick={() => { setShowActions(false); setCtxMenu(null); }}>

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
            {project.title}
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); setMode(mode === "pretty" ? "chat" : "pretty"); }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === "pretty" ? <MessageSquare className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowActions((v) => !v); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showActions && (
              <div
                className="absolute right-0 top-8 z-50 bg-card border border-border/60 rounded-xl shadow-xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                {isPaused ? (
                  <button onClick={handleResume} className="w-full text-left px-4 py-2.5 text-sm text-foreground/80 hover:bg-muted transition-colors">Resume project</button>
                ) : (
                  <button onClick={handlePause} className="w-full text-left px-4 py-2.5 text-sm text-foreground/80 hover:bg-muted transition-colors">Pause project</button>
                )}
                <button onClick={handleCloseProject} className="w-full text-left px-4 py-2.5 text-sm text-foreground/80 hover:bg-muted transition-colors">Close project</button>
                <div className="border-t border-border/30 my-1" />
                <button onClick={handleDeleteProject} className="w-full text-left px-4 py-2.5 text-sm text-destructive/80 hover:bg-muted hover:text-destructive transition-colors">Delete project</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Pretty View */}
      {mode === "pretty" && (
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 pb-10">
          <div className="pt-5 pb-6">
            <button
              onClick={() => setLocation("/projects")}
              className="text-xs text-muted-foreground/35 hover:text-muted-foreground/60 transition-colors mb-1 block"
            >
              My Projects /
            </button>
            <h1 ref={titleRef} className="font-serif text-3xl leading-tight">
              {project.title}
            </h1>
            {project.description && (
              <p className="text-muted-foreground/55 text-sm mt-1.5 leading-relaxed">
                {project.description}
              </p>
            )}
          </div>

          <div className="border-t border-border/20 mb-6" />

          {briefingLoading ? (
            <BriefingSkeleton />
          ) : briefingError || !briefing ? (
            <p className="text-muted-foreground/40 text-sm font-serif italic">
              {updates && updates.length === 0
                ? "Add updates in Chat view to get a briefing."
                : "Unable to generate briefing — try adding more context."}
            </p>
          ) : (
            <div className="space-y-6">
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/30 font-medium">Where you are</p>
                <p className="text-sm text-foreground/85 leading-relaxed">{briefing.lastKnownState}</p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/30 font-medium">Confidence</p>
                <p className="text-xs text-muted-foreground/45 leading-relaxed">
                  {briefing.confidenceLabel || `Based on info from ${timeAgo(briefing.createdAt)}`}
                </p>
              </div>

              {briefing.blockers && briefing.blockers.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/30 font-medium">Blockers</p>
                  <ul className="space-y-1">
                    {briefing.blockers.map((b, i) => (
                      <li key={i} className="text-sm text-foreground/70 leading-relaxed flex gap-2">
                        <span className="text-muted-foreground/25 shrink-0">·</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {briefing.nextActions && briefing.nextActions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/30 font-medium">Next actions</p>
                  <ul className="space-y-1.5">
                    {briefing.nextActions.map((a, i) => (
                      <li key={i} className="text-sm text-foreground/85 leading-relaxed flex gap-2">
                        <span className="text-primary/50 shrink-0 mt-0.5">›</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!briefingLoading && briefing && (
            <div className="mt-10 border-t border-border/15 pt-6">
              <p className="text-muted-foreground/18 text-xs text-center font-serif italic">
                More context coming soon
              </p>
            </div>
          )}
        </div>
      )}

      {/* Chat View */}
      {mode === "chat" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 space-y-1">
            {isUpdatesLoading ? (
              <div className="space-y-3 pt-4">
                <Skeleton className="h-12 w-3/4 rounded-2xl ml-auto" />
                <Skeleton className="h-12 w-1/2 rounded-2xl ml-auto" />
              </div>
            ) : updates && updates.length > 0 ? (
              [...updates].reverse().map((update) => (
                <div key={update.id} className="space-y-0.5">
                  <div className="flex justify-end">
                    {editingUpdateId === update.id ? (
                      <div className="max-w-[85%] w-full bg-card border border-primary/30 rounded-2xl rounded-br-sm px-4 py-3">
                        <textarea
                          autoFocus
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                            if (e.key === "Escape") setEditingUpdateId(null);
                          }}
                          rows={3}
                          className="w-full bg-transparent text-sm text-foreground/90 leading-relaxed outline-none resize-none"
                        />
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={() => setEditingUpdateId(null)} className="text-xs text-muted-foreground/50 hover:text-muted-foreground">Cancel</button>
                          <button onClick={saveEdit} className="text-xs text-primary hover:opacity-80">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        ref={(el) => { if (el) updateRefs.current.set(update.id, el); else updateRefs.current.delete(update.id); }}
                        className="max-w-[85%] bg-primary/10 border border-primary/20 rounded-2xl rounded-br-sm px-4 py-3 text-sm text-foreground/90 leading-relaxed cursor-pointer select-none transition-colors hover:border-primary/30"
                        onMouseDown={(e) => { if (e.button === 0) startLongPress(e, update.id); }}
                        onMouseUp={cancelLongPress}
                        onMouseLeave={cancelLongPress}
                        onTouchStart={(e) => startLongPress(e, update.id)}
                        onTouchEnd={cancelLongPress}
                        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, updateId: update.id }); }}
                      >
                        {update.sourceType === "voice" && (
                          <span className="text-muted-foreground/40 text-xs mr-1.5">🎤</span>
                        )}
                        {update.content}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end items-center gap-2 pr-1">
                    {update.sourceType === "voice" && (
                      <span className="text-[10px] text-muted-foreground/22">via voice</span>
                    )}
                    <p className="text-[10px] text-muted-foreground/22">
                      {new Date(update.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground/35 text-sm text-center pt-16 font-serif italic">No inputs yet.</p>
            )}
            <div ref={chatBottomRef} />
          </div>

          <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-8 pb-4 px-4">
            <div className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 focus-within:border-border/60 transition-colors">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleChatSubmit(); }}
                placeholder={isListening ? "Listening…" : "Add to this project…"}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/30 outline-none"
              />
              <button
                className={`shrink-0 transition-colors ${isListening ? "text-primary animate-pulse" : "text-muted-foreground/30 hover:text-muted-foreground"}`}
                onClick={toggleMic}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
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

      {/* Context menu */}
      {ctxMenu && (() => {
        const update = updates?.find((u) => u.id === ctxMenu.updateId);
        return (
          <div
            className="fixed z-50 bg-card border border-border/60 rounded-xl shadow-xl py-1 min-w-[150px] animate-in fade-in zoom-in-95 duration-150"
            style={{ left: Math.min(ctxMenu.x, window.innerWidth - 170), top: Math.min(ctxMenu.y, window.innerHeight - 140) }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="w-full text-left px-4 py-2.5 text-sm text-foreground/80 hover:bg-muted transition-colors" onClick={() => handleShowSource(ctxMenu.updateId)}>
              Show source
            </button>
            <button className="w-full text-left px-4 py-2.5 text-sm text-foreground/80 hover:bg-muted transition-colors" onClick={() => update && startEdit(update.id, update.content)}>
              Edit
            </button>
            <button className="w-full text-left px-4 py-2.5 text-sm text-destructive/80 hover:bg-muted hover:text-destructive transition-colors" onClick={() => handleDeleteUpdate(ctxMenu.updateId)}>
              Delete
            </button>
          </div>
        );
      })()}

      {micError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-destructive/90 text-destructive-foreground text-xs px-3 py-2 rounded-full shadow-lg animate-in fade-in duration-200">
          {micError}
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
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