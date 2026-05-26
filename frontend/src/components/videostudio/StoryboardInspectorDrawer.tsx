import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, Film, Edit3, Image, LayoutGrid } from 'lucide-react';
import type { Node } from '@xyflow/react';

interface StoryboardInspectorDrawerProps {
  node: Node;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  onGenIntentPrompt: (sceneId: string, nodeId: string) => void;
  onClose: () => void;
}

const StoryboardInspectorDrawer: React.FC<StoryboardInspectorDrawerProps> = ({
  node,
  setNodes,
  onGenIntentPrompt,
  onClose,
}) => {
  const data = node.data;
  const useAiMode = (data.useAiMode as boolean) ?? false;
  const renderMode = (data.renderMode as 'single' | 'grid') ?? 'single';
  const gridSize = (data.gridSize as '2x2' | '3x4') ?? '2x2';
  
  const [localIntent, setLocalIntent] = useState((data.userIntent as string) || '');
  const [localNegative, setLocalNegative] = useState((data.negativePrompt as string) || '');
  const [localNotes, setLocalNotes] = useState((data.directorNotes as string) || '');
  const [localPrompt, setLocalPrompt] = useState((data.prompt as string) || '');
  const [localImagePrompt, setLocalImagePrompt] = useState((data.imagePrompt as string) || (data.prompt as string) || '');
  const [localVideoPrompt, setLocalVideoPrompt] = useState((data.videoPrompt as string) || (data.prompt as string) || '');

  // Reset local state when node selection changes
  useEffect(() => {
    setLocalIntent((data.userIntent as string) || '');
    setLocalNegative((data.negativePrompt as string) || '');
    setLocalNotes((data.directorNotes as string) || '');
    setLocalPrompt((data.prompt as string) || '');
    setLocalImagePrompt((data.imagePrompt as string) || (data.prompt as string) || '');
    setLocalVideoPrompt((data.videoPrompt as string) || (data.prompt as string) || '');
  }, [node.id, data.userIntent, data.negativePrompt, data.directorNotes, data.prompt, data.imagePrompt, data.videoPrompt]);

  const updateNodeData = (field: string, value: any) => {
    setNodes((nds) => nds.map((n) => n.id === node.id ? { ...n, data: { ...n.data, [field]: value } } : n));
  };

  const setMode = (ai: boolean) => updateNodeData('useAiMode', ai);

  return (
    <div className="absolute right-4 top-4 z-40 pointer-events-auto w-[340px] h-[calc(100%-32px)] bg-obsidian-panel/95 backdrop-blur-xl border border-zinc-800/60 shadow-2xl rounded-none flex flex-col overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800/60 bg-obsidian-panel shrink-0">
        <div className="flex items-center gap-2 text-amber-cinematic">
          <Film className="w-4 h-4 text-amber-cinematic" />
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-200">
            {data.sceneName as string || 'Scene Inspector'}
          </span>
        </div>
        <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-200 rounded-none hover:bg-zinc-850/60 transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Render Mode Section - Breathtaking premium toggle */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Render Mode</label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-950 border border-zinc-850 rounded-none">
            <button
              onClick={() => {
                updateNodeData('renderMode', 'single');
                updateNodeData('gridSize', null);
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-none border transition-all duration-200 ${renderMode === 'single' ? 'bg-zinc-900 border-zinc-700 text-zinc-200 shadow-sm' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
            >
              <Image className="w-3.5 h-3.5" />
              Single Shot
            </button>
            <button
              onClick={() => {
                updateNodeData('renderMode', 'grid');
                updateNodeData('gridSize', '2x2');
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold rounded-none border transition-all duration-200 ${renderMode === 'grid' ? 'bg-amber-cinematic border-amber-cinematic text-zinc-950 shadow-md shadow-amber-cinematic/15 font-bold' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Storyboard Grid
            </button>
          </div>
        </div>

        {/* Grid Size Selection - Displays only when Grid is active */}
        {renderMode === 'grid' && (
          <div className="space-y-2 animate-fade-in">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Grid Panel Size</label>
            <div className="flex gap-2">
              <button
                onClick={() => updateNodeData('gridSize', '2x2')}
                className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-none border transition-all ${gridSize === '2x2' ? 'bg-amber-cinematic/10 border-amber-cinematic/40 text-amber-cinematic' : 'bg-zinc-900/30 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
              >
                2x2 (4 panels)
              </button>
              <button
                onClick={() => updateNodeData('gridSize', '3x4')}
                className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-none border transition-all ${gridSize === '3x4' ? 'bg-amber-cinematic/10 border-amber-cinematic/40 text-amber-cinematic' : 'bg-zinc-900/30 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
              >
                3x4 (12 panels)
              </button>
            </div>
          </div>
        )}

        {/* Mode Toggle for Prompting */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Prompting Mode</label>
          <div className="flex rounded-none overflow-hidden border border-zinc-850 w-fit p-0.5 bg-zinc-950">
            <button
              onClick={() => setMode(false)}
              className={`px-3 py-1.5 text-xs font-bold rounded-none transition-all ${!useAiMode ? 'bg-zinc-850 text-zinc-200 border border-zinc-800' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
            >
              Direct Input
            </button>
            <button
              onClick={() => setMode(true)}
              className={`px-3 py-1.5 text-xs font-bold rounded-none transition-all ${useAiMode ? 'bg-amber-cinematic text-zinc-950 font-bold border border-amber-cinematic shadow-md shadow-amber-cinematic/15' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
            >
              AI Assisted
            </button>
          </div>
        </div>

        {/* Prompt Section */}
        {useAiMode ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-amber-cinematic uppercase tracking-wider">
                <Edit3 className="w-3.5 h-3.5 text-amber-cinematic" /> User Intent (Việt/Anh)
              </label>
              <textarea
                placeholder="Miêu tả nội dung kịch bản hành động..."
                value={localIntent}
                onChange={(e) => setLocalIntent(e.target.value)}
                onBlur={() => { if (localIntent !== data.userIntent) updateNodeData('userIntent', localIntent); }}
                rows={3}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-none p-3 text-xs text-zinc-200 resize-none focus:outline-none focus:border-amber-cinematic focus:ring-1 focus:ring-amber-cinematic/20 transition-all leading-relaxed"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-550 uppercase tracking-wider block">Negative Prompt</label>
              <textarea
                placeholder="Những thứ không muốn xuất hiện..."
                value={localNegative}
                onChange={(e) => setLocalNegative(e.target.value)}
                onBlur={() => { if (localNegative !== data.negativePrompt) updateNodeData('negativePrompt', localNegative); }}
                rows={2}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-none p-3 text-xs text-zinc-400 resize-none focus:outline-none focus:border-amber-cinematic/55 transition-all leading-relaxed"
              />
            </div>

            <div className="pt-1">
              <button
                onClick={() => onGenIntentPrompt(node.id, node.id)}
                disabled={data.isGeneratingPrompt as boolean}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-cinematic hover:bg-amber-glow text-zinc-950 border border-amber-cinematic/40 rounded-none text-xs font-bold disabled:opacity-50 transition-all duration-300 shadow-lg shadow-amber-cinematic/20"
              >
                {data.isGeneratingPrompt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {data.isGeneratingPrompt ? 'Analyzing Script...' : 'Generate Dual Prompts'}
              </button>
            </div>

            {/* Generated Prompts Area */}
            {(data.aiPrompt as string || data.imagePrompt as string || data.videoPrompt as string) && (
              <div className="space-y-4 pt-2 border-t border-zinc-800/60">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-amber-cinematic/80 uppercase tracking-wider block">AI Image Prompt (Pix 2)</label>
                  <textarea
                    value={localImagePrompt}
                    onChange={(e) => setLocalImagePrompt(e.target.value)}
                    onBlur={() => { if (localImagePrompt !== data.imagePrompt) updateNodeData('imagePrompt', localImagePrompt); }}
                    rows={3}
                    className="w-full bg-zinc-950/60 border border-zinc-800 rounded-none p-2.5 text-[11px] text-zinc-300 leading-relaxed focus:outline-none focus:border-amber-cinematic"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-amber-cinematic/80 uppercase tracking-wider block">AI Video Prompt (Veo)</label>
                  <textarea
                    value={localVideoPrompt}
                    onChange={(e) => setLocalVideoPrompt(e.target.value)}
                    onBlur={() => { if (localVideoPrompt !== data.videoPrompt) updateNodeData('videoPrompt', localVideoPrompt); }}
                    rows={3}
                    className="w-full bg-zinc-950/60 border border-zinc-800 rounded-none p-2.5 text-[11px] text-zinc-300 leading-relaxed focus:outline-none focus:border-amber-cinematic"
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {/* Direct Input - Dual Prompts */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-amber-cinematic/80 uppercase tracking-wider">
                <Image className="w-3.5 h-3.5 text-amber-cinematic" /> Image Prompt (Gen Frame)
              </label>
              <textarea
                className="w-full bg-zinc-950 border border-zinc-800 rounded-none p-3 text-xs text-zinc-200 min-h-[90px] focus:outline-none focus:border-amber-cinematic transition-all leading-relaxed"
                value={localImagePrompt}
                onChange={(e) => setLocalImagePrompt(e.target.value)}
                onBlur={() => { if (localImagePrompt !== data.imagePrompt) updateNodeData('imagePrompt', localImagePrompt); }}
                placeholder={renderMode === 'grid' ? "A 2x2 cinematic storyboard grid..." : "A detailed cinematic shot of..."}
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-amber-cinematic/80 uppercase tracking-wider">
                <Film className="w-3.5 h-3.5 text-amber-cinematic" /> Video Prompt (Gen Video)
              </label>
              <textarea
                className="w-full bg-zinc-950 border border-zinc-800 rounded-none p-3 text-xs text-zinc-200 min-h-[90px] focus:outline-none focus:border-amber-cinematic transition-all leading-relaxed"
                value={localVideoPrompt}
                onChange={(e) => setLocalVideoPrompt(e.target.value)}
                onBlur={() => { if (localVideoPrompt !== data.videoPrompt) updateNodeData('videoPrompt', localVideoPrompt); }}
                placeholder="A cinematic continuous sequence of..."
              />
            </div>
          </div>
        )}

        <div className="h-[1px] bg-zinc-800/60 my-4" />

        {/* Director Notes */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-amber-cinematic/80 uppercase tracking-wider block">Director Notes</label>
          <textarea
            placeholder="Camera movement, lighting style notes..."
            value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            onBlur={() => { if (localNotes !== data.directorNotes) updateNodeData('directorNotes', localNotes); }}
            rows={2}
            className="w-full bg-amber-955/5 border border-amber-cinematic/20 rounded-none p-3 text-xs text-amber-200/80 placeholder-amber-500/30 resize-none focus:outline-none focus:border-amber-cinematic/40 transition-all leading-relaxed"
          />
        </div>

        {/* Duration */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-amber-cinematic/80 uppercase tracking-wider block">Video Duration</label>
          <select
            value={(data.videoDuration as number) || 8}
            onChange={(e) => updateNodeData('videoDuration', Number(e.target.value))}
            className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs rounded-none p-3 outline-none focus:border-amber-cinematic transition-all"
          >
            <option value={4}>4 Seconds</option>
            <option value={6}>6 Seconds</option>
            <option value={8}>8 Seconds</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default StoryboardInspectorDrawer;
