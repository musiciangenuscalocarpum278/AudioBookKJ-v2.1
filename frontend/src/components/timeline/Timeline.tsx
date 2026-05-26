// ==========================================================================
// components/timeline/Timeline.tsx
// Full DAW timeline panel: ruler, track rows, playhead, audio/video clips.
// Reads all state from Zustand stores; heavy interaction handlers passed as props.
// ==========================================================================
import React from 'react';
import { Play, Pause, Video, Volume2, Scissors, AlignLeft } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { usePlaybackStore } from '../../store/usePlaybackStore';
import { AudioClip } from './AudioClip';
import { VideoClip } from './VideoClip';
import type { TimelineClip, TimelineVideoClip } from '../../types';

interface TimelineProps {
  children?: React.ReactNode;
  // Playback controls
  toggleTimelinePlay: () => void;
  handleTimelineSeek: (e: React.MouseEvent) => void;
  handleClearTimeline: (type?: 'audio' | 'video' | 'all') => void;
  handleSplitClip?: () => void;
  // Clip mouse-down handlers
  handleTimelineClipMouseDown: (e: React.MouseEvent, clip: TimelineClip) => void;
  handleVideoClipMouseDown: (e: React.MouseEvent, clip: TimelineVideoClip) => void;
  handleVideoResizeMouseDown: (e: React.MouseEvent, clip: TimelineVideoClip, edge: 'left' | 'right') => void;
  handleDeleteTimelineClip: (e: React.MouseEvent, id: string) => void;
  onReRenderClip: (id: string) => void;
  onArrangeClips?: () => void;
  // Resize handle
  handleTimelineResizeStart: (e: React.MouseEvent) => void;
  // Refs
  timelineScrollRef: React.RefObject<HTMLDivElement | null>;
  timelineAudioRefs: React.MutableRefObject<Record<string, HTMLAudioElement>>;
  timelineVideoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>;
}

export function Timeline({
  toggleTimelinePlay, handleTimelineSeek, handleClearTimeline,
  handleSplitClip, onArrangeClips,
  handleTimelineClipMouseDown, handleVideoClipMouseDown,
  handleVideoResizeMouseDown, handleDeleteTimelineClip, onReRenderClip,
  handleTimelineResizeStart,
  timelineScrollRef, timelineAudioRefs, timelineVideoRefs,
  children,
}: TimelineProps) {
  const script = useProjectStore(s => s.script);
  const timelineClips = useProjectStore(s => s.timelineClips);
  const timelineVideoClips = useProjectStore(s => s.timelineVideoClips);
  const setTimelineVideoClips = useProjectStore(s => s.setTimelineVideoClips);
  const activeTab = useProjectStore(s => s.activeTab);
  const setActiveTab = useProjectStore(s => s.setActiveTab);
  const trackVolumes = useProjectStore(s => s.trackVolumes);
  const setTrackVolume = useProjectStore(s => s.setTrackVolume);
  const videoTrackVolumes = useProjectStore(s => s.videoTrackVolumes);
  const setVideoTrackVolume = useProjectStore(s => s.setVideoTrackVolume);
  const isPlayingTimeline = usePlaybackStore(s => s.isPlayingTimeline);
  const timelineTime = usePlaybackStore(s => s.timelineTime);
  const zoomLevel = usePlaybackStore(s => s.zoomLevel);
  const setZoomLevel = usePlaybackStore(s => s.setZoomLevel);
  const timelineHeight = usePlaybackStore(s => s.timelineHeight);
  const draggingVideoClipId = usePlaybackStore(s => s.draggingVideoClipId);
  const draggingTimelineClipId = usePlaybackStore(s => s.draggingTimelineClipId);
  const selectedTimelineVideoClipId = usePlaybackStore(s => s.selectedTimelineVideoClipId);
  const selectedTimelineAudioClipId = usePlaybackStore(s => s.selectedTimelineAudioClipId);
  const selectedTimelineVideoClipIds = usePlaybackStore(s => s.selectedTimelineVideoClipIds);
  const setSelectedTimelineVideoClipIds = usePlaybackStore(s => s.setSelectedTimelineVideoClipIds);
  const selectedTimelineAudioClipIds = usePlaybackStore(s => s.selectedTimelineAudioClipIds);
  const setSelectedTimelineAudioClipIds = usePlaybackStore(s => s.setSelectedTimelineAudioClipIds);
  const selectionBox = usePlaybackStore(s => s.selectionBox);
  const setSelectionBox = usePlaybackStore(s => s.setSelectionBox);

  // Native horizontal scroll, trackpad gesture and Ctrl + Wheel zoom mapping
  React.useEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // 1. Zoom with Ctrl + Wheel
      if (e.ctrlKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 10 : -10;
        const nextZoom = Math.max(10, Math.min(200, zoomLevel + factor));
        setZoomLevel(nextZoom);
        return;
      }

      // 2. Chuyển đổi lăn dọc thành cuộn ngang cho chuột thường (có/không nhấn Shift)
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault(); // Chặn cuộn dọc mặc định
        el.scrollLeft += e.deltaY;
        return;
      }

      // 3. Cuộn ngang trực tiếp từ con lăn phụ của MX Master 3S (deltaX)
      if (Math.abs(e.deltaX) > 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaX;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [zoomLevel, setZoomLevel, timelineScrollRef, activeTab, timelineScrollRef.current]);

  const handleTimelineBgMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Chỉ kích hoạt khi click chuột trái và không phải click vào clip
    if (e.button !== 0) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    setSelectionBox({ startX, startY, endX: startX, endY: startY });

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentX = moveEvent.clientX - rect.left;
      const currentY = moveEvent.clientY - rect.top;

      setSelectionBox({
        startX,
        startY,
        endX: Math.max(0, Math.min(rulerWidth, currentX)),
        endY: Math.max(0, currentY),
      });

      const box = {
        x1: Math.min(startX, currentX),
        x2: Math.max(startX, currentX),
        y1: Math.min(startY, currentY),
        y2: Math.max(startY, currentY),
      };

      // 1. Quét Video Clips
      const videoClipsInBox = timelineVideoClips.filter(clip => {
        const clipLeft = clip.startTime * zoomLevel;
        const clipRight = (clip.startTime + clip.duration) * zoomLevel;
        const clipTop = (clip.track ?? 0) * 64;
        const clipBottom = clipTop + 64;

        return (
          clipLeft < box.x2 &&
          clipRight > box.x1 &&
          clipTop < box.y2 &&
          clipBottom > box.y1
        );
      }).map(c => c.id);

      // 2. Quét Audio Clips
      const audioClipsInBox = timelineClips.filter(clip => {
        const clipLeft = clip.startTime * zoomLevel;
        const clipRight = (clip.startTime + clip.duration) * zoomLevel;
        const clipTop = videoTracksHeight + clip.track * 64;
        const clipBottom = clipTop + 64;

        return (
          clipLeft < box.x2 &&
          clipRight > box.x1 &&
          clipTop < box.y2 &&
          clipBottom > box.y1
        );
      }).map(c => c.id);

      setSelectedTimelineVideoClipIds(videoClipsInBox);
      setSelectedTimelineAudioClipIds(audioClipsInBox);
    };

    const handleMouseUp = () => {
      setSelectionBox(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Ruler width
  const totalDuration = timelineClips.length > 0
    ? Math.max(20, ...timelineClips.map(c => c.startTime + c.duration))
    : 20;
  const rulerWidth = totalDuration * zoomLevel + 500;

  // Track layout calculation
  const maxVideoTrack = timelineVideoClips.length > 0 ? Math.max(...timelineVideoClips.map(c => c.track ?? 0)) : 0;
  const numVideoTracks = activeTab === 'post-production' ? Math.max(3, maxVideoTrack + 2) : 0;
  const videoTracksHeight = numVideoTracks * 64;

  return (
    <div
      className={activeTab === 'post-production'
        ? 'flex-1 relative bg-zinc-950 shadow-2xl flex flex-col z-50 overflow-hidden w-full h-full'
        : 'fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-850 shadow-2xl flex flex-col z-50 transition-none'}
      style={activeTab === 'post-production' ? {} : { height: `${timelineHeight}px` }}
    >
      {/* Resize handle (Audio Studio mode only) */}
      {activeTab === 'audio' && (
        <div
          className="absolute top-0 left-0 right-0 h-2 -mt-1 cursor-row-resize bg-transparent hover:bg-amber-cinematic/40 z-50"
          onMouseDown={handleTimelineResizeStart}
        />
      )}

      {children}

      {/* Transport bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-850">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-cinematic flex items-center gap-2">
            <Play className="w-3.5 h-3.5 fill-current" /> Stories Editor (Timeline)
          </h3>
          <span className="text-[10px] text-zinc-550 ml-4 font-semibold uppercase tracking-wider">
            Tổng số clip: {timelineClips.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Play/Pause */}
          <button
            onClick={toggleTimelinePlay}
            className={`p-1.5 rounded transition-all cursor-pointer ${isPlayingTimeline ? 'bg-amber-cinematic text-white shadow-[0_0_10px_rgba(249,115,22,0.3)]' : 'bg-zinc-950 border border-zinc-800 text-amber-cinematic hover:bg-zinc-900'}`}
            title={isPlayingTimeline ? 'Tạm dừng (Space)' : 'Phát timeline (Space)'}
          >
            {isPlayingTimeline
              ? <Pause className="w-3.5 h-3.5" fill="currentColor" />
              : <Play className="w-3.5 h-3.5" fill="currentColor" />}
          </button>

          {/* Split Clip (Scissors) */}
          <button
            onClick={handleSplitClip}
            className="p-1.5 rounded bg-zinc-950 border border-zinc-800 hover:border-amber-cinematic/30 text-zinc-300 hover:text-rose-450 transition-colors shadow-sm cursor-pointer"
            title="Cắt clip tại playhead (Phím S)"
          >
            <Scissors className="w-3.5 h-3.5" />
          </button>

          {/* Time display */}
          <div className="text-xs font-bold font-mono text-amber-cinematic bg-zinc-950 px-2.5 py-1 rounded w-16 text-center border border-zinc-850">
            {timelineTime.toFixed(1)}s
          </div>

          {/* Sync button (audio tab only) */}
          {activeTab === 'audio' && (
            <button
              onClick={() => setActiveTab('post-production')}
              className="ml-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-xs font-semibold rounded border border-emerald-500/20 cursor-pointer"
              title="Chuyển sang Post-Production để Mix"
            >
              Sync to Post-Production
            </button>
          )}

          {/* Arrange Clips */}
          {onArrangeClips && (
            <button
              onClick={onArrangeClips}
              className="ml-2 px-2.5 py-1 bg-zinc-950 border border-zinc-800 hover:border-amber-cinematic/40 text-amber-cinematic hover:bg-amber-cinematic/10 transition-colors text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Sắp xếp Timeline: Tự động xếp các clip nối tiếp nhau cách 0.2s theo kịch bản"
            >
              <AlignLeft className="w-3.5 h-3.5" />
              Sắp Xếp
            </button>
          )}

          {/* Clear Buttons */}
          {activeTab === 'audio' ? (
            <button
              onClick={() => handleClearTimeline('audio')}
              className="ml-2 px-3 py-1 bg-rose-500/10 text-rose-450 hover:bg-rose-500/20 transition-colors text-xs font-semibold rounded border border-rose-500/20 cursor-pointer"
              title="Xóa toàn bộ Audio Timeline"
            >
              Clear Audio
            </button>
          ) : (
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => handleClearTimeline('audio')}
                className="px-3 py-1 bg-rose-500/10 text-rose-450 hover:bg-rose-500/20 transition-colors text-xs font-semibold rounded border border-rose-500/20 cursor-pointer"
                title="Xóa phần Audio"
              >
                Clear Audio
              </button>
              <button
                onClick={() => handleClearTimeline('video')}
                className="px-3 py-1 bg-rose-500/10 text-rose-450 hover:bg-rose-500/20 transition-colors text-xs font-semibold rounded border border-rose-500/20 cursor-pointer"
                title="Xóa phần Video"
              >
                Clear Videos
              </button>
              <button
                onClick={() => { if (window.confirm('Xóa TOÀN BỘ Timeline? Hành động này không thể hoàn tác.')) handleClearTimeline('all'); }}
                className="px-3 py-1 bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 transition-colors text-xs font-semibold rounded border border-rose-600/30 shadow-sm cursor-pointer"
                title="Xóa TOÀN BỘ Timeline"
              >
                Clear All
              </button>
            </div>
          )}

          {/* Zoom */}
          <div className="flex items-center gap-1 ml-4 bg-zinc-950 rounded border border-zinc-850 px-2 py-0.5">
            <button onClick={() => setZoomLevel(Math.max(10, zoomLevel - 10))} className="text-zinc-550 hover:text-amber-cinematic cursor-pointer font-bold px-1" title="Thu nhỏ timeline">-</button>
            <span className="text-[9px] text-zinc-400 font-mono w-8 text-center">{zoomLevel}%</span>
            <button onClick={() => setZoomLevel(Math.min(200, zoomLevel + 10))} className="text-zinc-550 hover:text-amber-cinematic cursor-pointer font-bold px-1" title="Phóng to timeline">+</button>
          </div>
        </div>
      </div>

      {/* Scrollable track area */}
      <div ref={timelineScrollRef} className="flex-1 overflow-auto relative bg-zinc-950/40 custom-scrollbar">
        <div style={{ marginLeft: '256px', position: 'relative' }}>
        {/* Ruler */}
        <div
          className="h-6 border-b border-zinc-850 mb-2 relative opacity-60 cursor-pointer hover:bg-zinc-900/40 transition-colors"
          onClick={handleTimelineSeek}
          style={{ width: `${rulerWidth}px` }}
        >
          {Array.from({ length: Math.ceil(totalDuration / 2) + 10 }).map((_, i) => (
            <div key={i} className="absolute top-1 text-[9px] font-mono text-zinc-550 border-l border-zinc-800/60 pl-1 h-3" style={{ left: `${i * 2 * zoomLevel}px` }}>
              {i * 2}s
            </div>
          ))}
        </div>

        {/* Track container */}
        <div
          className="relative min-h-[150px] h-full"
          style={{ width: `${rulerWidth}px` }}
          onMouseDown={handleTimelineBgMouseDown}
        >
          {/* Video track backgrounds */}
          {activeTab === 'post-production' && Array.from({ length: numVideoTracks }).map((_, vTrackIndex) => (
            <div
              key={`vtrack-${vTrackIndex}`}
              className="absolute left-0 right-0 h-16 border-b border-zinc-900 flex items-center group"
              style={{ top: `${vTrackIndex * 64}px` }}
            >
              {/* Background fill */}
              <div className="absolute inset-0 bg-amber-cinematic/5 opacity-40 pointer-events-none" />

              {/* Track Header (Sticky left) */}
              <div className="sticky left-0 z-[60] -ml-[256px] flex items-center gap-2 w-64 h-full bg-zinc-950 border-r border-zinc-900 px-4 group-hover:bg-zinc-900/50 transition-colors opacity-100 shadow-[2px_0_10px_rgba(0,0,0,0.5)]">
                <span className="text-xs text-amber-cinematic font-bold w-12 shrink-0">VIDEO {vTrackIndex + 1}</span>
                <div className="flex items-center gap-1.5 flex-1">
                  <Video className="w-3.5 h-3.5 text-zinc-550 shrink-0" />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={videoTrackVolumes[vTrackIndex] ?? 100}
                    onChange={(e) => setVideoTrackVolume(vTrackIndex, Number(e.target.value))}
                    className="w-16 h-1 bg-zinc-800 rounded-none appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-amber-cinematic [&::-webkit-slider-thumb]:rounded-none shrink-0"
                    title={`Video Volume: ${videoTrackVolumes[vTrackIndex] ?? 100}%`}
                  />
                  <span className="text-[9px] font-mono text-zinc-400 w-8 text-right shrink-0">{videoTrackVolumes[vTrackIndex] ?? 100}%</span>
                  <button 
                    onClick={() => setVideoTrackVolume(vTrackIndex, 100)} 
                    className="text-xs text-zinc-500 hover:text-amber-cinematic p-1 rounded transition-colors shrink-0 cursor-pointer"
                    title="Reset 100%"
                  >
                    ↺
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Audio track backgrounds */}
          {[0, 1, 2, 3].map(trackIndex => (
            <div
              key={`track-${trackIndex}`}
              className="absolute left-0 right-0 h-16 border-b border-zinc-900 flex items-center group"
              style={{ top: `${videoTracksHeight + trackIndex * 64}px` }}
            >
              {/* Background fill */}
              <div className="absolute inset-0 bg-zinc-900/10 opacity-20 pointer-events-none" />
              
              {/* Track Header (Sticky left) */}
              <div className="sticky left-0 z-[60] -ml-[256px] flex items-center gap-2 w-64 h-full bg-zinc-950 border-r border-zinc-900 px-4 group-hover:bg-zinc-900/50 transition-colors shadow-[2px_0_10px_rgba(0,0,0,0.5)]">
                <span className="text-xs text-zinc-400 font-bold w-12 shrink-0">TRACK {trackIndex}</span>
                {activeTab === 'post-production' && (
                  <div className="flex items-center gap-1.5 flex-1">
                    <Volume2 className="w-3.5 h-3.5 text-zinc-550 shrink-0" />
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={trackVolumes[trackIndex] ?? 100}
                      onChange={(e) => setTrackVolume(trackIndex, Number(e.target.value))}
                      className="w-16 h-1 bg-zinc-800 rounded-none appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-amber-cinematic [&::-webkit-slider-thumb]:rounded-none shrink-0"
                      title={`Volume: ${trackVolumes[trackIndex] ?? 100}%`}
                    />
                    <span className="text-[9px] font-mono text-zinc-400 w-8 text-right shrink-0">{trackVolumes[trackIndex] ?? 100}%</span>
                    <button 
                      onClick={() => setTrackVolume(trackIndex, 100)} 
                      className="text-xs text-zinc-550 hover:text-amber-cinematic p-1 rounded transition-colors shrink-0 cursor-pointer"
                      title="Reset 100%"
                    >
                      ↺
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-50 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.5)]"
            style={{ left: `${timelineTime * zoomLevel}px` }}
          >
            <div className="w-2.5 h-2.5 bg-rose-500 -ml-[4px] -mt-0.5 rounded-sm rotate-45 border-b border-r border-rose-600 shadow-md" />
          </div>

          {/* Video clips (post-production only) */}
          {activeTab === 'post-production' && timelineVideoClips.map((clip) => {
            const isSelected = selectedTimelineVideoClipIds.includes(clip.id) || selectedTimelineVideoClipId === clip.id
              || (selectedTimelineVideoClipIds.length === 0 && !selectedTimelineVideoClipId && !selectedTimelineAudioClipId && script.find(l => l.id === clip.lineId)?.selected);
            const isDragging = draggingVideoClipId === clip.id;
            return (
              <VideoClip
                key={clip.id}
                clip={clip}
                top={(clip.track ?? 0) * 64}
                left={clip.startTime * zoomLevel}
                width={clip.duration * zoomLevel}
                isDragging={isDragging}
                isSelected={!!isSelected}
                onMouseDown={(e) => handleVideoClipMouseDown(e, clip)}
                onResizeLeft={(e) => handleVideoResizeMouseDown(e, clip, 'left')}
                onResizeRight={(e) => handleVideoResizeMouseDown(e, clip, 'right')}
                onDelete={(e) => {
                  e.stopPropagation();
                  setTimelineVideoClips(prev => prev.filter(c => c.id !== clip.id));
                }}
                videoRef={(el) => {
                  if (el) timelineVideoRefs.current[clip.id] = el;
                }}
              />
            );
          })}

          {/* Audio clips */}
          {timelineClips.map((clip) => {
            const top = videoTracksHeight + clip.track * 64;
            const isSelected = selectedTimelineAudioClipIds.includes(clip.id) || selectedTimelineAudioClipId === clip.id
              || (selectedTimelineAudioClipIds.length === 0 && !selectedTimelineAudioClipId && !selectedTimelineVideoClipId && script.find(l => l.id === clip.lineId)?.selected);
            const isDragging = draggingTimelineClipId === clip.id;
            return (
              <AudioClip
                key={clip.id}
                clip={clip}
                top={top}
                left={clip.startTime * zoomLevel}
                width={clip.duration * zoomLevel}
                isDragging={isDragging}
                isSelected={!!isSelected}
                onMouseDown={(e) => handleTimelineClipMouseDown(e, clip)}
                onDelete={handleDeleteTimelineClip}
                onReRender={onReRenderClip}
                audioRef={(el) => {
                  if (el) timelineAudioRefs.current[clip.id] = el;
                }}
              />
            );
          })}

          {/* Selection Box Overlay */}
          {selectionBox && (
            <div
              className="absolute border border-amber-cinematic bg-amber-cinematic/15 pointer-events-none rounded-sm z-50 shadow-[0_0_10px_rgba(249,115,22,0.15)] border-dashed"
              style={{
                left: `${Math.min(selectionBox.startX, selectionBox.endX)}px`,
                top: `${Math.min(selectionBox.startY, selectionBox.endY)}px`,
                width: `${Math.abs(selectionBox.endX - selectionBox.startX)}px`,
                height: `${Math.abs(selectionBox.endY - selectionBox.startY)}px`,
              }}
            />
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

// label placeholder aria-label
