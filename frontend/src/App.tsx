import React, { useState, useRef, useEffect } from 'react';
import { Mic, Plus, FileText, Upload, Volume2, Trash2, Loader2, Save, FolderOpen, Copy, CheckCircle, ArrowUpDown, GripVertical, X, ChevronDown, ChevronUp, Image as ImageIcon, Video, User, Wand2 } from 'lucide-react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import localforage from 'localforage';
import VideoStudio from './VideoStudio';
import type { ScriptLine, TimelineClip, TimelineVideoClip, VoiceParams, RenderProgress, CharacterMetadata } from './types';
import { API, API_BASE } from './config';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTimelinePlayback } from './hooks/useTimelinePlayback';
import { useAudioMixer } from './hooks/useAudioMixer';
import { useScriptManager } from './hooks/useScriptManager';
import {
  useGenerateScript,
  useExtractEntities,
  useEnhanceMotion,
  useCreateSyntheticVoice,
  useSaveProfile,
} from './hooks/api/mutations';
import { useProjectStore } from './store/useProjectStore';
import { usePlaybackStore } from './store/usePlaybackStore';
import { Header } from './components/layout/Header';
import { ScriptSidebar } from './components/script/ScriptSidebar';
import { Timeline } from './components/timeline/Timeline';
import { PropertiesInspector } from './components/inspector/PropertiesInspector';
import Playground from './components/playground/Playground';

// Mock data for initial UI state
const initialScript = [
  { id: 0, speaker: 'narration', text: 'Tiếng gầm thét của "Lõi Ý thức" không giống với bất kỳ âm thanh cơ khí nào.' },
  { id: 1, speaker: 'kael', text: 'Vậy tôi phải làm gì? Nó sắp tan vỡ hoàn toàn!' },
  { id: 2, speaker: 'elara', text: 'Cậu không thể là người "làm" mọi việc. Cậu phải là người "hướng dẫn".' },
];


// Shared AudioContext to avoid browser hardware limit (~6 context max)

// Khởi tạo AudioContext dùng chung để tránh lỗi giới hạn phần cứng của trình duyệt (chỉ cho phép tạo ~6 context)
const SharedAudioContext = window.AudioContext || (window as any).webkitAudioContext;
const sharedAudioContext = new SharedAudioContext();
(window as any).globalAudioContext = sharedAudioContext;
const appWaveformCache = new Map<string, Float32Array>();

export const getMediaUrl = (filePath: string, projectId: string, addTimestamp: boolean = false) => {
  if (!filePath) return '';
  let url = '';
  if (filePath.startsWith('http')) {
    url = filePath;
  } else if (filePath.includes(':\\') || filePath.startsWith('/')) {
    url = `${API_BASE}/api/audio?path=${encodeURIComponent(filePath)}`;
  } else {
    url = `${API_BASE}/api/project-media/${projectId}/${filePath}`;
  }
  if (addTimestamp) {
    url += (url.includes('?') ? '&' : '?') + 't=' + Date.now();
  }
  return url;
};

const Waveform = ({ audioUrl, width }: { audioUrl: string, width: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let isCancelled = false;

    const draw = (channelData: Float32Array) => {
      if (isCancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const barWidth = 2;
      const gap = 1;
      const barCount = Math.floor(width / (barWidth + gap));
      const step = Math.ceil(channelData.length / barCount);
      ctx.clearRect(0, 0, width, canvas.height);
      ctx.fillStyle = '#0f172a';
      ctx.globalAlpha = 0.4;
      for (let i = 0; i < barCount; i++) {
        let min = 1.0, max = -1.0;
        for (let j = 0; j < step; j++) {
          const index = i * step + j;
          if (index < channelData.length) {
            const datum = channelData[index];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
          }
        }
        const amplitude = Math.max(Math.abs(min), Math.abs(max));
        const barHeight = Math.max(1, amplitude * canvas.height * 0.9);
        ctx.fillRect(i * (barWidth + gap), (canvas.height - barHeight) / 2, barWidth, barHeight);
      }
    };

    const cached = appWaveformCache.get(audioUrl);
    if (cached) { draw(cached); return () => { isCancelled = true; }; }

    fetch(audioUrl)
      .then(r => r.arrayBuffer())
      .then(buf => sharedAudioContext.decodeAudioData(buf))
      .then(decoded => {
        const data = decoded.getChannelData(0);
        appWaveformCache.set(audioUrl, data);
        draw(data);
      })
      .catch(() => { });

    return () => { isCancelled = true; };
  }, [audioUrl, width]);

  return <canvas ref={canvasRef} width={width} height={36} className="w-full h-[36px] pointer-events-none" />;
};

function App() {
  // ── Zustand: Project Store ────────────────────────────────────────────────
  const activeTab = useProjectStore(s => s.activeTab);
  const setActiveTab = useProjectStore(s => s.setActiveTab);
  const script = useProjectStore(s => s.script);
  const setScript = useProjectStore(s => s.setScript);
  const timelineClips = useProjectStore(s => s.timelineClips);
  const setTimelineClips = useProjectStore(s => s.setTimelineClips);
  const timelineVideoClips = useProjectStore(s => s.timelineVideoClips);
  const setTimelineVideoClips = useProjectStore(s => s.setTimelineVideoClips);
  const lockedVoices = useProjectStore(s => s.lockedVoices);
  const setLockedVoices = useProjectStore(s => s.setLockedVoices);
  const speakerVoiceParams = useProjectStore(s => s.speakerVoiceParams);
  const setSpeakerVoiceParams = useProjectStore(s => s.setSpeakerVoiceParams);
  const charactersMetadata = useProjectStore(s => s.charactersMetadata);
  const setCharactersMetadata = useProjectStore(s => s.setCharactersMetadata);
  const renderProgress = useProjectStore(s => s.renderProgress);
  const setRenderProgress = useProjectStore(s => s.setRenderProgress);
  const flowkitProjectId = useProjectStore(s => s.flowkitProjectId);
  const setFlowkitProjectId = useProjectStore(s => s.setFlowkitProjectId);
  const globalArtStyle = useProjectStore(s => s.globalArtStyle);
  const setGlobalArtStyle = useProjectStore(s => s.setGlobalArtStyle);
  const videoAspectRatio = useProjectStore(s => s.videoAspectRatio);
  const setVideoAspectRatio = useProjectStore(s => s.setVideoAspectRatio);
  const videoDuration = useProjectStore(s => s.videoDuration);
  const setVideoDuration = useProjectStore(s => s.setVideoDuration);
  const videoModelProfile = useProjectStore(s => s.videoModelProfile);
  const setVideoModelProfile = useProjectStore(s => s.setVideoModelProfile);
  const ttsDenoise = useProjectStore(s => s.ttsDenoise);
  const setTtsDenoise = useProjectStore(s => s.setTtsDenoise);
  const ttsPostprocess = useProjectStore(s => s.ttsPostprocess);
  const setTtsPostprocess = useProjectStore(s => s.setTtsPostprocess);
  const ttsNumStep = useProjectStore(s => s.ttsNumStep);
  const setTtsNumStep = useProjectStore(s => s.setTtsNumStep);
  const ttsGuidanceScale = useProjectStore(s => s.ttsGuidanceScale);
  const setTtsGuidanceScale = useProjectStore(s => s.setTtsGuidanceScale);
  const ttsSpeed = useProjectStore(s => s.ttsSpeed);
  const setTtsSpeed = useProjectStore(s => s.setTtsSpeed);
  const videoNodes = useProjectStore(s => s.videoNodes);
  const videoEdges = useProjectStore(s => s.videoEdges);
  const setVideoNodes = useProjectStore(s => s.setVideoNodes);
  const setVideoEdges = useProjectStore(s => s.setVideoEdges);
  const setProcessingJobs = useProjectStore(s => s.setProcessingJobs);
  const incrementProjectVersion = useProjectStore(s => s.incrementProjectVersion);
  const antigravityError = useProjectStore(s => s.antigravityError);
  const setSaveStatus = useProjectStore(s => s.setSaveStatus);
  const currentProjectId = useProjectStore(s => s.currentProjectId);
  const setCurrentProjectId = useProjectStore(s => s.setCurrentProjectId);
  const setCurrentProjectName = useProjectStore(s => s.setCurrentProjectName);
  const _hasHydrated = useProjectStore(s => s._hasHydrated);

  // ── Zustand: Playback Store ───────────────────────────────────────────────
  const isPlayingTimeline = usePlaybackStore(s => s.isPlayingTimeline);
  const setIsPlayingTimeline = usePlaybackStore(s => s.setIsPlayingTimeline);
  const timelineTime = usePlaybackStore(s => s.timelineTime);
  const setTimelineTime = usePlaybackStore(s => s.setTimelineTime);
  const zoomLevel = usePlaybackStore(s => s.zoomLevel);
  const setZoomLevel = usePlaybackStore(s => s.setZoomLevel);
  const timelineHeight = usePlaybackStore(s => s.timelineHeight);
  const setTimelineHeight = usePlaybackStore(s => s.setTimelineHeight);
  const draggingTimelineClipId = usePlaybackStore(s => s.draggingTimelineClipId);
  const setDraggingTimelineClipId = usePlaybackStore(s => s.setDraggingTimelineClipId);
  const timelineDragStartX = usePlaybackStore(s => s.timelineDragStartX);
  const setTimelineDragStartX = usePlaybackStore(s => s.setTimelineDragStartX);
  const timelineDragStartY = usePlaybackStore(s => s.timelineDragStartY);
  const setTimelineDragStartY = usePlaybackStore(s => s.setTimelineDragStartY);
  const timelineDragStartStartTime = usePlaybackStore(s => s.timelineDragStartStartTime);
  const setTimelineDragStartStartTime = usePlaybackStore(s => s.setTimelineDragStartStartTime);
  const timelineDragStartTrack = usePlaybackStore(s => s.timelineDragStartTrack);
  const setTimelineDragStartTrack = usePlaybackStore(s => s.setTimelineDragStartTrack);
  const draggingVideoClipId = usePlaybackStore(s => s.draggingVideoClipId);
  const setDraggingVideoClipId = usePlaybackStore(s => s.setDraggingVideoClipId);
  const resizingVideoClipId = usePlaybackStore(s => s.resizingVideoClipId);
  const setResizingVideoClipId = usePlaybackStore(s => s.setResizingVideoClipId);
  const videoResizeEdge = usePlaybackStore(s => s.videoResizeEdge);
  const setVideoResizeEdge = usePlaybackStore(s => s.setVideoResizeEdge);
  const videoDragStartDuration = usePlaybackStore(s => s.videoDragStartDuration);
  const setVideoDragStartDuration = usePlaybackStore(s => s.setVideoDragStartDuration);
  const videoDragStartTrimStart = usePlaybackStore(s => s.videoDragStartTrimStart);
  const setVideoDragStartTrimStart = usePlaybackStore(s => s.setVideoDragStartTrimStart);
  const selectedTimelineVideoClipId = usePlaybackStore(s => s.selectedTimelineVideoClipId);
  const setSelectedTimelineVideoClipId = usePlaybackStore(s => s.setSelectedTimelineVideoClipId);
  const selectedTimelineAudioClipId = usePlaybackStore(s => s.selectedTimelineAudioClipId);
  const setSelectedTimelineAudioClipId = usePlaybackStore(s => s.setSelectedTimelineAudioClipId);
  const selectedTimelineVideoClipIds = usePlaybackStore(s => s.selectedTimelineVideoClipIds);
  const setSelectedTimelineVideoClipIds = usePlaybackStore(s => s.setSelectedTimelineVideoClipIds);
  const selectedTimelineAudioClipIds = usePlaybackStore(s => s.selectedTimelineAudioClipIds);
  const setSelectedTimelineAudioClipIds = usePlaybackStore(s => s.setSelectedTimelineAudioClipIds);
  const groupDragStartPositions = usePlaybackStore(s => s.groupDragStartPositions);
  const setGroupDragStartPositions = usePlaybackStore(s => s.setGroupDragStartPositions);

  // ── Local UI state (not shared, no need for store) ───────────────────────
  const [activeVideoNodeLineIds, setActiveVideoNodeLineIds] = useState<number[]>([]);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [playingVoiceRef, setPlayingVoiceRef] = useState<string | null>(null);
  const [expandedScriptLines, setExpandedScriptLines] = useState<Set<number>>(new Set());
  const [expandedVoices, setExpandedVoices] = useState<Set<string>>(new Set());
  const [isGeneratingAsset, setIsGeneratingAsset] = useState<string | null>(null);
  const [isSortingMode, setIsSortingMode] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [isRegeneratingPrompt, setIsRegeneratingPrompt] = useState<number | null>(null);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  // ── TanStack Query mutations (auto-tracked isPending state) ──────────────
  const generateScriptMut = useGenerateScript();
  const extractEntitiesMut = useExtractEntities();
  const enhanceMotionMut = useEnhanceMotion();
  const createSyntheticVoiceMut = useCreateSyntheticVoice();
  const saveProfileMut = useSaveProfile();

  const isGenerating = generateScriptMut.isPending;
  const isExtractingEntities = extractEntitiesMut.isPending;
  const isCreatingSynthetic = createSyntheticVoiceMut.isPending ? createSyntheticVoiceMut.variables?.speaker ?? null : null;
  const isEnhancingMotion = enhanceMotionMut.isPending ? (enhanceMotionMut.variables as any)?._lineId ?? null : null;

  const toggleScriptLine = (id: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) return;
    setExpandedScriptLines(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVoice = (speaker: string, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('select')) return;
    setExpandedVoices(prev => {
      const next = new Set<string>();
      if (!prev.has(speaker)) {
        next.add(speaker);
      }
      return next;
    });
  };

  const handleTimelineResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = timelineHeight;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      setTimelineHeight(Math.max(100, Math.min(window.innerHeight - 100, startHeight + deltaY)));
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Tracks whether the initial server fetch has completed — prevents the
  // script save effect from wiping the DB before the mount data arrives
  const hasInitialLoaded = React.useRef(false);

  // Load project state by ID — used on mount and when switching projects
  const loadProjectById = React.useCallback(async (projectId: string) => {
    try {
      const { data } = await axios.get(API.projectState, { params: { project_id: projectId } });
      setCharactersMetadata(data.entities);
      if (data.project) {
        if (data.project.globalArtStyle) setGlobalArtStyle(data.project.globalArtStyle);
        if (data.project.videoAspectRatio) setVideoAspectRatio(data.project.videoAspectRatio);
        if (data.project.videoDuration) setVideoDuration(data.project.videoDuration);
        if (data.project.videoModelProfile) setVideoModelProfile(data.project.videoModelProfile);
        if (data.project.flowkitProjectId) setFlowkitProjectId(data.project.flowkitProjectId);
        if (data.project.ttsDenoise !== undefined) setTtsDenoise(data.project.ttsDenoise);
        if (data.project.ttsPostprocess !== undefined) setTtsPostprocess(data.project.ttsPostprocess);
        if (data.project.ttsNumStep !== undefined) setTtsNumStep(data.project.ttsNumStep);
        if (data.project.ttsGuidanceScale !== undefined) setTtsGuidanceScale(data.project.ttsGuidanceScale);
        if (data.project.ttsSpeed !== undefined) setTtsSpeed(data.project.ttsSpeed);
      }
      if (data.voiceParams) setSpeakerVoiceParams(data.voiceParams);
      else setSpeakerVoiceParams({});

      if (data.lockedVoices) setLockedVoices(data.lockedVoices);
      else setLockedVoices({});
      if (data.processingJobs) setProcessingJobs(data.processingJobs);
      if (data.videoGraph?.nodes?.length > 0) {
        setVideoNodes(data.videoGraph.nodes);
        setVideoEdges(data.videoGraph.edges ?? []);
      } else {
        setVideoNodes([]);
        setVideoEdges([]);
      }
      incrementProjectVersion();
      setScript(data.script || []);
      if (data.timelineClips) {
        setTimelineClips(data.timelineClips.audio.map((c: any) => ({
          ...c,
          audioUrl: getMediaUrl(c.filename, projectId),
          // Normalize: DB used to store volume as fraction (1.0) instead of percentage (100)
          volume: c.volume != null && c.volume <= 1.0 ? c.volume * 100 : (c.volume ?? 100),
        })));
        setTimelineVideoClips(data.timelineClips.video);
      } else {
        setTimelineClips([]);
        setTimelineVideoClips([]);
      }
    } catch (e) {
      console.error('Lỗi khi load project state', e);
    }
  }, []);

  // Load all project state on mount
  useEffect(() => {
    if (!_hasHydrated) return;
    loadProjectById(useProjectStore.getState().currentProjectId).finally(() => {
      hasInitialLoaded.current = true;
    });
  }, [_hasHydrated, loadProjectById]);

  // Switch to an existing project
  const handleSwitchProject = React.useCallback(async (id: string, name: string) => {
    hasInitialLoaded.current = false;
    setCurrentProjectId(id);
    setCurrentProjectName(name);
    // Reset working state before loading
    setScript([]);
    setTimelineClips([]);
    setTimelineVideoClips([]);
    setVideoNodes([]);
    setVideoEdges([]);
    setCharactersMetadata({});
    await loadProjectById(id);
    hasInitialLoaded.current = true;
    toast.success(`Đã chuyển sang Project: ${name}`);
  }, [loadProjectById]);

  // Create a new project and switch to it
  const handleCreateProject = React.useCallback(async (name: string, root: string = '') => {
    try {
      const res = await axios.post(API.projects, { name, project_root: root });
      const { id } = res.data.project;
      await handleSwitchProject(id, name);
    } catch {
      toast.error('Tạo Project thất bại');
    }
  }, [handleSwitchProject]);

  // Debounced save of script lines to SQLite whenever they change
  const scriptSaveTimer = React.useRef<ReturnType<typeof setTimeout>>();
  const saveStatusTimer = React.useRef<ReturnType<typeof setTimeout>>();
  const markSaved = React.useCallback(() => {
    const store = useProjectStore.getState();
    store.setSaveStatus('saved');
    clearTimeout(saveStatusTimer.current);
    saveStatusTimer.current = setTimeout(() => store.setSaveStatus('idle'), 2000);
  }, []);

  useEffect(() => {
    if (!hasInitialLoaded.current) return;
    clearTimeout(scriptSaveTimer.current);
    const pid = currentProjectId;
    scriptSaveTimer.current = setTimeout(() => {
      if (useProjectStore.getState().currentProjectId !== pid) return;
      useProjectStore.getState().setSaveStatus('saving');
      axios.post(API.scriptLines, { lines: script, project_id: pid })
        .then(markSaved)
        .catch(() => useProjectStore.getState().setSaveStatus('error'));
    }, 1500);

    return () => clearTimeout(scriptSaveTimer.current);
  }, [script, currentProjectId]);

  // Debounced save of timeline clips to SQLite whenever they change
  const timelineSaveTimer = React.useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!hasInitialLoaded.current) return;
    clearTimeout(timelineSaveTimer.current);
    const pid = currentProjectId;
    timelineSaveTimer.current = setTimeout(() => {
      if (useProjectStore.getState().currentProjectId !== pid) return;
      useProjectStore.getState().setSaveStatus('saving');
      axios.post(API.timelineClips, {
        audio: timelineClips.map(({ audioUrl: _url, ...rest }) => rest),
        video: timelineVideoClips,
        project_id: pid,
      })
        .then(markSaved)
        .catch(() => useProjectStore.getState().setSaveStatus('error'));
    }, 1500);

    return () => clearTimeout(timelineSaveTimer.current);
  }, [timelineClips, timelineVideoClips, currentProjectId]);

  // Debounced save of video/art settings & voice casting to SQLite whenever they change
  const profileSaveTimer = React.useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!hasInitialLoaded.current) return;
    clearTimeout(profileSaveTimer.current);
    const pid = currentProjectId;
    profileSaveTimer.current = setTimeout(() => {
      if (useProjectStore.getState().currentProjectId !== pid) return;
      useProjectStore.getState().setSaveStatus('saving');
      axios.post(API.projectProfile, {
        globalArtStyle,
        videoAspectRatio,
        videoDuration,
        videoModelProfile,
        flowkitProjectId,
        speakerVoiceParams,
        lockedVoices,
        ttsDenoise,
        ttsPostprocess,
        ttsNumStep,
        ttsGuidanceScale,
        ttsSpeed,
        project_id: pid,
      })
        .then(markSaved)
        .catch(() => useProjectStore.getState().setSaveStatus('error'));
    }, 1500);

    return () => clearTimeout(profileSaveTimer.current);
  }, [globalArtStyle, videoAspectRatio, videoDuration, videoModelProfile, flowkitProjectId, speakerVoiceParams, lockedVoices, currentProjectId, ttsDenoise, ttsPostprocess, ttsNumStep, ttsGuidanceScale, ttsSpeed]);

  // Debounced save of Video Studio graph to SQLite whenever they change
  const videoGraphSaveTimer = React.useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!hasInitialLoaded.current) return;
    clearTimeout(videoGraphSaveTimer.current);
    const pid = currentProjectId;
    videoGraphSaveTimer.current = setTimeout(() => {
      if (useProjectStore.getState().currentProjectId !== pid) return;
      useProjectStore.getState().setSaveStatus('saving');
      axios.post(API.videoGraph, {
        nodes: videoNodes,
        edges: videoEdges,
        project_id: pid,
      })
        .then(markSaved)
        .catch(() => useProjectStore.getState().setSaveStatus('error'));
    }, 1500);

    return () => clearTimeout(videoGraphSaveTimer.current);
  }, [videoNodes, videoEdges, currentProjectId]);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!draggingTimelineClipId && !draggingVideoClipId && !resizingVideoClipId) return;

      const deltaX = e.clientX - timelineDragStartX;
      let deltaSeconds = deltaX / zoomLevel;

      const deltaY = e.clientY - timelineDragStartY;
      let deltaTracks = Math.round(deltaY / 64); // 64px per track

      const startPositions = usePlaybackStore.getState().groupDragStartPositions;
      const selectedVideoIds = usePlaybackStore.getState().selectedTimelineVideoClipIds;
      const selectedAudioIds = usePlaybackStore.getState().selectedTimelineAudioClipIds;

      // Tính toán chặn biên trái (< 0) và biên trên (< 0) của cả nhóm
      let minStartTime = Infinity;
      let minVideoTrack = Infinity;
      let minAudioTrack = Infinity;

      selectedVideoIds.forEach(id => {
        const startPos = startPositions[id];
        if (startPos) {
          if (startPos.startTime < minStartTime) minStartTime = startPos.startTime;
          if (startPos.track < minVideoTrack) minVideoTrack = startPos.track;
        }
      });

      selectedAudioIds.forEach(id => {
        const startPos = startPositions[id];
        if (startPos) {
          if (startPos.startTime < minStartTime) minStartTime = startPos.startTime;
          if (startPos.track < minAudioTrack) minAudioTrack = startPos.track;
        }
      });

      if (minStartTime !== Infinity && minStartTime + deltaSeconds < 0) {
        deltaSeconds = -minStartTime;
      }

      if (minVideoTrack !== Infinity && minVideoTrack + deltaTracks < 0) {
        deltaTracks = -minVideoTrack;
      }

      if (minAudioTrack !== Infinity) {
        let maxAudioTrack = -Infinity;
        selectedAudioIds.forEach(id => {
          const startPos = startPositions[id];
          if (startPos && startPos.track > maxAudioTrack) maxAudioTrack = startPos.track;
        });

        if (minAudioTrack + deltaTracks < 0) {
          deltaTracks = -minAudioTrack;
        } else if (maxAudioTrack !== -Infinity && maxAudioTrack + deltaTracks > 3) {
          deltaTracks = 3 - maxAudioTrack;
        }
      }

      if (draggingTimelineClipId) {
        // Cập nhật các Audio Clips trong nhóm được chọn
        setTimelineClips(prev => prev.map(c => {
          if (selectedAudioIds.includes(c.id)) {
            const startPos = startPositions[c.id];
            if (startPos) {
              return {
                ...c,
                startTime: Math.max(0, startPos.startTime + deltaSeconds),
                track: Math.max(0, Math.min(3, startPos.track + deltaTracks))
              };
            }
          }
          return c;
        }));

        // Đồng thời dịch chuyển cả các Video Clips được chọn đi kèm (nếu chọn chéo)
        if (selectedVideoIds.length > 0) {
          setTimelineVideoClips(prev => prev.map(c => {
            if (selectedVideoIds.includes(c.id)) {
              const startPos = startPositions[c.id];
              if (startPos) {
                return {
                  ...c,
                  startTime: Math.max(0, startPos.startTime + deltaSeconds),
                  track: Math.max(0, startPos.track + deltaTracks)
                };
              }
            }
            return c;
          }));
        }
      }

      if (draggingVideoClipId) {
        // Cập nhật các Video Clips trong nhóm được chọn
        setTimelineVideoClips(prev => prev.map(c => {
          if (selectedVideoIds.includes(c.id)) {
            const startPos = startPositions[c.id];
            if (startPos) {
              return {
                ...c,
                startTime: Math.max(0, startPos.startTime + deltaSeconds),
                track: Math.max(0, startPos.track + deltaTracks)
              };
            }
          }
          return c;
        }));

        // Đồng thời dịch chuyển cả các Audio Clips được chọn đi kèm (nếu chọn chéo)
        if (selectedAudioIds.length > 0) {
          setTimelineClips(prev => prev.map(c => {
            if (selectedAudioIds.includes(c.id)) {
              const startPos = startPositions[c.id];
              if (startPos) {
                return {
                  ...c,
                  startTime: Math.max(0, startPos.startTime + deltaSeconds),
                  track: Math.max(0, Math.min(3, startPos.track + deltaTracks))
                };
              }
            }
            return c;
          }));
        }
      }

      if (resizingVideoClipId && videoResizeEdge) {
        setTimelineVideoClips(prev => prev.map(c => {
          if (c.id === resizingVideoClipId) {
            if (videoResizeEdge === 'right') {
              return { ...c, duration: Math.max(0.5, videoDragStartDuration + deltaSeconds) };
            } else if (videoResizeEdge === 'left') {
              const maxDelta = videoDragStartDuration - 0.5;
              const validDelta = Math.min(deltaSeconds, maxDelta);
              const newStartTime = Math.max(0, timelineDragStartStartTime + validDelta);
              const startDiff = newStartTime - timelineDragStartStartTime;
              return {
                ...c,
                startTime: newStartTime,
                duration: videoDragStartDuration - startDiff,
                trimStart: Math.max(0, videoDragStartTrimStart + startDiff)
              };
            }
          }
          return c;
        }));
      }
    };

    const handleGlobalMouseUp = () => {
      setDraggingTimelineClipId(null);
      setDraggingVideoClipId(null);
      setResizingVideoClipId(null);
    };

    if (draggingTimelineClipId || draggingVideoClipId || resizingVideoClipId) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [draggingTimelineClipId, draggingVideoClipId, resizingVideoClipId, videoResizeEdge, timelineDragStartX, timelineDragStartY, timelineDragStartStartTime, timelineDragStartTrack, videoDragStartDuration, videoDragStartTrimStart, zoomLevel]);

  const handleVideoClipMouseDown = (e: React.MouseEvent, clip: TimelineVideoClip) => {
    e.stopPropagation();
    setDraggingVideoClipId(clip.id);
    
    const isShiftOrCtrl = e.shiftKey || e.ctrlKey || e.metaKey;
    let nextVideoSelected = [...usePlaybackStore.getState().selectedTimelineVideoClipIds];
    
    if (isShiftOrCtrl) {
      if (nextVideoSelected.includes(clip.id)) {
        nextVideoSelected = nextVideoSelected.filter(id => id !== clip.id);
      } else {
        nextVideoSelected.push(clip.id);
      }
    } else {
      if (!nextVideoSelected.includes(clip.id)) {
        nextVideoSelected = [clip.id];
      }
    }
    
    setSelectedTimelineVideoClipIds(nextVideoSelected);
    if (!isShiftOrCtrl) {
      setSelectedTimelineAudioClipIds([]);
    }
    
    const startPositions: Record<string, { startTime: number; track: number }> = {};
    nextVideoSelected.forEach(id => {
      const c = timelineVideoClips.find(item => item.id === id);
      if (c) {
        startPositions[id] = { startTime: c.startTime, track: c.track ?? 0 };
      }
    });
    
    const currentAudioSelected = usePlaybackStore.getState().selectedTimelineAudioClipIds;
    currentAudioSelected.forEach(id => {
      const c = timelineClips.find(item => item.id === id);
      if (c) {
        startPositions[id] = { startTime: c.startTime, track: c.track };
      }
    });
    
    if (!startPositions[clip.id]) {
      startPositions[clip.id] = { startTime: clip.startTime, track: clip.track ?? 0 };
    }
    
    setGroupDragStartPositions(startPositions);

    setSelectedTimelineVideoClipId(clip.id);
    setSelectedTimelineAudioClipId(null);
    setTimelineDragStartX(e.clientX);
    setTimelineDragStartY(e.clientY);
    setTimelineDragStartStartTime(clip.startTime);
    setTimelineDragStartTrack(clip.track ?? 0);
    setScript(prev => prev.map(line => ({ ...line, selected: line.id === clip.lineId })));
  };

  const handleVideoResizeMouseDown = (e: React.MouseEvent, clip: TimelineVideoClip, edge: 'left' | 'right') => {
    e.stopPropagation();
    setResizingVideoClipId(clip.id);
    setVideoResizeEdge(edge);
    setTimelineDragStartX(e.clientX);
    setTimelineDragStartStartTime(clip.startTime);
    setVideoDragStartDuration(clip.duration);
    setVideoDragStartTrimStart(clip.trimStart || 0);
  };

  const handleTimelineClipMouseDown = (e: React.MouseEvent, clip: TimelineClip) => {
    e.stopPropagation();
    setDraggingTimelineClipId(clip.id);
    
    const isShiftOrCtrl = e.shiftKey || e.ctrlKey || e.metaKey;
    let nextAudioSelected = [...usePlaybackStore.getState().selectedTimelineAudioClipIds];
    
    if (isShiftOrCtrl) {
      if (nextAudioSelected.includes(clip.id)) {
        nextAudioSelected = nextAudioSelected.filter(id => id !== clip.id);
      } else {
        nextAudioSelected.push(clip.id);
      }
    } else {
      if (!nextAudioSelected.includes(clip.id)) {
        nextAudioSelected = [clip.id];
      }
    }
    
    setSelectedTimelineAudioClipIds(nextAudioSelected);
    if (!isShiftOrCtrl) {
      setSelectedTimelineVideoClipIds([]);
    }
    
    const startPositions: Record<string, { startTime: number; track: number }> = {};
    const currentVideoSelected = usePlaybackStore.getState().selectedTimelineVideoClipIds;
    currentVideoSelected.forEach(id => {
      const c = timelineVideoClips.find(item => item.id === id);
      if (c) {
        startPositions[id] = { startTime: c.startTime, track: c.track ?? 0 };
      }
    });
    
    nextAudioSelected.forEach(id => {
      const c = timelineClips.find(item => item.id === id);
      if (c) {
        startPositions[id] = { startTime: c.startTime, track: c.track };
      }
    });
    
    if (!startPositions[clip.id]) {
      startPositions[clip.id] = { startTime: clip.startTime, track: clip.track };
    }
    
    setGroupDragStartPositions(startPositions);

    setSelectedTimelineAudioClipId(clip.id);
    setSelectedTimelineVideoClipId(null);
    setTimelineDragStartX(e.clientX);
    setTimelineDragStartY(e.clientY);
    setTimelineDragStartStartTime(clip.startTime);
    setTimelineDragStartTrack(clip.track);

    // Auto-select corresponding script line and scroll to it
    setScript(prev => prev.map(line => ({
      ...line,
      selected: line.id === clip.lineId
    })));

    setExpandedScriptLines(prev => {
      const next = new Set(prev);
      next.add(clip.lineId);
      return next;
    });

    setTimeout(() => {
      const element = document.getElementById(`script-line-${clip.lineId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  const handleDeleteTimelineClip = (e: React.MouseEvent, clipId: string) => {
    e.stopPropagation();
    setTimelineClips(prev => prev.filter(c => c.id !== clipId));
  };

  // Timeline Playback state (from Zustand — refs stay local for DOM access)
  const timelineAudioRefs = useRef<{ [id: string]: HTMLAudioElement }>({});
  const timelineVideoRefs = useRef<{ [id: string]: HTMLVideoElement }>({});

  // Timeline animation loop + seek sync
  const trackVolumes = useProjectStore(s => s.trackVolumes);
  const videoTrackVolumes = useProjectStore(s => s.videoTrackVolumes);

  const { seekTimelineTo, toggleTimelinePlay } = useTimelinePlayback({
    isPlayingTimeline, setIsPlayingTimeline,
    timelineTime, setTimelineTime,
    timelineClips, timelineVideoClips,
    timelineAudioRefs, timelineVideoRefs,
    trackVolumes, videoTrackVolumes,
  });

  const handleTimelineSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    seekTimelineTo(Math.max(0, x / zoomLevel));
  };

  const handleSplitClip = () => {
    if (!selectedTimelineVideoClipId) {
      toast.error('Vui lòng chọn một Video Clip trên Timeline trước khi cắt!');
      return;
    }
    const clip = timelineVideoClips.find(c => c.id === selectedTimelineVideoClipId);
    if (!clip) return;

    const clipEnd = clip.startTime + clip.duration;
    if (timelineTime > clip.startTime + 0.1 && timelineTime < clipEnd - 0.1) {
      const splitPoint = timelineTime - clip.startTime;
      
      const part1Duration = splitPoint;
      const part2StartTime = timelineTime;
      const part2TrimStart = (clip.trimStart ?? 0) + splitPoint;
      const part2Duration = clip.duration - splitPoint;

      const part2Id = `${clip.id}_split_${Date.now()}`;
      
      const updatedClips = timelineVideoClips.flatMap((c) => {
        if (c.id === clip.id) {
          const part1 = { ...c, duration: part1Duration };
          const part2 = {
            ...c,
            id: part2Id,
            startTime: part2StartTime,
            trimStart: part2TrimStart,
            duration: part2Duration,
          };
          return [part1, part2];
        }
        return c;
      });

      setTimelineVideoClips(updatedClips);
      setSelectedTimelineVideoClipId(part2Id);
      toast.success('Đã chia đôi video clip thành công!');
    } else {
      toast.error('Kim đọc timeline phải nằm giữa video clip mới có thể cắt!');
    }
  };

  // Keyboard shortcuts (Space / ArrowLeft / ArrowRight / KeyS)
  useKeyboardShortcuts({
    onTogglePlay: toggleTimelinePlay,
    onSeek: seekTimelineTo,
    getCurrentTime: () => timelineTime,
    onSplitClip: handleSplitClip,
  }); const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);

  // localStorage persistence is now handled by Zustand's persist middleware
  // (useProjectStore) — manual useEffects removed.

  // ── Audio Mixer Hook ──────────────────────────────────────────────────────
  const { mixAndExport: handleMixAndExport } = useAudioMixer({
    timelineClips,
    timelineVideoClips,
    videoAspectRatio,
    setRenderProgress,
    trackVolumes,
    videoTrackVolumes,
  });

  // ── Script Manager Hook ───────────────────────────────────────────────────
  const { exportProject, handleImportProject, handleClearTimeline, handleNewProject } = useScriptManager({
    script,
    setScript,
    setTimelineClips,
    setTimelineVideoClips,
    setTimelineTime,
    importInputRef,
  });

  const handleCancelRender = () => {
    renderAbortRef.current?.abort();
    renderAbortRef.current = null;
    setRenderProgress({ status: 'idle', currentLine: 0, totalLines: 0, finalAudioUrl: null, message: '' });
    toast('Render đã bị hủy', { icon: '⛔' });
  };

  const handleReRenderClip = async (clipId: string) => {
    const clip = useProjectStore.getState().timelineClips.find(c => c.id === clipId);
    if (!clip) return;
    const line = useProjectStore.getState().script.find(l => l.id === clip.lineId);
    if (!line) { toast.error('Script line not found for this clip'); return; }
    try {
      const voiceParams = useProjectStore.getState().speakerVoiceParams[line.speaker];
      if (!voiceParams && line.speaker !== 'narration') {
        toast.error(`Lỗi: Chưa cấu hình Voice Casting cho [${line.speaker}]. Vui lòng vào Audio panel cấu hình trước khi render.`);
        return;
      }
      const res = await axios.post(API.renderLine, { id: line.id, text: line.text, speaker: line.speaker, voice_params: voiceParams, project_id: useProjectStore.getState().currentProjectId, speed: line.speed && line.speed !== 1.0 ? line.speed : ttsSpeed });
      // Force a clean remount of the hidden audio element after re-render.
      const oldAudio = timelineAudioRefs.current[clipId];
      if (oldAudio) {
        oldAudio.pause();
        oldAudio.src = '';
        oldAudio.load();
        delete timelineAudioRefs.current[clipId];
      }
      const newClipId = `clip_${line.id}_${Date.now()}`;
      setTimelineClips(prev => prev.map(c => c.id === clipId ? {
        ...c,
        id: newClipId,
        audioUrl: getMediaUrl(res.data.file, useProjectStore.getState().currentProjectId, true),
        filename: res.data.file,
        duration: res.data.duration || c.duration,
        stale: false,
      } : c));
      toast.success(`Re-rendered: ${line.speaker}`);
    } catch {
      toast.error('Re-render failed');
    }
  };

  const handleRenderAll = async () => {
    // Ưu tiên render các dòng được chọn. Nếu không chọn dòng nào thì coi như render tất cả.
    const hasSelection = script.some(line => line.selected);
    const linesToRender = hasSelection ? script.filter(line => line.selected) : script;

    if (linesToRender.length === 0) {
      toast.error("Không có dòng nào để render!");
      return;
    }

    const controller = new AbortController();
    renderAbortRef.current = controller;

    setRenderProgress({ status: 'rendering', currentLine: 0, totalLines: linesToRender.length, finalAudioUrl: null });

    const filenames: string[] = [];

    // Step 1: Render từng dòng
    for (let i = 0; i < linesToRender.length; i++) {
      const line = linesToRender[i];
      setRenderProgress(prev => ({ ...prev, currentLine: i + 1 }));

      try {
        const voiceParams = useProjectStore.getState().speakerVoiceParams[line.speaker];
        if (!voiceParams && line.speaker !== 'narration') {
          throw new Error(`Chưa cấu hình Voice Casting cho [${line.speaker}]`);
        }
        const res = await axios.post(API.renderLine, {
          id: line.id,
          text: line.text,
          speaker: line.speaker,
          voice_params: voiceParams,
          project_id: useProjectStore.getState().currentProjectId,
          speed: line.speed && line.speed !== 1.0 ? line.speed : ttsSpeed
        }, { signal: controller.signal });
        filenames.push(res.data.file);

        // Update or Add to Timeline
        setTimelineClips(prev => {
          const newClips = [...prev];
          const existingIndex = newClips.findIndex(c => c.lineId === line.id);
          const clipId = `clip_${line.id}_${Date.now()}`;

          if (existingIndex >= 0) {
            // Delete old audio ref to force mount of new element
            const oldId = newClips[existingIndex].id;
            const oldAudio = timelineAudioRefs.current[oldId];
            if (oldAudio) {
              oldAudio.pause();
              delete timelineAudioRefs.current[oldId];
            }

            // Update existing (giữ nguyên track và startTime)
            newClips[existingIndex] = {
              ...newClips[existingIndex],
              id: clipId,
              audioUrl: getMediaUrl(res.data.file, useProjectStore.getState().currentProjectId, true),
              filename: res.data.file,
              duration: res.data.duration || 2.0,
              volume: newClips[existingIndex].volume ?? 100,
            };
          } else {
            // Thêm mới vào Timeline đúng vị trí theo script order
            let newStartTime = 0;
            const scriptIndex = script.findIndex(l => l.id === line.id);
            if (scriptIndex > 0) {
              for (let j = scriptIndex - 1; j >= 0; j--) {
                const prevLine = script[j];
                const prevClip = newClips.find(c => c.lineId === prevLine.id);
                if (prevClip) {
                  newStartTime = prevClip.startTime + prevClip.duration + 0.5;
                  break;
                }
              }
            } else if (newClips.length > 0 && scriptIndex === -1) {
              const lastClip = newClips.reduce((prev, current) => (prev.startTime > current.startTime) ? prev : current);
              newStartTime = lastClip.startTime + lastClip.duration + 0.5;
            }

            const duration = res.data.duration || 2.0;

            // Shift subsequent clips
            newClips.forEach(c => {
              if (c.startTime >= newStartTime) {
                c.startTime += duration + 0.5;
              }
            });

            // Tự động phân bổ track dựa trên nhân vật
            const tracks = Array.from(new Set(newClips.map(c => c.speaker)));
            let trackIndex = tracks.indexOf(line.speaker);
            if (trackIndex === -1) trackIndex = tracks.length;

            newClips.push({
              id: clipId,
              lineId: line.id,
              speaker: line.speaker,
              audioUrl: getMediaUrl(res.data.file, useProjectStore.getState().currentProjectId, true),
              filename: res.data.file,
              track: trackIndex,
              startTime: newStartTime,
              duration: duration,
              volume: 100,
            });
          }
          return newClips;
        });

      } catch (e: any) {
        if (axios.isCancel(e)) return;
        console.error("Lỗi render line:", line.id);
        toast.error("Lỗi khi render câu thoại: " + line.text);
        setRenderProgress(prev => ({ ...prev, status: 'error' }));
        renderAbortRef.current = null;
        return;
      }
    }

    renderAbortRef.current = null;

    // Step 2: Assemble (Ghép nối)
    setRenderProgress(prev => ({ ...prev, status: 'assembling' }));

    try {
      const res = await axios.post(API.assembleAudio, { filenames, project_id: useProjectStore.getState().currentProjectId }, { responseType: 'blob' });
      const audioUrl = URL.createObjectURL(new Blob([res.data]));
      setRenderProgress(prev => ({ ...prev, status: 'done', finalAudioUrl: audioUrl }));
    } catch (e) {
      console.error("Lỗi Assemble:", e);
      toast.error("Lỗi khi ghép file audio!");
      setRenderProgress(prev => ({ ...prev, status: 'error' }));
    }
  };

  const createSyntheticVoice = (speaker: string) => {
    const params = speakerVoiceParams[speaker] || { gender: 'male', age: 'middle-aged', pitch: 'low pitch' };
    const instruct = `${params.gender}, ${params.pitch}, ${params.age}`;

    createSyntheticVoiceMut.mutate({ speaker, instruct, project_id: useProjectStore.getState().currentProjectId }, {
      onSuccess: (data) => {
        toast.success(data.message || "Tạo giọng ảo thành công! Đã khoá voice profile.");
        const nextLockedVoices = { ...lockedVoices, [speaker]: true };
        setLockedVoices(nextLockedVoices);
        handleSaveProfile(nextLockedVoices);
      },
      onError: () => toast.error("Lỗi tạo giọng ảo. Hãy kiểm tra console Backend."),
    });
  };

  const handleSaveProfile = (nextLockedVoices?: Record<string, boolean>) => {
    saveProfileMut.mutate(
      { speakerVoiceParams, lockedVoices: nextLockedVoices ?? lockedVoices, flowkitProjectId, videoModelProfile, project_id: useProjectStore.getState().currentProjectId },
      {
        onSuccess: () => toast.success("Đã lưu toàn bộ thiết lập Voice Casting và Project ID thành công!"),
        onError: () => toast.error("Lỗi khi lưu thiết lập!"),
      }
    );
  };

  const handleEnhanceMotion = (lineId: number, dialogue: string, rawMotion: string) => {
    if (!rawMotion) {
      toast.error("Vui lòng nhập mô tả motion cơ bản trước khi Enhance!");
      return;
    }
    enhanceMotionMut.mutate(
      { dialogue, motion_prompt: rawMotion, _lineId: lineId },
      {
        onSuccess: (data) => {
          if (data.prompt) {
            setScript(prev => prev.map(line =>
              line.id === lineId ? { ...line, motion_prompt: data.prompt } : line
            ));
          }
        },
        onError: () => toast.error("Lỗi khi enhance motion prompt!"),
      }
    );
  };

  const handleUploadCharacterImage = async (characterId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("character_id", characterId);
    formData.append("file", file);
    formData.append("project_id", useProjectStore.getState().currentProjectId || "default");
    formData.append("flowkit_project_id", flowkitProjectId || "a59651a1-70ff-44b6-ac42-c26d90ad28ef");

    try {
      const response = await axios.post(API.uploadCharacterImage, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.status === 'success') {
        if (response.data.metadata) {
          setCharactersMetadata(response.data.metadata);
        } else {
          setCharactersMetadata(prev => ({
            ...prev,
            [characterId]: {
              ...prev[characterId],
              local_image_path: response.data.file_path,
              media_id: null
            }
          }));
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("Lỗi upload ảnh nhân vật!");
    }
  };

  const handleDeleteEntity = async (entityId: string) => {
    if (!confirm("Bạn có chắc chắn muốn xoá thực thể này?")) return;
    try {
      const pid = useProjectStore.getState().currentProjectId;
      const response = await axios.delete(`${API_BASE}/api/entity/${entityId}?project_id=${pid}`);
      if (response.data.status === 'success') {
        setCharactersMetadata(response.data.metadata);
      }
    } catch (e) {
      console.error(e);
      toast.error("Lỗi khi xoá thực thể!");
    }
  };

  const handleGenerateAssetImage = async (characterId: string, prompt: string) => {
    if (!prompt) { toast.error("Không có prompt để tạo ảnh."); return; }
    setIsGeneratingAsset(characterId);
    try {
      const entity = charactersMetadata[characterId];
      let referenceMediaIds: string[] = [];
      if (entity) {
        if (entity.media_id) referenceMediaIds.push(entity.media_id);
        const varRefs = (entity.variations ?? [])
          .filter((v: any) => v.is_reference && v.media_id && v.media_id !== entity.media_id)
          .map((v: any) => v.media_id as string);
        referenceMediaIds = [...referenceMediaIds, ...varRefs];
      }

      // 1. Generate image request (synchronous from API now)
      const res = await axios.post(API.generateAssetImage, {
        asset_id: characterId,
        prompt: prompt,
        project_id: flowkitProjectId || "a59651a1-70ff-44b6-ac42-c26d90ad28ef",
        reference_media_ids: referenceMediaIds
      });

      const url = res.data.url;
      if (!url) {
        throw new Error("Không nhận được URL ảnh từ API");
      }

      // 2. Download to local
      const downloadRes = await axios.post(API.downloadAssetImage, {
        asset_id: characterId,
        url: url,
        media_id: res.data.media_id,
        prompt: prompt,
        name: entity?.variation_context || "Variation",
        project_id: useProjectStore.getState().currentProjectId,
      });
      if (downloadRes.data.status === "success") {
        setCharactersMetadata(downloadRes.data.metadata);
      } else {
        toast.error("Lưu ảnh thất bại!");
      }
      setIsGeneratingAsset(null);
    } catch (err: any) {
      console.error(err);
      toast.error("Lỗi gọi API: " + err.message);
      setIsGeneratingAsset(null);
    }
  };

  const deleteLine = (id: number) => {
    setScript(script.filter(line => line.id !== id));
  };

  const addLine = () => {
    const newId = script.length > 0 ? Math.max(...script.map(l => l.id)) + 1 : 1;
    const newLine: ScriptLine = {
      id: newId,
      speaker: 'narration',
      visual_references: [],
      text: '',
      image_prompt: '',
      is_image_generated: false,
      selected: false
    };
    setScript([...script, newLine]);
  };

  const insertLine = (afterIndex: number) => {
    const newId = script.length > 0 ? Math.max(...script.map(l => l.id)) + 1 : 1;
    const prevLine = script[afterIndex];
    const newLine: ScriptLine = {
      id: newId,
      speaker: prevLine?.speaker ?? 'narration',
      visual_references: [],
      text: '',
      image_prompt: '',
      is_image_generated: false,
      selected: false,
    };
    const next = [...script];
    next.splice(afterIndex + 1, 0, newLine);
    setScript(next);
    // Auto-expand the new line after state settles
    setTimeout(() => {
      setExpandedScriptLines(prev => { const s = new Set(prev); s.add(newId); return s; });
      document.getElementById(`script-line-${newId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const handleSort = () => {
    if (dragItem.current !== null && dragOverItem.current !== null) {
      const _script = [...script];
      const draggedItemContent = _script.splice(dragItem.current, 1)[0];
      _script.splice(dragOverItem.current, 0, draggedItemContent);
      dragItem.current = null;
      dragOverItem.current = null;
      setScript(_script);
    }
  };

  const handleDragOverContainer = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isSortingMode) return;

    const SCROLL_SPEED = 20;
    const SCROLL_MARGIN = 150;

    if (e.clientY < SCROLL_MARGIN) {
      window.scrollBy(0, -SCROLL_SPEED);
    } else if (window.innerHeight - e.clientY < SCROLL_MARGIN) {
      window.scrollBy(0, SCROLL_SPEED);
    }
  };

  const playSample = async (id: number, text: string, speaker: string, speed: number = 1.0) => {
    setPlayingId(id);
    setPlayingVoiceRef(null);
    if (audioRef.current) {
      audioRef.current.pause();
      if (audioRef.current.src.startsWith('blob:')) URL.revokeObjectURL(audioRef.current.src);
    }
    try {
      const voiceParams = useProjectStore.getState().speakerVoiceParams[speaker];
      const response = await axios.post(API.testVoice,
        { text, speaker, voice_params: voiceParams, project_id: useProjectStore.getState().currentProjectId, speed },
        { responseType: 'blob' }
      );

      const audioUrl = URL.createObjectURL(new Blob([response.data]));
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setPlayingId(null);
        URL.revokeObjectURL(audioUrl);
      };

      audio.play();
    } catch (error) {
      console.error("Lỗi khi test voice:", error);
      toast.error("Lỗi khi gọi OmniVoice Backend.");
      setPlayingId(null);
    }
  };

  const togglePlayVoiceRef = (speaker: string) => {
    if (playingVoiceRef === speaker) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingVoiceRef(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    setPlayingId(null);

    const audioUrl = `${API_BASE}/api/voice-ref/${speaker}?project_id=${useProjectStore.getState().currentProjectId}&t=${Date.now()}`;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    setPlayingVoiceRef(speaker);

    audio.play().catch(e => {
      console.error("Lỗi phát giọng mẫu:", e);
      toast.error("Không tìm thấy file giọng mẫu. Hãy tạo lại Diễn Viên Ảo.");
      setPlayingVoiceRef(null);
    });

    audio.onended = () => {
      setPlayingVoiceRef(null);
    };
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (script.length > 0 || timelineClips.length > 0) {
      if (!window.confirm("Tải lên kịch bản mới sẽ XÓA TOÀN BỘ kịch bản và Timeline hiện tại. Bạn có chắc muốn tiếp tục?")) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      setUploadWarnings([]);
      generateScriptMut.mutate(text, {
        onSuccess: async (data: any) => {
          if (data?.script) {
            const withIds = data.script.map((line: any, idx: number) => ({
              ...line,
              id: typeof line.id === 'number' ? line.id : Date.now() + idx,
            }));

            setScript(withIds);
            setTimelineClips([]);
            setTimelineVideoClips([]);
            setTimelineTime(0);

            // Explicit persistence
            const pid = useProjectStore.getState().currentProjectId;
            try {
              useProjectStore.getState().setSaveStatus('saving');
              await Promise.all([
                axios.post(API.scriptLines, { lines: withIds, project_id: pid }),
                axios.post(API.timelineClips, { audio: [], video: [], project_id: pid })
              ]);
              useProjectStore.getState().setSaveStatus('saved');
              setTimeout(() => useProjectStore.getState().setSaveStatus('idle'), 2000);
            } catch (err) {
              toast.error("Lỗi khi lưu dữ liệu lên server!");
            }

            if (data.warnings && data.warnings.length > 0) {
              setUploadWarnings(data.warnings);
              toast.success(`Đã tạo ${data.stats?.total_lines || withIds.length} dòng thoại. Có vài cảnh báo cần kiểm tra.`);
            } else {
              toast.success(`Thành công! Đã tạo ${data.stats?.total_lines || withIds.length} dòng thoại từ ${data.stats?.chunks_processed || 1} phân đoạn.`);
            }
          }
        },
        onError: () => toast.error("Có lỗi xảy ra khi gọi AI. Vui lòng check console Backend."),
        onSettled: () => { if (fileInputRef.current) fileInputRef.current.value = ''; },
      });
    };
    reader.readAsText(file);
  };

  const handleSyncToTimeline = async () => {
    let count = 0;
    const newVideoClips: TimelineVideoClip[] = [];

    try {
      const nodes = useProjectStore.getState().videoNodes;
      const edges = useProjectStore.getState().videoEdges;
      if (nodes && edges) {

        // Lấy danh sách video đã render xong (hoặc grid đã gen đủ)
        const videoNodes = nodes.filter((n: any) => 
          n.type === 'video' && (
            n.data?.videoUrl || 
            (n.data?.is_grid && n.data?.slices && Array.isArray(n.data.slices) && n.data.slices.every((s: any) => !!s.videoUrl))
          )
        );
        // Nhóm các videoNodes theo script lines (để gộp chung các Continuation Scene)
        const linesToVideosMap: Record<string, { vNode: any, sceneNode: any }[]> = {};

        videoNodes.forEach((vNode: any) => {
          const edge = edges.find((e: any) => e.target === vNode.id);
          if (edge) {
            const sceneNode = nodes.find((n: any) => n.id === edge.source && n.type === 'scene');
            if (sceneNode && sceneNode.data?.lines) {
              const linesKey = sceneNode.data.lines as string;
              if (!linesToVideosMap[linesKey]) linesToVideosMap[linesKey] = [];
              linesToVideosMap[linesKey].push({ vNode, sceneNode });
            }
          }
        });

        // Xử lý từng nhóm dòng kịch bản
        Object.keys(linesToVideosMap).forEach(linesKey => {
          const lineIds = linesKey.split(',').map((id: string) => parseInt(id.trim(), 10));
          const matchedClips = timelineClips.filter(c => lineIds.includes(c.lineId));

          if (matchedClips.length > 0) {
            matchedClips.sort((a, b) => a.startTime - b.startTime);
            const sceneStartTime = matchedClips[0].startTime;

            const videoItems = linesToVideosMap[linesKey];
            // Sort by X position so Continuation nodes (which are placed to the right) come later
            videoItems.sort((a, b) => a.vNode.position.x - b.vNode.position.x);

            let currentVideoStart = sceneStartTime;

            videoItems.forEach((item, index) => {
              const { vNode, sceneNode } = item;
              
              if (vNode.data.is_grid && vNode.data.slices && Array.isArray(vNode.data.slices)) {
                // It's a grid node: map 4 slices to sequential 2-second clips
                vNode.data.slices.forEach((slice: any, sliceIndex: number) => {
                  newVideoClips.push({
                    id: `video_${vNode.id}_slice_${slice.idx}_${Date.now()}_${index}_${sliceIndex}`,
                    lineId: lineIds[0], // attach to the first line
                    videoUrl: slice.videoUrl,
                    startTime: currentVideoStart + sliceIndex * 2.0,
                    duration: 2.0,
                  });
                  count++;
                });
                currentVideoStart += 8.0;
              } else {
                // Standard video node
                const duration = sceneNode.data?.videoDuration ?? videoDuration ?? 5.0;
                newVideoClips.push({
                  id: `video_${vNode.id}_${Date.now()}_${index}`,
                  lineId: lineIds[0], // attach to the first line
                  videoUrl: vNode.data.videoUrl,
                  startTime: currentVideoStart,
                  duration: duration
                });
                currentVideoStart += duration;
                count++;
              }
            });
          }
        });
      }
    } catch (e) {
      console.error("Lỗi khi đồng bộ từ Video Flow:", e);
    }

    // Fallback: sync từ script (cách cũ) nếu có
    script.forEach(line => {
      if (line.video_url && !newVideoClips.some(vc => vc.lineId === line.id)) {
        // ONLY sync legacy/script video if no active video node of this line is present in the flowboard graph
        const nodes = useProjectStore.getState().videoNodes;
        const edges = useProjectStore.getState().videoEdges;
        const hasFlowboardVideoNodes = nodes && nodes.some((n: any) => n.type === 'video');
        
        let videoNodeExists = false;
        if (hasFlowboardVideoNodes) {
          videoNodeExists = nodes.some((vNode: any) => {
            if (vNode.type !== 'video') return false;
            const edge = edges.find((e: any) => e.target === vNode.id);
            if (edge) {
              const sceneNode = nodes.find((n: any) => n.id === edge.source && n.type === 'scene');
              if (sceneNode && sceneNode.data?.lines) {
                const ids = (sceneNode.data.lines as string).split(',').map((s: string) => parseInt(s.trim(), 10));
                return ids.includes(line.id);
              }
            }
            return false;
          });
        }

        if (!hasFlowboardVideoNodes || videoNodeExists) {
          const audioClip = timelineClips.find(c => c.lineId === line.id);
          if (audioClip) {
            newVideoClips.push({
              id: `video_${line.id}_${Date.now()}`,
              lineId: line.id,
              videoUrl: line.video_url,
              startTime: audioClip.startTime,
              duration: audioClip.duration
            });
            count++;
          }
        }
      }
    });

    // Apply A/B Roll auto-arrange logic for Video Clips
    newVideoClips.sort((a, b) => a.startTime - b.startTime);
    const trackEndTimes: number[] = [];

    newVideoClips.forEach(clip => {
      let placed = false;
      for (let t = 0; t < trackEndTimes.length; t++) {
        if (clip.startTime >= trackEndTimes[t] - 0.1) { // 0.1s margin to avoid floating point issues
          clip.track = t;
          trackEndTimes[t] = clip.startTime + clip.duration;
          placed = true;
          break;
        }
      }
      if (!placed) {
        const newTrackIndex = trackEndTimes.length;
        clip.track = newTrackIndex;
        trackEndTimes.push(clip.startTime + clip.duration);
      }
    });

    setTimelineVideoClips(newVideoClips);
    toast.success(`Đã đồng bộ ${count} Video vào Timeline thành công!`);
  };

  const handleArrangeClips = async () => {
    if (timelineClips.length === 0) {
      toast.error('Không có clip âm thanh nào trên Timeline để sắp xếp!');
      return;
    }
    // Sort by script order
    const scriptLineIndices = new Map<number, number>();
    script.forEach((line, idx) => scriptLineIndices.set(line.id, idx));

    const sortedAudioClips = [...timelineClips].sort((a, b) => {
      const idxA = scriptLineIndices.has(a.lineId) ? scriptLineIndices.get(a.lineId)! : 999999;
      const idxB = scriptLineIndices.has(b.lineId) ? scriptLineIndices.get(b.lineId)! : 999999;
      return idxA - idxB;
    });

    // Recalculate sequentially with a 0.2s gap
    let currentEndTime = 0;
    const gap = 0.2;
    const audioOldStartTimes = new Map<number, number>();
    timelineClips.forEach(c => audioOldStartTimes.set(c.lineId, c.startTime));

    const updatedAudioClips = sortedAudioClips.map(clip => {
      const startTime = currentEndTime;
      currentEndTime = startTime + (clip.duration || 2.0) + gap;
      return { ...clip, startTime };
    });

    const audioNewStartTimes = new Map<number, number>();
    updatedAudioClips.forEach(c => audioNewStartTimes.set(c.lineId, c.startTime));

    // Sync corresponding video clips by shifting them with matching delta
    const updatedVideoClips = timelineVideoClips.map(vc => {
      if (vc.lineId !== undefined && audioNewStartTimes.has(vc.lineId)) {
        const newAudioStart = audioNewStartTimes.get(vc.lineId)!;
        const oldAudioStart = audioOldStartTimes.get(vc.lineId)!;
        const offset = newAudioStart - oldAudioStart;
        return { ...vc, startTime: Math.max(0, vc.startTime + offset) };
      }
      return vc;
    });

    setTimelineClips(updatedAudioClips);
    setTimelineVideoClips(updatedVideoClips);

    // Save to database
    const pid = useProjectStore.getState().currentProjectId;
    try {
      useProjectStore.getState().setSaveStatus('saving');
      await axios.post(API.timelineClips, {
        audio: updatedAudioClips,
        video: updatedVideoClips,
        project_id: pid
      });
      useProjectStore.getState().setSaveStatus('saved');
      setTimeout(() => useProjectStore.getState().setSaveStatus('idle'), 2000);
      toast.success('Đã tự động sắp xếp các clip nối tiếp nhau cách 0.2s!');
    } catch (err) {
      useProjectStore.getState().setSaveStatus('idle');
      toast.error('Lỗi khi lưu sắp xếp lên server!');
    }
  };

  const uniqueSpeakers = Array.from(new Set(script.map(line => line.speaker.toLowerCase())));

  const selectedLine = script.find(l => l.selected);
  const selectedVideoClip = selectedTimelineVideoClipId ? timelineVideoClips.find(c => c.id === selectedTimelineVideoClipId) : timelineVideoClips.find(c => c.lineId === selectedLine?.id);
  const selectedAudioClip = selectedTimelineAudioClipId ? timelineClips.find(c => c.id === selectedTimelineAudioClipId) : timelineClips.find(c => c.lineId === selectedLine?.id);

  return (
    <div className="h-screen w-full overflow-hidden bg-obsidian-dark text-slate-300 font-sans selection:bg-indigo-500/30 flex flex-col">
      <Toaster position="top-right" toastOptions={{ style: { background: '#18181b', color: '#f4f4f5', border: '1px solid #27272a' } }} />

      <Header
        handleImportProject={handleImportProject}
        exportProject={exportProject}
        handleNewProject={handleNewProject}
        handleFileUpload={handleFileUpload}
        handleRenderAll={handleRenderAll}
        handleMixAndExport={handleMixAndExport}
        handleSyncToTimeline={handleSyncToTimeline}
        handleCancelRender={handleCancelRender}
        handleSwitchProject={handleSwitchProject}
        handleCreateProject={handleCreateProject}
        isGenerating={isGenerating}
      />

      {/* Antigravity CLI error banner */}
      {antigravityError && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-red-950/80 border-b border-red-800/60 text-red-300 text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 font-bold text-red-400">Antigravity Error</span>
            <span className="truncate">{antigravityError}</span>
          </div>
          <button
            onClick={() => useProjectStore.getState().setAntigravityError(null)}
            className="shrink-0 px-2 py-0.5 rounded text-red-400 hover:text-white hover:bg-red-800/50 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Upload Warnings banner */}
      {uploadWarnings.length > 0 && (
        <div className="flex flex-col gap-1 px-4 py-3 bg-yellow-950/80 border-b border-yellow-800/60 text-yellow-300 text-xs shrink-0">
          <div className="flex items-center justify-between">
            <span className="font-bold text-yellow-400">Warning ({uploadWarnings.length})</span>
            <button
              onClick={() => setUploadWarnings([])}
              className="px-2 py-0.5 rounded text-yellow-400 hover:text-white hover:bg-yellow-800/50 transition-colors"
            >
              Dismiss
            </button>
          </div>
          <ul className="list-disc pl-5 max-h-32 overflow-y-auto space-y-1 mt-1">
            {uploadWarnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Fullscreen Loading Overlay for Script Generation */}
      {isGenerating && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-center">
          <Loader2 className="w-16 h-16 text-indigo-500 animate-spin mb-6" />
          <h2 className="text-2xl font-bold text-white mb-2">Đang phân tích kịch bản...</h2>
          <p className="text-slate-400 max-w-md">
            Quá trình này có thể mất vài phút cho file dài. AI đang chia đoạn, xây dựng Story Bible và trích xuất lời thoại...
          </p>
        </div>
      )}

      {activeTab === 'audio' && (
        <div className="tab-panel-enter flex-1 min-h-0 overflow-hidden w-full relative z-0 flex flex-col" style={{ marginBottom: `${timelineHeight}px` }}>
          <ScriptSidebar
            addLine={addLine}
            insertLine={insertLine}
            deleteLine={deleteLine}
            playSample={playSample}
            handleDragOverContainer={handleDragOverContainer}
            handleSort={handleSort}
            createSyntheticVoice={createSyntheticVoice}
            togglePlayVoiceRef={togglePlayVoiceRef}
            handleSaveProfile={handleSaveProfile}
            isSortingMode={isSortingMode}
            setIsSortingMode={setIsSortingMode}
            playingId={playingId}
            isCreatingSynthetic={isCreatingSynthetic}
            playingVoiceRef={playingVoiceRef}
            expandedScriptLines={expandedScriptLines}
            toggleScriptLine={toggleScriptLine}
            expandedVoices={expandedVoices}
            toggleVoice={toggleVoice}
            timelineScrollRef={timelineScrollRef}
            dragItem={dragItem}
            dragOverItem={dragOverItem}
          />
        </div>
      )}

      {(activeTab === 'audio' || activeTab === 'post-production') && (
        <div className={`tab-panel-enter ${activeTab === 'post-production' ? 'flex-1 flex flex-col min-h-0 w-full' : ''}`}>
          <Timeline
            toggleTimelinePlay={toggleTimelinePlay}
            handleTimelineSeek={handleTimelineSeek}
            handleClearTimeline={handleClearTimeline}
            handleSplitClip={handleSplitClip}
            handleTimelineClipMouseDown={handleTimelineClipMouseDown}
            handleVideoClipMouseDown={handleVideoClipMouseDown}
            handleVideoResizeMouseDown={handleVideoResizeMouseDown}
            handleDeleteTimelineClip={handleDeleteTimelineClip}
            onReRenderClip={handleReRenderClip}
            onArrangeClips={handleArrangeClips}
            handleTimelineResizeStart={handleTimelineResizeStart}
            timelineScrollRef={timelineScrollRef}
            timelineAudioRefs={timelineAudioRefs}
            timelineVideoRefs={timelineVideoRefs}
          >
            {activeTab === 'post-production' && (
              <div className="flex-[1.5] flex min-h-[300px] border-b border-zinc-800/60 bg-obsidian-dark">
                <div className="flex-1 flex flex-col items-center justify-center relative bg-black/40 p-6">
                  <div className={`w-full bg-black rounded-xl border border-zinc-800/60 shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center relative overflow-hidden ring-1 ring-white/5 ${videoAspectRatio === '9:16'
                      ? 'max-w-[420px] max-h-[70vh] aspect-[9/16]'
                      : 'max-w-4xl aspect-video'
                    }`}>
                    {timelineVideoClips.length === 0 ? (
                      <>
                        <Video className="w-12 h-12 text-slate-700 mb-3 opacity-50" />
                        <span className="text-slate-500 font-medium tracking-widest text-sm uppercase">Video Preview</span>
                        <span className="text-slate-600 text-xs mt-1">Sync video from Video Studio</span>
                      </>
                    ) : (
                      <>
                        {timelineVideoClips.map(clip => (
                          <video
                            key={clip.id}
                            ref={el => { if (el) timelineVideoRefs.current[clip.id] = el; }}
                            src={clip.videoUrl}
                            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-100 ${timelineTime >= clip.startTime && timelineTime < clip.startTime + clip.duration
                                ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                              }`}
                            muted={!clip.keepSound}
                            loop={false}
                            playsInline
                          />
                        ))}
                      </>
                    )}
                  </div>
                  {/* Export context stat row */}
                  {(() => {
                    const totalSec = Math.max(
                      0,
                      ...timelineClips.map(c => c.startTime + (c.duration ?? 0)),
                      ...timelineVideoClips.map(c => c.startTime + c.duration),
                    );
                    const mins = Math.floor(totalSec / 60);
                    const secs = Math.floor(totalSec % 60);
                    const dur = `${mins}:${secs.toString().padStart(2, '0')}`;
                    const res = videoAspectRatio === '9:16' ? '1080×1920' : '1920×1080';
                    return (
                      <div className="flex items-center gap-2 mt-3 text-[10px] font-mono text-slate-600">
                        <span>{videoAspectRatio}</span>
                        <span>·</span>
                        <span>{res}</span>
                        <span>·</span>
                        <span>{dur}</span>
                        <span>·</span>
                        <span>{timelineClips.length} audio</span>
                        <span>·</span>
                        <span>{timelineVideoClips.length} video</span>
                      </div>
                    );
                  })()}
                </div>
                <PropertiesInspector />
              </div>
            )}
          </Timeline>
        </div>
      )}

      <div
        className="tab-panel-enter flex-1 min-h-0 overflow-hidden flex flex-col"
        style={{ display: activeTab === 'video' ? 'flex' : 'none' }}
      >
        <VideoStudio
          script={script}
          setScript={setScript}
          charactersMetadata={charactersMetadata}
          setCharactersMetadata={setCharactersMetadata}
          flowkitProjectId={flowkitProjectId}
          setFlowkitProjectId={setFlowkitProjectId}
          handleUploadCharacterImage={handleUploadCharacterImage}
          handleGenerateAssetImage={handleGenerateAssetImage}
          handleDeleteEntity={handleDeleteEntity}
          isGeneratingAsset={isGeneratingAsset}
        />
      </div>

      {activeTab === 'playground' && (
        <div className="tab-panel-enter flex-1 min-h-0 overflow-hidden flex flex-col">
          <Playground />
        </div>
      )}
    </div>
  );
}

export default App;
