import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Send, Mic } from "lucide-react";
import { useListProjects, useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { AppHeader } from "@/components/app-header";

interface DumpEntry {
  id: string;
  content: string;
  timestamp: Date;
  tag?: {
    label: string;
    projectId: number;
  };
  pending?: boolean;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  const [entries, setEntries] = useState<DumpEntry[]>([]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedBottomRef = useRef<HTMLDivElement>(null);

  const { data: projects } = useListProjects();
  const { data: dashboard } = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });

  const activeCount = (dashboard?.activeProjects ?? 0) + (dashboard?.coastingProjects ?? 0);

  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  const handleSubmit = async () => {
    const content = input.trim();
    if (!content || submitting) return;

    const tempId = `temp-${Date.now()}`;
    setEntries((prev) => [
      ...prev,
      { id: tempId, content, timestamp: new Date(), pending: true },
    ]);
    setInput("");

    setSubmitting(true);
    try {
      const result = await postBrainDump(content);
      setEntries((prev) =>
        prev.map((e) =>
          e.id === tempId
            ? {
                ...e,
                pending: false,
                tag: {
                  label: result.isNew
                    ? `New project detected: ${result.project.title}`
                    : `Project updated: ${result.project.title}`,
                  projectId: result.project.id,
                },
              }
            : e
        )
      );
    } catch {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === tempId ? { ...e, pending: false } : e
        )
      );
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

  return (
    <div className="flex flex-col h-screen bg-background">
      <AppHeader title="Brain Dump" />

      {activeCount > 0 && entries.length === 0 && (
        <div className="px-4 pt-3">
          <Link href="/projects" className="inline-block text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
            You have {activeCount} active project{activeCount !== 1 ? "s" : ""}
          </Link>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-32 pt-4 space-y-1">
        {entries.map((entry) => (
          <div key={entry.id} className="space-y-1">
            <div
              className={`max-w-[85%] bg-card border border-border/40 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-foreground/90 leading-relaxed transition-opacity ${
                entry.pending ? "opacity-60" : "opacity-100"
              }`}
            >
              {entry.content}
            </div>
            {entry.tag && !entry.pending && (
              <Link
                href={`/projects/${entry.tag.projectId}`}
                className="inline-flex items-center gap-1.5 ml-1 px-2.5 py-1 rounded-full text-[11px] text-primary border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                {entry.tag.label}
              </Link>
            )}
            {entry.pending && (
              <div className="ml-1 h-4 w-36 bg-border/30 rounded-full animate-pulse" />
            )}
          </div>
        ))}
        <div ref={feedBottomRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-8 pb-4 px-4">
        <div className="flex items-center gap-2 bg-card border border-border rounded-2xl px-4 py-3 focus-within:border-border/80 transition-colors">
          <button className="text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0">
            <Mic className="w-4 h-4" />
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Drop anything…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || submitting}
            className="shrink-0 text-muted-foreground/50 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
