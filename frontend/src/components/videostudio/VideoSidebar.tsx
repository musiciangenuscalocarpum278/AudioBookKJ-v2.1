import React, { useState, useEffect } from 'react';
import { FileText, ChevronDown, ChevronUp, Wand2, Loader2, X } from 'lucide-react';
import type { ScriptLine } from '../../types';

interface VideoSidebarProps {
  script: ScriptLine[];
  activeLineIds: number[];
  isGeneratingStoryboard: boolean;
  onGenerateStoryboard: () => void;
  scriptListRefs: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
  focusCanvas?: boolean;
}

const VideoSidebar: React.FC<VideoSidebarProps> = ({
  script,
  activeLineIds,
  isGeneratingStoryboard,
  onGenerateStoryboard,
  scriptListRefs,
  focusCanvas = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Auto-scroll when active line changes or popover opens
  useEffect(() => {
    if (isOpen && activeLineIds.length > 0) {
      const timer = setTimeout(() => {
        const el = scriptListRefs.current[activeLineIds[0]];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeLineIds, scriptListRefs]);

  if (focusCanvas && !isOpen) {
    return null;
  }

  return (
    <div className={`absolute top-4 left-4 z-50 flex flex-col gap-2 pointer-events-none transition-opacity duration-300 ${focusCanvas && !isOpen ? 'opacity-0' : 'opacity-100'}`}>
      
      {/* Floating Pill / Launcher */}
      <div 
        className="pointer-events-auto bg-obsidian-panel border border-zinc-800/60 shadow-xl rounded-md flex items-center p-1.5 pr-4 gap-3 cursor-pointer hover:bg-zinc-800 transition-colors w-fit" 
        onClick={() => setIsOpen(!isOpen)}
        title={isOpen ? "Đóng kịch bản" : "Mở kịch bản"}
      >
        <div className={`p-2 rounded-sm transition-colors border ${activeLineIds.length > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-cinematic/10 text-amber-cinematic border-amber-cinematic/30'}`}>
          <FileText className="w-4 h-4" />
        </div>
        <div className="flex flex-col text-left">
          <span className="text-[10px] font-bold text-zinc-200 uppercase tracking-wider leading-none mb-0.5">Script List</span>
          <span className="text-[9px] text-zinc-400 leading-none">
            {script.length} lines {activeLineIds.length > 0 ? `• ${activeLineIds.length} selected` : ''}
          </span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-500 ml-2" /> : <ChevronDown className="w-4 h-4 text-zinc-500 ml-2" />}
      </div>

      {/* Script Popover */}
      {isOpen && (
        <div className="pointer-events-auto w-[340px] h-[calc(100vh-180px)] bg-obsidian-panel/95 backdrop-blur-xl border border-zinc-800/60 shadow-2xl rounded-md flex flex-col overflow-hidden">
          
          <div className="p-3 border-b border-zinc-800/60 flex justify-between items-center bg-obsidian-panel shrink-0">
            <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Script Content</span>
            <div className="flex items-center gap-2">
              <button
                onClick={onGenerateStoryboard}
                disabled={isGeneratingStoryboard || script.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold rounded-sm bg-amber-cinematic hover:bg-amber-glow text-zinc-950 disabled:opacity-50 transition-all border border-amber-cinematic/40 shadow-md shadow-amber-cinematic/10"
                title="Sử dụng AI Director để phân cảnh"
              >
                {isGeneratingStoryboard ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                AI Director
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1 text-zinc-500 hover:text-zinc-200 rounded-sm transition-colors"><X className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {script.length === 0 ? (
              <div className="text-zinc-500 text-xs text-center py-10">
                Kịch bản trống. Vui lòng quay lại Audio Studio để tạo kịch bản.
              </div>
            ) : (
              script.map((line, idx) => {
                const isActive = activeLineIds.includes(line.id);
                const speakerInitials = line.speaker.substring(0, 2).toUpperCase();
                
                return (
                  <div
                    key={line.id}
                    ref={(el) => { scriptListRefs.current[line.id] = el; }}
                    className={`border rounded-md transition-all duration-300 p-3 flex gap-3 ${
                      isActive
                        ? 'bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                        : 'bg-zinc-900/30 border-zinc-800/50'
                    }`}
                  >
                    <div className="shrink-0 flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-sm border flex items-center justify-center text-[9px] font-bold mb-1 ${isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>
                        {speakerInitials}
                      </div>
                      <span className="text-[8px] font-bold text-zinc-500">L.{idx + 1}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm border uppercase tracking-wider ${isActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-zinc-850 text-zinc-400 border-zinc-800'}`}>
                          {line.speaker}
                        </span>
                      </div>
                      <p className={`text-[11px] leading-relaxed break-words ${isActive ? 'text-emerald-100' : 'text-zinc-300'}`}>
                        {line.text}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      )}

    </div>
  );
};

export default VideoSidebar;
