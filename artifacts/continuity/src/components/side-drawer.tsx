import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { X, Inbox, FolderOpen, Home } from "lucide-react";
import { useListProjects, useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SideDrawer({ open, onClose }: SideDrawerProps) {
  const [location] = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);
  const { data: projects } = useListProjects();
  const { data: dashboard } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey() }
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => { onClose(); }, [location]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}
      <div
        ref={drawerRef}
        className={`fixed top-0 left-0 h-full w-72 bg-card border-r border-border z-50 flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-border/50">
          <span className="font-serif text-sm text-muted-foreground tracking-wide">Continuity</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <Link
            href="/"
            className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
              location === "/" ? "text-foreground bg-secondary/50" : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
            }`}
          >
            <Home className="w-4 h-4 shrink-0" />
            Home
          </Link>

          <Link
            href="/dump"
            className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
              location === "/dump" ? "text-foreground bg-secondary/50" : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
            }`}
          >
            <Inbox className="w-4 h-4 shrink-0" />
            Brain Dump
          </Link>

          <Link
            href="/projects"
            className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
              location === "/projects" ? "text-foreground bg-secondary/50" : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
            }`}
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            My Projects
            {dashboard && (
              <span className="ml-auto text-xs text-muted-foreground/40">{dashboard.totalProjects}</span>
            )}
          </Link>

          {projects && projects.length > 0 && (
            <div className="mt-4 px-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/35 mb-2">Recent</p>
              {projects.slice(0, 6).map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="flex items-center gap-2 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
                >
                  <span className="w-1 h-1 rounded-full shrink-0 bg-muted-foreground/30" />
                  {p.title}
                </Link>
              ))}
            </div>
          )}
        </nav>
      </div>
    </>
  );
}