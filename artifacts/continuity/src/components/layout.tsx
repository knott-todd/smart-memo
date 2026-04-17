import { Link, useLocation } from "wouter";
import { BookOpen } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border/40 sticky top-0 z-10 bg-background/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between px-6 h-16">
          <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <BookOpen className="w-5 h-5 text-primary" />
            <span className="font-serif text-lg tracking-wide">Continuity</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link 
              href="/" 
              className={`text-sm tracking-wide transition-colors ${location === "/" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Dashboard
            </Link>
            <Link 
              href="/new" 
              className={`text-sm tracking-wide transition-colors ${location === "/new" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              New Project
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-12">
        {children}
      </main>
    </div>
  );
}
