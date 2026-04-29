import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { X, AlignLeft, FolderOpen, Sun } from "lucide-react";
import { useListProjects, useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SideDrawer({ open, onClose }: SideDrawerProps) {
  const [location] = useLocation();
  const { data: threads } = useListProjects();
  const { data: dashboard } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey() },
  });

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  // Close on route change
  useEffect(() => { onClose(); }, [location]);

  const navLink = (
    href: string,
    label: string,
    Icon: React.ElementType,
    badge?: number
  ) => {
    const active = location === href;
    return (
      <Link
        href={href}
        className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
          active
            ? "text-foreground bg-muted/20"
            : "text-muted-foreground/50 hover:text-foreground hover:bg-muted/10"
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {label}
        {badge !== undefined && badge > 0 && (
          <span className="ml-auto text-xs text-muted-foreground/25 tabular-nums">{badge}</span>
        )}
      </Link>
    );
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-background/50 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed top-0 left-0 h-full w-60 bg-card border-r border-border/40 z-50 flex flex-col transition-transform duration-250 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-border/20 shrink-0">
          <span className="font-serif text-sm text-muted-foreground/25 tracking-widest uppercase select-none">
            Continuity
          </span>
          <button
            onClick={onClose}
            className="text-muted-foreground/30 hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {navLink("/", "Home", Sun)}
          {navLink("/now", "Now", Sun)}
          {navLink("/dump", "Log", AlignLeft)}
          {navLink("/projects", "Threads", FolderOpen, dashboard?.totalProjects)}

          {threads && threads.length > 0 && (
            <div className="mt-4 px-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/20 mb-1.5 select-none">
                Recent
              </p>
              {threads.slice(0, 8).map((t) => (
                <Link
                  key={t.id}
                  href={`/projects/${t.id}`}
                  className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground/30 hover:text-foreground/70 transition-colors truncate"
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
