import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";

const slides = [
  {
    headline: "Pick up where you left off.",
    sub: "Continuity gives you an honest briefing every time you return to a project.",
  },
  {
    headline: "Capture anything, anytime.",
    sub: "Type a thought, drop a note. No structure required.",
  },
  {
    headline: "We organize it into clear next steps.",
    sub: "AI reads your raw input and turns it into a briefing you can act on.",
  },
];

export default function Onboarding() {
  const [slide, setSlide] = useState(0);
  const [, setLocation] = useLocation();
  const isLast = slide === slides.length - 1;

  const handleStart = () => {
    localStorage.setItem("continuity_onboarded", "1");
    setLocation("/");
  };

  const handleNext = () => {
    if (isLast) {
      handleStart();
    } else {
      setSlide((s) => s + 1);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-background flex flex-col items-center justify-center z-50 select-none"
      onClick={handleNext}
    >
      <div className="max-w-sm w-full px-8 flex flex-col items-center text-center gap-10">
        <div className="space-y-4 transition-all duration-500">
          <h1 className="font-serif text-4xl leading-snug text-foreground">
            {slides[slide].headline}
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            {slides[slide].sub}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === slide
                  ? "w-6 bg-primary"
                  : i < slide
                  ? "w-2 bg-primary/40"
                  : "w-2 bg-border"
              }`}
            />
          ))}
        </div>

        {isLast ? (
          <button
            onClick={(e) => { e.stopPropagation(); handleStart(); }}
            className="px-8 py-3 bg-primary text-primary-foreground rounded-full font-medium text-sm tracking-wide transition-opacity hover:opacity-90"
          >
            Start
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); handleNext(); }}
            className="flex items-center gap-2 text-muted-foreground text-sm"
          >
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
