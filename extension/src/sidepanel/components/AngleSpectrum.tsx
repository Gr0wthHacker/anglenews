import React from "react";
import type { AngleCluster } from "@shared/types";
import EmotionalRegisterChip from "./EmotionalRegisterChip";
import ArticleCard from "./ArticleCard";

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

  return (
    <div className="px-3 py-3 space-y-4">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
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
              <h3 className="text-sm font-semibold text-gray-700">
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
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">
                  {distinctPercent}% distinct
                </span>
              )}
            </div>

            {/* Article cards */}
            <div className="space-y-2">
              {sortedArticles.map((article, idx) => (
                <ArticleCard
                  key={`${article.article.url}-${idx}`}
                  article={article}
                  compact={compact}
                />
              ))}
            </div>
          </div>
        );
      })}

      {sortedClusters.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-6">
          No alternative perspectives found yet.
        </p>
      )}
    </div>
  );
};

export default AngleSpectrum;
