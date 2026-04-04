import React from "react";
import { Newspaper } from "lucide-react";
import type { AngleCluster } from "@shared/types";
import EmotionalRegisterChip from "./EmotionalRegisterChip";
import ArticleCard from "./ArticleCard";
import { useKeyboardNav } from "../hooks/useKeyboardNav";

interface AngleSpectrumProps {
  clusters: AngleCluster[];
  compact?: boolean;
}

const AngleSpectrum: React.FC<AngleSpectrumProps> = ({
  clusters,
  compact = false,
}) => {
  // Sort clusters by distinctiveness descending (most different first)
  const sortedClusters = [...clusters].sort(
    (a, b) => b.distinctiveness - a.distinctiveness,
  );

  // Calculate total article count for keyboard navigation
  const totalArticles = sortedClusters.reduce(
    (sum, cluster) => sum + cluster.articles.length,
    0,
  );

  const { handleKeyDown, isFocused } = useKeyboardNav(totalArticles);

  // Track a running index across all clusters for keyboard nav
  let globalIndex = 0;

  return (
    <div className="px-3 py-3 space-y-4" onKeyDown={handleKeyDown} tabIndex={0}>
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
        Other Perspectives
      </h2>

      {sortedClusters.map((cluster) => {
        // Sort articles within cluster by sentiment contrast (abs compound desc)
        const sortedArticles = [...cluster.articles].sort(
          (a, b) =>
            Math.abs(b.sentiment.compound) - Math.abs(a.sentiment.compound),
        );

        const distinctPercent = Math.round(cluster.distinctiveness * 100);

        return (
          <div key={cluster.id} className="space-y-2">
            {/* Cluster header */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {cluster.label}
              </h3>
              <span className="text-[10px] text-gray-400">
                {cluster.articles.length} article
                {cluster.articles.length !== 1 ? "s" : ""}
              </span>
              <EmotionalRegisterChip
                register={cluster.dominantRegister}
                size="sm"
              />
              {distinctPercent > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium">
                  {distinctPercent}% distinct
                </span>
              )}
            </div>

            {/* Article cards */}
            <div className="space-y-2">
              {sortedArticles.map((article, idx) => {
                const cardIndex = globalIndex++;
                return (
                  <ArticleCard
                    key={`${article.article.url}-${idx}`}
                    article={article}
                    compact={compact}
                    index={cardIndex}
                    isFocused={isFocused(cardIndex)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {sortedClusters.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 px-6 text-center border border-gray-100 dark:border-gray-800 rounded-lg mx-1">
          <Newspaper size={28} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
            No alternative perspectives found
          </p>
          <p className="text-xs text-gray-400 leading-relaxed max-w-[240px]">
            Try searching for a broader topic or check back later as more
            outlets cover this story.
          </p>
        </div>
      )}
    </div>
  );
};

export default AngleSpectrum;
