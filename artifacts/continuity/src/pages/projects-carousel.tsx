import { useRef, useState, useEffect } from "react";
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

export default function ProjectsCarousel() {
  const [, setLocation] = useLocation();
  const { data: projects, isLoading } = useListProjects();
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Snap-scroll detection
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container || !projects) return;
    // Find which card is closest to center
    const containerCenter = container.scrollLeft + container.offsetWidth / 2;
    let closest = 0;
    let closestDist = Infinity;
    cardRefs.current.forEach((card, i) => {
      if (!card) return;
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(containerCenter - cardCenter);
      if (dist < closestDist) { closestDist = dist; closest = i; }
    });
    setActiveIndex(closest);
  };

  const handleCardClick = (id: number, index: number) => {
    if (index !== activeIndex) {
      // Just snap to it, don't navigate
      cardRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      setActiveIndex(index);
      return;
    }
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
            <Skeleton className="w-[72%] shrink-0 h-56 rounded-3xl" />
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
              className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                paddingLeft: "14%",
                paddingRight: "14%",
                gap: "12px",
                paddingBottom: "8px",
              }}
            >
              {projects.map((project, i) => {
                const isActive = i === activeIndex;
                return (
                  <div
                    key={project.id}
                    ref={(el) => { cardRefs.current[i] = el; }}
                    onClick={() => handleCardClick(project.id, i)}
                    snap-align="center"
                    className="shrink-0 snap-center cursor-pointer"
                    style={{
                      width: "72%",
                      // Active card is slightly taller and fully opaque; adjacent ones shrink + fade
                      transform: isActive ? "scale(1) translateY(0px)" : "scale(0.92) translateY(10px)",
                      opacity: isActive ? 1 : 0.45,
                      filter: isActive ? "none" : "brightness(0.55)",
                      transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease, filter 0.35s ease",
                      zIndex: isActive ? 10 : 1,
                      position: "relative",
                    }}
                  >
                    <div
                      className="bg-card border border-border/40 rounded-3xl flex flex-col justify-between"
                      style={{
                        padding: "clamp(20px, 5vw, 32px)",
                        minHeight: "clamp(180px, 30vh, 260px)",
                        borderColor: isActive ? "hsl(var(--border) / 0.7)" : "hsl(var(--border) / 0.3)",
                        boxShadow: isActive ? "0 8px 32px hsl(0 0% 0% / 0.35)" : "none",
                        transition: "box-shadow 0.35s ease, border-color 0.35s ease",
                      }}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[project.status] ?? "bg-muted-foreground/30"}`} />
                            <span className="text-xs text-muted-foreground capitalize">{project.status}</span>
                          </div>
                        </div>
                        <h2 className="font-serif leading-snug" style={{ fontSize: "clamp(18px, 4vw, 26px)" }}>
                          {project.title}
                        </h2>
                        {project.description && (
                          <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2">
                            {project.description}
                          </p>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground/40 mt-4">
                        {project.lastActivityAt
                          ? `Last active ${new Date(project.lastActivityAt).toLocaleDateString()}`
                          : "No activity yet"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Dot indicators */}
            <div className="flex justify-center gap-1.5 mt-5">
              {projects.map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${
                    i === activeIndex ? "w-4 h-1.5 bg-primary" : "w-1.5 h-1.5 bg-border/50"
                  }`}
                />
              ))}
            </div>

            {/* Tap hint on inactive */}
            {projects.length > 1 && (
              <p className="text-center text-[11px] text-muted-foreground/30 mt-3">
                {activeIndex < projects.length - 1 || activeIndex > 0
                  ? "Tap active card to open · swipe to browse"
                  : "Tap to open project"}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
