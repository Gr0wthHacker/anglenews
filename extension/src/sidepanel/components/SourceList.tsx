import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import type { AnalyzedArticle, BiasRating } from "@shared/types";
import { BIAS_RATING_ORDER } from "@shared/constants";
import BiasLabel from "./BiasLabel";
import EmotionalRegisterChip from "./EmotionalRegisterChip";

interface SourceListProps {
  articles: AnalyzedArticle[];
}

const biasOrder = (rating: BiasRating): number =>
  BIAS_RATING_ORDER.indexOf(rating);

const SourceList: React.FC<SourceListProps> = ({ articles }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);

  // Sort by bias spectrum (left to right), with null-bias articles at the end
  const sorted = useMemo(
    () =>
      [...articles].sort((a, b) => {
        const aOrder = a.sourceBias
          ? biasOrder(a.sourceBias.biasRating)
          : 999;
        const bOrder = b.sourceBias
          ? biasOrder(b.sourceBias.biasRating)
          : 999;
        return aOrder - bOrder;
      }),
    [articles],
  );

  const toggleExpanded = (url: string) => {
    setExpandedUrl((prev) => (prev === url ? null : url));
  };

  return (
    <div className="mx-3 my-3 border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-gray-400" />
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            All Sources ({articles.length})
          </span>
        </div>
        {isOpen ? (
          <ChevronDown size={14} className="text-gray-400" />
        ) : (
          <ChevronRight size={14} className="text-gray-400" />
        )}
      </button>

      {isOpen && (
        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {sorted.map((item) => {
            const { article, angle, sentiment, sourceBias } = item;
            const sourceName =
              sourceBias?.name || article.siteName || article.domain;
            const isExpanded = expandedUrl === article.url;

            return (
              <div key={article.url} className="bg-white dark:bg-gray-900">
                {/* Row */}
                <button
                  onClick={() => toggleExpanded(article.url)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown size={10} className="text-gray-300 shrink-0" />
                  ) : (
                    <ChevronRight size={10} className="text-gray-300 shrink-0" />
                  )}

                  <img
                    src={`https://www.google.com/s2/favicons?domain=${article.domain}&sz=16`}
                    alt=""
                    className="w-3.5 h-3.5 rounded-sm shrink-0"
                    loading="lazy"
                  />

                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1 min-w-0">
                    {sourceName}
                  </span>

                  {sourceBias && (
                    <BiasLabel biasRating={sourceBias.biasRating} size="sm" />
                  )}

                  {sourceBias && (
                    <span className="text-[10px] text-gray-400 shrink-0 capitalize">
                      {sourceBias.factualRating.replace("-", " ")}
                    </span>
                  )}

                  <span
                    className={`text-[10px] font-medium shrink-0 ${
                      sentiment.compound >= 0.25
                        ? "text-green-500"
                        : sentiment.compound <= -0.25
                          ? "text-red-500"
                          : "text-gray-400"
                    }`}
                  >
                    {sentiment.compound > 0 ? "+" : ""}
                    {sentiment.compound.toFixed(2)}
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-8 pb-3 space-y-2">
                    <div>
                      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                        Headline
                      </span>
                      <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">
                        {article.headline}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                        Framing
                      </span>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                        {angle.headline_framing}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                        Central Entity
                      </span>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        {angle.central_entity}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                        Causal Attribution
                      </span>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                        {angle.causal_attribution}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                        Solution Frame
                      </span>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                        {angle.solution_frame}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <EmotionalRegisterChip
                        register={angle.emotional_register}
                        size="sm"
                      />
                      <span className="text-[10px] text-gray-400">
                        Confidence: {Math.round(angle.confidence * 100)}%
                      </span>
                    </div>

                    {angle.key_omissions.length > 0 && (
                      <div>
                        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                          Key Omissions
                        </span>
                        <ul className="mt-0.5 space-y-0.5">
                          {angle.key_omissions.map((omission, i) => (
                            <li
                              key={i}
                              className="text-xs text-gray-500 flex items-start gap-1"
                            >
                              <span className="text-gray-300 mt-px">-</span>
                              {omission}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <button
                      onClick={() => chrome.tabs.create({ url: article.url })}
                      className="text-[10px] font-medium text-blue-500 hover:text-blue-700 transition-colors"
                    >
                      Open article in new tab
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SourceList;
