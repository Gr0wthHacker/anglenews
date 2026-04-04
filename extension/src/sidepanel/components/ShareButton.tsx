import React, { useState, useRef, useEffect } from "react";
import { Share2, Copy, FileText, ExternalLink, Check } from "lucide-react";
import type { AngleComparison } from "@shared/types";

interface ShareButtonProps {
  comparison: AngleComparison;
}

const ShareButton: React.FC<ShareButtonProps> = ({ comparison }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), 2000);
    }
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [toast]);

  const showToast = (message: string) => {
    setToast(message);
    setIsOpen(false);
  };

  const handleCopyText = async () => {
    const text = generatePlainTextSummary(comparison);
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!");
  };

  const handleCopyMarkdown = async () => {
    const md = generateMarkdownSummary(comparison);
    await navigator.clipboard.writeText(md);
    showToast("Copied to clipboard!");
  };

  const handleOpenInTab = () => {
    const html = generateStandaloneHTML(comparison);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    chrome.tabs.create({ url });
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        title="Share comparison"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Share2 size={14} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
          <button
            onClick={handleCopyText}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors text-left"
          >
            <Copy size={13} className="text-gray-400 shrink-0" />
            Copy summary to clipboard
          </button>
          <button
            onClick={handleCopyMarkdown}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors text-left"
          >
            <FileText size={13} className="text-gray-400 shrink-0" />
            Copy as Markdown
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={handleOpenInTab}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors text-left"
          >
            <ExternalLink size={13} className="text-gray-400 shrink-0" />
            Open in new tab
          </button>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-2 bg-gray-800 text-white text-xs font-medium rounded-lg shadow-lg animate-fade-in">
          <Check size={12} className="text-green-400 shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
};

// ─── Text Summary Generator ─────────────────────────────────────────────────

function generatePlainTextSummary(data: AngleComparison): string {
  const { topic, currentArticle, clusters, coverageGaps, totalSourcesAnalyzed } = data;
  const currentSource =
    currentArticle.sourceBias?.name ||
    currentArticle.article.siteName ||
    currentArticle.article.domain;
  const currentBias = currentArticle.sourceBias?.biasRating
    ? ` (${formatBiasLabel(currentArticle.sourceBias.biasRating)})`
    : "";

  const lines: string[] = [];
  lines.push(
    `AngleCheck: "${topic}" — ${totalSourcesAnalyzed} sources analyzed`,
  );
  lines.push("");
  lines.push(
    `You read: ${currentArticle.article.headline} on ${currentSource}${currentBias}`,
  );
  lines.push(`Framing: ${currentArticle.angle.headline_framing}`);
  lines.push("");

  lines.push(`${clusters.length} distinct angle${clusters.length !== 1 ? "s" : ""} found:`);
  clusters.forEach((cluster, i) => {
    const sources = cluster.articles
      .map(
        (a) =>
          a.sourceBias?.name || a.article.siteName || a.article.domain,
      )
      .join(", ");
    lines.push(
      `${i + 1}. ${cluster.label} (${cluster.articles.length} source${cluster.articles.length !== 1 ? "s" : ""}): ${sources}`,
    );
  });

  if (coverageGaps.length > 0) {
    lines.push("");
    lines.push(
      `Coverage gaps: ${coverageGaps.map((g) => g.description).join("; ")} (missing from ${currentSource})`,
    );
  }

  return lines.join("\n");
}

// ─── Markdown Summary Generator ─────────────────────────────────────────────

function generateMarkdownSummary(data: AngleComparison): string {
  const { topic, currentArticle, clusters, coverageGaps, totalSourcesAnalyzed } = data;
  const currentSource =
    currentArticle.sourceBias?.name ||
    currentArticle.article.siteName ||
    currentArticle.article.domain;
  const currentBias = currentArticle.sourceBias?.biasRating
    ? ` (${formatBiasLabel(currentArticle.sourceBias.biasRating)})`
    : "";

  const lines: string[] = [];
  lines.push(`# AngleCheck: "${topic}"`);
  lines.push(`> ${totalSourcesAnalyzed} sources analyzed`);
  lines.push("");
  lines.push("## Your Article");
  lines.push(
    `**[${currentArticle.article.headline}](${currentArticle.article.url})** on ${currentSource}${currentBias}`,
  );
  lines.push("");
  lines.push(`*Framing:* ${currentArticle.angle.headline_framing}`);
  lines.push("");
  lines.push(
    `## ${clusters.length} Distinct Angle${clusters.length !== 1 ? "s" : ""}`,
  );

  clusters.forEach((cluster, i) => {
    const sources = cluster.articles
      .map(
        (a) =>
          a.sourceBias?.name || a.article.siteName || a.article.domain,
      )
      .join(", ");
    lines.push(
      `${i + 1}. **${cluster.label}** (${cluster.articles.length} source${cluster.articles.length !== 1 ? "s" : ""}): ${sources}`,
    );
  });

  if (coverageGaps.length > 0) {
    lines.push("");
    lines.push("## Coverage Gaps");
    coverageGaps.forEach((gap) => {
      lines.push(`- ${gap.description} (missing from ${currentSource})`);
    });
  }

  lines.push("");
  lines.push("---");
  lines.push("*Generated by AngleCheck*");

  return lines.join("\n");
}

// ─── Standalone HTML Page ───────────────────────────────────────────────────

function generateStandaloneHTML(data: AngleComparison): string {
  const md = generateMarkdownSummary(data);
  // Convert the markdown to simple HTML
  const htmlBody = md
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/^---$/gm, "<hr>")
    .replace(/\*\*\[(.+?)\]\((.+?)\)\*\*/g, '<a href="$2"><strong>$1</strong></a>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : line.startsWith("<") ? line : `<p>${line}</p>`))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AngleCheck — ${escapeHtml(data.topic)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 680px; margin: 40px auto; padding: 0 20px; color: #1f2937; line-height: 1.6; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; background: linear-gradient(135deg, #2563eb, #7c3aed); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    h2 { font-size: 1.1rem; margin-top: 24px; margin-bottom: 8px; color: #374151; }
    blockquote { color: #6b7280; font-size: 0.875rem; margin-bottom: 16px; padding-left: 12px; border-left: 3px solid #e5e7eb; }
    p { margin-bottom: 8px; font-size: 0.9375rem; }
    li { margin-left: 20px; margin-bottom: 6px; font-size: 0.9375rem; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
    em { color: #6b7280; }
  </style>
</head>
<body>
${htmlBody}
</body>
</html>`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBiasLabel(rating: string): string {
  return rating
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default ShareButton;
