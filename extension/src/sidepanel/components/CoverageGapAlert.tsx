import React, { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { CoverageGap } from "@shared/types";

interface CoverageGapAlertProps {
  gaps: CoverageGap[];
  currentSourceName: string;
}

const CoverageGapAlert: React.FC<CoverageGapAlertProps> = ({
  gaps,
  currentSourceName,
}) => {
  const [expandedGaps, setExpandedGaps] = useState<Set<number>>(new Set());

  if (gaps.length === 0) return null;

  const toggleGap = (index: number) => {
    setExpandedGaps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="mx-3 my-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 overflow-hidden" role="alert">
      {/* Header */}
      <div className="flex items-start gap-2 px-3 pt-3 pb-2">
        <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            Coverage Gaps Detected
          </p>
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
            {currentSourceName} doesn't mention:
          </p>
        </div>
      </div>

      {/* Gap list */}
      <div className="px-3 pb-3 space-y-1.5">
        {gaps.map((gap, index) => {
          const isExpanded = expandedGaps.has(index);

          return (
            <div key={index} className="rounded-md bg-white/60 dark:bg-gray-800/60 border border-amber-100 dark:border-amber-800/50">
              <button
                onClick={() => toggleGap(index)}
                className="w-full flex items-start gap-2 px-2.5 py-2 text-left"
              >
                {isExpanded ? (
                  <ChevronDown size={12} className="text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <ChevronRight size={12} className="text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                    {gap.description}
                  </p>
                  <p className="text-[10px] text-amber-500 mt-0.5">
                    {gap.mentionedBy.length} other outlet
                    {gap.mentionedBy.length !== 1 ? "s" : ""} cover this
                  </p>
                </div>
              </button>

              {isExpanded && (
                <div className="px-7 pb-2">
                  <p className="text-[10px] font-medium text-gray-400 mb-1">
                    Covered by:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {gap.mentionedBy.map((source) => (
                      <span
                        key={source}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-800/40 text-amber-700 dark:text-amber-300"
                      >
                        {source}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CoverageGapAlert;
