import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { X, ScrollText, Layers, Home } from "lucide-react";
import { useListProjects, useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SideDrawer({ open, onClose }: SideDrawerProps) {
  const [location] = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);
  const { data: threads } = useListProjects();
  const { data: dashboard } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey() },
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => { onClose(); }, [location]);

  const navLink = (href: string, label: string, Icon: React.ElementType, badge?: number) => {
    const active = location === href;
    return (
      <Link
        href={href}
        className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
          active
            ? "text-foreground bg-secondary/50"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {label}
        {badge !== undefined && (
          <span className="ml-auto text-xs text-muted-foreground/30">{badge}</span>
        )}
      </Link>
    );
  };

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
        className={`fixed top-0 left-0 h-full w-64 bg-card border-r border-border/50 z-50 flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-border/30">
          <span className="font-serif text-sm text-muted-foreground/50 tracking-widest uppercase select-none">
            Continuity
          </span>
          <button
            onClick={onClose}
            className="text-muted-foreground/40 hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {navLink("/", "Home", Home)}
          {navLink("/dump", "Log", ScrollText)}
          {navLink(
            "/projects",
            "Threads",
            Layers,
            dashboard?.totalProjects
          )}

          {threads && threads.length > 0 && (
            <div className="mt-5 px-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/25 mb-2 select-none">
                Recent
              </p>
              {threads.slice(0, 7).map((t) => (
                <Link
                  key={t.id}
                  href={`/projects/${t.id}`}
                  className="flex items-center gap-2 py-2 text-xs text-muted-foreground/40 hover:text-foreground/80 transition-colors truncate"
                >
                  <span className="w-1 h-1 rounded-full shrink-0 bg-muted-foreground/20" />
                  {t.title}
                </Link>
              ))}
            </div>
          )}
        </nav>
      </div>
    </>
  );
}
