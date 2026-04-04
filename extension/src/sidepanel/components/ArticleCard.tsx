import React from "react";
import { ExternalLink } from "lucide-react";
import type { AnalyzedArticle } from "@shared/types";
import BiasLabel from "./BiasLabel";
import EmotionalRegisterChip from "./EmotionalRegisterChip";
import SentimentBar from "./SentimentBar";

interface ArticleCardProps {
  article: AnalyzedArticle;
  compact?: boolean;
}

const ArticleCard: React.FC<ArticleCardProps> = ({
  article,
  compact = false,
}) => {
  const { article: articleData, angle, sentiment, sourceBias } = article;
  const sourceName = sourceBias?.name || articleData.siteName || articleData.domain;

  const handleOpen = () => {
    chrome.tabs.create({ url: articleData.url });
  };

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3 hover:border-gray-200 transition-colors">
      {/* Source row */}
      <div className="flex items-center gap-2 mb-1.5">
        <img
          src={`https://www.google.com/s2/favicons?domain=${articleData.domain}&sz=16`}
          alt=""
          className="w-4 h-4 rounded-sm shrink-0"
          loading="lazy"
        />
        <span className="text-xs font-medium text-gray-600 truncate">
          {sourceName}
        </span>
        {sourceBias && (
          <BiasLabel biasRating={sourceBias.biasRating} size="sm" />
        )}
      </div>

      {/* Headline */}
      <button
        onClick={handleOpen}
        className="text-left text-sm font-medium text-gray-800 hover:text-blue-600 transition-colors leading-snug mb-1.5 line-clamp-2"
        title={articleData.headline}
      >
        {articleData.headline}
      </button>

      {!compact && (
        <>
          {/* Framing summary */}
          <p className="text-xs text-gray-500 leading-relaxed mb-2 line-clamp-2">
            {angle.headline_framing}
          </p>

          {/* Sentiment bar */}
          <div className="mb-2">
            <SentimentBar compound={sentiment.compound} />
          </div>
        </>
      )}

      {/* Bottom row */}
      <div className="flex items-center justify-between">
        <EmotionalRegisterChip register={angle.emotional_register} size="sm" />
        <button
          onClick={handleOpen}
          className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-500 hover:text-blue-700 transition-colors"
        >
          Read
          <ExternalLink size={10} />
        </button>
      </div>
    </div>
  );
};

export default ArticleCard;
