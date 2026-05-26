// ==========================================================================
// components/inspector/PropertiesInspector.tsx
// Right sidebar for the Post-Production tab.
// Shows properties of the currently selected audio or video clip.
// Reads/writes state via Zustand stores — zero prop drilling for state.
// ==========================================================================
import React from 'react';
import { Settings, Play, Mic, Video } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { usePlaybackStore } from '../../store/usePlaybackStore';

export function PropertiesInspector() {
  const script                     = useProjectStore(s => s.script);
  const timelineClips              = useProjectStore(s => s.timelineClips);
  const timelineVideoClips         = useProjectStore(s => s.timelineVideoClips);
  const setTimelineClips           = useProjectStore(s => s.setTimelineClips);
  const setTimelineVideoClips      = useProjectStore(s => s.setTimelineVideoClips);
  const selectedTimelineVideoClipId = usePlaybackStore(s => s.selectedTimelineVideoClipId);
  const selectedTimelineAudioClipId = usePlaybackStore(s => s.selectedTimelineAudioClipId);

  // Derived selections
  const selectedLine = script.find(l => l.selected);
  const selectedVideoClip = selectedTimelineVideoClipId
    ? timelineVideoClips.find(c => c.id === selectedTimelineVideoClipId)
    : timelineVideoClips.find(c => c.lineId === selectedLine?.id);
  const selectedAudioClip = selectedTimelineAudioClipId
    ? timelineClips.find(c => c.id === selectedTimelineAudioClipId)
    : timelineClips.find(c => c.lineId === selectedLine?.id);

  return (
    <div className="w-[340px] bg-obsidian-dark border-l border-zinc-800/60 p-5 overflow-y-auto flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.2)] z-10">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 mb-5">
        <Settings className="w-4 h-4 text-amber-cinematic" />
        <h3 className="text-sm font-bold text-zinc-200 tracking-wide uppercase">Properties Inspector</h3>
      </div>

      {/* Empty state */}
      {!selectedLine ? (
        <div className="text-xs text-zinc-500 text-center py-12 border border-dashed border-zinc-800 rounded-md bg-obsidian-panel/30 flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-obsidian-panel flex items-center justify-center mb-3">
            <Play className="w-5 h-5 text-zinc-600" />
          </div>
          <span>Click a clip on the timeline<br/>to inspect and edit properties</span>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* General Info */}
          <div>
            <h4 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Line Info</h4>
            <div className="bg-obsidian-panel/50 p-3 rounded-md border border-zinc-800/50">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-zinc-500">Speaker</span>
                <span className="text-[10px] font-bold text-amber-cinematic bg-amber-cinematic/10 px-1.5 py-0.5 rounded-sm">{selectedLine.speaker}</span>
              </div>
              <p className="text-xs text-zinc-300 italic line-clamp-3">"{selectedLine.text}"</p>
            </div>
          </div>

          {/* Video Properties */}
          {selectedVideoClip ? (
            <div>
              <h4 className="text-xs font-semibold text-amber-cinematic mb-2 uppercase tracking-wider flex items-center gap-1">
                <Video className="w-3.5 h-3.5" /> Video Properties
              </h4>
              <div className="bg-obsidian-panel/50 p-3 rounded-md border border-zinc-800/50 flex flex-col gap-3">
                {/* Keep Sound toggle */}
                <div className="flex items-center justify-between">
                  <label className="text-xs text-zinc-300">Keep Original Sound</label>
                  <button
                    onClick={() => {
                      setTimelineVideoClips(prev =>
                        prev.map(c => c.id === selectedVideoClip.id ? { ...c, keepSound: !c.keepSound } : c)
                      );
                    }}
                    className={`text-[10px] px-2 py-1 rounded-sm transition-colors font-semibold ${selectedVideoClip.keepSound ? 'bg-amber-cinematic text-black' : 'bg-zinc-800 text-zinc-400'}`}
                  >
                    {selectedVideoClip.keepSound ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Volume slider */}
                {selectedVideoClip.keepSound && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-zinc-300">Volume</label>
                      <span className="text-[10px] text-amber-cinematic font-mono">{selectedVideoClip.volume ?? 100}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={selectedVideoClip.volume ?? 100}
                      onChange={(e) => {
                        setTimelineVideoClips(prev =>
                          prev.map(c => c.id === selectedVideoClip.id ? { ...c, volume: parseInt(e.target.value) } : c)
                        );
                      }}
                      className="w-full accent-amber-cinematic bg-zinc-800 h-1 rounded-sm appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-amber-cinematic [&::-webkit-slider-thumb]:rounded-sm cursor-pointer"
                    />
                  </div>
                )}

                {/* Slipping Start Offset */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-zinc-300">Slipping Start Offset</label>
                    <span className="text-[10px] text-amber-cinematic font-mono">{(selectedVideoClip.trimStart ?? 0).toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="8"
                    step="0.1"
                    value={selectedVideoClip.trimStart ?? 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setTimelineVideoClips(prev =>
                        prev.map(c => c.id === selectedVideoClip.id ? { ...c, trimStart: val } : c)
                      );
                    }}
                    className="w-full accent-amber-cinematic bg-zinc-800 h-1 rounded-sm appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-amber-cinematic [&::-webkit-slider-thumb]:rounded-sm cursor-pointer"
                  />
                  <p className="text-[9px] text-zinc-500 mt-0.5">Dời điểm bắt đầu phát video (ví dụ: phát từ giây thứ 2.0 thay vì 0s).</p>
                </div>

                {/* Slipping Stop Offset */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-zinc-300">Slipping Stop Offset (Trim End)</label>
                    <span className="text-[10px] text-amber-cinematic font-mono">{(selectedVideoClip.duration ?? 8).toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min={((selectedVideoClip.trimStart ?? 0) + 0.5).toString()}
                    max="8.0"
                    step="0.1"
                    value={((selectedVideoClip.trimStart ?? 0) + (selectedVideoClip.duration ?? 8))}
                    onChange={(e) => {
                      const newStopOffset = parseFloat(e.target.value);
                      const newDuration = Math.max(0.5, newStopOffset - (selectedVideoClip.trimStart ?? 0));
                      setTimelineVideoClips(prev =>
                        prev.map(c => c.id === selectedVideoClip.id ? { ...c, duration: newDuration } : c)
                      );
                    }}
                    className="w-full accent-amber-cinematic bg-zinc-800 h-1 rounded-sm appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-amber-cinematic [&::-webkit-slider-thumb]:rounded-sm cursor-pointer"
                  />
                  <p className="text-[9px] text-zinc-500 mt-0.5">Cắt bớt đuôi video (ví dụ: dừng phát tại giây thứ 6.0 thay vì 8.0s).</p>
                </div>

                {/* Offset time */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <label className="text-xs text-zinc-300">Offset Time (s)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={selectedVideoClip.startTime.toFixed(1)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          setTimelineVideoClips(prev =>
                            prev.map(c => c.id === selectedVideoClip.id ? { ...c, startTime: val } : c)
                          );
                        }
                      }}
                      className="bg-obsidian-dark border border-zinc-800/80 rounded-sm px-2 py-1 text-xs text-zinc-300 w-full font-mono focus:border-amber-cinematic/50 focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-cinematic/5 border border-amber-cinematic/20 rounded-md p-3 text-center">
              <span className="text-xs text-amber-cinematic/70">No video clip linked to this line.</span>
            </div>
          )}

          {/* Audio Properties */}
          {selectedAudioClip && (
            <div>
              <h4 className="text-xs font-semibold text-amber-cinematic mb-2 uppercase tracking-wider flex items-center gap-1">
                <Mic className="w-3.5 h-3.5" /> Audio Properties
              </h4>
              <div className="bg-obsidian-panel/50 p-3 rounded-md border border-zinc-800/50 flex flex-col gap-4">
                {/* Volume slider */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-zinc-300">Clip Volume (Gain)</label>
                    <div className="flex items-center gap-1.5">
                      <button 
                        onClick={() => {
                          setTimelineClips(prev =>
                            prev.map(c => c.id === selectedAudioClip.id ? { ...c, volume: 100 } : c)
                          );
                        }}
                        className="text-[10px] text-zinc-500 hover:text-amber-cinematic p-0.5 rounded transition-colors"
                        title="Reset 100%"
                      >
                        ↺
                      </button>
                      <span className="text-[10px] text-amber-cinematic font-mono w-7 text-right">{selectedAudioClip.volume ?? 100}%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={selectedAudioClip.volume ?? 100}
                    onChange={(e) => {
                      setTimelineClips(prev =>
                        prev.map(c => c.id === selectedAudioClip.id ? { ...c, volume: parseInt(e.target.value) } : c)
                      );
                    }}
                    className="w-full accent-amber-cinematic bg-zinc-800 h-1 rounded-sm appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-amber-cinematic [&::-webkit-slider-thumb]:rounded-sm cursor-pointer"
                  />
                  <p className="text-[9px] text-zinc-500 mt-1">Chỉnh âm lượng riêng cho đoạn thoại này.</p>
                </div>

                <hr className="border-zinc-800/50" />

                {/* Offset time */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-300">Offset Time (s)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={selectedAudioClip.startTime.toFixed(1)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          setTimelineClips(prev =>
                            prev.map(c => c.id === selectedAudioClip.id ? { ...c, startTime: val } : c)
                          );
                        }
                      }}
                      className="bg-obsidian-dark border border-zinc-800/80 rounded-sm px-2 py-1 text-xs text-zinc-300 w-full font-mono focus:border-amber-cinematic/50 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Audio Effects */}
                <div>
                  <label className="text-xs text-zinc-300 block mb-2">Audio Effects (Beta)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="px-2 py-1.5 text-[10px] font-semibold bg-obsidian-dark hover:bg-zinc-800 text-zinc-300 rounded-sm transition-colors border border-zinc-800/80 hover:border-zinc-700">Fade In</button>
                    <button className="px-2 py-1.5 text-[10px] font-semibold bg-obsidian-dark hover:bg-zinc-800 text-zinc-300 rounded-sm transition-colors border border-zinc-800/80 hover:border-zinc-700">Fade Out</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
