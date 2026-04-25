import { useLocation } from "wouter";
import { Menu } from "lucide-react";
import { useState } from "react";
import { SideDrawer } from "@/components/side-drawer";

export default function Landing() {
  const [, setLocation] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-background">
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="px-4 pt-4">
        <button
          onClick={() => setDrawerOpen(true)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-3 pb-12">
        {/* App name */}
        <p className="font-serif text-muted-foreground/25 text-sm tracking-widest uppercase mb-4 select-none">
          Continuity
        </p>

        <button
          onClick={() => setLocation("/dump")}
          className="w-full max-w-sm bg-card border border-border/50 rounded-2xl flex flex-col items-start justify-end hover:border-border/80 active:scale-[0.98] transition-all px-6"
          style={{ height: "clamp(100px, 26vh, 170px)" }}
        >
          <span className="font-serif text-2xl text-foreground/75 mb-1.5">Log</span>
          <span className="text-xs text-muted-foreground/25 mb-5 leading-snug">
            Drop anything — thought, update, idea
          </span>
        </button>

        <button
          onClick={() => setLocation("/projects")}
          className="w-full max-w-sm bg-card border border-border/50 rounded-2xl flex flex-col items-start justify-end hover:border-border/80 active:scale-[0.98] transition-all px-6"
          style={{ height: "clamp(100px, 26vh, 170px)" }}
        >
          <span className="font-serif text-2xl text-foreground/75 mb-1.5">Threads</span>
          <span className="text-xs text-muted-foreground/25 mb-5 leading-snug">
            Everything you've logged, organised
          </span>
        </button>
      </div>
    </div>
  );
}
