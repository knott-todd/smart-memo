import { useLocation } from "wouter";
import { useState } from "react";
import { SideDrawer } from "@/components/side-drawer";
import { Menu } from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-background">
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="px-4 pt-4">
        <button
          onClick={() => setDrawerOpen(true)}
          className="text-muted-foreground/40 hover:text-foreground transition-colors p-1 -ml-1"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 gap-2.5 pb-10">
        <p className="font-serif text-muted-foreground/20 text-xs tracking-widest uppercase mb-5 select-none">
          Continuity
        </p>

        {[
          { label: "Now", sub: "What to do today", path: "/now" },
          { label: "Log", sub: "Drop anything", path: "/dump" },
          { label: "Threads", sub: "Everything you've noted", path: "/projects" },
        ].map(({ label, sub, path }) => (
          <button
            key={path}
            onClick={() => setLocation(path)}
            className="w-full max-w-sm bg-card border border-border/40 rounded-2xl flex flex-col items-start justify-end hover:border-border/70 active:scale-[0.99] transition-all px-5"
            style={{ height: "clamp(80px, 18vh, 130px)" }}
          >
            <span className="font-serif text-xl text-foreground/75 mb-0.5">{label}</span>
            <span className="text-xs text-muted-foreground/25 mb-4">{sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
