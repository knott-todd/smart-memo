import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import BrainDump from "@/pages/brain-dump";
import ProjectsCarousel from "@/pages/projects-carousel";
import ProjectDetail from "@/pages/project";
import NewProject from "@/pages/new-project";
import Onboarding from "@/pages/onboarding";
import { useEffect, useState } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ThemeWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return <>{children}</>;
}

function AppRoutes() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    setOnboarded(!!localStorage.getItem("continuity_onboarded"));
  }, []);

  if (onboarded === null) return null;

  if (!onboarded) {
    return <Onboarding />;
  }

  return (
    <Switch>
      <Route path="/" component={BrainDump} />
      <Route path="/projects" component={ProjectsCarousel} />
      <Route path="/projects/:id" component={ProjectDetail} />
      <Route path="/new" component={NewProject} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeWrapper>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRoutes />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeWrapper>
    </QueryClientProvider>
  );
}

export default App;
