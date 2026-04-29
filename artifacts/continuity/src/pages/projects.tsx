import { useLocation } from "wouter";
import { useListProjects } from "@workspace/api-client-react";
import { AppHeader } from "@/components/app-header";
import { Search, X } from "lucide-react";
import { useState, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_LABELS: Record<string, string> = {
  active: "active",
  early: "early",
  stalled: "stalled",
  urgent: "urgent",
  waiting: "waiting",
  reference: "ref",
  needs_you: "needs you",
  dark: "archived",
};

const TYPE_LABELS: Record<string, string> = {
  project: "project",
  idea: "idea",
  admin: "admin",
  reminder: "reminder",
  reference: "reference",
};

// Top-level category derived from threadType + status
function getCategory(thread: { threadType: string; status: string }): string {
  const { threadType, status } = thread;
  if (status === "dark") return "Archived";
  if (threadType === "project") {
    if (status === "urgent") return "Active Projects";
    if (status === "active" || status === "early" || status === "waiting" || status === "stalled") return "Active Projects";
    return "Active Projects";
  }
  if (threadType === "idea") return "Ideas";
  if (threadType === "admin") return "Admin";
  if (threadType === "reminder") return "Admin";
  if (threadType === "reference") return "Reference";
  return "Miscellaneous";
}

const CATEGORY_ORDER = ["Active Projects", "Ideas", "Admin", "Reference", "Miscellaneous", "Archived"];

function timeAgo(date: string | null | undefined): string {
  if (!date) return "";
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  if (diff < 86400 * 30) return `${Math.floor(diff / (86400 * 7))}w`;
  return `${Math.floor(diff / (86400 * 30))}mo`;
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

  // Group by category then subcategory
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, typeof filtered>>();
    for (const t of filtered) {
      const cat = getCategory(t);
      if (!map.has(cat)) map.set(cat, new Map());
      const sub = (t as any).subcategory ?? "__none__";
      const catMap = map.get(cat)!;
      if (!catMap.has(sub)) catMap.set(sub, []);
      catMap.get(sub)!.push(t);
    }
    // Sort categories by order
    return CATEGORY_ORDER
      .filter((c) => map.has(c))
      .map((cat) => {
        const subMap = map.get(cat)!;
        const subs: { label: string | null; threads: typeof filtered }[] = [];
        // None-subcategorised first
        if (subMap.has("__none__")) {
          subs.push({ label: null, threads: subMap.get("__none__")! });
        }
        for (const [sub, threads] of subMap.entries()) {
          if (sub !== "__none__") subs.push({ label: sub, threads });
        }
        return { category: cat, subs };
      });
  }, [filtered]);

  return (
    <div className="flex flex-col h-screen bg-background">
      <AppHeader
        title="Threads"
        right={
          <button
            onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setQuery(""); }}
            className="text-muted-foreground/40 hover:text-foreground transition-colors"
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
            placeholder="Search…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/25 outline-none py-1"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-4 pt-4 space-y-px">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="w-full h-12 rounded-none" />)}
          </div>
        ) : !filtered.length ? (
          <div className="flex flex-col items-center justify-center h-full pb-16 px-8 text-center gap-3">
            {query ? (
              <p className="text-muted-foreground/35 text-sm">No threads match "{query}"</p>
            ) : (
              <>
                <p className="text-muted-foreground/30 text-base font-serif italic">No threads yet.</p>
                <p className="text-muted-foreground/20 text-sm leading-relaxed">
                  Log anything in the feed — a thread will be created automatically.
                </p>
                <button onClick={() => setLocation("/dump")} className="mt-2 text-sm text-foreground/30 hover:text-foreground/60 transition-colors">
                  Go to Log
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto pb-8">
            {grouped.map(({ category, subs }) => (
              <div key={category}>
                {/* Category heading */}
                <div className="px-4 pt-5 pb-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium select-none">
                    {category}
                  </p>
                </div>

                {subs.map(({ label, threads }) => (
                  <div key={label ?? "__none__"}>
                    {/* Subcategory subheading */}
                    {label && (
                      <div className="px-4 pt-2 pb-0.5">
                        <p className="text-xs text-muted-foreground/30 italic select-none">{label}</p>
                      </div>
                    )}
                    <div className="divide-y divide-border/8">
                      {threads.map((thread) => (
                        <button
                          key={thread.id}
                          onClick={() => setLocation(`/projects/${thread.id}`)}
                          className="w-full text-left px-4 py-3 hover:bg-muted/8 active:bg-muted/15 transition-colors flex items-baseline justify-between gap-3 group"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground/80 truncate group-hover:text-foreground transition-colors">
                              {thread.title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-mono text-muted-foreground/20 uppercase">
                                {TYPE_LABELS[thread.threadType] ?? thread.threadType}
                              </span>
                              {thread.status !== "active" && thread.status !== "early" && (
                                <span className="text-[10px] font-mono text-muted-foreground/20">
                                  · {STATUS_LABELS[thread.status] ?? thread.status}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] font-mono text-muted-foreground/20 shrink-0 tabular-nums">
                            {timeAgo(thread.lastActivityAt?.toString())}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
