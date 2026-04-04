import React from "react";
import type { BiasRating } from "@shared/types";
import { BIAS_COLORS } from "@shared/constants";

const BIAS_LABELS: Record<BiasRating, string> = {
  "far-left": "Far Left",
  left: "Left",
  "left-center": "Lean Left",
  center: "Center",
  "right-center": "Lean Right",
  right: "Right",
  "far-right": "Far Right",
};

interface BiasLabelProps {
  biasRating: BiasRating;
  size?: "sm" | "md";
}

const BiasLabel: React.FC<BiasLabelProps> = ({ biasRating, size = "md" }) => {
  const color = BIAS_COLORS[biasRating];
  const label = BIAS_LABELS[biasRating];

  const sizeClasses =
    size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full whitespace-nowrap ${sizeClasses}`}
      style={{
        backgroundColor: `${color}18`,
        color: color,
        border: `1px solid ${color}40`,
      }}
      aria-label={`Bias rating: ${label}`}
    >
      {label}
    </span>
  );
};

export default BiasLabel;
