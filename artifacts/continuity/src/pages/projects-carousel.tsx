import { useRef, useState, useCallback } from "react";
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

// How many px of drag before we commit to a swipe
const SWIPE_THRESHOLD = 48;

export default function ProjectsCarousel() {
  const [, setLocation] = useLocation();
  const { data: projects, isLoading } = useListProjects();
  const [activeIndex, setActiveIndex] = useState(0);

  // Drag state
  const dragStart = useRef<number | null>(null);
  const isDragging = useRef(false);
  const dragDelta = useRef(0);
  const [liveOffset, setLiveOffset] = useState(0); // px drag offset while dragging

  const count = projects?.length ?? 0;

  // ── Navigation ────────────────────────────────────────────────────────────

  const goTo = useCallback(
    (index: number) => setActiveIndex(Math.max(0, Math.min(index, count - 1))),
    [count]
  );

  // ── Pointer / touch handlers ──────────────────────────────────────────────

  const onPointerDown = (e: React.PointerEvent | React.TouchEvent) => {
    const x = "touches" in e ? e.touches[0].clientX : (e as React.PointerEvent).clientX;
    dragStart.current = x;
    isDragging.current = false;
    dragDelta.current = 0;
  };

  const onPointerMove = (e: React.PointerEvent | React.TouchEvent) => {
    if (dragStart.current === null) return;
    const x = "touches" in e ? e.touches[0].clientX : (e as React.PointerEvent).clientX;
    const delta = x - dragStart.current;
    if (Math.abs(delta) > 6) isDragging.current = true;
    dragDelta.current = delta;
    if (isDragging.current) setLiveOffset(delta);
  };

  const onPointerUp = (projectId: number) => {
    const delta = dragDelta.current;
    const wasDrag = isDragging.current;
    dragStart.current = null;
    isDragging.current = false;
    dragDelta.current = 0;
    setLiveOffset(0);

    if (!wasDrag) {
      // Tap — navigate
      setLocation(`/projects/${projectId}`);
      return;
    }

    if (delta < -SWIPE_THRESHOLD) goTo(activeIndex + 1);
    else if (delta > SWIPE_THRESHOLD) goTo(activeIndex - 1);
  };

  const onPointerCancel = () => {
    dragStart.current = null;
    isDragging.current = false;
    dragDelta.current = 0;
    setLiveOffset(0);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background select-none">
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
          <div className="flex justify-center px-8">
            <Skeleton className="w-full max-w-sm h-56 rounded-3xl" />
          </div>
        ) : !projects || projects.length === 0 ? (
          <div className="text-center px-8 space-y-4">
            <p className="font-serif text-2xl text-foreground/80">No projects yet.</p>
            <p className="text-muted-foreground text-sm">
              Start typing in Brain Dump to create your first project.
            </p>
            <Link
              href="/"
              className="inline-block text-sm text-primary hover:opacity-80 transition-opacity mt-2"
            >
              Go to Brain Dump
            </Link>
          </div>
        ) : (
          <>
            {/* Stack container */}
            <div
              className="relative mx-auto"
              style={{
                width: "min(82vw, 360px)",
                // Height of the tallest card + extra for the peeking stack below
                height: "clamp(220px, 38vh, 300px)",
              }}
            >
              {/* Render cards in reverse so activeIndex is on top */}
              {[...projects].reverse().map((project, revI) => {
                const i = count - 1 - revI; // real index
                const offset = i - activeIndex; // negative = past, 0 = active, positive = upcoming

                // Only render a window of cards for perf
                if (Math.abs(offset) > 3) return null;

                // Stack depth visual: cards behind the active one peek out at bottom
                const isPast = offset < 0;
                const isFuture = offset > 0;
                const isActive = offset === 0;

                // Each card behind sits slightly lower and scaled down
                const depth = Math.abs(offset);
                const scale = isActive ? 1 : Math.max(0.82, 1 - depth * 0.07);
                // Past cards slide slightly up-and-left (already flipped through)
                // Future cards stack below-right (waiting to be flipped to)
                const translateY = isActive
                  ? liveOffset * 0.05 // subtle tilt when dragging
                  : isFuture
                  ? depth * 10 + 6   // peek downward — like cards in a deck
                  : -depth * 4;       // past cards slightly up
                const translateX = isActive
                  ? liveOffset        // live drag
                  : isFuture
                  ? depth * 3
                  : depth * -6;
                const rotate = isActive
                  ? liveOffset * 0.02 // gentle rotation while dragging
                  : isFuture
                  ? depth * 0.8
                  : -depth * 1.5;
                const zIndex = isActive ? 20 : isPast ? 10 - depth : 15 - depth;
                const opacity = isActive ? 1 : Math.max(0.35, 1 - depth * 0.25);
                const brightness = isActive ? 1 : Math.max(0.45, 1 - depth * 0.2);

                return (
                  <div
                    key={project.id}
                    style={{
                      position: "absolute",
                      inset: 0,
                      transform: `translateX(${translateX}px) translateY(${translateY}px) scale(${scale}) rotate(${rotate}deg)`,
                      transformOrigin: "center bottom",
                      transition: isDragging.current && isActive
                        ? "none"
                        : "transform 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease, filter 0.3s ease",
                      zIndex,
                      opacity,
                      filter: `brightness(${brightness})`,
                      cursor: isActive ? "grab" : "pointer",
                    }}
                    onMouseDown={isActive ? onPointerDown : undefined}
                    onMouseMove={isActive ? onPointerMove : undefined}
                    onMouseUp={isActive ? () => onPointerUp(project.id) : () => goTo(i)}
                    onMouseLeave={isActive ? onPointerCancel : undefined}
                    onTouchStart={isActive ? onPointerDown : undefined}
                    onTouchMove={isActive ? onPointerMove : undefined}
                    onTouchEnd={isActive ? () => onPointerUp(project.id) : () => goTo(i)}
                    onTouchCancel={isActive ? onPointerCancel : undefined}
                  >
                    <div
                      className="w-full h-full bg-card rounded-3xl flex flex-col justify-between overflow-hidden"
                      style={{
                        border: isActive
                          ? "1px solid hsl(var(--border) / 0.65)"
                          : "1px solid hsl(var(--border) / 0.25)",
                        boxShadow: isActive
                          ? "0 12px 40px hsl(0 0% 0% / 0.45), 0 2px 8px hsl(0 0% 0% / 0.2)"
                          : "0 4px 16px hsl(0 0% 0% / 0.2)",
                        padding: "clamp(18px, 5vw, 28px)",
                      }}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[project.status] ?? "bg-muted-foreground/30"}`}
                          />
                          <span className="text-xs text-muted-foreground capitalize">
                            {project.status}
                          </span>
                        </div>
                        <h2
                          className="font-serif leading-snug text-foreground"
                          style={{ fontSize: "clamp(17px, 4.5vw, 24px)" }}
                        >
                          {project.title}
                        </h2>
                        {project.description && (
                          <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">
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
            <div className="flex justify-center gap-1.5 mt-8">
              {projects.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`rounded-full transition-all duration-300 ${
                    i === activeIndex
                      ? "w-4 h-1.5 bg-primary"
                      : "w-1.5 h-1.5 bg-border/50 hover:bg-border"
                  }`}
                />
              ))}
            </div>

            <p className="text-center text-[11px] text-muted-foreground/30 mt-3">
              Swipe or tap to browse · tap active to open
            </p>
          </>
        )}
      </div>
    </div>
  );
}
