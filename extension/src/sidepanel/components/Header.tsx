import React from "react";
import { Settings, Minimize2, Maximize2 } from "lucide-react";
import type { AngleComparison } from "@shared/types";
import TopicSearch from "./TopicSearch";
import HistoryPanel from "./HistoryPanel";
import ShareButton from "./ShareButton";

interface HeaderProps {
  topic: string | null;
  isCompact: boolean;
  onToggleCompact: () => void;
  comparison?: AngleComparison | null;
  onLoadComparison?: (comparison: AngleComparison) => void;
  onSearch?: (topic: string) => void;
}

const Header: React.FC<HeaderProps> = ({ topic, isCompact, onToggleCompact, comparison, onLoadComparison, onSearch }) => {
  const handleOpenOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-20">
      <div className="flex items-center gap-2 min-w-0">
        {/* Logo */}
        <span
          className="text-base font-bold tracking-tight bg-clip-text text-transparent shrink-0"
          style={{
            backgroundImage: "linear-gradient(135deg, #2563eb, #7c3aed)",
          }}
        >
          AngleCheck
        </span>

        {/* Topic */}
        {topic && (
          <>
            <span className="text-gray-300 shrink-0">/</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate" title={topic}>
              {topic}
            </span>
          </>
        )}

        {onSearch && <TopicSearch onSearch={onSearch} />}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {onLoadComparison && (
          <HistoryPanel onLoadComparison={onLoadComparison} />
        )}
        {comparison && <ShareButton comparison={comparison} />}
        <button
          onClick={onToggleCompact}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          title={isCompact ? "Expand view" : "Compact view"}
        >
          {isCompact ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
        </button>
        <button
          onClick={handleOpenOptions}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          title="Settings"
        >
          <Settings size={14} />
        </button>
      </div>
    </div>
  );
};

export default Header;
