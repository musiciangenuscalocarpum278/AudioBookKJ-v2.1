import React from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Video, Loader2, RefreshCw, Plus, Trash2, Play, XCircle, ListVideo, CheckCircle2 } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { VideoStudioContext } from './VideoStudioContext';
import { API, API_BASE } from '../../config';
import { useProjectStore } from '../../store/useProjectStore';
import { usePlaybackStore } from '../../store/usePlaybackStore';
import type { TimelineVideoClip } from '../../types';

const VideoNodeCard = ({ id, data, selected }: NodeProps) => {
  const context = React.useContext(VideoStudioContext);
  const { setNodes, getNodes, getEdges } = useReactFlow();
  const [isHovered, setIsHovered] = React.useState(false);
  const [hoveredSliceIdx, setHoveredSliceIdx] = React.useState<number | null>(null);

  const timelineClips      = useProjectStore(s => s.timelineClips);
  const timelineVideoClips = useProjectStore(s => s.timelineVideoClips);
  const setTimelineVideoClips = useProjectStore(s => s.setTimelineVideoClips);
  const storeVideoDuration = useProjectStore(s => s.videoDuration);
  const setSelectedTimelineVideoClipId = usePlaybackStore(s => s.setSelectedTimelineVideoClipId);

  const videoUrl = data.videoUrl as string | undefined;
  const isGeneratingVideo = data.isGeneratingVideo as boolean;
  const opName = data.opName as string | undefined;
  const mediaId = data.mediaId as string | undefined;
  const errorMsg = data.error as string | undefined;

  // Poll for standard video status
  React.useEffect(() => {
    if (data.is_grid) return;
    if (!isGeneratingVideo || videoUrl) return;
    if (!opName && !mediaId) return;

    const poll = setInterval(async () => {
      try {
        const params: Record<string, string> = { project_id: useProjectStore.getState().currentProjectId };
        if (mediaId) params.media_id = mediaId;
        else if (opName) params.operation_name = opName;

        const res = await axios.get(API.checkVideoStatus, { params });
        if (res.data?.status === 200 && res.data?.data) {
          const videoData = res.data.data.video ?? {};
          const fifeUrl = videoData.fifeUrl;
          if (fifeUrl) {
            setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, videoUrl: fifeUrl, isGeneratingVideo: false } } : n));
            // Write video URL back to script lines via parent SceneNode
            const parentEdge = getEdges().find(e => e.target === id);
            const sceneNode = parentEdge ? getNodes().find(n => n.id === parentEdge.source && n.type === 'scene') : null;
            if (sceneNode?.data?.lines) {
              const lineIds = (sceneNode.data.lines as string).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
              useProjectStore.getState().setScript(prev => prev.map(l => lineIds.includes(l.id) ? { ...l, video_url: fifeUrl } : l));
            }
          }
        }
      } catch (err: any) {
        const status = err.response?.status;
        if (status && status !== 404 && status !== 429 && status < 500) {
          setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, isGeneratingVideo: false, error: 'Failed to generate' } } : n));
        } else {
          console.warn(`[Video Poll] Transient error ${status}, keeping polling...`);
        }
      }
    }, 5000);

    return () => clearInterval(poll);
  }, [isGeneratingVideo, videoUrl, opName, mediaId, id, data.is_grid, setNodes, getNodes, getEdges]);

  // Poll for grid slices
  React.useEffect(() => {
    if (!data.is_grid || !data.slices || !Array.isArray(data.slices)) return;
    
    const activeSlices = data.slices.filter((s: any) => !s.videoUrl && !s.error && s.isGenerating !== false);
    
    if (activeSlices.length === 0) {
      if (isGeneratingVideo) {
        setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, isGeneratingVideo: false } } : n));
      }
      return;
    }

    const poll = setInterval(async () => {
      let nodeNeedsUpdate = false;
      let newSlices = [...(data.slices as any[])];

      for (const slice of activeSlices) {
        try {
          const params: Record<string, string> = { project_id: useProjectStore.getState().currentProjectId };
          if (slice.media_id) params.media_id = slice.media_id;
          else if (slice.operation_name) params.operation_name = slice.operation_name;
          else continue;

          const res = await axios.get(API.checkVideoStatus, { params });
          if (res.data?.status === 200 && res.data?.data) {
            const videoData = res.data.data.video ?? {};
            const fifeUrl = videoData.fifeUrl;
            if (fifeUrl) {
              newSlices = newSlices.map(s => 
                s.idx === slice.idx ? { ...s, videoUrl: fifeUrl, isGenerating: false, error: undefined } : s
              );
              nodeNeedsUpdate = true;
            }
          }
        } catch (err: any) {
          const status = err.response?.status;
          if (status && status !== 404 && status !== 429 && status < 500) {
            newSlices = newSlices.map(s => 
              s.idx === slice.idx ? { ...s, isGenerating: false, error: err.message || 'Failed' } : s
            );
            nodeNeedsUpdate = true;
          }
        }
      }

      if (nodeNeedsUpdate) {
        const stillActive = newSlices.some(s => !s.videoUrl && !s.error);
        setNodes((nds) => nds.map((n) => n.id === id ? {
          ...n,
          data: {
            ...n.data,
            slices: newSlices,
            isGeneratingVideo: stillActive
          }
        } : n));
      }
    }, 5000);

    return () => clearInterval(poll);
  }, [data.is_grid, data.slices, isGeneratingVideo, id, setNodes]);

  const _sceneLineIds = (() => {
    const parentEdge = getEdges().find(e => e.target === id);
    const sceneNode = parentEdge ? getNodes().find(n => n.id === parentEdge.source && n.type === 'scene') : null;
    return sceneNode?.data?.lines
      ? (sceneNode.data.lines as string).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
      : [];
  })();
  const _primaryLineId = _sceneLineIds[0] ?? 0;
  const existingTimelineClip = _primaryLineId > 0
    ? timelineVideoClips.find(c => c.lineId === _primaryLineId)
    : null;

  const isSlicesFullyGenerated = !!(data.is_grid && data.slices && Array.isArray(data.slices) && data.slices.every((s: any) => !!s.videoUrl));
  const isVideoReady = !!(videoUrl || isSlicesFullyGenerated);

  const isInTimeline = data.is_grid
    ? !!(data.slices && Array.isArray(data.slices) && data.slices.every((s: any) => timelineVideoClips.some(c => c.videoUrl === s.videoUrl)))
    : !!(videoUrl && timelineVideoClips.some(c => c.videoUrl === videoUrl));

  const handleReRenderSlice = async (sliceIdx: number) => {
    const slice = (data.slices as any[])?.find((s) => s.idx === sliceIdx);
    if (!slice) return;

    const parentEdge = getEdges().find(e => e.target === id);
    const sceneNode = parentEdge ? getNodes().find(n => n.id === parentEdge.source && n.type === 'scene') : null;
    if (!sceneNode) {
      toast.error('Không tìm thấy Scene cha để lấy thông tin prompt!');
      return;
    }

    const prompt = (sceneNode.data.useAiMode && sceneNode.data.aiPrompt) 
      ? sceneNode.data.aiPrompt as string 
      : sceneNode.data.prompt as string;

    // Set slice to generating state
    setNodes((nds) => nds.map((n) => {
      if (n.id === id) {
        const updatedSlices = (n.data.slices as any[]).map((s) =>
          s.idx === sliceIdx ? { ...s, videoUrl: undefined, isGenerating: true, error: undefined, operation_name: undefined } : s
        );
        return {
          ...n,
          data: {
            ...n.data,
            slices: updatedSlices,
            isGeneratingVideo: true
          }
        };
      }
      return n;
    }));

    try {
      const res = await axios.post(API.generateSceneVideo, {
        prompt,
        project_id: useProjectStore.getState().flowkitProjectId,
        scene_id: `${id}_slice_${sliceIdx}_${Date.now()}`,
        start_image_media_id: slice.start_image_media_id,
        reference_media_ids: [],
        aspect_ratio: useProjectStore.getState().videoAspectRatio || "16:9",
        duration_seconds: 2,
        video_model_profile: useProjectStore.getState().videoModelProfile,
        is_grid_mode: false,
        start_image_url: null,
      });

      const { operation_name: opName, primary_media_id: mediaId } = res.data;
      if (!opName && !mediaId) throw new Error('No operation_name or primary_media_id returned');

      setNodes((nds) => nds.map((n) => {
        if (n.id === id) {
          const updatedSlices = (n.data.slices as any[]).map((s) =>
            s.idx === sliceIdx ? { ...s, operation_name: opName, media_id: mediaId } : s
          );
          return {
            ...n,
            data: {
              ...n.data,
              slices: updatedSlices,
            }
          };
        }
        return n;
      }));
      toast.success(`Đang tạo lại video cho góc ${sliceIdx + 1}...`);
    } catch (err: any) {
      toast.error(`Lỗi khi tạo lại góc ${sliceIdx + 1}: ` + err.message);
      setNodes((nds) => nds.map((n) => {
        if (n.id === id) {
          const updatedSlices = (n.data.slices as any[]).map((s) =>
            s.idx === sliceIdx ? { ...s, isGenerating: false, error: err.message } : s
          );
          const stillActive = updatedSlices.some((s) => !s.videoUrl && !s.error);
          return {
            ...n,
            data: {
              ...n.data,
              slices: updatedSlices,
              isGeneratingVideo: stillActive
            }
          };
        }
        return n;
      }));
    }
  };

  const handleAddToTimeline = (replace = false) => {
    if (!isVideoReady) return;
    const parentEdge = getEdges().find(e => e.target === id);
    const sceneNode = parentEdge ? getNodes().find(n => n.id === parentEdge.source && n.type === 'scene') : null;
    const lineIds = sceneNode?.data?.lines
      ? (sceneNode.data.lines as string).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
      : [];
    const lineId = lineIds[0] ?? 0;
    const audioClip = lineIds.length > 0 ? timelineClips.find(c => lineIds.includes(c.lineId)) : null;

    const startTime = audioClip?.startTime ?? (timelineVideoClips.length > 0
      ? Math.max(...timelineVideoClips.map(c => c.startTime + c.duration))
      : 0);

    const getTrackForStartTime = (sTime: number) => {
      const trackEndTimes: number[] = [];
      timelineVideoClips.forEach(c => {
        const t = c.track ?? 0;
        while (trackEndTimes.length <= t) trackEndTimes.push(0);
        trackEndTimes[t] = Math.max(trackEndTimes[t], c.startTime + c.duration);
      });
      let track = trackEndTimes.length;
      for (let t = 0; t < trackEndTimes.length; t++) {
        if (sTime >= trackEndTimes[t] - 0.1) { track = t; break; }
      }
      return track;
    };

    if (data.is_grid && data.slices && Array.isArray(data.slices)) {
      const newClips: TimelineVideoClip[] = [];
      data.slices.forEach((slice: any, index: number) => {
        const clipStartTime = startTime + index * 2;
        const track = getTrackForStartTime(clipStartTime);
        newClips.push({
          id: `video_${id}_slice_${slice.idx}_${Date.now()}_${index}`,
          lineId,
          videoUrl: slice.videoUrl,
          startTime: clipStartTime,
          duration: 2.0,
          track,
        });
      });

      if (replace && existingTimelineClip) {
        setTimelineVideoClips(prev => [
          ...prev.filter(c => c.id !== existingTimelineClip.id),
          ...newClips
        ]);
        toast.success('Đã thay thế và sync 4 clip video dạng lưới!');
      } else {
        setTimelineVideoClips(prev => [...prev, ...newClips]);
        toast.success('Đã thêm 4 clip video dạng lưới vào Timeline!');
      }
      return;
    }

    const duration = (sceneNode?.data?.videoDuration as number | undefined) ?? storeVideoDuration;
    if (replace && existingTimelineClip) {
      setTimelineVideoClips(prev => prev.map(c =>
        c.id === existingTimelineClip.id
          ? { ...c, videoUrl: videoUrl!, duration }
          : c
      ));
      setSelectedTimelineVideoClipId(existingTimelineClip.id);
      toast.success('Replaced video clip in Timeline');
      return;
    }

    const track = getTrackForStartTime(startTime);
    const newClip: TimelineVideoClip = {
      id: `video_${id}_${Date.now()}`,
      lineId,
      videoUrl: videoUrl!,
      startTime,
      duration,
      track,
    };
    setTimelineVideoClips(prev => [...prev, newClip]);
    setSelectedTimelineVideoClipId(newClip.id);
    toast.success('Added to Timeline');
  };

  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-zinc-950 border border-zinc-700 hover:border-amber-cinematic rounded-full"
      />

      {/* COMPACT VIEW */}
      <div
        className={`video-node-compact bg-obsidian-panel border shadow-sm w-32 h-16 flex items-center justify-center transition-colors rounded-xl ${
          selected ? 'border-amber-cinematic shadow-[0_0_10px_rgba(249,115,22,0.2)]' : 'border-zinc-800'
        }`}
      >
        <Video className="w-4 h-4 text-amber-cinematic animate-pulse" />
        <span className="text-[10px] text-zinc-300 font-bold ml-2 font-mono tracking-wider">VIDEO</span>
      </div>

      {/* DETAILED VIEW */}
      <div
        className={`video-node-detailed bg-obsidian-panel/95 border rounded-xl shadow-md overflow-hidden group transition-all duration-150 ${
          data.is_grid ? 'w-[432px]' : 'w-72'
        } ${
          selected
            ? 'border-amber-cinematic shadow-[0_0_15px_rgba(249,115,22,0.25)] scale-[1.005]'
            : 'border-zinc-800/80 hover:border-zinc-700'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-2.5 py-2 bg-zinc-950 border-b border-zinc-850">
          <div className="flex items-center gap-2">
            <Video className="w-3.5 h-3.5 text-amber-cinematic" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-200 font-mono">
              {data.is_grid ? 'Grid 2x2 Storyboard' : 'Video Module'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {!data.is_grid && (videoUrl || isGeneratingVideo) && (
              <button
                onClick={() => context?.onRegenVideoNode('', id)}
                disabled={isGeneratingVideo}
                title="Regenerate video"
                aria-label="Regenerate video"
                className="p-0.5 rounded text-zinc-400 hover:text-amber-cinematic disabled:opacity-40 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
            {isGeneratingVideo && (
              <div className="text-zinc-550 animate-pulse text-[9px] font-mono tracking-wider uppercase">Generating...</div>
            )}
            <button
              onClick={() => context?.onDeleteScene(id)}
              title="Delete video"
              aria-label="Delete video"
              className="p-0.5 rounded text-zinc-400 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div
          className={`bg-zinc-950 relative flex items-center justify-center group/video border-b border-zinc-850 ${
            useProjectStore.getState().videoAspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video'
          }`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {data.is_grid && data.slices && Array.isArray(data.slices) ? (
            <div className="grid grid-cols-2 grid-rows-2 w-full h-full bg-zinc-950 border border-zinc-850">
              {data.slices.map((slice: any) => (
                <div
                  key={slice.idx}
                  className="relative border border-zinc-850/60 overflow-hidden flex items-center justify-center bg-zinc-900 group/slice"
                  onMouseEnter={() => setHoveredSliceIdx(slice.idx)}
                  onMouseLeave={() => setHoveredSliceIdx(null)}
                >
                  {slice.videoUrl ? (
                    <div className="w-full h-full relative">
                      {hoveredSliceIdx === slice.idx ? (
                        <video
                          src={slice.videoUrl}
                          autoPlay
                          muted
                          loop
                          className="w-full h-full object-cover"
                          preload="metadata"
                        />
                      ) : (
                        <>
                          <img
                            src={`${API_BASE}/api/video/thumbnail?url=${encodeURIComponent(slice.videoUrl)}&project_id=${
                              useProjectStore.getState().currentProjectId
                            }`}
                            alt={`Góc ${slice.idx + 1}`}
                            className="w-full h-full object-cover opacity-60"
                          />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-7 h-7 bg-zinc-950/70 rounded-full flex items-center justify-center border border-zinc-850">
                              <Play className="w-2.5 h-2.5 text-amber-cinematic ml-0.5" />
                            </div>
                          </div>
                        </>
                      )}
                      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover/slice:opacity-100 transition-opacity z-20 flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReRenderSlice(slice.idx);
                          }}
                          title="Tạo lại duy nhất ô này"
                          aria-label={`Tạo lại góc ${slice.idx + 1}`}
                          className="p-1 bg-zinc-950/90 hover:bg-zinc-850 border border-zinc-800 text-amber-cinematic hover:text-amber-400 transition-colors rounded-sm"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  ) : slice.isGenerating !== false ? (
                    <div className="flex flex-col items-center justify-center p-2 text-center">
                      <Loader2 className="w-5 h-5 animate-spin text-amber-cinematic mb-1.5" />
                      <span className="text-[9px] text-zinc-500 font-semibold font-mono uppercase tracking-wider">
                        Angle {slice.idx + 1}...
                      </span>
                    </div>
                  ) : slice.error ? (
                    <div className="flex flex-col items-center justify-center p-2 text-center relative w-full h-full bg-red-950/20">
                      <span className="text-[9px] text-red-400 font-bold font-mono tracking-wider uppercase mb-1">
                        Failed
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReRenderSlice(slice.idx);
                        }}
                        title="Tạo lại"
                        aria-label={`Tạo lại góc lỗi ${slice.idx + 1}`}
                        className="p-1 bg-red-950/50 hover:bg-red-900/40 border border-red-800/60 text-red-200 transition-colors rounded-sm"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center p-2 text-center">
                      <span className="text-[9px] font-mono tracking-wider uppercase text-zinc-650">Ready</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : videoUrl ? (
            isHovered ? (
              <video src={videoUrl} autoPlay muted loop controls className="w-full h-full object-cover" />
            ) : (
              <>
                <img
                  src={`${API_BASE}/api/video/thumbnail?url=${encodeURIComponent(videoUrl)}&project_id=${
                    useProjectStore.getState().currentProjectId
                  }`}
                  alt="Video Thumbnail"
                  className="w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-10 h-10 bg-zinc-950/70 rounded-full flex items-center justify-center border border-zinc-800">
                    <Play className="w-3.5 h-3.5 text-amber-cinematic ml-0.5" />
                  </div>
                </div>
              </>
            )
          ) : isGeneratingVideo ? (
            <div className="flex flex-col items-center gap-2 py-4 text-[9px] text-zinc-400 font-mono tracking-wider uppercase">
              <Loader2 className="w-5 h-5 animate-spin text-amber-cinematic" />
              <span>Rendering... (2-5 mins)</span>
            </div>
          ) : errorMsg ? (
            <div className="flex flex-col items-center gap-1.5 py-4 px-3 text-[9px] text-red-400 text-center font-mono tracking-wide">
              <span className="font-bold uppercase tracking-wider">Generation Error</span>
              <span className="text-zinc-500 break-all leading-normal">{errorMsg}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 py-4 text-[9px] text-zinc-600 font-mono tracking-wider uppercase">
              <span>Pending Generation</span>
            </div>
          )}
        </div>

        {/* Footer / Actions */}
        {isVideoReady && (
          <div className="flex items-center justify-between px-2.5 py-2 bg-zinc-950">
            {isInTimeline ? (
              <button
                disabled
                className="flex items-center gap-1 px-2 py-1 text-[9px] bg-zinc-900 text-zinc-500 rounded-sm font-medium border border-zinc-850 opacity-60 cursor-default font-mono tracking-wider uppercase"
              >
                <CheckCircle2 className="w-2.5 h-2.5 text-zinc-500" /> In Timeline
              </button>
            ) : existingTimelineClip ? (
              <button
                onClick={() => handleAddToTimeline(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-[9px] bg-amber-cinematic/15 hover:bg-amber-cinematic/25 text-amber-cinematic rounded-sm font-semibold transition-colors border border-amber-cinematic/30 font-mono tracking-wider uppercase"
                title="Replace existing clip for this scene with the new video"
              >
                <ListVideo className="w-2.5 h-2.5" /> Replace Clip
              </button>
            ) : (
              <button
                onClick={() => handleAddToTimeline(false)}
                className="flex items-center gap-1 px-2.5 py-1 text-[9px] bg-amber-cinematic/15 hover:bg-amber-cinematic/25 text-amber-cinematic rounded-sm font-semibold transition-colors border border-amber-cinematic/30 font-mono tracking-wider uppercase"
                title="Add this video clip to the Post-Production timeline"
              >
                <ListVideo className="w-2.5 h-2.5" /> Add to Timeline
              </button>
            )}
            <button
              onClick={() => context?.onContinueScene('', id)}
              className="flex items-center gap-1 px-2.5 py-1 text-[9px] bg-zinc-800 hover:bg-zinc-700 text-zinc-250 rounded-sm font-medium transition-colors border border-zinc-700 font-mono tracking-wider uppercase"
            >
              <Plus className="w-2.5 h-2.5" /> Continue Scene
            </button>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-zinc-950 border border-zinc-700 hover:border-amber-cinematic rounded-full"
      />
    </div>
  );
};

export default React.memo(VideoNodeCard, (prevProps, nextProps) => {
  if (prevProps.id !== nextProps.id) return false;
  if (prevProps.selected !== nextProps.selected) return false;

  const p = prevProps.data;
  const n = nextProps.data;
  if (p.videoUrl !== n.videoUrl) return false;
  if (p.isGeneratingVideo !== n.isGeneratingVideo) return false;
  if (p.opName !== n.opName) return false;
  if (p.mediaId !== n.mediaId) return false;
  if (p.error !== n.error) return false;
  if (p.is_grid !== n.is_grid) return false;

  if (p.slices !== n.slices) {
    if (!p.slices || !n.slices) return false;
    if (p.slices.length !== n.slices.length) return false;
    for (let i = 0; i < p.slices.length; i++) {
      const ps = p.slices[i];
      const ns = n.slices[i];
      if (ps.idx !== ns.idx) return false;
      if (ps.videoUrl !== ns.videoUrl) return false;
      if (ps.isGenerating !== ns.isGenerating) return false;
      if (ps.error !== ns.error) return false;
      if (ps.start_image_media_id !== ns.start_image_media_id) return false;
      if (ps.operation_name !== ns.operation_name) return false;
      if (ps.media_id !== ns.media_id) return false;
    }
  }
  return true;
});
