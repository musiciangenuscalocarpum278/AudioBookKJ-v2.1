// ==========================================================================
// components/timeline/VideoClip.tsx
// A single draggable, resizable video clip in the DAW timeline.
// ==========================================================================
import React from 'react';
import { X, Video } from 'lucide-react';
import type { TimelineVideoClip } from '../../types';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface VideoClipProps {
  clip: TimelineVideoClip;
  top: number;
  left: number;
  width: number;
  isDragging: boolean;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onResizeLeft: (e: React.MouseEvent) => void;
  onResizeRight: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  videoRef: (el: HTMLVideoElement | null) => void;
}

export function VideoClip({
  clip, top, left, width, isDragging, isSelected,
  onMouseDown, onResizeLeft, onResizeRight, onDelete, videoRef,
}: VideoClipProps) {
  return (
    <div
      className={`absolute h-14 rounded-md overflow-hidden transition-all duration-150 shadow-sm border cursor-move ${
        isDragging
          ? 'opacity-85 z-40 ring-1 ring-amber-cinematic/50 scale-[1.01] bg-zinc-800 border-amber-cinematic shadow-[0_0_15px_rgba(249,115,22,0.2)]'
          : isSelected
          ? 'z-30 bg-zinc-900 border-amber-cinematic shadow-[0_0_15px_rgba(249,115,22,0.35)] ring-1 ring-amber-cinematic/40 border-2'
          : 'z-20 bg-zinc-900/95 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850'
      }`}
      style={{ top: `${top + 4}px`, left: `${left}px`, width: `${width}px` }}
      onMouseDown={onMouseDown}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-amber-cinematic/30 z-50 transition-colors group"
        onMouseDown={onResizeLeft}
      >
        <div className="absolute left-0.5 top-1/2 -translate-y-1/2 h-4 w-0.5 bg-zinc-650 group-hover:bg-amber-cinematic pointer-events-none" />
      </div>

      {/* Clip header */}
      <div className={`px-1.5 py-0.5 text-[9px] font-bold truncate flex justify-between items-center border-b relative z-10 ${
        isSelected ? 'text-zinc-100 bg-zinc-950 border-zinc-850' : 'text-zinc-400 bg-zinc-950 border-zinc-900'
      }`}>
        <span className="flex items-center gap-1">
          <span className="text-[8px] font-mono font-medium rounded-sm uppercase tracking-wider text-amber-cinematic border border-amber-cinematic/20 bg-amber-950/10 px-1 py-0.2">
            Video
          </span>
          <span className="opacity-75 font-mono">({clip.duration.toFixed(1)}s)</span>
        </span>
        <button
          onClick={onDelete}
          className="text-zinc-500 hover:text-red-400 bg-transparent p-0.5 rounded-sm transition-colors"
          title="Xóa clip video"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Thumbnail */}
      <div className="w-full h-8 relative flex items-center justify-center pointer-events-none overflow-hidden bg-zinc-950/30">
        <img
          src={`${API_BASE}/api/video/thumbnail?url=${encodeURIComponent(clip.videoUrl)}`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-50"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <Video className="w-3 h-3 text-zinc-500 opacity-40 relative z-10" />
      </div>

      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-amber-cinematic/30 z-50 transition-colors group"
        onMouseDown={onResizeRight}
      >
        <div className="absolute right-0.5 top-1/2 -translate-y-1/2 h-4 w-0.5 bg-zinc-650 group-hover:bg-amber-cinematic pointer-events-none" />
      </div>
    </div>
  );
}
