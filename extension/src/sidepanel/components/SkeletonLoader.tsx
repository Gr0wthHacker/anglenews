import React from "react";

// ─── Base Skeleton Pulse ────────────────────────────────────────────────────

interface SkeletonPulseProps {
  width?: string;
  height?: string;
  className?: string;
  rounded?: "sm" | "md" | "lg" | "full";
}

export const SkeletonPulse: React.FC<SkeletonPulseProps> = ({
  width = "w-full",
  height = "h-4",
  className = "",
  rounded = "md",
}) => {
  const roundedClass =
    rounded === "full"
      ? "rounded-full"
      : rounded === "lg"
        ? "rounded-lg"
        : rounded === "sm"
          ? "rounded-sm"
          : "rounded";

  return (
    <div
      className={`animate-pulse bg-gray-200 ${roundedClass} ${width} ${height} ${className}`}
    />
  );
};

// ─── Article Card Skeleton ──────────────────────────────────────────────────

export const ArticleCardSkeleton: React.FC = () => (
  <div className="bg-white border border-gray-100 rounded-lg p-3">
    {/* Source row: favicon circle + source name */}
    <div className="flex items-center gap-2 mb-1.5">
      <SkeletonPulse width="w-4" height="h-4" rounded="sm" />
      <SkeletonPulse width="w-24" height="h-3" />
      <SkeletonPulse width="w-14" height="h-4" rounded="full" />
    </div>

    {/* Headline: two lines */}
    <div className="space-y-1.5 mb-1.5">
      <SkeletonPulse width="w-full" height="h-3.5" />
      <SkeletonPulse width="w-3/4" height="h-3.5" />
    </div>

    {/* Framing text */}
    <div className="space-y-1 mb-2">
      <SkeletonPulse width="w-full" height="h-3" />
      <SkeletonPulse width="w-5/6" height="h-3" />
    </div>

    {/* Sentiment bar */}
    <SkeletonPulse width="w-full" height="h-2.5" rounded="full" className="mb-2" />

    {/* Bottom row: chip + link */}
    <div className="flex items-center justify-between">
      <SkeletonPulse width="w-16" height="h-5" rounded="full" />
      <SkeletonPulse width="w-10" height="h-3" />
    </div>
  </div>
);

// ─── Current Article Skeleton ───────────────────────────────────────────────

export const CurrentArticleSkeleton: React.FC = () => (
  <div className="bg-white border border-gray-100 rounded-lg mx-3 mt-3 overflow-hidden shadow-sm border-l-[3px] border-l-gray-300">
    <div className="px-3 pt-3 pb-2">
      {/* "You're Reading" label */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <SkeletonPulse width="w-3" height="h-3" rounded="full" />
        <SkeletonPulse width="w-20" height="h-2.5" />
      </div>

      {/* Source name + bias badge */}
      <div className="flex items-center gap-2 mb-2">
        <SkeletonPulse width="w-28" height="h-4" />
        <SkeletonPulse width="w-16" height="h-5" rounded="full" />
      </div>

      {/* Chips row */}
      <div className="flex items-center gap-1.5">
        <SkeletonPulse width="w-16" height="h-5" rounded="full" />
        <SkeletonPulse width="w-24" height="h-5" rounded="full" />
      </div>
    </div>

    {/* Details section */}
    <div className="px-3 pb-3 space-y-2">
      {/* Central Entity */}
      <div>
        <SkeletonPulse width="w-20" height="h-2.5" className="mb-1" />
        <SkeletonPulse width="w-32" height="h-3" />
      </div>

      {/* Framing */}
      <div>
        <SkeletonPulse width="w-14" height="h-2.5" className="mb-1" />
        <SkeletonPulse width="w-full" height="h-3" />
        <SkeletonPulse width="w-2/3" height="h-3" className="mt-1" />
      </div>

      {/* Causal Attribution */}
      <div>
        <SkeletonPulse width="w-28" height="h-2.5" className="mb-1" />
        <SkeletonPulse width="w-full" height="h-3" />
        <SkeletonPulse width="w-3/4" height="h-3" className="mt-1" />
      </div>
    </div>
  </div>
);

// ─── Cluster Skeleton ───────────────────────────────────────────────────────

interface ClusterSkeletonProps {
  cardCount?: number;
}

export const ClusterSkeleton: React.FC<ClusterSkeletonProps> = ({
  cardCount = 2,
}) => (
  <div className="space-y-2">
    {/* Cluster header: label + article count + chip */}
    <div className="flex items-center gap-2">
      <SkeletonPulse width="w-32" height="h-4" />
      <SkeletonPulse width="w-14" height="h-3" />
      <SkeletonPulse width="w-16" height="h-5" rounded="full" />
      <SkeletonPulse width="w-20" height="h-5" rounded="full" />
    </div>

    {/* Article cards */}
    <div className="space-y-2">
      {Array.from({ length: cardCount }, (_, i) => (
        <ArticleCardSkeleton key={i} />
      ))}
    </div>
  </div>
);

// ─── Dashboard Skeleton (full page) ────────────────────────────────────────

export const DashboardSkeleton: React.FC = () => (
  <div className="flex flex-col">
    {/* Current article skeleton (sticky area) */}
    <div className="bg-white pb-1 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06)]">
      <CurrentArticleSkeleton />
    </div>

    {/* Angle spectrum: section header + clusters */}
    <div className="px-3 py-3 space-y-4">
      <SkeletonPulse width="w-32" height="h-3" />

      <ClusterSkeleton cardCount={3} />
      <ClusterSkeleton cardCount={2} />
      <ClusterSkeleton cardCount={2} />
    </div>

    {/* Coverage gap alert skeleton */}
    <div className="mx-3 my-3 rounded-lg border border-gray-100 bg-gray-50 overflow-hidden p-3 space-y-2">
      <div className="flex items-center gap-2">
        <SkeletonPulse width="w-3.5" height="h-3.5" rounded="sm" />
        <SkeletonPulse width="w-36" height="h-3" />
      </div>
      <SkeletonPulse width="w-full" height="h-3" />
      <SkeletonPulse width="w-2/3" height="h-3" />
    </div>

    {/* Tone distribution bar skeleton */}
    <div className="mx-3 my-3">
      <SkeletonPulse width="w-28" height="h-3" className="mb-2" />
      <SkeletonPulse width="w-full" height="h-5" rounded="full" />
      <div className="flex gap-3 mt-2">
        <SkeletonPulse width="w-14" height="h-3" />
        <SkeletonPulse width="w-14" height="h-3" />
        <SkeletonPulse width="w-14" height="h-3" />
        <SkeletonPulse width="w-14" height="h-3" />
      </div>
    </div>
  </div>
);

export default DashboardSkeleton;
