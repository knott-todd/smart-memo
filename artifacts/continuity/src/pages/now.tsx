import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, RefreshCw } from "lucide-react";
import { AppHeader } from "@/components/app-header";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Todo {
  content: string;
  priority: "urgent" | "active" | "deferred";
  projectId: number;
  projectTitle: string;
  threadType: string;
  sourceUpdateId: number;
  appearedCount: number;
}

interface NowData {
  urgent: Todo[];
  active: Todo[];
  deferred: Todo[];
}

async function fetchNow(): Promise<NowData> {
  const res = await fetch(`${BASE}/api/now`);
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

function TodoItem({ todo, onNavigate }: { todo: Todo; onNavigate: (id: number) => void }) {
  const isProject = todo.threadType === "project";
  return (
    <div className="flex items-start gap-3 py-2.5 group">
      <div className="w-3.5 h-3.5 mt-0.5 shrink-0 rounded border border-border/40 group-hover:border-border/70 transition-colors" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground/80 leading-relaxed">{todo.content}</p>
        {isProject ? (
          <button
            onClick={() => onNavigate(todo.projectId)}
            className="text-[11px] font-mono text-muted-foreground/25 hover:text-muted-foreground/50 mt-0.5 transition-colors block"
          >
            ↳ {todo.projectTitle}
          </button>
        ) : (
          <span className="text-[11px] font-mono text-muted-foreground/20 mt-0.5 block">
            ↳ {todo.projectTitle}
          </span>
        )}
        {todo.appearedCount > 1 && (
          <span className="text-[10px] text-muted-foreground/20 font-mono">
            noted {todo.appearedCount}×
          </span>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  todos,
  onNavigate,
  empty,
}: {
  title: string;
  todos: Todo[];
  onNavigate: (id: number) => void;
  empty?: string;
}) {
  if (todos.length === 0 && !empty) return null;
  return (
    <div className="mb-6">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/25 font-medium mb-1 px-4 select-none">
        {title}
      </p>
      <div className="px-4">
        {todos.length === 0 ? (
          <p className="text-sm text-muted-foreground/25 py-2 font-serif italic">{empty}</p>
        ) : (
          todos.map((t, i) => (
            <TodoItem key={`${t.sourceUpdateId}-${i}`} todo={t} onNavigate={onNavigate} />
          ))
        )}
      </div>
    </div>
  );
}

export default function Now() {
  const [data, setData] = useState<NowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [, setLocation] = useLocation();

  const load = () => {
    setLoading(true);
    setError(false);
    fetchNow()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const isEmpty =
    data && data.urgent.length === 0 && data.active.length === 0 && data.deferred.length === 0;

  return (
    <div className="flex flex-col h-screen bg-background">
      <AppHeader
        title="Now"
        right={
          <button
            onClick={load}
            disabled={loading}
            className="text-muted-foreground/30 hover:text-muted-foreground transition-colors disabled:opacity-20"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto pt-4">
        {loading ? (
          <div className="flex justify-center pt-16">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/20" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center pt-16 gap-3 px-8 text-center">
            <p className="text-muted-foreground/40 text-sm font-serif italic">
              Couldn't extract tasks.
            </p>
            <button onClick={load} className="text-xs text-muted-foreground/30 hover:text-muted-foreground transition-colors">
              Try again
            </button>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-[60vh] px-8 text-center gap-2">
            <p className="text-muted-foreground/30 text-base font-serif italic">Nothing on the list.</p>
            <p className="text-muted-foreground/20 text-sm">Log something in the feed.</p>
            <button
              onClick={() => setLocation("/dump")}
              className="mt-2 text-sm text-foreground/30 hover:text-foreground/60 transition-colors"
            >
              Go to Log
            </button>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto pb-8">
            <Section title="Urgent" todos={data!.urgent} onNavigate={(id) => setLocation(`/projects/${id}`)} />
            <Section
              title="Active"
              todos={data!.active}
              onNavigate={(id) => setLocation(`/projects/${id}`)}
              empty="Nothing flagged as active."
            />
            {data!.deferred.length > 0 && (
              <Section
                title="Deferred"
                todos={data!.deferred}
                onNavigate={(id) => setLocation(`/projects/${id}`)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
