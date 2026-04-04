import React from "react";
import {
  AlertTriangle,
  Minus,
  TrendingUp,
  Swords,
  Heart,
  Ban,
} from "lucide-react";
import type { EmotionalRegister } from "@shared/types";

const REGISTER_CONFIG: Record<
  EmotionalRegister,
  { color: string; label: string; Icon: React.FC<{ size?: number }> }
> = {
  alarm: { color: "#ef4444", label: "Alarm", Icon: AlertTriangle },
  neutral: { color: "#6b7280", label: "Neutral", Icon: Minus },
  optimistic: { color: "#22c55e", label: "Optimistic", Icon: TrendingUp },
  adversarial: { color: "#f97316", label: "Adversarial", Icon: Swords },
  empathetic: { color: "#3b82f6", label: "Empathetic", Icon: Heart },
  dismissive: { color: "#a855f7", label: "Dismissive", Icon: Ban },
};

interface EmotionalRegisterChipProps {
  register: EmotionalRegister;
  size?: "sm" | "md";
}

const EmotionalRegisterChip: React.FC<EmotionalRegisterChipProps> = ({
  register,
  size = "md",
}) => {
  const config = REGISTER_CONFIG[register];
  const { color, label, Icon } = config;

  const sizeClasses =
    size === "sm" ? "text-[10px] px-1.5 py-0.5 gap-0.5" : "text-xs px-2 py-0.5 gap-1";
  const iconSize = size === "sm" ? 10 : 12;

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full whitespace-nowrap ${sizeClasses}`}
      style={{
        backgroundColor: `${color}15`,
        color: color,
        border: `1px solid ${color}30`,
      }}
      aria-label={`Emotional register: ${label}`}
    >
      <Icon size={iconSize} />
      {label}
    </span>
  );
};

export default EmotionalRegisterChip;
