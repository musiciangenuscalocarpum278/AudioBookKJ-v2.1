import React from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { usePlaybackStore } from '../../store/usePlaybackStore';
import { Volume2, SlidersHorizontal, Image as ImageIcon, Trash2 } from 'lucide-react';

export function PostProductionInspector() {
  const script = useProjectStore(s => s.script);
  const timelineClips = useProjectStore(s => s.timelineClips);
  const setTimelineClips = useProjectStore(s => s.setTimelineClips);
  const timelineVideoClips = useProjectStore(s => s.timelineVideoClips);
  const setTimelineVideoClips = useProjectStore(s => s.setTimelineVideoClips);
  
  const selectedTimelineAudioClipId = usePlaybackStore(s => s.selectedTimelineAudioClipId);
  const selectedTimelineVideoClipId = usePlaybackStore(s => s.selectedTimelineVideoClipId);
  const setSelectedTimelineAudioClipId = usePlaybackStore(s => s.setSelectedTimelineAudioClipId);
  const setSelectedTimelineVideoClipId = usePlaybackStore(s => s.setSelectedTimelineVideoClipId);

  // Determine active selection
  const selectedAudioClip = selectedTimelineAudioClipId ? timelineClips.find(c => c.id === selectedTimelineAudioClipId) : null;
  const selectedVideoClip = selectedTimelineVideoClipId ? timelineVideoClips.find(c => c.id === selectedTimelineVideoClipId) : null;

  if (!selectedAudioClip && !selectedVideoClip) {
    return (
      <div className="w-80 bg-obsidian-dark border-l border-zinc-800/60 flex flex-col h-[calc(100vh-8rem)]">
        <div className="p-4 border-b border-zinc-800/60">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-amber-cinematic" /> Properties Inspector
          </h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-50">
          <SlidersHorizontal className="w-12 h-12 text-zinc-600 mb-4" />
          <h3 className="text-zinc-300 font-medium mb-2">Chưa chọn Clip</h3>
          <p className="text-xs text-zinc-500">Click vào một Audio Clip hoặc Video Clip dưới Timeline để tinh chỉnh.</p>
        </div>
      </div>
    );
  }

  const handleUpdateAudioClip = (updates: Partial<typeof selectedAudioClip>) => {
    if (!selectedAudioClip) return;
    setTimelineClips(prev => prev.map(c => c.id === selectedAudioClip.id ? { ...c, ...updates } : c));
  };

  const handleUpdateVideoClip = (updates: Partial<typeof selectedVideoClip>) => {
    if (!selectedVideoClip) return;
    setTimelineVideoClips(prev => prev.map(c => c.id === selectedVideoClip.id ? { ...c, ...updates } : c));
  };

  const lineText = selectedAudioClip 
    ? script.find(l => l.id === selectedAudioClip.lineId)?.text 
    : (selectedVideoClip ? script.find(l => l.id === selectedVideoClip.lineId)?.text : '');

  return (
    <div className="w-80 bg-obsidian-dark border-l border-zinc-800/60 flex flex-col h-[calc(100vh-8rem)] overflow-y-auto">
      <div className="p-4 border-b border-zinc-800/60 bg-obsidian-dark sticky top-0 z-10 flex justify-between items-center">
        <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          {selectedAudioClip ? <Volume2 className="w-4 h-4 text-amber-cinematic" /> : <ImageIcon className="w-4 h-4 text-amber-cinematic" />}
          {selectedAudioClip ? 'Audio Properties' : 'Video Properties'}
        </h2>
        <button 
          onClick={() => { setSelectedTimelineAudioClipId(null); setSelectedTimelineVideoClipId(null); }}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Đóng
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Info Block */}
        <div className="p-3 bg-obsidian-panel rounded-md border border-zinc-800/50">
          <div className="text-xs text-zinc-500 mb-1">Dòng kịch bản (Line {selectedAudioClip?.lineId || selectedVideoClip?.lineId})</div>
          <div className="text-sm text-zinc-300 line-clamp-3 italic">"{lineText}"</div>
        </div>

        {selectedAudioClip && (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-zinc-400">Clip Volume (Gain)</label>
                <span className="text-xs text-amber-cinematic font-mono">{selectedAudioClip.volume ?? 100}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                value={selectedAudioClip.volume ?? 100}
                onChange={(e) => handleUpdateAudioClip({ volume: Number(e.target.value) })}
                className="w-full h-1 bg-zinc-800 rounded-sm accent-amber-cinematic appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-amber-cinematic [&::-webkit-slider-thumb]:rounded-sm"
              />
              <p className="text-[10px] text-zinc-500 mt-2">Chỉnh âm lượng chỉ riêng cho đoạn thoại này.</p>
            </div>
            
            <hr className="border-zinc-800/50" />
            
            <div>
              <label className="text-xs font-semibold text-zinc-400 block mb-2">Audio Effects</label>
              <div className="grid grid-cols-2 gap-2">
                <button className="px-3 py-2 text-xs bg-obsidian-panel hover:bg-zinc-800 text-zinc-300 rounded-sm transition-colors border border-zinc-800/80">Fade In</button>
                <button className="px-3 py-2 text-xs bg-obsidian-panel hover:bg-zinc-800 text-zinc-300 rounded-sm transition-colors border border-zinc-800/80">Fade Out</button>
              </div>
            </div>
          </div>
        )}

        {selectedVideoClip && (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-zinc-400">Video Start Offset (Slipping)</label>
                <span className="text-xs text-amber-cinematic font-mono">{(selectedVideoClip.trimStart ?? 0).toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min="0"
                max="8"
                step="0.1"
                value={selectedVideoClip.trimStart ?? 0}
                onChange={(e) => handleUpdateVideoClip({ trimStart: Number(e.target.value) })}
                className="w-full h-1 bg-zinc-850 rounded-sm accent-amber-cinematic appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-amber-cinematic [&::-webkit-slider-thumb]:rounded-sm transition-colors"
              />
              <p className="text-[10px] text-zinc-500 mt-2">Dời điểm bắt đầu phát video (ví dụ: phát từ giây thứ 2.0 thay vị 0s).</p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-zinc-400">Video Stop Offset (Trim End)</label>
                <span className="text-xs text-amber-cinematic font-mono">{((selectedVideoClip.trimStart ?? 0) + (selectedVideoClip.duration ?? 8)).toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={((selectedVideoClip.trimStart ?? 0) + 0.5).toString()}
                max="8.0"
                step="0.1"
                value={((selectedVideoClip.trimStart ?? 0) + (selectedVideoClip.duration ?? 8))}
                onChange={(e) => {
                  const newStopOffset = Number(e.target.value);
                  const newDuration = Math.max(0.5, newStopOffset - (selectedVideoClip.trimStart ?? 0));
                  handleUpdateVideoClip({ duration: newDuration });
                }}
                className="w-full h-1 bg-zinc-850 rounded-sm accent-amber-cinematic appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-amber-cinematic [&::-webkit-slider-thumb]:rounded-sm transition-colors"
              />
              <p className="text-[10px] text-zinc-500 mt-2">Cắt bớt đuôi video (ví dụ: dừng phát tại giây thứ 6.0 thay vì 8.0s).</p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-zinc-400">Video Opacity</label>
                <span className="text-xs text-zinc-500 font-mono">100%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={100}
                disabled
                className="w-full h-1 bg-zinc-800 rounded-sm accent-zinc-600 appearance-none cursor-not-allowed opacity-50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-zinc-600 [&::-webkit-slider-thumb]:rounded-sm"
              />
              <p className="text-[10px] text-zinc-500 mt-2">(Tính năng Opacity đang phát triển)</p>
            </div>
          </div>
        )}

        <button 
          className="w-full mt-4 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-sm transition-colors border border-rose-500/20"
          onClick={() => {
            if (selectedAudioClip) {
              setTimelineClips(prev => prev.filter(c => c.id !== selectedAudioClip.id));
              setSelectedTimelineAudioClipId(null);
            }
            if (selectedVideoClip) {
              setTimelineVideoClips(prev => prev.filter(c => c.id !== selectedVideoClip.id));
              setSelectedTimelineVideoClipId(null);
            }
          }}
        >
          <Trash2 className="w-4 h-4" /> Xóa Clip Khỏi Timeline
        </button>
      </div>
    </div>
  );
}
