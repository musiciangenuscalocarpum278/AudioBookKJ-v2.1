import React from 'react';
import { ReactFlow, Controls, Background, Panel, useUpdateNodeInternals, ReactFlowProvider, PanOnScrollMode } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import axios from 'axios';
import toast from 'react-hot-toast';
import type { ScriptLine, CharacterMetadata } from './types';
import { API } from './config';
import { VideoStudioContext } from './components/videostudio/VideoStudioContext';
import VideoSidebar from './components/videostudio/VideoSidebar';
import VideoAssetsPanel from './components/videostudio/VideoAssetsPanel';
import VideoRenderSidebar from './components/videostudio/VideoRenderSidebar';
import { useProjectStore } from './store/useProjectStore';
import { useNodeGraph } from './hooks/useNodeGraph';
import { useAIDirector } from './hooks/useAIDirector';
import { useAutoRenderQueue } from './hooks/useAutoRenderQueue';
import VideoStatusBar from './components/videostudio/VideoStatusBar';
import { DirectorReadinessModal } from './components/videostudio/DirectorReadinessModal';
import { VideoWorkflowStepper, type WorkflowStep } from './components/videostudio/VideoWorkflowStepper';
import StoryboardInspectorDrawer from './components/videostudio/StoryboardInspectorDrawer';
import { Play, Square, Loader2, Trash2, Sparkles, FilePlus, Maximize2, Minimize2, Download } from 'lucide-react';

interface VideoStudioProps {
  script: ScriptLine[];
  setScript: React.Dispatch<React.SetStateAction<ScriptLine[]>>;
  charactersMetadata: Record<string, CharacterMetadata>;
  setCharactersMetadata: React.Dispatch<React.SetStateAction<Record<string, CharacterMetadata>>>;
  flowkitProjectId: string;
  setFlowkitProjectId: React.Dispatch<React.SetStateAction<string>>;
  handleUploadCharacterImage: (id: string, e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleGenerateAssetImage: (id: string, prompt: string) => Promise<void>;
  handleDeleteEntity: (id: string) => Promise<void>;
  isGeneratingAsset: string | null;
}

const VideoStudio: React.FC<VideoStudioProps> = ({
  script,
  charactersMetadata,
  setCharactersMetadata,
  flowkitProjectId,
  setFlowkitProjectId,
  handleUploadCharacterImage,
  handleGenerateAssetImage,
  handleDeleteEntity,
  isGeneratingAsset,
}) => {
  const [activeVideoNodeLineIds, setActiveVideoNodeLineIds] = React.useState<number[]>([]);
  const [isZoomedOut, setIsZoomedOut] = React.useState(false);
  const updateNodeInternals = useUpdateNodeInternals();

  const globalArtStyle = useProjectStore(s => s.globalArtStyle);
  const setGlobalArtStyle = useProjectStore(s => s.setGlobalArtStyle);
  const activeTab = useProjectStore(s => s.activeTab);
  const currentProjectId = useProjectStore(s => s.currentProjectId);



  const aspectRatio = useProjectStore(s => s.videoAspectRatio);
  const setAspectRatio = useProjectStore(s => s.setVideoAspectRatio);
  const videoDuration = useProjectStore(s => s.videoDuration);
  const setVideoDuration = useProjectStore(s => s.setVideoDuration);
  const timelineClips = useProjectStore(s => s.timelineClips);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const [focusCanvas, setFocusCanvas] = React.useState(false);
  const [showDirectorGate, setShowDirectorGate] = React.useState(false);
  const [isShiftPressed, setIsShiftPressed] = React.useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };
    const handleBlur = () => {
      setIsShiftPressed(false);
    };

    window.addEventListener('keydown', handleKeyDown, { passive: true });
    window.addEventListener('keyup', handleKeyUp, { passive: true });
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);
  const [activeStep, setActiveStep] = React.useState<WorkflowStep>(() => {
    return Object.keys(charactersMetadata || {}).length === 0 ? 'assets' : 'director';
  });
  const scriptListRefs = React.useRef<Record<number, HTMLDivElement | null>>({});

  const {
    nodes, setNodes, onNodesChange,
    edges, setEdges, onEdgesChange,
    nodesRef, edgesRef,
    nodeTypes, edgeTypes,
    onConnect, onDragOver, onDrop,
    handleSelectionChange,
    reactFlowInstance, setReactFlowInstance,
  } = useNodeGraph({ charactersMetadata, onLineIdsChange: setActiveVideoNodeLineIds });

  React.useEffect(() => {
    if (reactFlowInstance && nodesRef.current) {
      nodesRef.current.forEach(n => updateNodeInternals(n.id));
    }
  }, [isZoomedOut, updateNodeInternals, reactFlowInstance, nodesRef]);

  const hasFittedRef = React.useRef(false);
  const prevTabRef = React.useRef(activeTab);
  const prevProjectRef = React.useRef(currentProjectId);

  // Auto fit-view safely ONLY when the container is actually visible
  React.useEffect(() => {
    if (activeTab === 'video' && reactFlowInstance && nodes.length > 0) {
      const isNewTab = prevTabRef.current !== 'video';
      const isNewProject = prevProjectRef.current !== currentProjectId;
      
      if (isNewTab || isNewProject || !hasFittedRef.current) {
        setTimeout(() => {
          reactFlowInstance.fitView({ duration: 500, padding: 0.2 });
          hasFittedRef.current = true;
          prevProjectRef.current = currentProjectId;
        }, 100);
      }
    }
    prevTabRef.current = activeTab;
  }, [activeTab, reactFlowInstance, nodes.length, currentProjectId]);

  const {
    handleExtractEntities,
    handleGenerateStoryboard,
    isGeneratingStoryboard, isExtractingEntities, enhancingAssetId,
    handleEnhancePrompt,
    handleGenFrame, handleGenVideo, handleRegenScenePrompt, handleGenIntentPrompt, handleContinueScene, handleRegenVideoNode, handleExtractLastFrame,
  } = useAIDirector({
    script, charactersMetadata, setCharactersMetadata, timelineClips,
    globalArtStyle, aspectRatio, videoDuration,
    nodesRef, edgesRef, setNodes, setEdges, reactFlowInstance,
  });

  const {
    isAutoRendering,
    toggleAutoRender,
    progressText,
  } = useAutoRenderQueue({
    nodesRef,
    edgesRef,
    onGenFrame: handleGenFrame,
    onGenVideo: handleGenVideo,
    onRegenVideoNode: handleRegenVideoNode,
    onExtractLastFrame: handleExtractLastFrame,
    setNodes,
  });

  const handleGenerateAllPrompts = React.useCallback(async () => {
    const sceneNodes = nodesRef.current.filter(n => n.type === 'scene' && n.data.useAiMode);
    if (sceneNodes.length === 0) {
      toast.error('Không tìm thấy Scene nào đang ở chế độ AI Mode!');
      return;
    }

    toast.success(`Bắt đầu tạo ${sceneNodes.length} AI Prompts...`);
    for (const node of sceneNodes) {
      // Find the associated video node
      const videoNode = nodesRef.current.find(n => n.type === 'video' && n.data.parentId === node.id);
      if (videoNode) {
        await handleGenIntentPrompt(node.id, videoNode.id);
        // Small delay to prevent API throttling
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    toast.success('Đã hoàn tất tạo hàng loạt AI Prompts!');
  }, [nodesRef, handleGenIntentPrompt]);

  const handleAddScene = React.useCallback(() => {
    const id = `broll_${Date.now()}`;
    const viewport = reactFlowInstance?.getViewport();
    const centerX = viewport
      ? (-viewport.x + window.innerWidth / 2) / viewport.zoom
      : 450;
    const centerY = viewport
      ? (-viewport.y + window.innerHeight / 2) / viewport.zoom
      : 300;
    setNodes(nds => [...nds, {
      id,
      type: 'scene',
      position: { x: centerX, y: centerY },
      data: {
        sceneName: 'B-Roll',
        prompt: '',
        userIntent: '',
        negativePrompt: '',
        directorNotes: '',
        lines: '',
        videoNodes: [],
        useAiMode: false,
        videoDuration: videoDuration,
      },
    }]);
    toast.success('Đã thêm Scene mới!');
  }, [reactFlowInstance, setNodes, videoDuration]);

  const handleExportStoryboard = React.useCallback(() => {
    const payload = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      script: script.map(l => ({ id: l.id, speaker: l.speaker, text: l.text })),
      assets: Object.values(charactersMetadata).map(c => ({ id: c.name, type: c.type, description: c.description })),
      scenes: nodes.filter(n => n.type === 'scene').map(n => ({
        id: n.id,
        sceneName: n.data.sceneName,
        lines: n.data.lines,
        userIntent: n.data.userIntent,
        negativePrompt: n.data.negativePrompt,
        aiPrompt: n.data.aiPrompt,
        directorNotes: n.data.directorNotes,
        hasFrame: !!n.data.frameUrl,
        error: n.data.error,
      })),
      edges: edges.map(e => ({ source: e.source, target: e.target }))
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = "storyboard_review.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success('Đã tải xuống storyboard_review.json!');
  }, [script, charactersMetadata, nodes, edges]);

  const onLayout = React.useCallback(
    () => {
      // Helper to calculate estimated card height dynamically based on aspect ratio
      const getNodeHeight = (node: any, ratio: '16:9' | '9:16') => {
        if (node.type === 'asset') {
          return 100;
        }

        if (node.type === 'scene') {
          const hasFrame = !!node.data?.frameUrl;
          if (hasFrame) {
            const imageWidth = 320; // w-80
            const imageHeight = ratio === '9:16' ? imageWidth * (16 / 9) : imageWidth * (9 / 16);
            // Header (~44) + Image + Content (~60) + Footer (~44) + padding
            return imageHeight + 160;
          }
          return 180;
        }

        if (node.type === 'video') {
          const isGrid = !!node.data?.is_grid;
          const cardWidth = isGrid ? 432 : 288; // w-[432px] vs w-72
          const isVideoReady = !!(node.data?.videoUrl || (isGrid && node.data?.slices && node.data.slices.every((s: any) => !!s.videoUrl)));
          const isGenerating = !!node.data?.isGeneratingVideo;
          const hasVideo = isVideoReady || isGenerating || !!node.data?.error;

          if (hasVideo) {
            const videoHeight = ratio === '9:16' ? cardWidth * (16 / 9) : cardWidth * (9 / 16);
            // Header (~36) + Video block + Footer (~36) + margin/padding
            return videoHeight + 80;
          }
          return 120; // Pending/compact
        }

        return 150;
      };

      const assetNodes = nodes.filter(n => n.type === 'asset');
      const sceneNodes = nodes.filter(n => n.type === 'scene');

      // Sort assets by ID alphabetically
      assetNodes.sort((a, b) => a.id.localeCompare(b.id));

      // Sort scenes by sceneIndex (e.g., 'shot_0', 'shot_10' -> 0, 10)
      sceneNodes.sort((a, b) => {
        const idA = parseInt(a.id.replace('shot_', '')) || 0;
        const idB = parseInt(b.id.replace('shot_', '')) || 0;
        return idA - idB;
      });

      let cursorY = 50;
      let cursorX = 450;
      let lastLines: string | null = null;
      let currentRowMaxHeight = 0;

      const nodePositions: Record<string, { x: number, y: number }> = {};

      sceneNodes.forEach((scene) => {
        const currentLines = (scene.data?.lines as string) || '';

        // Calculate heights for scene and connected video node
        const sceneHeight = getNodeHeight(scene, aspectRatio);
        const videoNode = nodes.find(n => n.type === 'video' && n.data.parentId === scene.id);
        const videoHeight = videoNode ? getNodeHeight(videoNode, aspectRatio) : 0;
        const currentPairMaxHeight = Math.max(sceneHeight, videoHeight);

        if (lastLines === null) {
          lastLines = currentLines;
          currentRowMaxHeight = currentPairMaxHeight;
        } else if (lastLines !== currentLines) {
          // Transition to next row: previous max height + 100px vertical gap
          cursorY += currentRowMaxHeight + 100;
          cursorX = 450;
          lastLines = currentLines;
          currentRowMaxHeight = currentPairMaxHeight;
        } else {
          // Same row: update row height if this pair is taller
          currentRowMaxHeight = Math.max(currentRowMaxHeight, currentPairMaxHeight);
        }

        // Place Scene Node
        nodePositions[scene.id] = { x: cursorX, y: cursorY };

        if (videoNode) {
          // Place Video Node immediately to the right
          nodePositions[videoNode.id] = { x: cursorX + 380, y: cursorY };
          cursorX += 760; // Space for both scene and video
        } else {
          cursorX += 380; // Space for just scene
        }
      });

      const layoutedNodes = nodes.map((node) => {
        const newNode = { ...node };

        if (node.type === 'asset') {
          const idx = assetNodes.findIndex(n => n.id === node.id);
          newNode.position = { x: 50, y: idx * 120 + 50 };
        } else if (node.type === 'scene' || node.type === 'video') {
          if (nodePositions[node.id]) {
            newNode.position = nodePositions[node.id];
          }
        }

        return newNode;
      });

      setNodes(layoutedNodes);
      window.requestAnimationFrame(() => reactFlowInstance?.fitView({ duration: 500, padding: 0.2 }));
    },
    [nodes, setNodes, reactFlowInstance, aspectRatio]
  );


  React.useEffect(() => {
    if (activeVideoNodeLineIds.length > 0) {
      const el = scriptListRefs.current[activeVideoNodeLineIds[0]];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeVideoNodeLineIds]);

  // Asset management callbacks
  const handleUpdateAsset = React.useCallback(async (id: string, field: string, value: string) => {
    setCharactersMetadata(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } })); // optimistic
    try {
      const pid = useProjectStore.getState().currentProjectId;
      const res = await axios.post(API.updateAsset, { id, field, value, project_id: pid });
      if (res.data.metadata) setCharactersMetadata(res.data.metadata); // server authoritative
    } catch (e) { console.error(e); }
  }, [setCharactersMetadata]);

  const handleAddAsset = React.useCallback(async () => {
    try {
      const res = await axios.post(API.createAsset, {
        type: 'character',
        name: 'New Asset',
        description: '',
        image_prompt: '',
        project_id: useProjectStore.getState().currentProjectId,
      });
      if (res.data.metadata) setCharactersMetadata(res.data.metadata);
    } catch (e: any) {
      toast.error('Failed to create asset: ' + (e.response?.data?.detail || e.message));
    }
  }, [setCharactersMetadata]);

  const handleDeleteVariation = React.useCallback(async (assetId: string, variationId: string) => {
    try {
      const res = await axios.post(API.deleteVariation, { asset_id: assetId, variation_id: variationId, project_id: useProjectStore.getState().currentProjectId });
      if (res.data.status === 'success') setCharactersMetadata(res.data.metadata);
    } catch (e: any) { toast.error('Lỗi xoá variation: ' + e.message); }
  }, [setCharactersMetadata]);

  const handleToggleReference = React.useCallback(async (assetId: string, variationId: string) => {
    try {
      const res = await axios.post(API.toggleReferenceVariation, { asset_id: assetId, variation_id: variationId, project_id: useProjectStore.getState().currentProjectId });
      if (res.data.status === 'success') setCharactersMetadata(res.data.metadata);
    } catch { toast.error('Lỗi khi chuyển đổi ảnh tham chiếu!'); }
  }, [setCharactersMetadata]);

  const handleSetOfficialVariation = React.useCallback(async (assetId: string, variationId: string) => {
    try {
      const res = await axios.post(API.setOfficialVariation, { asset_id: assetId, variation_id: variationId, project_id: useProjectStore.getState().currentProjectId });
      if (res.data.status === 'success') setCharactersMetadata(res.data.metadata);
    } catch { toast.error('Lỗi khi đặt ảnh chính thức!'); }
  }, [setCharactersMetadata]);

  const handleLocateNode = React.useCallback((nodeId: string) => {
    if (!reactFlowInstance) return;
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      reactFlowInstance.setCenter(node.position.x + 150, node.position.y + 200, { zoom: 0.85, duration: 800 });
      setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, selected: true } : { ...n, selected: false }));
    }
  }, [reactFlowInstance, nodes, setNodes]);

  const handleReRenderVideoNode = React.useCallback(async (videoNodeId: string) => {
    const incomingEdge = edges.find(e => e.target === videoNodeId);
    const sceneNodeId = incomingEdge ? incomingEdge.source : '';
    if (sceneNodeId) {
      await handleRegenVideoNode(sceneNodeId, videoNodeId);
    } else {
      toast.error('Không tìm thấy Scene tương ứng để render lại!');
    }
  }, [edges, handleRegenVideoNode]);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden bg-obsidian-dark">
      <VideoWorkflowStepper
        activeStep={activeStep}
        onStepChange={setActiveStep}
        script={script}
        charactersMetadata={charactersMetadata}
        nodes={nodes}
      />

      <div className="flex flex-1 min-h-0 w-full relative">
        <VideoSidebar
          script={script}
          activeLineIds={activeVideoNodeLineIds}
          isGeneratingStoryboard={isGeneratingStoryboard}
          onGenerateStoryboard={() => setShowDirectorGate(true)}
          scriptListRefs={scriptListRefs}
          focusCanvas={focusCanvas || activeStep === 'assets' || activeStep === 'render'}
        />

        <div className="flex-1 bg-obsidian-dark relative h-full" onDragOver={onDragOver} onDrop={onDrop}>
          <VideoStudioContext.Provider value={{
            onGenFrame: handleGenFrame,
            onGenVideo: handleGenVideo,
            onRegenScenePrompt: handleRegenScenePrompt,
            onGenIntentPrompt: handleGenIntentPrompt,
            onContinueScene: handleContinueScene,
            onRegenVideoNode: handleRegenVideoNode,
            onExtractLastFrame: handleExtractLastFrame,
            onDeleteScene: (nodeId) => {
              // Find the scene node to get associated line IDs
              let sceneNode = nodes.find(n => n.id === nodeId && n.type === 'scene');
              if (!sceneNode) {
                // If nodeId is a video node, find the connected scene node
                const edge = edges.find(e => e.target === nodeId);
                if (edge) {
                  sceneNode = nodes.find(n => n.id === edge.source && n.type === 'scene');
                }
              }

              if (sceneNode?.data?.lines) {
                const lineIds = (sceneNode.data.lines as string).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
                useProjectStore.getState().setScript(prev => prev.map(l => lineIds.includes(l.id) ? { ...l, video_url: undefined } : l));
              }

              // If nodeId is a scene node, find and delete any associated video nodes
              const isScene = nodes.some(n => n.id === nodeId && n.type === 'scene');
              let nodesToFilter = [nodeId];
              if (isScene) {
                const connectedEdges = edges.filter(e => e.source === nodeId);
                connectedEdges.forEach(e => {
                  const targetNode = nodes.find(n => n.id === e.target && n.type === 'video');
                  if (targetNode) {
                    nodesToFilter.push(targetNode.id);
                  }
                });
              }

              setNodes((nds) => nds.filter((n) => !nodesToFilter.includes(n.id)));
              setEdges((eds) => eds.filter((e) => !nodesToFilter.includes(e.source) && !nodesToFilter.includes(e.target)));
            },
            aspectRatio,
            videoDuration,
            charactersMetadata,
          }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onSelectionChange={handleSelectionChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              minZoom={0.05}
              maxZoom={2}
              onlyRenderVisibleElements={true}
              className={`bg-obsidian-dark ${isZoomedOut ? 'flow-zoom-low' : ''}`}
              colorMode="dark"
              selectionOnDrag={true}
              selectionKeyCode={null}
              panOnDrag={[1, 2]}
              panActivationKeyCode="Space"
              zoomOnScroll={!isShiftPressed}
              panOnScroll={isShiftPressed}
              panOnScrollMode={PanOnScrollMode.Vertical}
              onMove={(_, viewport) => {
                const nextZoomedOut = viewport.zoom < 0.4;
                if (nextZoomedOut !== isZoomedOut) {
                  setIsZoomedOut(nextZoomedOut);
                }
              }}
            >
              <Background color="#18181b" gap={16} />
              <Controls className="bg-zinc-900 border-zinc-800 text-zinc-300 fill-zinc-300" />
              <Panel position="top-center" className="m-4 mt-6 flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 bg-obsidian-panel/80 backdrop-blur-md p-1 border border-zinc-800/40 rounded-md shadow-xl">
                  <button
                    onClick={() => {
                      const next = !focusCanvas;
                      setFocusCanvas(next);
                      window.requestAnimationFrame(() => reactFlowInstance?.fitView({ duration: 400, padding: 0.2 }));
                    }}
                    className={`shadow-md border px-3 py-2 rounded-sm text-xs font-bold transition-all duration-200 flex items-center gap-2 ${
                      focusCanvas 
                        ? 'bg-amber-cinematic border-amber-cinematic text-zinc-950 font-bold shadow-sm shadow-amber-cinematic/10' 
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
                    }`}
                    title={focusCanvas ? 'Exit Focus Canvas' : 'Focus Canvas — hide side panels'}
                  >
                    {focusCanvas ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    {focusCanvas ? 'Exit Focus' : 'Focus'}
                  </button>
                  <button
                    onClick={() => onLayout()}
                    className="bg-zinc-950 hover:bg-zinc-900 text-amber-cinematic border border-amber-cinematic/40 px-4 py-2 rounded-sm text-xs font-bold transition-all duration-200 shadow-sm hover:border-amber-cinematic flex items-center gap-2"
                    title="Tự động sắp xếp lại các Node trên màn hình"
                  >
                    ✨ Auto Arrange
                  </button>
                  <button
                    onClick={handleAddScene}
                    className="bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-200 px-4 py-2 rounded-sm text-xs font-bold transition-all duration-200 flex items-center gap-2"
                    title="Thêm Scene trống (B-Roll / establishing shot)"
                  >
                    <FilePlus className="w-4 h-4" /> Add Scene
                  </button>
                  <button
                    onClick={handleGenerateAllPrompts}
                    className="bg-amber-cinematic hover:bg-amber-glow text-zinc-950 border border-amber-cinematic/50 px-4 py-2 rounded-sm text-xs font-bold transition-all duration-200 shadow-md shadow-amber-cinematic/10 flex items-center gap-2"
                    title="Tự động gọi AI viết Prompt (FACS) cho toàn bộ Scene"
                  >
                    <Sparkles className="w-4 h-4" /> Gen All Prompts
                  </button>
                  <button
                    onClick={handleExportStoryboard}
                    className="bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-200 px-4 py-2 rounded-sm text-xs font-bold transition-all duration-200 flex items-center gap-2"
                    title="Xuất Storyboard ra JSON để nhờ Antigravity review"
                  >
                    <Download className="w-4 h-4" /> Export Review
                  </button>
                  <button
                    onClick={toggleAutoRender}
                    className={`shadow-md border px-4 py-2 rounded-sm text-xs font-bold transition-all duration-200 flex items-center gap-2 ${
                      isAutoRendering 
                        ? 'bg-red-950 hover:bg-red-900 border-red-900/50 text-red-200' 
                        : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500/50 text-zinc-950 font-bold'
                    }`}
                    title="Tự động Render tuần tự toàn bộ sơ đồ"
                  >
                    {isAutoRendering ? (
                      <><Square className="w-4 h-4 fill-current" /> Stop Auto-Render</>
                    ) : (
                      <><Play className="w-4 h-4 fill-current" /> Start Auto-Render</>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ bản vẽ Storyboard không?")) {
                        setNodes([]);
                        setEdges([]);
                      }
                    }}
                    className="bg-zinc-950 border border-zinc-800 hover:border-rose-500/35 hover:bg-rose-950/15 text-zinc-500 hover:text-rose-400 p-2 rounded-sm transition-all flex items-center justify-center"
                    title="Xóa toàn bộ bản vẽ Storyboard"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {progressText && (
                  <div className="bg-obsidian-panel/95 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono px-3 py-1.5 rounded-sm flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                    <Loader2 className="w-3 h-3 animate-spin" /> {progressText}
                  </div>
                )}
              </Panel>
            </ReactFlow>
          </VideoStudioContext.Provider>
 
          {/* Storyboard Inspector Drawer */}
          {nodes.find(n => n.selected && n.type === 'scene') && (
            <StoryboardInspectorDrawer
              node={nodes.find(n => n.selected && n.type === 'scene')!}
              setNodes={setNodes}
              onGenIntentPrompt={handleGenIntentPrompt}
              onClose={() => setNodes(nds => nds.map(n => n.selected ? { ...n, selected: false } : n))}
            />
          )}
        </div>
 
        <VideoStatusBar />
 
        <VideoAssetsPanel
          focusCanvas={focusCanvas || activeStep !== 'assets'}
          charactersMetadata={charactersMetadata}
          flowkitProjectId={flowkitProjectId}
          setFlowkitProjectId={setFlowkitProjectId}
          globalArtStyle={globalArtStyle}
          setGlobalArtStyle={setGlobalArtStyle}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          videoDuration={videoDuration}
          onDurationChange={setVideoDuration}
          isExtractingEntities={isExtractingEntities}
          isGeneratingAsset={isGeneratingAsset}
          enhancingAssetId={enhancingAssetId}
          script={script}
          onExtractEntities={handleExtractEntities}
          onAddAsset={handleAddAsset}
          onUpdateAsset={handleUpdateAsset}
          onDeleteEntity={handleDeleteEntity}
          onUploadCharacterImage={handleUploadCharacterImage}
          onGenerateAssetImage={handleGenerateAssetImage}
          onEnhancePrompt={(id) => handleEnhancePrompt(id, handleUpdateAsset)}
          onSetOfficialVariation={handleSetOfficialVariation}
          onToggleReference={handleToggleReference}
          onDeleteVariation={handleDeleteVariation}
          onPreviewImage={setPreviewImage}
        />

        <VideoRenderSidebar
          nodes={nodes}
          edges={edges}
          script={script}
          onLocateNode={handleLocateNode}
          onReRender={handleReRenderVideoNode}
          activeStep={activeStep}
        />
 
        {previewImage && (
          <div
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-8 cursor-zoom-out"
            onClick={() => setPreviewImage(null)}
          >
            <img src={previewImage} className="max-w-full max-h-full object-contain rounded-md border border-zinc-800 shadow-2xl" alt="Preview" />
          </div>
        )}

        <DirectorReadinessModal
          isOpen={showDirectorGate}
          onClose={() => setShowDirectorGate(false)}
          onGenerate={(mode) => {
            setActiveStep('storyboard');
            handleGenerateStoryboard(mode);
          }}
          script={script}
          charactersMetadata={charactersMetadata}
          selectedSceneId={nodes.find(n => n.selected && n.type === 'scene')?.id}
          selectedLineIds={activeVideoNodeLineIds}
        />
      </div>
    </div>
  );
};

const VideoStudioWithProvider: React.FC<VideoStudioProps> = (props) => {
  return (
    <ReactFlowProvider>
      <VideoStudio {...props} />
    </ReactFlowProvider>
  );
};

export default VideoStudioWithProvider;
