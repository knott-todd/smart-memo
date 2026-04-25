import { useState } from "react";
import { Menu } from "lucide-react";
import { SideDrawer } from "./side-drawer";

interface AppHeaderProps {
  title: string;
  right?: React.ReactNode;
}

export function AppHeader({ title, right }: AppHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <header className="sticky top-0 z-30 bg-background border-b border-border/40 h-14 flex items-center px-4">
        <button
          onClick={() => setDrawerOpen(true)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <span className="absolute left-1/2 -translate-x-1/2 font-serif text-base tracking-wide text-foreground">
          {title}
        </span>

        {right && (
          <div className="ml-auto">
            {right}
          </div>
        )}
      </header>
    </>
  );
}
