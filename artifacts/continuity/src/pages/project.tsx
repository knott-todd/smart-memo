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
  getListProjectsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Sparkles, Loader2, Clock, CheckCircle2, AlertCircle, ArrowRight, Settings, Trash2, Edit2, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ProjectDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const projectId = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorksheetOpen, setIsWorksheetOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "coasting" | "dark">("active");

  const [worksheetData, setWorksheetData] = useState({
    momentumRating: 5,
    currentStatus: "",
    mainBlocker: "",
    nextStep: "",
    sameAsLast: false
  });

  const { data: project, isLoading: isProjectLoading } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) }
  });

  const { data: updates, isLoading: isUpdatesLoading } = useListProjectUpdates(projectId, {
    query: { enabled: !!projectId, queryKey: getListProjectUpdatesQueryKey(projectId) }
  });

  const { data: briefings, isLoading: isBriefingsLoading } = useListProjectBriefings(projectId, {
    query: { enabled: !!projectId, queryKey: getListProjectBriefingsQueryKey(projectId) }
  });

  const generateBriefing = useGenerateBriefing();
  const createUpdate = useCreateUpdate();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const submitWorksheet = useSubmitWorksheet();

  useEffect(() => {
    if (project) {
      setEditTitle(project.title);
      setEditDescription(project.description || "");
      setEditStatus(project.status);
    }
  }, [project]);

  const handleGenerateBriefing = () => {
    generateBriefing.mutate(
      { id: projectId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getListProjectBriefingsQueryKey(projectId) });
          toast({
            title: "Briefing generated",
            description: "Your re-entry briefing is ready.",
          });
        },
        onError: () => {
          toast({
            title: "Failed to generate briefing",
            description: "Something went wrong. Please try again.",
            variant: "destructive"
          });
        }
      }
    );
  };

  const handleBrainDump = () => {
    if (!content.trim()) return;

    createUpdate.mutate(
      { id: projectId, data: { content, sourceType: "text" } },
      {
        onSuccess: () => {
          setContent("");
          queryClient.invalidateQueries({ queryKey: getListProjectUpdatesQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          toast({
            title: "Recorded",
            description: "Your update has been stored.",
          });
        },
        onError: () => {
          toast({
            title: "Failed to save update",
            variant: "destructive"
          });
        }
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
          toast({ title: "Project updated" });
        }
      }
    );
  };

  const handleDeleteProject = () => {
    if (!confirm("Are you sure you want to delete this project?")) return;
    deleteProject.mutate(
      { id: projectId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast({ title: "Project deleted" });
          setLocation("/");
        }
      }
    );
  };

  const handleSubmitWorksheet = () => {
    submitWorksheet.mutate(
      { id: projectId, data: worksheetData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectUpdatesQueryKey(projectId) });
          setIsWorksheetOpen(false);
          toast({ title: "Worksheet submitted" });
          setWorksheetData({
            momentumRating: 5,
            currentStatus: "",
            mainBlocker: "",
            nextStep: "",
            sameAsLast: false
          });
        }
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBrainDump();
    }
  };

  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  useEffect(() => {
    autoResizeTextarea();
  }, [content]);

  if (isProjectLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <div className="space-y-12 pb-32 animate-in fade-in duration-700">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-6 border-b border-border/50 pb-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-3xl font-serif">{project.title}</h1>
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <Settings className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Project Settings</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <label htmlFor="title">Title</label>
                    <Input id="title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="description">Description</label>
                    <Textarea id="description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <label>Status</label>
                    <Select value={editStatus} onValueChange={(v: any) => setEditStatus(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="coasting">Coasting</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter className="flex justify-between">
                  <Button variant="destructive" onClick={handleDeleteProject} disabled={deleteProject.isPending}>
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </Button>
                  <Button onClick={handleUpdateProject} disabled={updateProject.isPending}>Save changes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl">{project.description}</p>
        </div>
        <div className="flex flex-col items-end gap-3 shrink-0">
          <div className="flex gap-2">
            <Dialog open={isWorksheetOpen} onOpenChange={setIsWorksheetOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 text-muted-foreground">
                  <ClipboardList className="w-4 h-4" /> Worksheet
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Project Worksheet</DialogTitle>
                  <DialogDescription>Structured update to capture momentum.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <label>Momentum (1-10): {worksheetData.momentumRating}</label>
                    <input 
                      type="range" min="1" max="10" 
                      value={worksheetData.momentumRating} 
                      onChange={(e) => setWorksheetData({...worksheetData, momentumRating: Number(e.target.value)})} 
                      className="w-full"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label>Current Status</label>
                    <Textarea value={worksheetData.currentStatus} onChange={(e) => setWorksheetData({...worksheetData, currentStatus: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                    <label>Main Blocker</label>
                    <Input value={worksheetData.mainBlocker} onChange={(e) => setWorksheetData({...worksheetData, mainBlocker: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                    <label>Next Step</label>
                    <Input value={worksheetData.nextStep} onChange={(e) => setWorksheetData({...worksheetData, nextStep: e.target.value})} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleSubmitWorksheet} disabled={submitWorksheet.isPending || !worksheetData.currentStatus || !worksheetData.nextStep}>
                    Submit Worksheet
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button 
              onClick={handleGenerateBriefing} 
              disabled={generateBriefing.isPending}
              variant="outline"
              className="gap-2 bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary"
            >
              {generateBriefing.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate Briefing
            </Button>
          </div>
          <div className="text-xs text-muted-foreground capitalize flex items-center gap-2">
            Status: {project.status} • Confidence: {project.confidenceLevel}
          </div>
        </div>
      </header>

      <Tabs defaultValue="briefing" className="w-full">
        <TabsList className="mb-8">
          <TabsTrigger value="briefing">Latest Briefing</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="briefing" className="mt-0">
          {project.latestBriefing ? (
            <section className="bg-card/50 border border-border/50 rounded-2xl p-6 md:p-8 shadow-sm">
              <h2 className="text-sm font-medium tracking-widest text-muted-foreground uppercase mb-8 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Generated
                <span className="text-xs font-normal opacity-50 ml-auto lowercase">{new Date(project.latestBriefing.createdAt).toLocaleString()}</span>
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                <div className="space-y-3">
                  <h3 className="font-serif text-lg text-primary flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Last Known State
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {project.latestBriefing.lastKnownState}
                  </p>
                </div>
                
                <div className="space-y-3">
                  <h3 className="font-serif text-lg text-amber-500 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> Blockers
                  </h3>
                  {project.latestBriefing.blockers && project.latestBriefing.blockers.length > 0 ? (
                    <ul className="space-y-2">
                      {project.latestBriefing.blockers.map((blocker, i) => (
                        <li key={i} className="text-muted-foreground leading-relaxed flex items-start gap-2">
                          <span className="text-amber-500/50 mt-1">•</span> {blocker}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground/50 italic">No noted blockers.</p>
                  )}
                </div>

                <div className="space-y-3 md:col-span-2">
                  <h3 className="font-serif text-lg text-green-500 flex items-center gap-2">
                    <ArrowRight className="w-4 h-4" /> Next Actions
                  </h3>
                  {project.latestBriefing.nextActions && project.latestBriefing.nextActions.length > 0 ? (
                    <ul className="space-y-3">
                      {project.latestBriefing.nextActions.map((action, i) => (
                        <li key={i} className="text-foreground leading-relaxed flex items-start gap-3 bg-secondary/30 p-4 rounded-lg border border-border/30">
                          <div className="shrink-0 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center text-xs text-muted-foreground mt-0.5">
                            {i + 1}
                          </div>
                          {action}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground/50 italic">No clear next actions identified.</p>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <section className="bg-card/20 border border-dashed border-border p-8 rounded-2xl text-center">
              <p className="text-muted-foreground font-serif italic mb-4">No briefing generated yet.</p>
              <Button onClick={handleGenerateBriefing} disabled={generateBriefing.isPending} variant="secondary">
                {generateBriefing.isPending ? "Analyzing..." : "Generate Initial Briefing"}
              </Button>
            </section>
          )}
        </TabsContent>
        
        <TabsContent value="history" className="mt-0">
          <div className="space-y-6">
            {isBriefingsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : briefings && briefings.length > 0 ? (
              <div className="grid gap-4">
                {briefings.map(b => (
                  <div key={b.id} className="bg-card/30 border border-border p-4 rounded-xl">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">{new Date(b.createdAt).toLocaleDateString()}</span>
                      <Badge variant="outline">{b.confidenceLevel}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{b.lastKnownState}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground italic">No past briefings.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Feed */}
      <section className="space-y-6 mt-12">
        <h2 className="text-sm font-medium tracking-widest text-muted-foreground uppercase border-b border-border/50 pb-4">
          Journal
        </h2>
        
        {isUpdatesLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : updates && updates.length > 0 ? (
          <div className="space-y-6">
            {updates.map((update) => (
              <div key={update.id} className="flex gap-4 group">
                <div className="w-12 shrink-0 text-right">
                  <div className="text-xs text-muted-foreground/50 font-mono mt-1 group-hover:text-muted-foreground transition-colors">
                    {new Date(update.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="text-[10px] text-muted-foreground/30 uppercase mt-1">
                    {new Date(update.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div className="w-px bg-border/40 shrink-0 relative">
                  <div className="absolute top-2 -left-1 w-2 h-2 rounded-full bg-border group-hover:bg-primary/50 transition-colors" />
                </div>
                <div className="bg-card/30 border border-border/40 rounded-xl p-4 flex-1">
                  <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{update.content}</p>
                  {update.tags && update.tags.length > 0 && (
                    <div className="flex gap-2 mt-3">
                      {update.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-[10px] bg-secondary/50 text-muted-foreground">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground/50 italic text-center py-8">No journal entries yet.</p>
        )}
      </section>

      {/* Input Area (Fixed Bottom) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-background via-background to-transparent pointer-events-none z-20">
        <div className="max-w-3xl mx-auto pointer-events-auto shadow-2xl shadow-background">
          <div className="relative bg-card border border-border rounded-2xl overflow-hidden focus-within:ring-1 focus-within:ring-primary/50 transition-all">
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Dump your thoughts... (Shift+Enter for new line)"
              className="min-h-[80px] max-h-[300px] w-full resize-none border-0 focus-visible:ring-0 bg-transparent py-4 px-5 text-foreground placeholder:text-muted-foreground/50 pb-12"
              disabled={createUpdate.isPending}
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-widest hidden sm:inline-block">Enter to save</span>
              <Button 
                size="sm" 
                onClick={handleBrainDump} 
                disabled={!content.trim() || createUpdate.isPending}
                className="h-8 w-8 rounded-full p-0"
              >
                {createUpdate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
