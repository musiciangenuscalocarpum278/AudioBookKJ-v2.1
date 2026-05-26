import React from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Film, Wand2, Play, Pause, Video, Loader2, ChevronDown, ChevronRight, Plus, RefreshCw, Sparkles, Trash2, Volume2, LayoutGrid, Image } from 'lucide-react';
import axios from 'axios';
import { VideoStudioContext } from './VideoStudioContext';
import { API } from '../../config';
import type { InlineVideoNode } from '../../types';
import { useProjectStore } from '../../store/useProjectStore';

// ── Scene Node Card ───────────────────────────────────────────────────────

const SceneNodeCard = ({ id, data, selected }: NodeProps) => {
  const context = React.useContext(VideoStudioContext);
  const { setNodes, getNodes, getEdges } = useReactFlow();
  const flowkitConnected = useProjectStore(s => s.flowkitConnected);

  // ── Phase 4.1: Luật Khóa phụ thuộc (Sequential Rendering Dependency) ──
  let isLocked = false;
  let missingRequirement = '';
  let hasUpstreamVideo = false;
  let upstreamVideoUrl = '';
  const incomingEdges = getEdges().filter(e => e.target === id);
  const previousDependencyEdge = incomingEdges.find(e => e.source.startsWith('shot_') || e.source.startsWith('video_'));
  
  if (previousDependencyEdge) {
    const prevNodeId = previousDependencyEdge.source;
    const prevNode = getNodes().find(n => n.id === prevNodeId);
    if (prevNode) {
      if (prevNode.type === 'scene') {
        isLocked = true;
        const prevIndex = parseInt(prevNodeId.replace('shot_', '')) + 1;
        missingRequirement = `Chờ Scene ${prevIndex} bắt đầu Gen Video`;
      } else if (prevNode.type === 'video') {
        hasUpstreamVideo = true;
        if (prevNode.data.videoUrl) upstreamVideoUrl = prevNode.data.videoUrl as string;
        if (prevNode.data.isGeneratingVideo) {
          isLocked = true;
          missingRequirement = `Đang chờ Render Video trước đó...`;
        }
      }
    }
  }

  const isGenerating = data.isGenerating as boolean;
  const frameUrl = data.frameUrl as string;
  const useAiMode = (data.useAiMode as boolean) ?? false;
  const renderMode = (data.renderMode as 'single' | 'grid') ?? 'single';
  const gridSize = data.gridSize as '2x2' | '3x4' | null;
  const errorMsg = data.error as string | undefined;
  const [isEditing, setIsEditing] = React.useState(false);
  const [tempPrompt, setTempPrompt] = React.useState(data.prompt as string);
  const [showAiPrompt, setShowAiPrompt] = React.useState(false);

  // ── Inline audio preview ──────────────────────────────────────────────────
  const timelineClips = useProjectStore(s => s.timelineClips);
  const [isPreviewingAudio, setIsPreviewingAudio] = React.useState(false);
  const audioPreviewRef = React.useRef<HTMLAudioElement | null>(null);

  const sceneLineIds = React.useMemo(() => {
    if (!data.lines) return [] as number[];
    return String(data.lines).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  }, [data.lines]);

  const sceneClips = React.useMemo(() =>
    timelineClips.filter(c => sceneLineIds.includes(c.lineId)).sort((a, b) => a.startTime - b.startTime),
    [timelineClips, sceneLineIds]
  );

  const script = useProjectStore(s => s.script);

  const displayLines = React.useMemo(() => {
    if (!data.lines) return 'Chưa gán';
    const ids = String(data.lines)
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n));
    if (ids.length === 0) return 'Chưa gán';
    const positions = ids.map(id => {
      const idx = script.findIndex(l => l.id === id);
      return idx !== -1 ? `Dòng ${idx + 1}` : `ID: ${id}`;
    });
    return positions.join(', ');
  }, [data.lines, script]);

  const handleLineChange = React.useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setNodes(prev => prev.map(node => {
      if (node.id === id) {
        return {
          ...node,
          data: {
            ...node.data,
            lines: val
          }
        };
      }
      return node;
    }));
  }, [id, setNodes]);

  const stopPreview = React.useCallback(() => {
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current.src = '';
      audioPreviewRef.current = null;
    }
    setIsPreviewingAudio(false);
  }, []);

  React.useEffect(() => () => { stopPreview(); }, [stopPreview]);

  const handlePreviewAudio = React.useCallback(() => {
    if (isPreviewingAudio) { stopPreview(); return; }
    if (sceneClips.length === 0) return;
    setIsPreviewingAudio(true);
    let index = 0;
    const playNext = () => {
      if (index >= sceneClips.length) { stopPreview(); return; }
      const audio = new Audio(sceneClips[index].audioUrl);
      audioPreviewRef.current = audio;
      audio.onended = () => { index++; playNext(); };
      audio.onerror = () => { index++; playNext(); };
      audio.play().catch(() => stopPreview());
    };
    playNext();
  }, [isPreviewingAudio, sceneClips, stopPreview]);

  const anyGenerating = isGenerating || (data.isGeneratingVideo as boolean);

  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-zinc-950 border border-zinc-700 hover:border-amber-cinematic rounded-full"
      />

      {/* COMPACT VIEW */}
      <div
        className={`scene-node-compact bg-obsidian-panel border shadow-sm w-36 h-16 flex flex-col items-center justify-center transition-colors rounded-xl ${
          selected ? 'border-amber-cinematic shadow-[0_0_10px_rgba(249,115,22,0.2)]' : 'border-zinc-800'
        }`}
      >
        <Film className="w-4 h-4 text-amber-cinematic mb-1 animate-pulse" />
        <span className="text-[9px] text-zinc-300 font-bold max-w-[120px] truncate px-1 font-mono tracking-wider">
          {data.sceneName as string}
        </span>
      </div>

      {/* DETAILED VIEW */}
      <div className="scene-node-detailed flex gap-4 items-start">
        <div
          className={`bg-obsidian-panel border rounded-xl shadow-md w-80 overflow-hidden group transition-all duration-150 shrink-0 ${
            selected
              ? errorMsg
                ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)] scale-[1.005]'
                : 'border-amber-cinematic shadow-[0_0_15px_rgba(249,115,22,0.25)] scale-[1.005]'
              : errorMsg
              ? 'border-red-500/50 hover:border-red-400'
              : 'border-zinc-800 hover:border-zinc-750'
          }`}
        >
          {/* Header */}
          <div className="bg-zinc-950 p-2.5 border-b border-zinc-850 flex justify-between items-center">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Film className="w-4 h-4 text-amber-cinematic" />
              <span className="font-bold text-[11px] text-zinc-200 uppercase tracking-wider font-mono">
                {data.sceneName as string}
              </span>
              {renderMode === 'grid' ? (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-mono tracking-wider uppercase bg-amber-cinematic/15 text-amber-cinematic border border-amber-cinematic/30">
                  <LayoutGrid className="w-2.5 h-2.5 text-amber-cinematic" />
                  Grid ({gridSize || '2x2'})
                </span>
              ) : (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] font-mono tracking-wider uppercase bg-zinc-900 text-zinc-400 border border-zinc-800">
                  <Image className="w-2.5 h-2.5 text-zinc-500" />
                  Single
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative flex items-center bg-zinc-950 border border-zinc-800 hover:border-amber-cinematic/50 rounded-md px-1.5 py-0.5 transition-colors">
                <label htmlFor={`lines-select-${id}`} className="sr-only">Select Script Line</label>
                <span className="text-[9px] font-mono text-zinc-500 mr-1 select-none uppercase tracking-wider">
                  Lines:
                </span>
                <select
                  id={`lines-select-${id}`}
                  value={data.lines ? String(data.lines) : ''}
                  onChange={handleLineChange}
                  className="bg-transparent text-[9px] font-bold text-amber-cinematic focus:outline-none cursor-pointer pr-4 appearance-none font-mono max-w-[110px] truncate"
                  style={{
                    backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23f97316' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
                    backgroundPosition: 'right -4px center',
                    backgroundSize: '14px',
                    backgroundRepeat: 'no-repeat',
                  }}
                >
                  {!data.lines && (
                    <option value="" className="bg-zinc-950 text-zinc-500 font-mono">
                      -- N/A --
                    </option>
                  )}
                  {data.lines && String(data.lines).includes(',') && (
                    <option value={String(data.lines)} className="bg-zinc-950 text-zinc-200 font-sans">
                      {displayLines}
                    </option>
                  )}
                  {script.map((line, index) => {
                    const displayText = `Dòng ${index + 1} (${line.speaker}): ${line.text.substring(0, 20)}${
                      line.text.length > 20 ? '...' : ''
                    }`;
                    return (
                      <option key={line.id} value={line.id.toString()} className="bg-zinc-950 text-zinc-200 font-sans">
                        {displayText}
                      </option>
                    );
                  })}
                </select>
              </div>
              {sceneClips.length > 0 && (
                <button
                  onClick={handlePreviewAudio}
                  title={
                    isPreviewingAudio ? 'Stop preview' : `Preview audio (${sceneClips.length} clip${sceneClips.length > 1 ? 's' : ''})`
                  }
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-mono tracking-wider uppercase transition-colors ${
                    isPreviewingAudio
                      ? 'bg-amber-cinematic/25 text-amber-cinematic hover:bg-amber-cinematic/35 border border-amber-cinematic/35'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-amber-cinematic border border-zinc-700'
                  }`}
                >
                  {isPreviewingAudio ? <Pause className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />}
                  {isPreviewingAudio ? 'Stop' : 'Audio'}
                </button>
              )}
              <button
                onClick={() => context?.onDeleteScene(id)}
                title="Delete scene"
                aria-label="Delete scene"
                className="p-1 text-zinc-500 hover:bg-red-950/20 hover:text-red-400 rounded-md transition-colors ml-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Frame preview */}
          {frameUrl && (
            <div
              className={`w-full bg-zinc-950 border-b border-zinc-850 relative ${
                context?.aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'
              }`}
            >
              <img src={frameUrl} alt="Generated Frame" className="w-full h-full object-cover opacity-75" />
            </div>
          )}

          {/* Prompt Preview (Read-only on card) */}
          <div className="p-3 bg-zinc-950/30">
            <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-3">
              {useAiMode
                ? (data.userIntent as string) || 'Chưa có intent...'
                : (data.prompt as string) || 'Chưa có prompt...'}
            </p>
          </div>

          {errorMsg && (
            <div className="bg-red-950/20 border-t border-red-900/60 p-2 text-[9px] text-red-300 font-mono flex flex-col gap-1">
              <div className="flex items-center gap-1 font-bold text-red-400 uppercase tracking-wider">
                <RefreshCw className="w-3 h-3 animate-spin-hover" /> Generation Error
              </div>
              <p className="line-clamp-3 leading-relaxed text-zinc-400">{errorMsg}</p>
            </div>
          )}

          {/* Frame / Video generation buttons */}
          <div className="bg-zinc-950 p-2 flex justify-between gap-2 border-t border-zinc-850">
            <div className="flex gap-1.5 items-stretch w-full justify-between">
              <div className="flex gap-1.5">
                {hasUpstreamVideo ? (
                  <button
                    onClick={() => {
                      if (upstreamVideoUrl) context?.onExtractLastFrame(id, upstreamVideoUrl);
                    }}
                    disabled={anyGenerating || !upstreamVideoUrl}
                    className="px-2.5 py-1.5 bg-amber-cinematic/15 hover:bg-amber-cinematic/25 disabled:bg-zinc-900 disabled:text-zinc-660 disabled:border-zinc-850 border border-amber-cinematic/35 text-amber-cinematic rounded-md text-[9px] font-mono tracking-wider uppercase flex items-center gap-1 transition-colors shadow-sm"
                    title="Extracts last frame from previous Video to use as starting image"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-3 h-3 animate-spin text-amber-cinematic" />
                    ) : (
                      <Film className="w-3 h-3" />
                    )}
                    {isGenerating ? 'Extracting...' : 'Auto-Frame'}
                  </button>
                ) : (
                  <button
                    onClick={() => context?.onGenFrame(id)}
                    disabled={anyGenerating || !flowkitConnected}
                    className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-650 disabled:border-zinc-850 border border-zinc-700 text-zinc-200 rounded-md text-[9px] font-mono tracking-wider uppercase flex items-center gap-1 transition-colors shadow-sm"
                    title={
                      !flowkitConnected ? 'FlowKit Extension not connected' : isLocked ? missingRequirement : 'Gen starting frame for video'
                    }
                  >
                    {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    {isGenerating ? 'Gen...' : 'Gen Frame'}
                  </button>
                )}
              </div>

              <button
                onClick={() => context?.onGenVideo(id)}
                disabled={
                  anyGenerating ||
                  !flowkitConnected ||
                  (!data.frameMediaId && !hasUpstreamVideo) ||
                  (useAiMode && !data.aiPrompt)
                }
                title={
                  !flowkitConnected
                    ? 'FlowKit Extension not connected'
                    : isLocked
                    ? missingRequirement
                    : !data.frameMediaId && !hasUpstreamVideo
                    ? 'Gen Frame first'
                    : useAiMode && !data.aiPrompt
                    ? 'Generate AI Prompt first'
                    : 'Generate Video'
                }
                className="px-3 py-1.5 bg-amber-cinematic hover:bg-amber-glow disabled:bg-zinc-900 disabled:border-zinc-850 disabled:text-zinc-650 text-zinc-950 font-bold rounded-md text-[9px] font-mono tracking-wider uppercase flex items-center gap-1.5 transition-colors border border-amber-cinematic shadow-sm"
              >
                {data.isGeneratingVideo as boolean ? (
                  <Loader2 className="w-3 h-3 animate-spin text-zinc-950" />
                ) : (
                  <Video className="w-3 h-3" />
                )}
                {data.isGeneratingVideo as boolean ? 'Generating...' : 'Gen Video'}
              </button>
            </div>
          </div>
          {/* End main card container */}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-zinc-950 border border-zinc-700 hover:border-amber-cinematic rounded-full"
      />
    </div>
  );
};

export default React.memo(SceneNodeCard, (prevProps, nextProps) => {
  if (prevProps.id !== nextProps.id) return false;
  if (prevProps.selected !== nextProps.selected) return false;

  const p = prevProps.data;
  const n = nextProps.data;
  if (p.sceneName !== n.sceneName) return false;
  if (p.lines !== n.lines) return false;
  if (p.prompt !== n.prompt) return false;
  if (p.aiPrompt !== n.aiPrompt) return false;
  if (p.useAiMode !== n.useAiMode) return false;
  if (p.renderMode !== n.renderMode) return false;
  if (p.gridSize !== n.gridSize) return false;
  if (p.error !== n.error) return false;
  if (p.isGenerating !== n.isGenerating) return false;
  if (p.isGeneratingVideo !== n.isGeneratingVideo) return false;
  if (p.frameUrl !== n.frameUrl) return false;
  if (p.frameMediaId !== n.frameMediaId) return false;
  if (p.userIntent !== n.userIntent) return false;

  return true;
});

// label placeholder aria-label
