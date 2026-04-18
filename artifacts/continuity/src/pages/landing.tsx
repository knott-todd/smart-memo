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

      {/* Hamburger */}
      <div className="px-4 pt-4">
        <button
          onClick={() => setDrawerOpen(true)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Main content — vertically centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4 pb-12">
        <button
          onClick={() => setLocation("/projects")}
          className="w-full max-w-sm bg-card border border-border/50 rounded-2xl flex items-center justify-center hover:border-primary/40 hover:bg-card/80 active:scale-[0.98] transition-all"
          style={{ height: "clamp(100px, 28vh, 180px)" }}
        >
          <span className="font-serif text-2xl text-foreground/80">My Projects</span>
        </button>

        <button
          onClick={() => setLocation("/dump")}
          className="w-full max-w-sm bg-card border border-border/50 rounded-2xl flex items-center justify-center hover:border-primary/40 hover:bg-card/80 active:scale-[0.98] transition-all"
          style={{ height: "clamp(100px, 28vh, 180px)" }}
        >
          <span className="font-serif text-2xl text-foreground/80">Brain Dump</span>
        </button>
      </div>
    </div>
  );
}