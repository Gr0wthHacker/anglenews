import React from "react";
import type { EmotionalRegister } from "@shared/types";
import { EMOTIONAL_REGISTERS } from "@shared/constants";

const REGISTER_COLORS: Record<EmotionalRegister, string> = {
  alarm: "#ef4444",
  neutral: "#6b7280",
  optimistic: "#22c55e",
  adversarial: "#f97316",
  empathetic: "#3b82f6",
  dismissive: "#a855f7",
};

const REGISTER_LABELS: Record<EmotionalRegister, string> = {
  alarm: "Alarm",
  neutral: "Neutral",
  optimistic: "Optimistic",
  adversarial: "Adversarial",
  empathetic: "Empathetic",
  dismissive: "Dismissive",
};

interface ToneDistributionBarProps {
  distribution: Record<EmotionalRegister, number>;
}

const ToneDistributionBar: React.FC<ToneDistributionBarProps> = ({
  distribution,
}) => {
  const total = Object.values(distribution).reduce((sum, v) => sum + v, 0);

  if (total === 0) return null;

  // Filter to only registers with nonzero counts, preserving order
  const activeRegisters = EMOTIONAL_REGISTERS.filter(
    (r) => distribution[r] > 0,
  );

  return (
    <div className="mx-3 my-3">
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
        Tone Distribution
      </h2>

      {/* Stacked bar */}
      <div
        className="flex h-5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700"
        role="img"
        aria-label={`Tone distribution: ${activeRegisters.map((r) => `${REGISTER_LABELS[r]} ${Math.round((distribution[r] / total) * 100)}%`).join(", ")}`}
      >
        {activeRegisters.map((register) => {
          const count = distribution[register];
          const pct = (count / total) * 100;
          return (
            <div
              key={register}
              className="transition-all duration-300 first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${pct}%`,
                backgroundColor: REGISTER_COLORS[register],
                minWidth: pct > 0 ? "4px" : "0",
              }}
              title={`${REGISTER_LABELS[register]}: ${count} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>

      {/* Labels */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {activeRegisters.map((register) => {
          const count = distribution[register];
          return (
            <div key={register} className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: REGISTER_COLORS[register] }}
              />
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                {REGISTER_LABELS[register]}
              </span>
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ToneDistributionBar;
