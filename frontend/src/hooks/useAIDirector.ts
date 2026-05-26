import { useCallback, useRef } from 'react';
import React from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import type { Node, Edge } from '@xyflow/react';
import type { ScriptLine, CharacterMetadata, InlineVideoNode, TimelineClip, DirectorRunMode } from '../types';
import { API } from '../config';
import { useExtractEntities, useEnhancePrompt } from './api/mutations';
import { useProjectStore } from '../store/useProjectStore';

function getUpstreamMediaIds(
  nodeId: string,
  nodesRef: React.MutableRefObject<Node[]>,
  edgesRef: React.MutableRefObject<Edge[]>,
  charactersMetadata: Record<string, CharacterMetadata>
): string[] {
  const visited = new Set<string>();
  const queue = [nodeId];
  const upstreamNodes: Node[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    for (const edge of edgesRef.current.filter((e) => e.target === currentId)) {
      const src = nodesRef.current.find((n) => n.id === edge.source);
      if (src && !visited.has(src.id)) { upstreamNodes.push(src); queue.push(src.id); }
    }
  }

  return upstreamNodes.flatMap((src) => {
    if (src.type === 'video') return []; // Image AI cannot process video media IDs
    if (src.data.mediaId) return [src.data.mediaId as string];
    const baseId = (src.data.baseAssetId as string) || src.id;
    const entity = charactersMetadata[baseId];
    if (!entity) return [];
    const refs = (entity.variations ?? [])
      .filter((v: any) => v.is_reference && v.media_id && v.media_id !== entity.media_id)
      .map((v: any) => v.media_id as string);
    return entity.media_id ? [entity.media_id, ...refs] : refs;
  }).filter(Boolean);
}

function getUpstreamCharacterDescriptions(
  nodeId: string,
  nodesRef: React.MutableRefObject<Node[]>,
  edgesRef: React.MutableRefObject<Edge[]>,
  charactersMetadata: Record<string, CharacterMetadata>
): string[] {
  const visited = new Set<string>();
  const queue = [nodeId];
  const upstreamNodes: Node[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    for (const edge of edgesRef.current.filter((e) => e.target === currentId)) {
      const src = nodesRef.current.find((n) => n.id === edge.source);
      if (src && !visited.has(src.id)) { upstreamNodes.push(src); queue.push(src.id); }
    }
  }

  return upstreamNodes.flatMap((src) => {
    if (src.type !== 'asset') return [];
    const baseId = (src.data.baseAssetId as string) || src.id;
    const entity = charactersMetadata[baseId];
    if (!entity || !entity.description) return [];
    return [`${entity.name}: ${entity.description}`];
  }).filter(Boolean);
}

function updateVideoNode(
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  nodeId: string,
  videoNodeId: string,
  patch: Partial<InlineVideoNode>
) {
  setNodes((nds) =>
    nds.map((n) => {
      if (n.id !== nodeId) return n;
      const videoNodes: InlineVideoNode[] = (n.data.videoNodes as InlineVideoNode[]) ?? [];
      return {
        ...n,
        data: {
          ...n.data,
          videoNodes: videoNodes.map((vn) => vn.id === videoNodeId ? { ...vn, ...patch } : vn),
        },
      };
    })
  );
}

export function useAIDirector({
  script,
  charactersMetadata,
  setCharactersMetadata,
  globalArtStyle,
  aspectRatio,
  videoDuration,
  timelineClips,
  nodesRef,
  edgesRef,
  setNodes,
  setEdges,
  reactFlowInstance,
}: {
  script: ScriptLine[];
  charactersMetadata: Record<string, CharacterMetadata>;
  setCharactersMetadata: React.Dispatch<React.SetStateAction<Record<string, CharacterMetadata>>>;
  globalArtStyle: string;
  aspectRatio: '16:9' | '9:16';
  videoDuration: number;
  timelineClips: TimelineClip[];
  nodesRef: React.MutableRefObject<Node[]>;
  edgesRef: React.MutableRefObject<Edge[]>;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  reactFlowInstance: any;
}) {
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = React.useState(false);

  const extractEntitiesMut = useExtractEntities();
  const enhancePromptMut = useEnhancePrompt();
  const isExtractingEntities = extractEntitiesMut.isPending;
  const enhancingAssetId = enhancePromptMut.isPending
    ? (enhancePromptMut.variables as any)?._assetId ?? null
    : null;

  const globalArtStyleRef = useRef(globalArtStyle);
  React.useEffect(() => { globalArtStyleRef.current = globalArtStyle; }, [globalArtStyle]);
  const aspectRatioRef = useRef(aspectRatio);
  React.useEffect(() => { aspectRatioRef.current = aspectRatio; }, [aspectRatio]);
  const videoDurationRef = useRef(videoDuration);
  React.useEffect(() => { videoDurationRef.current = videoDuration; }, [videoDuration]);

  // ── Existing: Gen Frame ────────────────────────────────────────────────────

  const handleGenFrame = useCallback(async (nodeId: string) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const mediaIds = getUpstreamMediaIds(nodeId, nodesRef, edgesRef, charactersMetadata);
    const prompt = (node.data.imagePrompt as string) || ((node.data.useAiMode && node.data.aiPrompt) ? node.data.aiPrompt as string : node.data.prompt as string);

    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, isGenerating: true } } : n));
    try {
      const res = await axios.post(API.generateSceneFrame, {
        prompt,
        project_id: useProjectStore.getState().flowkitProjectId,
        reference_media_ids: mediaIds,
        aspect_ratio: aspectRatioRef.current,
      });
      const url = res.data.url;
      if (!url) throw new Error('No image URL returned from API');
      useProjectStore.getState().setAntigravityError(null);
      setNodes((nds) => nds.map((n) => n.id === nodeId ? {
        ...n, data: { ...n.data, isGenerating: false, frameUrl: url, frameMediaId: res.data.media_id },
      } : n));
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message;
      toast.error('Lỗi khi gọi API tạo ảnh: ' + msg);
      useProjectStore.getState().setAntigravityError('Frame gen failed: ' + msg);
      setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, isGenerating: false } } : n));
    }
  }, [charactersMetadata, nodesRef, edgesRef, setNodes]);

  const handleExtractLastFrame = useCallback(async (nodeId: string, videoUrl: string) => {
    try {
      let pathParam = videoUrl;
      try {
        const urlObj = new URL(videoUrl);
        const p = urlObj.searchParams.get('path');
        if (p) pathParam = p;
      } catch (e) {}

      if (!pathParam) {
        toast.error('Không tìm thấy đường dẫn video hợp lệ để trích xuất frame.');
        return;
      }
      
      setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, isGenerating: true } } : n));
      const res = await axios.post(API.extractLastFrame, {
        video_path: pathParam,
        project_id: useProjectStore.getState().currentProjectId || 'default',
      });
      const data = res.data;
      if (!data.media_id) throw new Error('Không nhận được media_id từ FlowKit');
      
      setNodes((nds) => nds.map((n) => n.id === nodeId ? {
        ...n, data: { ...n.data, isGenerating: false, frameUrl: data.image_url, frameMediaId: data.media_id },
      } : n));
      toast.success('Đã lấy Frame cuối của video làm hình bắt đầu!');
    } catch (err: any) {
      toast.error('Lỗi trích xuất Frame: ' + err.message);
      setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, isGenerating: false } } : n));
    }
  }, [nodesRef, setNodes]);

  // ── Existing: Gen Video → now creates inline videoNodes[0] ────────────────

  const handleGenVideo = useCallback(async (nodeId: string) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const mediaIds = getUpstreamMediaIds(nodeId, nodesRef, edgesRef, charactersMetadata);
    const charDescs = getUpstreamCharacterDescriptions(nodeId, nodesRef, edgesRef, charactersMetadata);
    
    let prompt = (node.data.videoPrompt as string) || ((node.data.useAiMode && node.data.aiPrompt) ? node.data.aiPrompt as string : node.data.prompt as string);
    
    if (charDescs.length > 0) {
      prompt = `${prompt}. Character appearances: ${charDescs.join('; ')}. Keep appearances consistent.`;
    }

    const videoNodeId = `video_${Date.now()}`;
    const newNode: Node = {
      id: videoNodeId,
      type: 'video',
      position: { x: node.position.x + 380, y: node.position.y },
      data: {
        isGeneratingVideo: true,
        parentId: nodeId,
      }
    };

    setNodes((nds) => [
      ...nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, isGeneratingVideo: true } } : n),
      newNode
    ]);

    const outgoingEdges = edgesRef.current.filter(e => e.source === nodeId && e.target.startsWith('shot_'));
    const edgesToRemoveIds = outgoingEdges.map(e => e.id);
    
    const newRewiredEdges = outgoingEdges.map(e => ({
      ...e,
      id: `e_${videoNodeId}-${e.target}`,
      source: videoNodeId,
    }));

    setEdges((eds) => [
      ...eds.filter(e => !edgesToRemoveIds.includes(e.id)),
      {
        id: `e_${nodeId}-${videoNodeId}`,
        source: nodeId,
        target: videoNodeId,
        animated: true,
        style: { stroke: '#10b981', strokeWidth: 2, opacity: 0.8 },
      },
      ...newRewiredEdges
    ]);

    try {
      const res = await axios.post(API.generateSceneVideo, {
        prompt,
        project_id: useProjectStore.getState().flowkitProjectId,
        scene_id: videoNodeId,
        start_image_media_id: node.data.frameMediaId || null,
        reference_media_ids: mediaIds,
        aspect_ratio: aspectRatioRef.current,
        duration_seconds: (node.data.videoDuration as number) || videoDurationRef.current,
        is_grid_mode: node.data.renderMode === 'grid',
        start_image_url: node.data.frameUrl || null,
      });

      if (res.data.is_grid && res.data.slices) {
        setNodes((nds) => nds.map((n) => {
          if (n.id === nodeId) return { ...n, data: { ...n.data, isGeneratingVideo: false } };
          if (n.id === videoNodeId) {
            return {
              ...n,
              data: {
                ...n.data,
                is_grid: true,
                slices: res.data.slices.map((s: any) => ({
                  ...s,
                  videoUrl: undefined,
                  isGenerating: true,
                  error: undefined
                })),
                isGeneratingVideo: true
              }
            };
          }
          return n;
        }));
        return;
      }

      const { operation_name: opName, primary_media_id: mediaId } = res.data;
      if (!opName && !mediaId) throw new Error('No operation_name or primary_media_id returned');

      setNodes((nds) => nds.map((n) => {
        if (n.id === nodeId) return { ...n, data: { ...n.data, isGeneratingVideo: false } };
        if (n.id === videoNodeId) return { ...n, data: { ...n.data, opName, mediaId } };
        return n;
      }));
    } catch (err: any) {
      toast.error('Lỗi khi gọi API tạo Video: ' + err.message);
      setNodes((nds) => nds.map((n) => {
        if (n.id === nodeId) return { ...n, data: { ...n.data, isGeneratingVideo: false } };
        if (n.id === videoNodeId) return { ...n, data: { ...n.data, isGeneratingVideo: false } };
        return n;
      }));
    }
  }, [charactersMetadata, nodesRef, edgesRef, setNodes]);

  // ── Existing: Regen Scene Prompt ──────────────────────────────────────────

  const handleRegenScenePrompt = useCallback(async (nodeId: string) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, prompt: 'Đang phân tích kịch bản và viết lại prompt...' } } : n));
    try {
      let rawText = '';
      if (node.data.lines) {
        const lineIds = (node.data.lines as string).split(',').map((s) => s.trim());
        rawText = script.filter((l) => lineIds.includes(l.id.toString())).map((l) => l.text).join(' ');
      }
      const res = await axios.post(API.enhancePrompt, {
        prompt: rawText || 'A generic scene',
        asset_type: 'scene',
        asset_name: node.data.sceneName,
        global_style: globalArtStyleRef.current,
        director_notes: (node.data.directorNotes as string) || '',
      });
      useProjectStore.getState().setAntigravityError(null);
      setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, prompt: res.data.prompt } } : n));
    } catch (e: any) {
      const msg = e.response?.data?.detail || e.message;
      toast.error('Lỗi khi Regen Prompt: ' + msg);
      useProjectStore.getState().setAntigravityError('Prompt regen failed: ' + msg);
    }
  }, [script, nodesRef, setNodes]);

  // ── New: Generate Intent Prompt via Gemini ────────────────────────────────

  const handleGenIntentPrompt = useCallback(async (nodeId: string, videoNodeId: string) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;

    const videoNodes: InlineVideoNode[] = (node.data.videoNodes as InlineVideoNode[]) ?? [];
    const vn = videoNodes.find((v) => v.id === videoNodeId);

    const intent = vn?.userIntent ?? (node.data.userIntent as string) ?? '';
    const negative = vn?.negativePrompt ?? (node.data.negativePrompt as string) ?? '';
    if (!intent.trim()) { toast.error('Hãy nhập Intent trước!'); return; }

    let sceneContext = '';
    if (node.data.lines) {
      const lineIds = (node.data.lines as string).split(',').map((s) => s.trim());
      sceneContext = script.filter((l) => lineIds.includes(l.id.toString())).map((l) => l.text).join(' ');
    }

    updateVideoNode(setNodes, nodeId, videoNodeId, { isGeneratingPrompt: true });

    try {
      let lastFrameUrl = vn?.lastFrameUrl;
      // If it's a continuation scene, it might have frameUrl set from the previous node
      if (!lastFrameUrl && node.data.frameUrl && node.data.sceneName?.toString().includes('(Cont)')) {
        lastFrameUrl = node.data.frameUrl as string;
      }

      const res = await axios.post(API.generateIntentPrompt, {
        user_intent: intent,
        negative_prompt: negative,
        scene_context: sceneContext,
        global_art_style: globalArtStyleRef.current,
        director_notes: (node.data.directorNotes as string) || '',
        last_frame_path: lastFrameUrl
          ? new URL(lastFrameUrl).searchParams.get('path') ?? undefined
          : undefined,
      });
      const aiPrompt = res.data.ai_prompt as string;
      useProjectStore.getState().setAntigravityError(null);
      updateVideoNode(setNodes, nodeId, videoNodeId, { aiPrompt, isGeneratingPrompt: false });
      // Also store on scene node when it's the first (scene-level) prompt
      const vnIndex = videoNodes.findIndex((v) => v.id === videoNodeId);
      if (vnIndex === 0 || vnIndex === -1) {
        setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, aiPrompt } } : n));
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message;
      toast.error('Lỗi khi gen prompt từ AI: ' + msg);
      useProjectStore.getState().setAntigravityError('Intent prompt failed: ' + msg);
      updateVideoNode(setNodes, nodeId, videoNodeId, { isGeneratingPrompt: false });
    }
  }, [script, nodesRef, setNodes]);

  // ── New: Continue Scene ───────────────────────────────────────────────────

  const handleContinueScene = useCallback(async (_: string, videoNodeId: string) => {
    const videoNode = nodesRef.current.find((n) => n.id === videoNodeId);
    if (!videoNode || !videoNode.data.videoUrl) { toast.error('Video chưa sẵn sàng để tiếp nối.'); return; }

    const parentNodeId = videoNode.data.parentId as string;
    const parentNode = nodesRef.current.find((n) => n.id === parentNodeId);
    if (!parentNode) return;

    const newSceneId = `scene_cont_${Date.now()}`;

    // Extract the video path from the URL (format: /api/video?path=...)
    let videoPath: string;
    try {
      videoPath = new URL(videoNode.data.videoUrl as string).searchParams.get('path') ?? '';
    } catch {
      videoPath = videoNode.data.videoUrl as string;
    }

    try {
      const frameRes = await axios.post(API.extractLastFrame, {
        video_path: videoPath,
        project_id: useProjectStore.getState().currentProjectId || 'default',
      });
      const { image_path: imagePath, image_url: imageUrl } = frameRes.data;

      // Upload the server-side extracted frame to FlowKit to get a media_id
      const uploadRes = await axios.post(API.uploadLocalImage, {
        image_path: imagePath,
        project_id: useProjectStore.getState().flowkitProjectId,
      });
      const lastFrameMediaId = uploadRes.data?.media_id ?? null;

      // Create new Scene Node
      setNodes((nds) => {
        const pNode = nds.find(n => n.id === parentNodeId);
        if (!pNode) return nds;
        
        const newNode: Node = {
          id: newSceneId,
          type: 'scene',
          position: { x: videoNode.position.x + 350, y: videoNode.position.y },
          data: {
            sceneName: `${pNode.data.sceneName} (Cont)`,
            lines: pNode.data.lines,
            useAiMode: true,
            frameUrl: imageUrl,
            frameMediaId: lastFrameMediaId,
            userIntent: '',
            negativePrompt: '',
            aiPrompt: '',
          }
        };
        return [...nds, newNode];
      });

      // Add Edge
      setEdges((eds) => [
        ...eds,
        {
          id: `e_${videoNodeId}-${newSceneId}`,
          source: videoNodeId,
          target: newSceneId,
          animated: true,
          style: { stroke: '#10b981', strokeWidth: 2, opacity: 0.8 },
        }
      ]);
      
    } catch (err: any) {
      toast.error('Lỗi khi tạo Scene nối tiếp: ' + err.message);
    }
  }, [nodesRef, setNodes, setEdges]);

  // ── New: Regen a specific VideoNode ───────────────────────────────────────

  const handleRegenVideoNode = useCallback(async (_: string, videoNodeId: string) => {
    const videoNode = nodesRef.current.find((n) => n.id === videoNodeId);
    if (!videoNode) return;

    const parentNodeId = videoNode.data.parentId as string;
    const parentNode = nodesRef.current.find((n) => n.id === parentNodeId);
    if (!parentNode) return;

    const mediaIds = getUpstreamMediaIds(parentNodeId, nodesRef, edgesRef, charactersMetadata);
    const prompt = (parentNode.data.useAiMode && parentNode.data.aiPrompt) 
      ? parentNode.data.aiPrompt as string 
      : parentNode.data.prompt as string;

    setNodes((nds) => nds.map((n) => n.id === videoNodeId ? {
      ...n, data: { ...n.data, opName: undefined, mediaId: undefined, videoUrl: undefined, isGeneratingVideo: true }
    } : n));

    try {
      const res = await axios.post(API.generateSceneVideo, {
        prompt,
        project_id: useProjectStore.getState().flowkitProjectId,
        scene_id: videoNodeId,
        start_image_media_id: parentNode.data.frameMediaId ?? null,
        reference_media_ids: mediaIds,
        aspect_ratio: aspectRatioRef.current,
        duration_seconds: (parentNode.data.videoDuration as number) || videoDurationRef.current,
        is_grid_mode: parentNode.data.renderMode === 'grid',
        start_image_url: parentNode.data.frameUrl || null,
      });

      if (res.data.is_grid && res.data.slices) {
        setNodes((nds) => nds.map((n) => n.id === videoNodeId ? {
          ...n,
          data: {
            ...n.data,
            is_grid: true,
            slices: res.data.slices.map((s: any) => ({
              ...s,
              videoUrl: undefined,
              isGenerating: true,
              error: undefined
            })),
            isGeneratingVideo: true
          }
        } : n));
        return;
      }

      const { operation_name: opName, primary_media_id: mediaId } = res.data;
      if (!opName && !mediaId) throw new Error('No operation_name or primary_media_id returned');
      setNodes((nds) => nds.map((n) => n.id === videoNodeId ? { ...n, data: { ...n.data, opName, mediaId } } : n));
    } catch (err: any) {
      toast.error('Lỗi khi Regen Video Node: ' + err.message);
      setNodes((nds) => nds.map((n) => n.id === videoNodeId ? { ...n, data: { ...n.data, isGeneratingVideo: false } } : n));
    }
  }, [charactersMetadata, nodesRef, edgesRef, setNodes]);

  // ── Existing: Storyboard & Entities ──────────────────────────────────────

  const handleGenerateStoryboard = useCallback(async (mode: DirectorRunMode = { type: 'all_missing' }) => {
    if (!script.length) return;
    setIsGeneratingStoryboard(true);
    try {
      let currentMetadata = charactersMetadata;
      if (script.length > 0) {
        useProjectStore.getState().setVideoProgress({
          status: 'extracting',
          message: 'Đang tự động phân tích kịch bản và trích xuất nhân vật/bối cảnh...',
          currentStep: 0,
          totalSteps: 0,
        });
        try {
          const fullText = script.map((l) => l.text).join('\n\n');
          const extRes = await extractEntitiesMut.mutateAsync({
            text: fullText,
            existing_metadata: charactersMetadata,
            project_id: useProjectStore.getState().currentProjectId || 'default'
          });
          if (extRes?.metadata) {
            setCharactersMetadata(extRes.metadata);
            currentMetadata = extRes.metadata;
            console.log('[Auto-Extractor] Trích xuất thực thể thành công:', extRes.metadata);
          }
        } catch (extErr) {
          console.error('[Auto-Extractor] Lỗi trích xuất thực thể:', extErr);
          toast.error('Lỗi khi tự động trích xuất thực thể, vẫn tiếp tục tạo storyboard...');
        }
      }

      useProjectStore.getState().setVideoProgress({
        status: 'storyboarding',
        message: 'Đang dùng kéo AI để chia nhỏ kịch bản...',
        currentStep: 0,
        totalSteps: 0,
      });

      console.log('--- STARTING SMART SLICER ---');
      
      // Step 3.1: Frontend Slicer Logic
      // Group script lines based on speaker boundary and duration limits (<8s)
      const blocks: { scriptLines: ScriptLine[], totalDuration: number, speaker: string }[] = [];
      let currentBlock: { scriptLines: ScriptLine[], totalDuration: number, speaker: string } | null = null;
      
      for (const line of script) {
        // Find audio duration for this line from timelineClips
        const audioClip = timelineClips?.find(c => c.lineId === line.id);
        const duration = audioClip?.duration || 5.0; // Fallback to 5s if not generated yet
        
        // Rules for breaking a new block:
        // 1. If it's the very first line
        // 2. If the speaker changes (narration vs character)
        // 3. If adding this line to the current block exceeds 8 seconds
        if (!currentBlock || currentBlock.speaker !== line.speaker || (currentBlock.totalDuration + duration > 8.0)) {
          if (currentBlock) {
            blocks.push(currentBlock);
          }
          currentBlock = {
            scriptLines: [line],
            totalDuration: duration,
            speaker: line.speaker
          };
        } else {
          // Add to current block
          currentBlock.scriptLines.push(line);
          currentBlock.totalDuration += duration;
        }
      }
      
      // Push the final block
      if (currentBlock) {
        blocks.push(currentBlock);
      }
      
      console.log('[Slicer] Kịch bản đã được cắt thành các Blocks:', blocks);
      toast.success(`[Slicer] Đã chia kịch bản thành ${blocks.length} Scene Blocks! Đang bắt đầu xử lý...`);
      
      // Step 3.3 and 3.4: Orchestrator & Streaming UI
      const currentNodes = useProjectStore.getState().videoNodes;
      
      const coveredLineIds = new Set<string>();
      let maxSceneIndex = -1;
      let lastExistingSceneId: string | null = null;
      let lastExistingPrompt = "";

      currentNodes.forEach((n: any) => {
        if (n.type === 'scene') {
          // If the node represents a failed/errored generation, do NOT add its lines to coveredLineIds.
          // This allows all_missing mode to automatically identify it as missing and regenerate it in-place.
          if (n.data?.error) {
            return;
          }
          if (n.data.lines) {
            n.data.lines.split(',').map((s: string) => s.trim()).forEach((id: string) => coveredLineIds.add(id));
          }
          const idxMatch = n.id.match(/^shot_(\d+)$/);
          if (idxMatch) {
             const idx = parseInt(idxMatch[1], 10);
             if (idx > maxSceneIndex) {
                maxSceneIndex = idx;
                lastExistingSceneId = n.id;
                lastExistingPrompt = n.data.prompt || "";
             }
          }
        }
      });

      const usedAssets = new Set<string>(currentNodes.filter((n: any) => n.type === 'asset').map((n: any) => n.id));
      let previousContext = lastExistingPrompt ? `Previous scene: ${lastExistingPrompt}` : "";
      let sceneIndex = maxSceneIndex + 1;
      let previousBlockLastSceneId: string | null = lastExistingSceneId;
      
      let pendingBlocks = blocks;

      if (mode.type === 'all_missing') {
        pendingBlocks = blocks.filter(b => {
          return !b.scriptLines.every(l => coveredLineIds.has(l.id.toString()));
        });
      } else if (mode.type === 'from_line') {
        const startIdx = blocks.findIndex(b => b.scriptLines.some(l => l.id === mode.lineId));
        if (startIdx !== -1) {
          pendingBlocks = blocks.slice(startIdx);
        } else {
          toast.error(`Không tìm thấy dòng ${mode.lineId} trong các block.`);
          pendingBlocks = [];
        }
      } else if (mode.type === 'regenerate_scene') {
        const sceneNode = currentNodes.find((n: any) => n.id === mode.sceneId);
        if (sceneNode && sceneNode.data.lines) {
          const lineIds = (sceneNode.data.lines as string).split(',').map(s => parseInt(s.trim()));
          pendingBlocks = blocks.filter(b => b.scriptLines.some(l => lineIds.includes(l.id)));
        } else {
          toast.error(`Không tìm thấy dữ liệu line của Scene ${mode.sceneId}`);
          pendingBlocks = [];
        }
      }

      if (pendingBlocks.length === 0) {
        toast.success("Tất cả Script đã có Storyboard!");
        useProjectStore.getState().setVideoProgress({ status: 'idle' });
        setIsGeneratingStoryboard(false);
        return;
      }

      useProjectStore.getState().setVideoProgress({
        status: 'storyboarding',
        message: 'Bắt đầu biên dịch góc máy...',
        currentStep: 0,
        totalSteps: pendingBlocks.length,
      });
      
      for (let bIndex = 0; bIndex < pendingBlocks.length; bIndex++) {
        const block = pendingBlocks[bIndex];
        
        useProjectStore.getState().setVideoProgress({
          status: 'storyboarding',
          message: `Đang tưởng tượng góc máy cho Scene ${bIndex + 1}/${pendingBlocks.length}...`,
          currentStep: bIndex,
          totalSteps: pendingBlocks.length,
        });

        try {
          const res = await axios.post(API.generateScenePrompt, {
            block_lines: block.scriptLines,
            previous_context: previousContext,
            assets_metadata: currentMetadata,
            global_style: globalArtStyleRef.current,
            total_duration: block.totalDuration
          });
          
          const shots = res.data.shots;
          if (!shots || !shots.length) continue;
          
          let previousSceneNodeId: string | null = null;
          
          shots.forEach((shot: any, shotIndex: number) => {
            const globalBlockIndex = blocks.findIndex(b => b === block);
            const blockLineIds = block.scriptLines.map(l => l.id.toString());
            const matchingNode = currentNodes.find((n: any) => {
              if (n.type !== 'scene' || !n.data?.lines) return false;
              const nLineIds = n.data.lines.split(',').map((s: string) => s.trim());
              return nLineIds.some((id: string) => blockLineIds.includes(id));
            });

            let matchingIncomingTransitionSource: string | null = null;
            if (matchingNode) {
              const incomingTransition = edgesRef.current.find(e => 
                e.target === matchingNode.id && 
                (e.id.startsWith('e_block_') || e.id.startsWith('e_sub_'))
              );
              if (incomingTransition) {
                matchingIncomingTransitionSource = incomingTransition.source;
              }
            }

            const imageNodeId = matchingNode ? matchingNode.id : `shot_${sceneIndex}`;
            const linesStr = block.scriptLines.map(l => l.id).join(', ');
            
            const targetY = matchingNode 
              ? matchingNode.position.y + shotIndex * 220 
              : (globalBlockIndex !== -1 ? globalBlockIndex : sceneIndex) * 220 + 50;

            const newNode: Node = {
              id: imageNodeId, 
              type: 'scene',
              position: { x: 450, y: targetY },
              data: {
                sceneName: matchingNode ? (matchingNode.data.sceneName?.replace(' (Failed)', '') || `Scene ${sceneIndex + 1}`) : `Scene ${sceneIndex + 1}`,
                prompt: shot.visual_prompt,
                imagePrompt: shot.image_prompt || shot.visual_prompt || "",
                videoPrompt: shot.video_prompt || shot.visual_prompt || "",
                renderMode: shot.render_mode || "single",
                gridSize: shot.grid_size || null,
                userIntent: shot.user_intent || "",
                lines: linesStr,
                videoNodes: matchingNode ? (matchingNode.data.videoNodes || []) : [],
                useAiMode: !!shot.user_intent,
                videoDuration: shot.video_duration || 6,
              },
            };
            
            setEdges(eds => eds.filter(e => e.target !== imageNodeId));

            setNodes(nds => {
              const exists = nds.some(n => n.id === imageNodeId);
              if (exists) {
                return nds.map(n => n.id === imageNodeId ? {
                  ...n,
                  position: newNode.position,
                  data: {
                    ...n.data,
                    ...newNode.data,
                    error: undefined,
                  }
                } : n);
              }
              return [...nds, newNode];
            });
            
            shot.asset_ids?.forEach((assetId: string) => {
              if (!usedAssets.has(assetId)) {
                usedAssets.add(assetId);
                const asset = currentMetadata[assetId];
                if (asset) {
                  const newAssetNode: Node = {
                    id: assetId, type: 'asset',
                    position: { x: 50, y: usedAssets.size * 120 - 70 },
                    data: { name: asset.name, assetType: asset.type, imagePath: asset.local_image_path },
                  };
                  setNodes(nds => [...nds, newAssetNode]);
                }
              }
              
              const newEdge: Edge = {
                id: `e_${assetId}-${imageNodeId}`, source: assetId, target: imageNodeId,
                animated: true, style: { stroke: '#6366f1', strokeWidth: 2, opacity: 0.6 },
              };
              setEdges(eds => [...eds, newEdge]);
            });
            
            // Add edge between previous block and this block (dashed)
            const prevId = matchingIncomingTransitionSource || previousBlockLastSceneId;
            if (shotIndex === 0 && prevId && !shot.is_cut) {
              const blockEdge: Edge = {
                id: `e_block_${prevId}-${imageNodeId}`,
                source: prevId,
                target: imageNodeId,
                type: 'default',
                style: { stroke: '#475569', strokeWidth: 1, strokeDasharray: '5,5' },
              };
              setEdges(eds => [...eds, blockEdge]);
            }

            // Add edge between sub-scenes within the same block (solid emerald)
            if (shotIndex > 0 && previousSceneNodeId && !shot.is_cut) {
              const subSceneEdge: Edge = {
                id: `e_sub_${previousSceneNodeId}-${imageNodeId}`,
                source: previousSceneNodeId,
                target: imageNodeId,
                type: 'default',
                animated: true,
                style: { stroke: '#10b981', strokeWidth: 2 },
              };
              setEdges(eds => [...eds, subSceneEdge]);
            }

            previousSceneNodeId = imageNodeId;
            // Cập nhật Cửa sổ Ngữ cảnh cho Block tiếp theo
            previousContext = `Scene ${sceneIndex + 1}: ${shot.visual_prompt}`;
            sceneIndex++;
          });
          
          if (previousSceneNodeId) {
            previousBlockLastSceneId = previousSceneNodeId;
          }
          
        } catch (err: any) {
          console.error('[Orchestrator] Lỗi khi xử lý Block:', block, err);
          toast.error(`Lỗi khi tạo Scene ${bIndex + 1}!`);
          
          const globalBlockIndex = blocks.findIndex(b => b === block);
          const blockLineIds = block.scriptLines.map(l => l.id.toString());
          const matchingNode = currentNodes.find((n: any) => {
            if (n.type !== 'scene' || !n.data?.lines) return false;
            const nLineIds = n.data.lines.split(',').map((s: string) => s.trim());
            return nLineIds.some((id: string) => blockLineIds.includes(id));
          });

          let matchingIncomingTransitionSource: string | null = null;
          if (matchingNode) {
            const incomingTransition = edgesRef.current.find(e => 
              e.target === matchingNode.id && 
              (e.id.startsWith('e_block_') || e.id.startsWith('e_sub_'))
            );
            if (incomingTransition) {
              matchingIncomingTransitionSource = incomingTransition.source;
            }
          }

          const errorNodeId = matchingNode ? matchingNode.id : `shot_${sceneIndex}`;
          const linesStr = block.scriptLines.map(l => l.id).join(', ');
          
          const targetY = matchingNode 
            ? matchingNode.position.y 
            : (globalBlockIndex !== -1 ? globalBlockIndex : sceneIndex) * 220 + 50;

          const errorNode: Node = {
            id: errorNodeId,
            type: 'scene',
            position: { x: 450, y: targetY },
            data: {
              sceneName: matchingNode ? (matchingNode.data.sceneName?.includes('(Failed)') ? matchingNode.data.sceneName : `${matchingNode.data.sceneName} (Failed)`) : `Scene ${sceneIndex + 1} (Failed)`,
              prompt: '',
              userIntent: '',
              lines: linesStr,
              videoNodes: matchingNode ? (matchingNode.data.videoNodes || []) : [],
              useAiMode: true,
              error: err.response?.data?.detail || err.message || 'AI Generation Failed',
            },
          };
          
          setEdges(eds => eds.filter(e => e.target !== errorNodeId));

          setNodes(nds => {
            const exists = nds.some(n => n.id === errorNodeId);
            if (exists) {
              return nds.map(n => n.id === errorNodeId ? {
                ...n,
                position: errorNode.position,
                data: {
                  ...n.data,
                  ...errorNode.data,
                }
              } : n);
            }
            return [...nds, errorNode];
          });
          
          const prevId = matchingIncomingTransitionSource || previousBlockLastSceneId;
          if (prevId) {
            const blockEdge: Edge = {
              id: `e_block_${prevId}-${errorNodeId}`,
              source: prevId,
              target: errorNodeId,
              type: 'default',
              style: { stroke: '#ef4444', strokeWidth: 1, strokeDasharray: '5,5' },
            };
            setEdges(eds => [...eds, blockEdge]);
          }
          
          previousBlockLastSceneId = errorNodeId;
          sceneIndex++;
        }
      }
      
      useProjectStore.getState().setAntigravityError(null);
      toast.success('Bản nháp Storyboard đã hoàn tất!');
      useProjectStore.getState().setVideoProgress({
        status: 'success',
        message: 'Kịch bản phân cảnh đã cập nhật xong!',
        currentStep: pendingBlocks.length,
        totalSteps: pendingBlocks.length,
      });
      setTimeout(() => useProjectStore.getState().setVideoProgress({ status: 'idle' }), 3000);

    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.detail || 'Có lỗi xảy ra khi tạo bản nháp';
      toast.error(msg);
      useProjectStore.getState().setAntigravityError('Storyboard generation failed: ' + msg);
      useProjectStore.getState().setVideoProgress({
        status: 'error',
        message: 'Lỗi khi tạo Storyboard!',
      });
      setTimeout(() => useProjectStore.getState().setVideoProgress({ status: 'idle' }), 3000);
    } finally {
      setIsGeneratingStoryboard(false);
      setTimeout(() => {
        reactFlowInstance?.fitView({ padding: 0.2, duration: 800 });
      }, 500);
    }
  }, [script, timelineClips, charactersMetadata, setNodes, setEdges, reactFlowInstance]);

  const handleExtractEntities = useCallback(() => {
    if (!script.length) return;
    
    useProjectStore.getState().setVideoProgress({
      status: 'extracting',
      message: 'Đang đọc kịch bản và tìm kiếm thực thể mới...',
      currentStep: 0,
      totalSteps: 0,
    });

    const fullText = script.map((l) => l.text).join('\n\n');
    extractEntitiesMut.mutate({ 
      text: fullText, 
      existing_metadata: charactersMetadata,
      project_id: useProjectStore.getState().currentProjectId
    }, {
      onSuccess: (data) => {
        if (data?.metadata) {
          setCharactersMetadata(data.metadata);
          toast.success('Đã trích xuất xong Danh sách Nhân Vật & Bối Cảnh!');
          useProjectStore.getState().setVideoProgress({
            status: 'success',
            message: 'Đã trích xuất thành công!',
          });
          setTimeout(() => useProjectStore.getState().setVideoProgress({ status: 'idle' }), 3000);
        }
      },
      onError: () => {
        toast.error('Lỗi khi trích xuất thực thể. Vui lòng check console backend.');
        useProjectStore.getState().setVideoProgress({
          status: 'error',
          message: 'Lỗi trích xuất!',
        });
        setTimeout(() => useProjectStore.getState().setVideoProgress({ status: 'idle' }), 3000);
      },
    });
  }, [script, setCharactersMetadata, charactersMetadata, extractEntitiesMut]);

  const handleEnhancePrompt = useCallback((
    id: string,
    handleUpdateAsset: (id: string, field: string, value: string) => void
  ) => {
    const entity = charactersMetadata[id];
    if (!entity) return;
    let basePrompt = entity.description || 'A character';
    if (entity.variation_context) basePrompt = `Context/Action: ${entity.variation_context}. Character description: ${basePrompt}`;

    enhancePromptMut.mutate(
      {
        prompt: basePrompt,
        asset_type: entity.type,
        asset_name: entity.name,
        global_style: globalArtStyleRef.current,
        _assetId: id,
      },
      {
        onSuccess: (data) => {
          handleUpdateAsset(id, 'image_prompt', data.prompt);
          toast.success('Đã Enhance Prompt thành công!');
        },
        onError: (e: any) => toast.error('Lỗi Enhance: ' + e.message),
      }
    );
  }, [charactersMetadata, enhancePromptMut]);

  return {
    isGeneratingStoryboard, isExtractingEntities, enhancingAssetId,
    handleGenFrame, handleGenVideo, handleRegenScenePrompt, handleExtractLastFrame,
    handleGenerateStoryboard, handleExtractEntities, handleEnhancePrompt,
    handleGenIntentPrompt, handleContinueScene, handleRegenVideoNode,
  };
}
