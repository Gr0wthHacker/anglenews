import React from "react";
import { ExternalLink } from "lucide-react";
import type { AnalyzedArticle } from "@shared/types";
import BiasLabel from "./BiasLabel";
import EmotionalRegisterChip from "./EmotionalRegisterChip";
import SentimentBar from "./SentimentBar";

interface ArticleCardProps {
  article: AnalyzedArticle;
  compact?: boolean;
  index?: number;
  isFocused?: boolean;
}

const ArticleCard: React.FC<ArticleCardProps> = ({
  article,
  compact = false,
  index,
  isFocused = false,
}) => {
  const { article: articleData, angle, sentiment, sourceBias } = article;
  const sourceName = sourceBias?.name || articleData.siteName || articleData.domain;

  const handleOpen = () => {
    chrome.tabs.create({ url: articleData.url });
  };

  return (
    <div
      data-card-index={index}
      className={`bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg p-3 hover:border-gray-200 dark:hover:border-gray-600 transition-colors ${isFocused ? "ring-2 ring-blue-500" : ""}`}
    >
      {/* Source row */}
      <div className="flex items-center gap-2 mb-1.5">
        <img
          src={`https://www.google.com/s2/favicons?domain=${articleData.domain}&sz=16`}
          alt=""
          className="w-4 h-4 rounded-sm shrink-0"
          loading="lazy"
        />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate">
          {sourceName}
        </span>
        {sourceBias && (
          <BiasLabel biasRating={sourceBias.biasRating} size="sm" />
        )}
      </div>

      {/* Headline */}
      <button
        onClick={handleOpen}
        className="text-left text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors leading-snug mb-1.5 line-clamp-2"
        title={articleData.headline}
      >
        {articleData.headline}
      </button>

      {!compact && (
        <>
          {/* Framing summary */}
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-2 line-clamp-2">
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
          aria-label={`Read article from ${sourceName}`}
        >
          Read
          <ExternalLink size={10} />
        </button>
      </div>
    </div>
  );
};

export default ArticleCard;
