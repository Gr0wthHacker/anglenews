import React from "react";

interface SentimentBarProps {
  compound: number; // -1 to 1
}

const SentimentBar: React.FC<SentimentBarProps> = ({ compound }) => {
  // Map compound from [-1, 1] to [0, 100] for positioning
  const position = ((compound + 1) / 2) * 100;

  let label: string;
  if (compound <= -0.25) {
    label = "Negative";
  } else if (compound >= 0.25) {
    label = "Positive";
  } else {
    label = "Neutral";
  }

  return (
    <div className="w-full">
      <div className="relative h-2.5 rounded-full overflow-hidden bg-gray-100">
        {/* Gradient bar */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "linear-gradient(to right, #ef4444 0%, #d1d5db 50%, #22c55e 100%)",
          }}
        />
        {/* Marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-gray-900"
          style={{ left: `${position}%`, transform: "translateX(-50%)" }}
        />
        {/* Triangle marker above */}
        <div
          className="absolute -top-1 w-0 h-0"
          style={{
            left: `${position}%`,
            transform: "translateX(-50%)",
            borderLeft: "4px solid transparent",
            borderRight: "4px solid transparent",
            borderTop: "4px solid #1f2937",
          }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-gray-400">Negative</span>
        <span className="text-[10px] font-medium text-gray-600">{label}</span>
        <span className="text-[9px] text-gray-400">Positive</span>
      </div>
    </div>
  );
};

export default SentimentBar;
