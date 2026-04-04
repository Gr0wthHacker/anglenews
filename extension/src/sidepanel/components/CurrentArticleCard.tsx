import React from "react";
import { Eye } from "lucide-react";
import type { AnalyzedArticle } from "@shared/types";
import { BIAS_COLORS } from "@shared/constants";
import BiasLabel from "./BiasLabel";
import EmotionalRegisterChip from "./EmotionalRegisterChip";

interface CurrentArticleCardProps {
  article: AnalyzedArticle;
  compact?: boolean;
}

const CurrentArticleCard: React.FC<CurrentArticleCardProps> = ({
  article,
  compact = false,
}) => {
  const { article: articleData, angle, sourceBias } = article;

  const borderColor = sourceBias
    ? BIAS_COLORS[sourceBias.biasRating]
    : "#9e9e9e";

  const confidenceColor =
    angle.confidence >= 0.7
      ? "#22c55e"
      : angle.confidence >= 0.4
        ? "#eab308"
        : "#ef4444";

  const confidenceLabel =
    angle.confidence >= 0.7
      ? "High"
      : angle.confidence >= 0.4
        ? "Medium"
        : "Low";

  const sourceName = sourceBias?.name || articleData.siteName || articleData.domain;

  return (
    <div
      className="bg-white border border-gray-100 rounded-lg mx-3 mt-3 overflow-hidden shadow-sm"
      style={{ borderLeftWidth: "3px", borderLeftColor: borderColor }}
    >
      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Eye size={12} className="text-gray-400 shrink-0" />
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
            You're Reading
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-sm font-semibold text-gray-800">
            {sourceName}
          </span>
          {sourceBias && <BiasLabel biasRating={sourceBias.biasRating} size="sm" />}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <EmotionalRegisterChip register={angle.emotional_register} size="sm" />
          <span
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500"
            title={`Confidence: ${Math.round(angle.confidence * 100)}%`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: confidenceColor }}
            />
            {confidenceLabel} confidence
          </span>
        </div>
      </div>

      {/* Details */}
      {!compact && (
        <div className="px-3 pb-3 space-y-2">
          {/* Central Entity */}
          <div>
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              Central Entity
            </span>
            <p className="text-xs text-gray-700 mt-0.5">
              {angle.central_entity}
            </p>
          </div>

          {/* Headline Framing */}
          <div>
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              Framing
            </span>
            <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">
              {angle.headline_framing}
            </p>
          </div>

          {/* Causal Attribution */}
          <div>
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              Causal Attribution
            </span>
            <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">
              {angle.causal_attribution}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CurrentArticleCard;
