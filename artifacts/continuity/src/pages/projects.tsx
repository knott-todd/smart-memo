import { useLocation } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { AppHeader } from "@/components/app-header";
import { Search, X } from "lucide-react";
import { useState, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";

function timeAgo(date: string | null | undefined): string {
  if (!date) return "No entries yet";
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / (86400 * 7))}w ago`;
  return `${Math.floor(diff / (86400 * 30))}mo ago`;
}

export default function Threads() {
  const [, setLocation] = useLocation();
  const { data: threads, isLoading } = useListProjects();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!threads) return [];
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
    );
  }, [threads, query]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <AppHeader
        title="Threads"
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

      {searchOpen && (
        <div className="px-4 py-2 border-b border-border/20">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search threads…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/30 outline-none py-1"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-4 pt-4 space-y-px">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="w-full h-14 rounded-none" />
            ))}
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full pb-16 px-8 text-center gap-3">
            {query ? (
              <p className="text-muted-foreground/40 text-sm">
                No threads match "{query}"
              </p>
            ) : (
              <>
                <p className="text-muted-foreground/40 text-base font-serif italic">
                  No threads yet.
                </p>
                <p className="text-muted-foreground/25 text-sm leading-relaxed">
                  Log anything in the feed — a thread will be created automatically.
                </p>
                <button
                  onClick={() => setLocation("/dump")}
                  className="mt-2 text-sm text-primary/60 hover:text-primary transition-colors"
                >
                  Go to Log
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto divide-y divide-border/10">
            {filtered.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setLocation(`/projects/${thread.id}`)}
                className="w-full text-left px-4 py-4 hover:bg-muted/10 active:bg-muted/20 transition-colors flex items-baseline justify-between gap-4 group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground/80 truncate group-hover:text-foreground transition-colors">
                    {thread.title}
                  </p>
                  {thread.description && (
                    <p className="text-xs text-muted-foreground/30 truncate mt-0.5">
                      {thread.description}
                    </p>
                  )}
                </div>
                <span className="text-[11px] font-mono text-muted-foreground/20 shrink-0 tabular-nums">
                  {timeAgo(thread.lastActivityAt?.toString())}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
