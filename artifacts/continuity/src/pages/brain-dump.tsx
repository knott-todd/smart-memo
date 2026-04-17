import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Send, Mic, Loader2 } from "lucide-react";
import { useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { AppHeader } from "@/components/app-header";

interface HistoricalEntry {
  id: number;
  content: string;
  createdAt: string;
  projectId: number;
  projectTitle: string;
}

interface PendingEntry {
  tempId: string;
  content: string;
  timestamp: Date;
  resolved?: {
    projectId: number;
    projectTitle: string;
    isNew: boolean;
  };
  failed?: boolean;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchAllUpdates(): Promise<HistoricalEntry[]> {
  const res = await fetch(`${BASE}/api/updates`);
  if (!res.ok) return [];
  return res.json();
}

async function postBrainDump(content: string) {
  const res = await fetch(`${BASE}/api/brain-dump`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Failed to submit");
  return res.json() as Promise<{
    update: { id: number; content: string; createdAt: string };
    project: { id: number; title: string };
    isNew: boolean;
  }>;
}

export default function BrainDump() {
  const [history, setHistory] = useState<HistoricalEntry[]>([]);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const feedBottomRef = useRef<HTMLDivElement>(null);

  const { data: dashboard } = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const activeCount = (dashboard?.activeProjects ?? 0) + (dashboard?.coastingProjects ?? 0);

  useEffect(() => {
    fetchAllUpdates().then((data) => {
      setHistory(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, pending]);

  const handleSubmit = async () => {
    const content = input.trim();
    if (!content || submitting) return;

    const tempId = `temp-${Date.now()}`;
    setPending((prev) => [...prev, { tempId, content, timestamp: new Date() }]);
    setInput("");
    setSubmitting(true);

    try {
      const result = await postBrainDump(content);
      // Move from pending to history once resolved
      const newEntry: HistoricalEntry = {
        id: result.update.id,
        content: result.update.content,
        createdAt: result.update.createdAt,
        projectId: result.project.id,
        projectTitle: result.project.title,
      };
      setHistory((prev) => [...prev, newEntry]);
      setPending((prev) =>
        prev.map((e) =>
          e.tempId === tempId
            ? { ...e, resolved: { projectId: result.project.id, projectTitle: result.project.title, isNew: result.isNew } }
            : e
        )
      );
      // Remove pending entry after brief display of tag
      setTimeout(() => {
        setPending((prev) => prev.filter((e) => e.tempId !== tempId));
      }, 2500);
    } catch {
      setPending((prev) =>
        prev.map((e) => (e.tempId === tempId ? { ...e, failed: true } : e))
      );
      setTimeout(() => {
        setPending((prev) => prev.filter((e) => e.tempId !== tempId));
      }, 2000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isEmpty = !loading && history.length === 0 && pending.length === 0;

  return (
    <div className="flex flex-col h-screen bg-background">
      <AppHeader title="Brain Dump" />

      {activeCount > 0 && isEmpty && (
        <div className="px-4 pt-3">
          <Link href="/projects" className="inline-block text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
            You have {activeCount} active project{activeCount !== 1 ? "s" : ""}
          </Link>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-32 pt-4">
        {loading ? (
          <div className="flex items-center justify-center pt-20">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/30" />
          </div>
        ) : isEmpty ? (
          <div className="flex items-center justify-center h-full pb-24">
            <p className="text-muted-foreground/30 text-sm font-serif italic">Drop anything…</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <div key={entry.id} className="space-y-1">
                <div className="max-w-[85%] bg-card border border-border/40 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-foreground/90 leading-relaxed">
                  {entry.content}
                </div>
                <Link
                  href={`/projects/${entry.projectId}`}
                  className="inline-flex items-center ml-1 px-2.5 py-1 rounded-full text-[11px] text-muted-foreground/60 border border-border/30 hover:text-primary hover:border-primary/20 hover:bg-primary/5 transition-colors"
                >
                  {entry.projectTitle}
                </Link>
              </div>
            ))}

            {pending.map((entry) => (
              <div key={entry.tempId} className="space-y-1">
                <div className="max-w-[85%] bg-card border border-border/40 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-foreground/90 leading-relaxed opacity-60">
                  {entry.content}
                </div>
                {entry.resolved ? (
                  <Link
                    href={`/projects/${entry.resolved.projectId}`}
                    className="inline-flex items-center gap-1.5 ml-1 px-2.5 py-1 rounded-full text-[11px] text-primary border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors animate-in fade-in duration-300"
                  >
                    {entry.resolved.isNew
                      ? `New project: ${entry.resolved.projectTitle}`
                      : `Project updated: ${entry.resolved.projectTitle}`}
                  </Link>
                ) : entry.failed ? (
                  <span className="ml-1 text-[11px] text-destructive/60">Failed to save</span>
                ) : (
                  <div className="ml-1 h-5 w-32 bg-border/20 rounded-full animate-pulse" />
                )}
              </div>
            ))}
          </div>
        )}
        <div ref={feedBottomRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-8 pb-4 px-4">
        <div className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 focus-within:border-border/60 transition-colors">
          <button className="text-muted-foreground/30 hover:text-muted-foreground transition-colors shrink-0">
            <Mic className="w-4 h-4" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Drop anything…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/30 outline-none"
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || submitting}
            className="shrink-0 text-muted-foreground/40 hover:text-primary disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
