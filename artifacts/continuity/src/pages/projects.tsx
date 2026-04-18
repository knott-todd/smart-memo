import { useLocation } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { AppHeader } from "@/components/app-header";
import { Search, X } from "lucide-react";
import { useState, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";

function timeAgo(date: string | null | undefined): string {
  if (!date) return "No activity yet";
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return "Last active: just now";
  if (diff < 3600) return `Last active: ${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `Last active: ${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `Last active: ${Math.floor(diff / 86400)} days ago`;
  if (diff < 86400 * 30) return `Last active: ${Math.floor(diff / (86400 * 7))} weeks ago`;
  return `Last active: ${Math.floor(diff / (86400 * 30))} months ago`;
}

export default function Projects() {
  const [, setLocation] = useLocation();
  const { data: projects, isLoading } = useListProjects();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!projects) return [];
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
    );
  }, [projects, query]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <AppHeader
        title="My Projects"
        right={
          <button
            onClick={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setQuery("");
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
          </button>
        }
      />

      {/* Search bar */}
      {searchOpen && (
        <div className="px-4 py-2 border-b border-border/30">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none py-1"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-4 pt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="w-full rounded-xl" style={{ height: "calc(33vh - 24px)" }} />
            ))}
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full pb-16 px-8 text-center gap-3">
            {query ? (
              <p className="text-muted-foreground/50 text-sm">
                No projects match "{query}"
              </p>
            ) : (
              <>
                <p className="text-muted-foreground/60 text-base font-serif italic">
                  No projects yet.
                </p>
                <p className="text-muted-foreground/40 text-sm leading-relaxed">
                  Start by dropping a thought in Brain Dump
                  <br />— we'll take it from there.
                </p>
                <button
                  onClick={() => setLocation("/dump")}
                  className="mt-2 text-sm text-primary hover:opacity-80 transition-opacity"
                >
                  Go to Brain Dump
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="px-4 pt-4 pb-8 space-y-3">
            {filtered.map((project) => (
              <button
                key={project.id}
                onClick={() => setLocation(`/projects/${project.id}`)}
                className="w-full text-left border border-border/40 rounded-xl px-5 active:scale-[0.99] transition-transform hover:border-border/70"
                style={{
                  minHeight: "calc(33vh - 24px)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  paddingTop: "clamp(16px, 3vw, 24px)",
                  paddingBottom: "clamp(16px, 3vw, 24px)",
                }}
              >
                <div className="space-y-1.5">
                  <h2 className="font-serif text-xl leading-snug text-foreground">
                    {project.title}
                  </h2>
                  {project.description && (
                    <p className="text-muted-foreground/60 text-sm leading-relaxed line-clamp-2">
                      {project.description}
                    </p>
                  )}
                </div>
                <p className="text-muted-foreground/35 text-xs mt-4">
                  {timeAgo(project.lastActivityAt?.toString())}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}