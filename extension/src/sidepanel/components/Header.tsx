import React from "react";
import { Settings, Minimize2, Maximize2 } from "lucide-react";

interface HeaderProps {
  topic: string | null;
  compact: boolean;
  onToggleCompact: () => void;
}

const Header: React.FC<HeaderProps> = ({ topic, compact, onToggleCompact }) => {
  const handleOpenOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-white sticky top-0 z-20">
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
            <span className="text-xs text-gray-500 truncate" title={topic}>
              {topic}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onToggleCompact}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          title={compact ? "Expand view" : "Compact view"}
        >
          {compact ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
        </button>
        <button
          onClick={handleOpenOptions}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          title="Settings"
        >
          <Settings size={14} />
        </button>
      </div>
    </div>
  );
};

export default Header;
