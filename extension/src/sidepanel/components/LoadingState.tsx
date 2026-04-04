import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  sourceCount?: number;
}

const STAGES = [
  "Extracting article",
  "Finding related coverage",
  "Analyzing angles across sources",
  "Clustering perspectives",
];

const LoadingState: React.FC<LoadingStateProps> = ({ sourceCount }) => {
  const [stageIndex, setStageIndex] = useState(0);
  const [dots, setDots] = useState("");

  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 400);
    return () => clearInterval(dotInterval);
  }, []);

  useEffect(() => {
    const stageInterval = setInterval(() => {
      setStageIndex((prev) => (prev < STAGES.length - 1 ? prev + 1 : prev));
    }, 2500);
    return () => clearInterval(stageInterval);
  }, []);

  const currentMessage =
    stageIndex === 2 && sourceCount
      ? `Analyzing angles across ${sourceCount} sources`
      : STAGES[stageIndex];

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-16">
      <div className="relative mb-6">
        <Loader2 size={40} className="text-blue-500 animate-spin" />
      </div>

      <p className="text-sm font-medium text-gray-700 text-center">
        {currentMessage}
        <span className="inline-block w-4 text-left">{dots}</span>
      </p>

      {/* Progress dots */}
      <div className="flex gap-1.5 mt-6">
        {STAGES.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i <= stageIndex
                ? "bg-blue-500 w-4"
                : "bg-gray-200 w-1.5"
            }`}
          />
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-6">
        This typically takes 5-15 seconds
      </p>
    </div>
  );
};

export default LoadingState;
