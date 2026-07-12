import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/shadcn/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import slide1 from "@/assets/onboarding/slide1.png";
import slide2 from "@/assets/onboarding/slide2.png";
import slide3 from "@/assets/onboarding/Slide3.png";
import slide4 from "@/assets/onboarding/Slide4.png";
import slide5 from "@/assets/onboarding/Slide5.png";

const slides = [
  {
    title: "Use mouse wheel to move, Ctrl + scroll to zoom",
    image: slide1,
  },
  {
    title: "Right click anywhere to add a block",
    image: slide2,
  },
  {
    title: "Top left corner to open the sidebar",
    image: slide3,
  },
  {
    title:
      "Left click on a block to select it - Right click for menu - Double click to open/edit",
    image: slide4,
  },
  {
    title: "Click and drag from a handle to connect blocks",
    image: slide5,
  },
];

export default function OnboardingModal() {
  const shouldShow = localStorage.getItem("hasSeenOnboarding") !== "true";
  const [isOpen, setIsOpen] = useState(shouldShow);
  const [currentSlide, setCurrentSlide] = useState(0);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem("hasSeenOnboarding", "true");
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Welcome to Nolënor !</DialogTitle>
          <DialogDescription>
            Here's a quick tour to get you started.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {/* Image + title, re-animated on each slide change */}
          <div key={currentSlide} className="contents">
            <div className="flex justify-center animate-appear">
              <img
                src={slides[currentSlide].image}
                alt={`Slide ${currentSlide + 1}`}
                className="max-w-full h-auto rounded-lg"
              />
            </div>

            <h3 className="text-center text-lg font-semibold animate-appear-up">
              {slides[currentSlide].title}
            </h3>
          </div>

          {/* Progress indicator */}
          <div className="flex justify-center gap-1">
            {slides.map((_, index) => (
              <div
                key={index}
                className={`h-2 w-2 rounded-full transition-all ${
                  index === currentSlide ? "bg-primary w-8" : "bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentSlide === 0}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>

            <Button variant="ghost" onClick={handleSkip}>
              Skip
            </Button>

            <Button onClick={handleNext}>
              {currentSlide === slides.length - 1 ? "Done" : "Next"}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
