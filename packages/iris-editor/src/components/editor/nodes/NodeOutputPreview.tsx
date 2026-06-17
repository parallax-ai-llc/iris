'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@editor/lib/convert/string';
import { PortType } from '../../../constants/node-definitions';
import {
  AlertTriangle,
  X,
  Eye,
  Download,
  Check,
  Copy,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';


interface IterationWrapper {
  __iterations: unknown[];
  iterationCount: number;
}

function isIterationWrapper(value: unknown): value is IterationWrapper {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).__iterations)
  );
}

// Output Preview Tooltip Component
export function OutputPreviewTooltip({
  output,
  outputType,
  portName,
  prompt,
  onClose,
}: {
  output: unknown;
  outputType: PortType;
  /** Name of the port being previewed. Used to extract that port's value from
   * the node's full outputs object (which contains all ports). */
  portName?: string;
  prompt?: string;
  onClose: () => void;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [iterationIndex, setIterationIndex] = useState(0);

  // Close on click outside (but not when clicking on other modals)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking inside this tooltip
      if (tooltipRef.current && tooltipRef.current.contains(target)) {
        return;
      }
      // Don't close if clicking inside another output preview tooltip
      if (target.closest('[data-output-preview]')) {
        return;
      }
      onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Detect loop-iteration wrapper and pick the active iteration. Iterations
  // contain the full per-iteration outputs map (all ports), so iteration
  // selection happens before port extraction.
  const iterations = isIterationWrapper(output) ? output.__iterations : null;
  const iterationCount = iterations?.length ?? 0;
  const safeIndex = iterations
    ? Math.min(Math.max(0, iterationIndex), iterationCount - 1)
    : 0;
  const activeFullOutput = iterations ? iterations[safeIndex] : output;

  // Extract just the requested port's value from the full outputs object so
  // each port preview shows its own data, not the entire node result.
  const activeOutput =
    portName && activeFullOutput && typeof activeFullOutput === 'object' && !Array.isArray(activeFullOutput)
      ? (activeFullOutput as Record<string, unknown>)[portName]
      : activeFullOutput;

  // Parse output data
  const outputData = activeOutput as Record<string, unknown> | string | undefined;

  // Generate filename from prompt
  const getFilename = (extension: string) => {
    if (prompt) {
      // Clean prompt for filename: remove special chars, limit length
      const cleanPrompt = prompt
        .replace(/[^a-zA-Z0-9가-힣\s]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 50);
      return `${cleanPrompt}.${extension}`;
    }
    return `output_${Date.now()}.${extension}`;
  };

  // Download handler for media files
  const handleDownload = async (url: string, type: 'image' | 'video' | 'audio') => {
    try {
      const extension = type === 'image' ? 'png' : type === 'video' ? 'mp4' : 'mp3';
      const filename = getFilename(extension);

      // Handle base64 data URLs
      if (url.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // Handle remote URLs - fetch and download
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  // Copy handler for text
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  // Get display content based on output type
  const renderContent = () => {
    if (!outputData) {
      return <span className="text-white/50 text-xs">No output data</span>;
    }

    // Handle different output types
    if (outputType === 'image') {
      let imageUrl = typeof outputData === 'string'
        ? outputData
        : (outputData as Record<string, unknown>)?.url as string
        || (outputData as Record<string, unknown>)?.image as string;

      // Handle base64 strings - add data URI prefix if needed
      // Skip URLs that start with '/' (relative paths like /api/iris/assets/...)
      if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('data:') && !imageUrl.startsWith('/')) {
        imageUrl = `data:image/png;base64,${imageUrl}`;
      }

      if (imageUrl) {
        return (
          <div className="space-y-2">
            <div className="relative w-80 h-80">
              <img
                src={imageUrl}
                alt="Output"
                className="absolute inset-0 w-full h-full object-contain rounded"
              />
            </div>
            <button
              onClick={() => handleDownload(imageUrl, 'image')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-400/20 hover:bg-slate-400/30 text-slate-200 rounded-lg text-xs transition-colors w-full justify-center"
            >
              <Download size={12} />
              <span>Download Image</span>
            </button>
          </div>
        );
      }
    }

    if (outputType === 'video') {
      const videoUrl = typeof outputData === 'string'
        ? outputData
        : (outputData as Record<string, unknown>)?.url as string
        || (outputData as Record<string, unknown>)?.video as string;
      if (videoUrl) {
        return (
          <div className="space-y-2">
            <video
              src={videoUrl}
              controls
              className="w-80 h-auto rounded"
            />
            <button
              onClick={() => handleDownload(videoUrl, 'video')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-400/20 hover:bg-slate-400/30 text-slate-200 rounded-lg text-xs transition-colors w-full justify-center"
            >
              <Download size={12} />
              <span>Download Video</span>
            </button>
          </div>
        );
      }
    }

    if (outputType === 'audio') {
      const audioUrl = typeof outputData === 'string'
        ? outputData
        : (outputData as Record<string, unknown>)?.url as string
        || (outputData as Record<string, unknown>)?.audio as string;
      if (audioUrl) {
        return (
          <div className="space-y-2">
            <audio src={audioUrl} controls className="w-80" />
            <button
              onClick={() => handleDownload(audioUrl, 'audio')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-400/20 hover:bg-slate-400/30 text-slate-200 rounded-lg text-xs transition-colors w-full justify-center"
            >
              <Download size={12} />
              <span>Download Audio</span>
            </button>
          </div>
        );
      }
    }

    // Check if output is an object with a URL (like OUTPUT_STORAGE result)
    if (typeof outputData === 'object' && outputData !== null) {
      const objData = outputData as Record<string, unknown>;
      const url = objData?.url as string;

      if (url && typeof url === 'string' && url.startsWith('http')) {
        // Determine file type from URL
        const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
        const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url);
        const isAudio = /\.(mp3|wav|ogg|m4a|aac)$/i.test(url);

        return (
          <div className="space-y-3">
            {/* Preview based on file type */}
            {isImage && (
              <div className="relative w-80 h-60">
                <img src={url} alt="Saved file" className="absolute inset-0 w-full h-full object-contain rounded" />
              </div>
            )}
            {isVideo && (
              <video src={url} controls className="w-80 h-auto rounded" />
            )}
            {isAudio && (
              <audio src={url} controls className="w-80" />
            )}

            {/* Clickable URL */}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-slate-300 hover:text-slate-200 underline break-all"
            >
              {url}
            </a>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handleCopy(url)}
                className={cn(
                  "flex-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors justify-center",
                  copied
                    ? "bg-green-500/20 text-green-300"
                    : "bg-white/10 hover:bg-white/20 text-white/70"
                )}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                <span>{copied ? 'Copied!' : 'Copy URL'}</span>
              </button>
              {(isImage || isVideo || isAudio) && (
                <button
                  onClick={() => handleDownload(url, isImage ? 'image' : isVideo ? 'video' : 'audio')}
                  className="flex-1 flex items-center gap-1.5 px-3 py-1.5 bg-slate-400/20 hover:bg-slate-400/30 text-slate-200 rounded-lg text-xs transition-colors justify-center"
                >
                  <Download size={12} />
                  <span>Download</span>
                </button>
              )}
            </div>
          </div>
        );
      }
    }

    // Text or other types - show as text
    let textContent: string;
    if (typeof outputData === 'string') {
      textContent = outputData;
    } else {
      // Always render objects/arrays as JSON. Previously this code unwrapped
      // `objData.text` or `objData.result` to a flat string, which silently
      // hid the rest of the structure — e.g. a parseJson result like
      // `{text: "test", other: 1}` would render only "test", making the
      // node look broken even though the server returned the full object.
      textContent = JSON.stringify(outputData, null, 2);
    }

    const MAX_PREVIEW_LINES = 10;
    const lines = textContent.split('\n');
    const hasMore = lines.length > MAX_PREVIEW_LINES;
    const displayText = expanded || !hasMore
      ? textContent
      : lines.slice(0, MAX_PREVIEW_LINES).join('\n');
    const hiddenLineCount = lines.length - MAX_PREVIEW_LINES;

    return (
      <div className="space-y-2">
        <pre
          className={cn(
            "text-xs text-white/80 whitespace-pre-wrap break-words font-mono select-text overflow-auto",
            expanded ? "max-h-[400px]" : "max-h-[260px]"
          )}
        >
          {displayText}
        </pre>
        {hasMore && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors w-full justify-center bg-white/5 hover:bg-white/10 text-white/70"
          >
            <span>
              {expanded ? 'Show less' : `Show more (${hiddenLineCount} more line${hiddenLineCount > 1 ? 's' : ''})`}
            </span>
          </button>
        )}
        <button
          onClick={() => handleCopy(textContent)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors w-full justify-center",
            copied
              ? "bg-green-500/20 text-green-300"
              : "bg-slate-400/20 hover:bg-slate-400/30 text-slate-200"
          )}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied!' : 'Copy Text'}</span>
        </button>
      </div>
    );
  };

  return (
    <div
      ref={tooltipRef}
      data-output-preview
      className="nodrag nowheel absolute top-full mt-2 right-0 z-50 bg-slate-800 border border-white/20 rounded-lg shadow-xl p-3 min-w-[400px] max-w-[90vw] cursor-default select-text"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <Eye size={12} className="text-green-400" />
          <span className="text-xs font-medium text-white/80">Output Preview</span>
          {iterations && (
            <span className="text-[10px] text-white/40 ml-1">
              · loop
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-0.5 hover:bg-white/10 rounded transition-colors"
        >
          <X size={12} className="text-white/50" />
        </button>
      </div>
      {iterations && iterationCount > 0 && (
        <div className="flex items-center justify-between gap-2 mb-2 px-2 py-1.5 rounded-md bg-white/5 border border-white/10">
          <button
            onClick={() => setIterationIndex((idx) => Math.max(0, idx - 1))}
            disabled={safeIndex === 0}
            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-white/70"
            title="Previous iteration"
          >
            <ChevronLeft size={12} />
          </button>
          <span className="text-[11px] font-mono text-white/80 tabular-nums">
            {safeIndex + 1} / {iterationCount}
          </span>
          <button
            onClick={() =>
              setIterationIndex((idx) => Math.min(iterationCount - 1, idx + 1))
            }
            disabled={safeIndex >= iterationCount - 1}
            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-white/70"
            title="Next iteration"
          >
            <ChevronRight size={12} />
          </button>
        </div>
      )}
      {renderContent()}
    </div>
  );
}

// Error Preview Tooltip Component
export function ErrorPreviewTooltip({
  error,
  onClose,
}: {
  error: string;
  onClose: () => void;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Close on click outside (but not when clicking on other modals)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (tooltipRef.current && tooltipRef.current.contains(target)) {
        return;
      }
      if (target.closest('[data-output-preview]')) {
        return;
      }
      onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(error);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <div
      ref={tooltipRef}
      data-output-preview
      className="nodrag nowheel absolute top-full mt-2 right-0 z-50 cursor-default"
    >
      <div className="bg-slate-900 border border-red-500/30 rounded-lg shadow-2xl overflow-hidden min-w-[400px] max-w-[90vw]">
        <div className="flex items-center justify-between p-3 border-b border-red-500/20 bg-red-500/10">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-400" />
            <span className="text-sm font-medium text-white">Error</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 rounded hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-3 space-y-2">
          <pre className="text-xs text-red-200/90 whitespace-pre-wrap break-words font-mono max-h-[300px] overflow-y-auto">
            {error}
          </pre>
          <button
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors w-full justify-center",
              copied
                ? "bg-green-500/20 text-green-300"
                : "bg-red-500/20 hover:bg-red-500/30 text-red-300"
            )}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? 'Copied!' : 'Copy Error'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
