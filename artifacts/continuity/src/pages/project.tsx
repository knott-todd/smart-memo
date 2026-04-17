import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetProject,
  getGetProjectQueryKey,
  useGenerateBriefing,
  useCreateUpdate,
  useListProjectUpdates,
  getListProjectUpdatesQueryKey,
  useUpdateProject,
  useDeleteProject,
  useListProjectBriefings,
  getListProjectBriefingsQueryKey,
  useSubmitWorksheet,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  Eye,
  Sparkles,
  Loader2,
  ChevronLeft,
  Settings,
  Trash2,
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

function ConfidenceLabel({ level, lastActivity }: { level: string; lastActivity?: string | null }) {
  if (!lastActivity) return <span className="text-muted-foreground/50 text-xs">No data yet</span>;
  const days = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000);
  const label =
    days === 0 ? "from today" : days === 1 ? "from yesterday" : `from ${days} days ago`;
  return (
    <span className="text-xs text-muted-foreground/60">
      Based on info {label}
    </span>
  );
}

export default function ProjectDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const projectId = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [mode, setMode] = useState<ViewMode>("pretty");
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "coasting" | "dark">("active");

  const { data: project, isLoading: isProjectLoading } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) },
  });

  const { data: updates, isLoading: isUpdatesLoading } = useListProjectUpdates(projectId, {
    query: { enabled: !!projectId, queryKey: getListProjectUpdatesQueryKey(projectId) },
  });

  const generateBriefing = useGenerateBriefing();
  const createUpdate = useCreateUpdate();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

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

  const handleGenerateBriefing = () => {
    generateBriefing.mutate(
      { id: projectId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getListProjectBriefingsQueryKey(projectId) });
          toast({ title: "Briefing generated" });
        },
        onError: () => {
          toast({ title: "Failed to generate briefing", variant: "destructive" });
        },
      }
    );
  };

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
        onError: () => {
          toast({ title: "Failed to save", variant: "destructive" });
        },
      }
    );
  };

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

  const briefing = project.latestBriefing;

  return (
    <div className="flex flex-col h-screen bg-background">
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
              <DialogHeader>
                <DialogTitle>Project Settings</DialogTitle>
              </DialogHeader>
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
                  <Select value={editStatus} onValueChange={(v: any) => setEditStatus(v)}>
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
                <Button size="sm" onClick={handleUpdateProject} disabled={updateProject.isPending}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <button
            onClick={() => setMode(mode === "pretty" ? "chat" : "pretty")}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={mode === "pretty" ? "View raw inputs" : "View pretty briefing"}
          >
            {mode === "pretty" ? <MessageSquare className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Pretty View */}
      {mode === "pretty" && (
        <div className="flex-1 overflow-y-auto">
          {/* Above fold: title + briefing block */}
          <div className="px-5 pt-6 pb-4 min-h-[calc(100vh-3.5rem)] flex flex-col justify-between">
            <div className="space-y-5">
              <div>
                <h1 className="font-serif text-3xl leading-tight">{project.title}</h1>
                {project.description && (
                  <p className="text-muted-foreground text-sm mt-1 leading-relaxed">{project.description}</p>
                )}
              </div>

              {briefing ? (
                <div className="space-y-4 border-t border-border/30 pt-5">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40">Last Known State</p>
                    <p className="text-sm text-foreground/85 leading-relaxed line-clamp-3">
                      {briefing.lastKnownState}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40">Confidence</p>
                    <ConfidenceLabel level={briefing.confidenceLevel} lastActivity={project.lastActivityAt} />
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40">Blockers</p>
                    {briefing.blockers && briefing.blockers.length > 0 ? (
                      <ul className="space-y-0.5">
                        {briefing.blockers.slice(0, 3).map((b, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-amber-500/60 mt-0.5 shrink-0">•</span>
                            <span className="line-clamp-2">{b}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground/40 italic">None identified</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40">Next Actions</p>
                    {briefing.nextActions && briefing.nextActions.length > 0 ? (
                      <ol className="space-y-1">
                        {briefing.nextActions.slice(0, 3).map((a, i) => (
                          <li key={i} className="text-sm text-foreground/85 flex items-start gap-2">
                            <span className="text-xs text-muted-foreground/40 mt-0.5 shrink-0 w-3">{i + 1}.</span>
                            <span className="line-clamp-2">{a}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-xs text-muted-foreground/40 italic">None identified</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-border/40 rounded-2xl p-6 space-y-3 text-center">
                  <p className="text-muted-foreground/60 text-sm font-serif italic">No briefing yet</p>
                  <button
                    onClick={handleGenerateBriefing}
                    disabled={generateBriefing.isPending}
                    className="inline-flex items-center gap-2 text-xs text-primary border border-primary/20 rounded-full px-4 py-1.5 hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    {generateBriefing.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Generate Briefing
                  </button>
                </div>
              )}
            </div>

            {briefing && (
              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleGenerateBriefing}
                  disabled={generateBriefing.isPending}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-30"
                >
                  {generateBriefing.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  Refresh briefing
                </button>
              </div>
            )}
          </div>

          {/* Below fold: Context + Insights from updates */}
          {updates && updates.length > 0 && (
            <div className="px-5 pb-8 space-y-8 border-t border-border/20">
              <div className="pt-6 space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40">Context Summary</p>
                <p className="text-sm text-muted-foreground/70 leading-relaxed">
                  {briefing?.lastKnownState ?? "Add updates to build context."}
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40">Key Insights</p>
                {briefing?.blockers && briefing.blockers.length > 0 ? (
                  <ul className="space-y-1.5">
                    {[...briefing.blockers, ...(briefing.nextActions ?? [])].slice(0, 6).map((item, i) => (
                      <li key={i} className="text-sm text-muted-foreground/70 flex items-start gap-2">
                        <span className="text-muted-foreground/30 mt-0.5 shrink-0">—</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground/30 italic">Generate a briefing to see insights.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40">Artifacts</p>
                <p className="text-xs text-muted-foreground/30 italic">Images and files — coming soon.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chat View */}
      {mode === "chat" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24 space-y-1">
            {isUpdatesLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-3/4 rounded-2xl" />
                <Skeleton className="h-12 w-1/2 rounded-2xl" />
              </div>
            ) : updates && updates.length > 0 ? (
              [...updates].reverse().map((update) => (
                <div key={update.id} className="space-y-1">
                  <div className="max-w-[85%] bg-card border border-border/40 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-foreground/90 leading-relaxed">
                    {update.content}
                  </div>
                  <p className="text-[10px] text-muted-foreground/30 ml-1">
                    {new Date(update.createdAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground/40 text-sm text-center pt-16 font-serif italic">
                No inputs yet.
              </p>
            )}
            <div ref={chatBottomRef} />
          </div>

          <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-8 pb-4 px-4">
            <div className="flex items-center gap-2 bg-card border border-border rounded-2xl px-4 py-3">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleChatSubmit(); }}
                placeholder="Add to this project…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
              />
              <button
                onClick={handleChatSubmit}
                disabled={!chatInput.trim() || createUpdate.isPending}
                className="shrink-0 text-muted-foreground/50 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {createUpdate.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span className="text-xs">Send</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
