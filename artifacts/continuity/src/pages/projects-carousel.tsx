import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { AppHeader } from "@/components/app-header";
import { Plus } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-500",
  coasting: "bg-amber-500",
  dark: "bg-muted-foreground/30",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export default function ProjectsCarousel() {
  const [, setLocation] = useLocation();
  const { data: projects, isLoading } = useListProjects();
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container || !projects) return;
    const cardWidth = container.offsetWidth * 0.78;
    const scrollLeft = container.scrollLeft;
    const index = Math.round(scrollLeft / cardWidth);
    setActiveIndex(Math.max(0, Math.min(index, projects.length - 1)));
  };

  const handleCardClick = (id: number) => {
    setLocation(`/projects/${id}`);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <AppHeader
        title="Projects"
        right={
          <Link href="/new" className="text-muted-foreground hover:text-foreground transition-colors">
            <Plus className="w-5 h-5" />
          </Link>
        }
      />

      <div className="flex-1 flex flex-col justify-center overflow-hidden">
        {isLoading ? (
          <div className="flex gap-4 px-[11%]">
            <Skeleton className="w-[78%] shrink-0 h-72 rounded-3xl" />
          </div>
        ) : !projects || projects.length === 0 ? (
          <div className="text-center px-8 space-y-4">
            <p className="font-serif text-2xl text-foreground/80">No projects yet.</p>
            <p className="text-muted-foreground text-sm">Start typing in Brain Dump to create your first project.</p>
            <Link href="/" className="inline-block text-sm text-primary hover:opacity-80 transition-opacity mt-2">
              Go to Brain Dump
            </Link>
          </div>
        ) : (
          <>
            <div
              ref={containerRef}
              onScroll={handleScroll}
              className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-[11%] pb-4 scrollbar-none"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => handleCardClick(project.id)}
                  className="w-[78%] shrink-0 snap-center bg-card border border-border/40 rounded-3xl p-8 cursor-pointer hover:border-border/70 transition-all duration-200 flex flex-col justify-between min-h-64"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${STATUS_DOT[project.status] ?? "bg-muted-foreground/30"}`} />
                        <span className="text-xs text-muted-foreground capitalize">{project.status}</span>
                      </div>
                      <span className="text-xs text-muted-foreground/50">
                        {CONFIDENCE_LABEL[project.confidenceLevel] ?? ""}
                      </span>
                    </div>
                    <h2 className="font-serif text-2xl text-foreground leading-snug">{project.title}</h2>
                    {project.description && (
                      <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2">
                        {project.description}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground/40 mt-6">
                    {project.lastActivityAt
                      ? `Last active ${new Date(project.lastActivityAt).toLocaleDateString()}`
                      : "No activity yet"}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center gap-1.5 mt-4">
              {projects.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i === activeIndex ? "w-4 bg-primary" : "w-1.5 bg-border"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
