import React from 'react';
import { Film, Loader2, Play, AlertCircle, CheckCircle, Search, RefreshCw, Layers } from 'lucide-react';
import type { ScriptLine } from '../../types';

interface VideoRenderSidebarProps {
  nodes: any[];
  edges: any[];
  script: ScriptLine[];
  onLocateNode: (nodeId: string) => void;
  onReRender: (nodeId: string) => void;
  activeStep: string;
}

const VideoRenderSidebar: React.FC<VideoRenderSidebarProps> = ({
  nodes,
  edges,
  script,
  onLocateNode,
  onReRender,
  activeStep,
}) => {
  if (activeStep !== 'render') return null;

  // Filter video nodes
  const videoNodes = nodes.filter(n => n.type === 'video');

  // Map video nodes with their parent scenes and prompt metadata
  const renderItems = videoNodes.map(videoNode => {
    // Find parent scene node
    const incomingEdge = edges.find(e => e.target === videoNode.id);
    const parentScene = incomingEdge 
      ? nodes.find(n => n.id === incomingEdge.source && n.type === 'scene') 
      : null;

    // Get prompt / scene name
    const sceneName = parentScene?.data?.sceneName || 'B-Roll Clip';
    const linesStr = parentScene?.data?.lines as string | undefined;
    
    // Get first script line text if available
    let textPreview = '';
    if (linesStr) {
      const lineIds = linesStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      const matchingLines = script.filter(l => lineIds.includes(l.id));
      if (matchingLines.length > 0) {
        textPreview = matchingLines[0].text;
      }
    }

    const isGrid = !!videoNode.data?.is_grid;
    const isGeneratingVideo = !!videoNode.data?.isGeneratingVideo;
    const videoUrl = videoNode.data?.videoUrl as string | undefined;
    const errorMsg = videoNode.data?.error as string | undefined;
    
    // For grid mode, calculate completed slices
    let gridProgressText = '';
    let completedSlices = 0;
    let totalSlices = 0;
    let firstFinishedSliceUrl: string | undefined = undefined;

    if (isGrid && videoNode.data?.slices && Array.isArray(videoNode.data.slices)) {
      const slices = videoNode.data.slices;
      totalSlices = slices.length;
      completedSlices = slices.filter((s: any) => !!s.videoUrl).length;
      gridProgressText = `${completedSlices}/${totalSlices} slices`;
      
      const finishedSlice = slices.find((s: any) => !!s.videoUrl);
      if (finishedSlice) {
        firstFinishedSliceUrl = finishedSlice.videoUrl;
      }
    }

    // Determine aggregate status
    // 'ready', 'rendering', 'error', 'idle'
    let status: 'ready' | 'rendering' | 'error' | 'idle' = 'idle';
    if (isGrid) {
      const activeSlices = videoNode.data.slices?.filter((s: any) => !s.videoUrl && !s.error && s.isGenerating !== false) || [];
      if (activeSlices.length > 0 || isGeneratingVideo) {
        status = 'rendering';
      } else if (completedSlices === totalSlices && totalSlices > 0) {
        status = 'ready';
      } else if (videoNode.data.slices?.some((s: any) => !!s.error) || errorMsg) {
        status = 'error';
      }
    } else {
      if (isGeneratingVideo) {
        status = 'rendering';
      } else if (videoUrl) {
        status = 'ready';
      } else if (errorMsg) {
        status = 'error';
      }
    }

    return {
      id: videoNode.id,
      sceneName,
      textPreview,
      status,
      videoUrl: isGrid ? firstFinishedSliceUrl : videoUrl,
      isGrid,
      gridProgressText,
      completedSlices,
      totalSlices,
      errorMsg: errorMsg || 'Lỗi render clip',
      rawNode: videoNode
    };
  });

  // Calculate statistics
  const total = renderItems.length;
  const rendering = renderItems.filter(item => item.status === 'rendering').length;
  const completed = renderItems.filter(item => item.status === 'ready').length;
  const failed = renderItems.filter(item => item.status === 'error').length;

  return (
    <div className="absolute right-4 top-4 z-50 flex gap-3 h-[calc(100%-32px)] pointer-events-none">
      
      {/* Render Progress Drawer */}
      <div className="pointer-events-auto w-[330px] bg-obsidian-panel/95 backdrop-blur-xl border border-zinc-800/60 shadow-2xl rounded-md flex flex-col h-full overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-zinc-800/60 bg-obsidian-panel/80">
          <div className="flex items-center gap-2 text-zinc-100">
            <div className="p-1 rounded-sm bg-amber-cinematic/10 border border-amber-cinematic/20">
              <Film className="w-4 h-4 text-amber-cinematic animate-pulse" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider">Tiến Trình Render</span>
              <span className="text-[9px] text-zinc-500 font-medium">Video Studio Pipeline</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-1 p-2 bg-zinc-950/60 border-b border-zinc-850 shrink-0 text-center">
          <div className="p-1.5 rounded-sm bg-zinc-900/40 border border-zinc-800/40">
            <div className="text-[10px] text-zinc-500 font-bold uppercase">Tổng</div>
            <div className="text-sm font-bold text-zinc-300 mt-0.5">{total}</div>
          </div>
          <div className="p-1.5 rounded-sm bg-amber-500/5 border border-amber-500/10">
            <div className="text-[10px] text-amber-500/70 font-bold uppercase">Chạy</div>
            <div className="text-sm font-bold text-amber-400 mt-0.5 flex items-center justify-center gap-1">
              {rendering > 0 && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
              {rendering}
            </div>
          </div>
          <div className="p-1.5 rounded-sm bg-emerald-500/5 border border-emerald-500/10">
            <div className="text-[10px] text-emerald-500/70 font-bold uppercase">Xong</div>
            <div className="text-sm font-bold text-emerald-400 mt-0.5">{completed}</div>
          </div>
          <div className="p-1.5 rounded-sm bg-rose-500/5 border border-rose-500/10">
            <div className="text-[10px] text-rose-500/70 font-bold uppercase">Lỗi</div>
            <div className="text-sm font-bold text-rose-400 mt-0.5">{failed}</div>
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar min-h-0">
          {renderItems.map((item) => {
            return (
              <div 
                key={item.id}
                className={`p-2.5 rounded border transition-all duration-300 relative group flex gap-3 ${
                  item.status === 'rendering' 
                    ? 'bg-amber-500/5 border-amber-500/20 shadow-md shadow-amber-500/5' 
                    : item.status === 'ready'
                    ? 'bg-zinc-900/30 border-zinc-800/80 hover:border-emerald-500/30 hover:bg-zinc-800/20'
                    : item.status === 'error'
                    ? 'bg-rose-950/10 border-rose-900/30 shadow-[inset_0_1px_1px_rgba(244,63,94,0.05)]'
                    : 'bg-zinc-900/20 border-zinc-850'
                }`}
              >
                
                {/* Media Thumbnail or Status Spinner */}
                <div className="w-14 h-14 shrink-0 rounded-sm bg-zinc-950 border border-zinc-850 flex items-center justify-center overflow-hidden relative group/thumb shadow-sm">
                  {item.status === 'ready' && item.videoUrl ? (
                    <>
                      <video 
                        src={item.videoUrl} 
                        muted 
                        loop 
                        playsInline 
                        className="w-full h-full object-cover" 
                        onMouseOver={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                        onMouseOut={(e) => {
                          const v = e.target as HTMLVideoElement;
                          v.pause();
                          v.currentTime = 0;
                        }}
                      />
                      <div className="absolute inset-0 bg-black/45 opacity-100 group-hover/thumb:opacity-0 transition-opacity flex items-center justify-center pointer-events-none">
                        <Play className="w-3 h-3 text-zinc-300 drop-shadow-md" />
                      </div>
                    </>
                  ) : item.status === 'rendering' ? (
                    <div className="flex flex-col items-center justify-center gap-1 w-full h-full bg-zinc-950/80">
                      <Loader2 className="w-4 h-4 text-amber-cinematic animate-spin" />
                      {item.isGrid && (
                        <span className="text-[7px] text-amber-cinematic/80 font-bold uppercase tracking-wider font-mono">
                          {item.completedSlices}/{item.totalSlices}
                        </span>
                      )}
                    </div>
                  ) : item.status === 'error' ? (
                    <div className="flex items-center justify-center w-full h-full bg-rose-950/30">
                      <AlertCircle className="w-5 h-5 text-rose-500" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-full h-full bg-zinc-900/40">
                      <Film className="w-4 h-4 text-zinc-700" />
                    </div>
                  )}

                  {/* Aspect Ratio Badge / Mode Badge */}
                  {item.isGrid && (
                    <span className="absolute bottom-0.5 right-0.5 bg-indigo-950/90 text-indigo-400 border border-indigo-500/20 text-[6px] font-bold px-1 py-0.2 rounded font-mono shadow-sm flex items-center gap-0.5">
                      <Layers className="w-1.5 h-1.5" /> GRID
                    </span>
                  )}
                </div>

                {/* Info and action */}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-zinc-200 text-xs truncate max-w-[130px]">{item.sceneName}</span>
                      
                      {/* Badge indicator */}
                      {item.status === 'rendering' && (
                        <span className="bg-amber-500/10 text-amber-400 text-[8px] font-bold px-1.5 py-0.5 rounded-sm border border-amber-500/20 flex items-center gap-1 animate-pulse">
                          Đang Render
                        </span>
                      )}
                      {item.status === 'ready' && (
                        <span className="bg-emerald-500/10 text-emerald-400 text-[8px] font-bold px-1.5 py-0.5 rounded-sm border border-emerald-500/20 flex items-center gap-0.5">
                          <CheckCircle className="w-2.5 h-2.5" /> Hoàn thành
                        </span>
                      )}
                      {item.status === 'error' && (
                        <span className="bg-rose-500/10 text-rose-400 text-[8px] font-bold px-1.5 py-0.5 rounded-sm border border-rose-500/20 flex items-center gap-0.5">
                          Lỗi
                        </span>
                      )}
                      {item.status === 'idle' && (
                        <span className="bg-zinc-800 text-zinc-400 text-[8px] font-bold px-1.5 py-0.5 rounded-sm border border-zinc-700/50">
                          Chờ
                        </span>
                      )}
                    </div>

                    {item.textPreview && (
                      <p className="text-[10px] text-zinc-400 truncate mt-1 italic font-medium leading-relaxed">
                        "{item.textPreview}"
                      </p>
                    )}

                    {item.isGrid && item.status === 'rendering' && (
                      <div className="w-full bg-zinc-950 rounded-full h-1 mt-1.5 overflow-hidden border border-zinc-850">
                        <div 
                          className="bg-amber-cinematic h-full transition-all duration-500" 
                          style={{ width: `${(item.completedSlices / item.totalSlices) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Interactions overlay / quick action buttons */}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => onLocateNode(item.id)}
                      className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 hover:border-amber-cinematic/50 hover:bg-zinc-800 hover:text-amber-cinematic text-[9px] font-bold text-zinc-400 rounded-sm transition-all duration-200 flex items-center gap-1"
                      title="Tìm kiếm và định vị node trên bản vẽ"
                    >
                      <Search className="w-2.5 h-2.5" /> Định vị
                    </button>

                    {item.status === 'error' && (
                      <button
                        onClick={() => onReRender(item.id)}
                        className="px-2 py-0.5 bg-rose-950/40 border border-rose-900/50 hover:bg-rose-900 hover:text-white text-[9px] font-bold text-rose-300 rounded-sm transition-all duration-200 flex items-center gap-1"
                      >
                        <RefreshCw className="w-2.5 h-2.5" /> Thử lại
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {renderItems.length === 0 && (
            <div className="text-center py-16 px-4">
              <Film className="w-8 h-8 text-zinc-700 mx-auto mb-2.5 stroke-1" />
              <div className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Chưa có clip nào</div>
              <p className="text-[10px] text-zinc-650 mt-1 max-w-[200px] mx-auto">Tạo kịch bản và storyboard trước khi bắt đầu render.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoRenderSidebar;
