import { useState, useRef } from "react";
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

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [slide, setSlide] = useState(0);
  const isLast = slide === slides.length - 1;

  const touchStartX = useRef<number | null>(null);

  const handleStart = () => {
    localStorage.setItem("continuity_onboarded", "1");
    onComplete();
  };

  const goNext = () => {
    if (isLast) {
      handleStart();
    } else {
      setSlide((s) => s + 1);
    }
  };

  const goPrev = () => {
    if (slide > 0) setSlide((s) => s - 1);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) {
      if (delta > 0) {
        goNext();
      } else {
        goPrev();
      }
    }
    touchStartX.current = null;
  };

  return (
    <div
      className="fixed inset-0 bg-background flex flex-col items-center justify-center z-50 select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="max-w-sm w-full px-8 flex flex-col items-center text-center gap-10">
        <div key={slide} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
          <h1 className="font-serif text-4xl leading-snug text-foreground">
            {slides[slide].headline}
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            {slides[slide].sub}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
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
            onClick={handleStart}
            className="px-8 py-3 bg-primary text-primary-foreground rounded-full font-medium text-sm tracking-wide transition-opacity hover:opacity-90 active:opacity-75"
          >
            Start
          </button>
        ) : (
          <button
            onClick={goNext}
            className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground transition-colors"
          >
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
