// ==========================================================================
// components/timeline/AudioClip.tsx
// A single draggable audio clip in the DAW timeline.
// Receives handlers from Timeline.tsx and reads refs from parent.
// ==========================================================================
import React from 'react';
import { X, AlertTriangle, RefreshCw } from 'lucide-react';
import type { TimelineClip } from '../../types';
import { useProjectStore } from '../../store/useProjectStore';

// Shared AudioContext — browser hard-limits at ~6; never create one per component
const _AC = window.AudioContext || (window as any).webkitAudioContext;
const sharedAC: AudioContext = (window as any).globalAudioContext || new _AC();
if (!(window as any).globalAudioContext) {
  (window as any).globalAudioContext = sharedAC;
}

// Decoded audio peaks cache — avoids re-decoding when only width/zoom changes
const peaksCache = new Map<string, number[]>();

function WaveformSVG({ audioUrl, isSelected }: { audioUrl: string; isSelected: boolean }) {
  const [peaks, setPeaks] = React.useState<number[]>([]);

  React.useEffect(() => {
    if (!audioUrl) return;

    const cached = peaksCache.get(audioUrl);
    if (cached) {
      setPeaks(cached);
      return;
    }

    let cancelled = false;

    fetch(audioUrl)
      .then(r => r.arrayBuffer())
      .then(buf => sharedAC.decodeAudioData(buf))
      .then(decoded => {
        if (cancelled) return;
        const channelData = decoded.getChannelData(0);
        
        // Compute 80 sample peaks for high resolution but optimal DOM weight
        const numPeaks = 80;
        const sampleStep = Math.floor(channelData.length / numPeaks);
        const computed: number[] = [];
        for (let i = 0; i < numPeaks; i++) {
          let max = 0;
          const start = i * sampleStep;
          const end = Math.min(channelData.length, start + sampleStep);
          for (let j = start; j < end; j++) {
            max = Math.max(max, Math.abs(channelData[j]));
          }
          computed.push(max);
        }
        peaksCache.set(audioUrl, computed);
        setPeaks(computed);
      })
      .catch(() => {
        // Fallback deterministic waveform representation if fetch/decode fails (mock values)
        const hash = audioUrl.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const fallback = Array.from({ length: 80 }, (_, i) => {
          const val = Math.abs(Math.sin(hash + i * 0.15)) * 0.5 + Math.cos(hash + i * 0.3) * 0.2;
          return Math.max(0.05, Math.min(0.85, val));
        });
        setPeaks(fallback);
      });

    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  if (peaks.length === 0) {
    return (
      <svg className="w-full h-8 opacity-40" viewBox="0 0 100 36" preserveAspectRatio="none">
        <line x1="0" y1="18" x2="100" y2="18" stroke={isSelected ? '#f97316' : '#3f3f46'} strokeWidth="1" strokeDasharray="2,2" />
      </svg>
    );
  }

  const barCount = peaks.length;
  const height = 36;
  const mid = height / 2;

  let pathD = '';
  const barWidth = 1.2;
  const gap = 0.8;
  const step = barWidth + gap;

  peaks.forEach((peak, i) => {
    const x = i * step;
    const amt = Math.max(1.5, peak * (height - 4));
    const y1 = mid - amt / 2;
    const y2 = mid + amt / 2;
    pathD += ` M ${x.toFixed(1)} ${y1.toFixed(1)} L ${x.toFixed(1)} ${y2.toFixed(1)}`;
  });

  const totalWidth = barCount * step;

  return (
    <svg
      className="w-full h-[36px] pointer-events-none"
      viewBox={`0 0 ${totalWidth} ${height}`}
      preserveAspectRatio="none"
    >
      <path
        d={pathD}
        stroke={isSelected ? '#f97316' : '#d4d4d8'} // Cinematic Amber or bright silver
        strokeWidth={barWidth}
        strokeLinecap="round"
        opacity={isSelected ? "1" : "0.5"}
      />
    </svg>
  );
}

// Speaker specific colors in alignment with Option A (distinct, custom colors)
function getSpeakerBadgeStyle(speaker?: string): string {
  const name = (speaker ?? '').toLowerCase().trim();
  if (name === 'narration' || name === 'narrator') {
    return 'text-amber-cinematic border border-amber-cinematic/30 bg-amber-950/20';
  }
  if (name === 'kael') {
    return 'text-emerald-400 border border-emerald-500/30 bg-emerald-950/20';
  }
  if (name === 'elara') {
    return 'text-red-400 border border-red-500/30 bg-red-950/20';
  }
  // Default fallback speaker (e.g. Gold/Yellow)
  return 'text-yellow-400 border border-yellow-500/30 bg-yellow-950/20';
}

interface AudioClipProps {
  clip: TimelineClip;
  top: number;
  left: number;
  width: number;
  isDragging: boolean;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onReRender: (id: string) => void;
  audioRef: (el: HTMLAudioElement | null) => void;
}

export function AudioClip({
  clip, top, left, width, isDragging, isSelected,
  onMouseDown, onDelete, onReRender, audioRef,
}: AudioClipProps) {
  const trackVolumes = useProjectStore(s => s.trackVolumes);
  const setTimelineClips = useProjectStore(s => s.setTimelineClips);

  React.useEffect(() => {
    const audioEl = document.getElementById(`audio-${clip.id}`) as HTMLAudioElement;
    if (audioEl) {
      const finalVol = ((clip.volume ?? 100) / 100) * ((trackVolumes[clip.track] ?? 100) / 100);
      audioEl.volume = Math.min(1, Math.max(0, finalVol));
    }
  }, [clip.volume, trackVolumes, clip.track, clip.id]);

  const handleAudioError = (e: any) => {
    console.warn("Audio Error:", clip.audioUrl, e);
  };

  const badgeStyle = getSpeakerBadgeStyle(clip.speaker);

  return (
    <div
      key={clip.id}
      onMouseDown={onMouseDown}
      className={`absolute h-14 rounded-md overflow-hidden cursor-move transition-all duration-150 shadow-sm border ${
        clip.stale
          ? 'z-10 bg-red-950/40 border-red-800'
          : isDragging
          ? 'opacity-85 z-40 ring-1 ring-amber-cinematic/50 scale-[1.01] bg-zinc-800 border-amber-cinematic shadow-[0_0_15px_rgba(249,115,22,0.2)]'
          : isSelected
          ? 'z-30 bg-zinc-900 border-amber-cinematic shadow-[0_0_15px_rgba(249,115,22,0.35)] ring-1 ring-amber-cinematic/40 border-2'
          : 'z-10 bg-zinc-900/90 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850'
      }`}
      style={{ top: `${top + 4}px`, left: `${left}px`, width: `${width}px` }}
    >
      {/* Clip header */}
      <div className={`px-1 py-0.5 text-[9px] font-bold truncate flex justify-between items-center border-b ${
        clip.stale ? 'text-red-300 bg-red-950/50 border-red-900/50'
        : isSelected ? 'text-zinc-100 bg-zinc-950 border-zinc-850' : 'text-zinc-400 bg-zinc-950 border-zinc-900'
      }`}>
        <span className="flex items-center gap-1.5 truncate">
          {clip.stale && <AlertTriangle className="w-2.5 h-2.5 text-red-400" />}
          <span className={`px-1 py-0.2 text-[8px] font-mono font-medium rounded-sm uppercase tracking-wider ${badgeStyle}`}>
            {clip.speaker}
          </span>
        </span>
        <button
          onClick={(e) => onDelete(e, clip.id)}
          className={`bg-transparent p-0.5 rounded-sm transition-colors ${
            clip.stale 
              ? 'text-red-400 hover:text-white hover:bg-red-900/40' 
              : isSelected 
              ? 'text-zinc-400 hover:text-red-400 hover:bg-zinc-800' 
              : 'text-zinc-500 hover:text-red-400 hover:bg-zinc-800'
          }`}
          title="Xóa clip audio"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>

      {clip.stale ? (
        /* Stale overlay */
        <div className="flex items-center justify-between h-8 px-2">
          <span className="text-[9px] text-red-400 font-mono tracking-wide uppercase truncate">Missing Asset</span>
          <button
            onClick={(e) => { e.stopPropagation(); onReRender(clip.id); }}
            className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 bg-amber-cinematic/20 border border-amber-cinematic/40 hover:bg-amber-cinematic/30 text-amber-cinematic rounded-sm text-[8px] font-mono tracking-wider uppercase transition-colors"
            title="Re-render this line"
          >
            <RefreshCw className="w-2 h-2 animate-spin-hover" /> Render
          </button>
        </div>
      ) : (
        /* SVG Lightwave Waveform */
        <div className="w-full h-8 flex items-center px-1 bg-zinc-950/20">
          <WaveformSVG audioUrl={clip.audioUrl} isSelected={isSelected} />
        </div>
      )}

      {/* Hidden audio element */}
      {!clip.stale && (
        <audio
          id={`audio-${clip.id}`}
          src={clip.audioUrl}
          ref={audioRef}
          preload="metadata"
          onError={handleAudioError}
        />
      )}
    </div>
  );
}
