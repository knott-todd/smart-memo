import { useListProjects, useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Plus, Activity, Moon, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const { data: dashboard, isLoading: isDashboardLoading } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey() }
  });
  const { data: projects, isLoading: isProjectsLoading } = useListProjects();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "coasting": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "dark": return "bg-muted text-muted-foreground border-border";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case "high": return "bg-green-500";
      case "medium": return "bg-amber-500";
      case "low": return "bg-muted-foreground";
      default: return "bg-muted-foreground";
    }
  };

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out fill-mode-both">
      <section className="space-y-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-3xl text-foreground">Welcome back.</h1>
          <p className="text-muted-foreground text-lg font-serif italic">Here's where we left off.</p>
        </div>

        {isDashboardLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : dashboard ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <div className="bg-card border border-border p-4 rounded-xl flex flex-col justify-between">
              <span className="text-muted-foreground text-sm flex items-center gap-2"><Activity className="w-4 h-4" /> Active</span>
              <span className="text-2xl font-serif mt-2">{dashboard.activeProjects}</span>
            </div>
            <div className="bg-card border border-border p-4 rounded-xl flex flex-col justify-between">
              <span className="text-muted-foreground text-sm flex items-center gap-2"><Clock className="w-4 h-4" /> Coasting</span>
              <span className="text-2xl font-serif mt-2">{dashboard.coastingProjects}</span>
            </div>
            <div className="bg-card border border-border p-4 rounded-xl flex flex-col justify-between">
              <span className="text-muted-foreground text-sm flex items-center gap-2"><Moon className="w-4 h-4" /> Dark</span>
              <span className="text-2xl font-serif mt-2">{dashboard.darkProjects}</span>
            </div>
            <div className="bg-card border border-border p-4 rounded-xl flex flex-col justify-between">
              <span className="text-muted-foreground text-sm flex items-center gap-2">Briefings</span>
              <span className="text-2xl font-serif mt-2">{dashboard.totalBriefings}</span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-border/50 pb-4">
          <h2 className="text-xl font-serif">Projects</h2>
          <Link href="/new" className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors">
            <Plus className="w-4 h-4" />
            New Project
          </Link>
        </div>

        {isProjectsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="h-full border-border/50 bg-card hover:bg-secondary/50 transition-all cursor-pointer group rounded-xl overflow-hidden">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className={`capitalize font-normal text-xs px-2 py-0.5 ${getStatusColor(project.status)}`}>
                        {project.status}
                      </Badge>
                      <div className="flex items-center gap-2" title={`Confidence: ${project.confidenceLevel}`}>
                        <span className="text-xs text-muted-foreground capitalize">{project.confidenceLevel}</span>
                        <div className={`w-2 h-2 rounded-full ${getConfidenceColor(project.confidenceLevel)}`} />
                      </div>
                    </div>
                    <CardTitle className="text-xl font-serif group-hover:text-primary transition-colors">{project.title}</CardTitle>
                    <CardDescription className="line-clamp-2 text-muted-foreground/80 mt-2">
                      {project.description || "No description provided."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-muted-foreground/60 flex items-center justify-between">
                      <span>Type: <span className="capitalize">{project.projectType}</span></span>
                      {project.lastActivityAt && (
                        <span>Last active: {new Date(project.lastActivityAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-24 border border-dashed border-border/50 rounded-xl bg-card/30">
            <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-serif mb-2">The desk is clear</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
              Start a new project to begin documenting your journey and creating re-entry briefings.
            </p>
            <Link href="/new" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2">
              Start a Project
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
