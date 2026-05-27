// ==========================================================================
// store/useProjectStore.ts
// Global project state — script, timeline clips, voice settings, etc.
// Persisted to IndexedDB (via localForage) so state survives page refresh.
// ==========================================================================
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import localforage from 'localforage';
import type { ScriptLine, TimelineClip, TimelineVideoClip, VoiceParams, CharacterMetadata, RenderProgress, VideoProgress, VideoModelProfile } from '../types';

interface ProjectState {
  // ── Active tab ──────────────────────────────────────────────────────────
  activeTab: 'audio' | 'video' | 'post-production' | 'playground';
  setActiveTab: (tab: 'audio' | 'video' | 'post-production' | 'playground') => void;

  // ── Script ──────────────────────────────────────────────────────────────
  script: ScriptLine[];
  setScript: (script: ScriptLine[] | ((prev: ScriptLine[]) => ScriptLine[])) => void;

  // ── Timeline: Audio ─────────────────────────────────────────────────────
  timelineClips: TimelineClip[];
  setTimelineClips: (clips: TimelineClip[] | ((prev: TimelineClip[]) => TimelineClip[])) => void;

  // ── Timeline: Video ─────────────────────────────────────────────────────
  timelineVideoClips: TimelineVideoClip[];
  setTimelineVideoClips: (clips: TimelineVideoClip[] | ((prev: TimelineVideoClip[]) => TimelineVideoClip[])) => void;

  // ── Video Studio Graph ──────────────────────────────────────────────────
  videoNodes: any[];
  setVideoNodes: (nodes: any[] | ((prev: any[]) => any[])) => void;
  
  videoEdges: any[];
  setVideoEdges: (edges: any[] | ((prev: any[]) => any[])) => void;

  // ── Voice settings ───────────────────────────────────────────────────────
  lockedVoices: Record<string, boolean>;
  setLockedVoices: (voices: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;

  speakerVoiceParams: Record<string, VoiceParams>;
  setSpeakerVoiceParams: (params: Record<string, VoiceParams> | ((prev: Record<string, VoiceParams>) => Record<string, VoiceParams>)) => void;

  trackVolumes: Record<number, number>;
  setTrackVolume: (trackIndex: number, volume: number) => void;

  videoTrackVolumes: Record<number, number>;
  setVideoTrackVolume: (trackIndex: number, volume: number) => void;

  // ── Characters & Assets ──────────────────────────────────────────────────
  charactersMetadata: Record<string, CharacterMetadata>;
  setCharactersMetadata: (meta: Record<string, CharacterMetadata> | ((prev: Record<string, CharacterMetadata>) => Record<string, CharacterMetadata>)) => void;

  // ── Render progress ──────────────────────────────────────────────────────
  renderProgress: RenderProgress;
  setRenderProgress: (progress: RenderProgress | ((prev: RenderProgress) => RenderProgress)) => void;

  videoProgress: VideoProgress;
  setVideoProgress: (progress: Partial<VideoProgress>) => void;

  // ── Misc UI ─────────────────────────────────────────────────────────────
  flowkitProjectId: string;
  setFlowkitProjectId: (id: string) => void;

  globalArtStyle: string;
  setGlobalArtStyle: (style: string) => void;

  videoAspectRatio: '16:9' | '9:16';
  setVideoAspectRatio: (ratio: '16:9' | '9:16') => void;

  videoDuration: number;
  setVideoDuration: (duration: number) => void;

  videoModelProfile: VideoModelProfile;
  setVideoModelProfile: (profile: VideoModelProfile) => void;

  // ── TTS Settings ─────────────────────────────────────────────────────────
  ttsDenoise: boolean;
  setTtsDenoise: (denoise: boolean) => void;

  ttsPostprocess: boolean;
  setTtsPostprocess: (postprocess: boolean) => void;

  ttsNumStep: number;
  setTtsNumStep: (numStep: number) => void;

  ttsGuidanceScale: number;
  setTtsGuidanceScale: (scale: number) => void;

  ttsSpeed: number;
  setTtsSpeed: (speed: number) => void;

  // ── Panel UI prefs ───────────────────────────────────────────────────────
  isVoicePanelCollapsed: boolean;
  setIsVoicePanelCollapsed: (collapsed: boolean) => void;

  // ── Project lifecycle ────────────────────────────────────────────────────
  projectVersion: number;
  incrementProjectVersion: () => void;

  processingJobs: { operationNames: string[]; mediaIds: string[] };
  setProcessingJobs: (jobs: { operationNames: string[]; mediaIds: string[] }) => void;

  flowkitConnected: boolean;
  setFlowkitConnected: (connected: boolean) => void;

  antigravityError: string | null;
  setAntigravityError: (error: string | null) => void;

  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;

  currentProjectId: string;
  setCurrentProjectId: (id: string) => void;
  currentProjectName: string;
  setCurrentProjectName: (name: string) => void;

  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

const initialScript: ScriptLine[] = [
  { id: 0, speaker: 'narration', text: 'Tiếng gầm thét của "Lõi Ý thức" không giống với bất kỳ âm thanh cơ khí nào.' },
  { id: 1, speaker: 'kael', text: 'Vậy tôi phải làm gì? Nó sắp tan vỡ hoàn toàn!' },
  { id: 2, speaker: 'elara', text: 'Cậu không thể là người "làm" mọi việc. Cậu phải là người "hướng dẫn".' },
];

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      // ── Active tab ───────────────────────────────────────────────────────
      activeTab: 'audio',
      setActiveTab: (tab) => set({ activeTab: tab }),

      // ── Script ──────────────────────────────────────────────────────────
      script: initialScript,
      setScript: (scriptOrUpdater) =>
        set((state) => ({
          script: typeof scriptOrUpdater === 'function' ? scriptOrUpdater(state.script) : scriptOrUpdater,
        })),

      // ── Timeline: Audio ─────────────────────────────────────────────────
      timelineClips: [],
      setTimelineClips: (clipsOrUpdater) =>
        set((state) => ({
          timelineClips: typeof clipsOrUpdater === 'function' ? clipsOrUpdater(state.timelineClips) : clipsOrUpdater,
        })),

      // ── Timeline: Video ─────────────────────────────────────────────────
      timelineVideoClips: [],
      setTimelineVideoClips: (clipsOrUpdater) =>
        set((state) => ({
          timelineVideoClips: typeof clipsOrUpdater === 'function' ? clipsOrUpdater(state.timelineVideoClips) : clipsOrUpdater,
        })),

      // ── Video Studio Graph ──────────────────────────────────────────────
      videoNodes: [],
      setVideoNodes: (nodesOrUpdater) =>
        set((state) => ({
          videoNodes: typeof nodesOrUpdater === 'function' ? nodesOrUpdater(state.videoNodes) : nodesOrUpdater,
        })),

      videoEdges: [],
      setVideoEdges: (edgesOrUpdater) =>
        set((state) => ({
          videoEdges: typeof edgesOrUpdater === 'function' ? edgesOrUpdater(state.videoEdges) : edgesOrUpdater,
        })),

      // ── Voice settings ───────────────────────────────────────────────────
      lockedVoices: {},
      setLockedVoices: (voicesOrUpdater) =>
        set((state) => ({
          lockedVoices: typeof voicesOrUpdater === 'function' ? voicesOrUpdater(state.lockedVoices) : voicesOrUpdater,
        })),

      speakerVoiceParams: {},
      setSpeakerVoiceParams: (paramsOrUpdater) =>
        set((state) => ({
          speakerVoiceParams: typeof paramsOrUpdater === 'function' ? paramsOrUpdater(state.speakerVoiceParams) : paramsOrUpdater,
        })),

      trackVolumes: { 0: 100, 1: 100, 2: 100, 3: 100 },
      setTrackVolume: (trackIndex, volume) =>
        set((state) => ({
          trackVolumes: { ...state.trackVolumes, [trackIndex]: volume }
        })),

      videoTrackVolumes: { 0: 100, 1: 100, 2: 100, 3: 100 },
      setVideoTrackVolume: (trackIndex, volume) =>
        set((state) => ({
          videoTrackVolumes: { ...state.videoTrackVolumes, [trackIndex]: volume }
        })),

      // ── Characters & Assets ──────────────────────────────────────────────
      charactersMetadata: {},
      setCharactersMetadata: (metaOrUpdater) =>
        set((state) => ({
          charactersMetadata: typeof metaOrUpdater === 'function' ? metaOrUpdater(state.charactersMetadata) : metaOrUpdater,
        })),

      // ── Render progress ──────────────────────────────────────────────────
      renderProgress: { status: 'idle', currentLine: 0, totalLines: 0, finalAudioUrl: null, message: '' },
      setRenderProgress: (progressOrUpdater) =>
        set((state) => ({
          renderProgress: typeof progressOrUpdater === 'function' ? progressOrUpdater(state.renderProgress) : progressOrUpdater,
        })),

      videoProgress: { status: 'idle', message: '', currentStep: 0, totalSteps: 0 },
      setVideoProgress: (progress) => 
        set((state) => ({
          videoProgress: { ...state.videoProgress, ...progress }
        })),

      // ── Misc UI ─────────────────────────────────────────────────────────
      flowkitProjectId: 'a59651a1-70ff-44b6-ac42-c26d90ad28ef',
      setFlowkitProjectId: (id) => set({ flowkitProjectId: id }),

      globalArtStyle: '',
      setGlobalArtStyle: (style) => set({ globalArtStyle: style }),

      videoAspectRatio: '16:9',
      setVideoAspectRatio: (ratio) => set({ videoAspectRatio: ratio }),

      videoDuration: 8,
      setVideoDuration: (duration) => set({ videoDuration: duration }),

      videoModelProfile: 'ultra_low_priority',
      setVideoModelProfile: (profile) => set({ videoModelProfile: profile }),

      // ── TTS Settings ──────────────────────────────────────────────────
      ttsDenoise: true,
      setTtsDenoise: (denoise) => set({ ttsDenoise: denoise }),

      ttsPostprocess: false,
      setTtsPostprocess: (postprocess) => set({ ttsPostprocess: postprocess }),

      ttsNumStep: 32,
      setTtsNumStep: (numStep) => set({ ttsNumStep: numStep }),

      ttsGuidanceScale: 2.0,
      setTtsGuidanceScale: (scale) => set({ ttsGuidanceScale: scale }),

      ttsSpeed: 1.0,
      setTtsSpeed: (speed) => set({ ttsSpeed: speed }),

      // ── Panel UI prefs ────────────────────────────────────────────────
      isVoicePanelCollapsed: false,
      setIsVoicePanelCollapsed: (collapsed) => set({ isVoicePanelCollapsed: collapsed }),

      // ── Project lifecycle ────────────────────────────────────────────────
      projectVersion: 0,
      incrementProjectVersion: () => set((state) => ({ projectVersion: state.projectVersion + 1 })),

      processingJobs: { operationNames: [], mediaIds: [] },
      setProcessingJobs: (jobs) => set({ processingJobs: jobs }),

      flowkitConnected: false,
      setFlowkitConnected: (connected) => set({ flowkitConnected: connected }),

      antigravityError: null,
      setAntigravityError: (error) => set({ antigravityError: error }),

      saveStatus: 'idle',
      setSaveStatus: (status) => set({ saveStatus: status }),

      currentProjectId: 'default',
      setCurrentProjectId: (id) => set({ currentProjectId: id }),
      currentProjectName: 'My Audiobook',
      setCurrentProjectName: (name) => set({ currentProjectName: name }),

      _hasHydrated: false,
      setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),
    }),
    {
      name: 'audiobook-project',
      storage: createJSONStorage(() => localforage),
      partialize: (state) => ({
        activeTab: state.activeTab,
        lockedVoices: state.lockedVoices,
        speakerVoiceParams: state.speakerVoiceParams,
        trackVolumes: state.trackVolumes,
        videoTrackVolumes: state.videoTrackVolumes,
        flowkitProjectId: state.flowkitProjectId,
        globalArtStyle: state.globalArtStyle,
        videoAspectRatio: state.videoAspectRatio,
        videoDuration: state.videoDuration,
        videoModelProfile: state.videoModelProfile,
        ttsDenoise: state.ttsDenoise,
        ttsPostprocess: state.ttsPostprocess,
        ttsNumStep: state.ttsNumStep,
        ttsGuidanceScale: state.ttsGuidanceScale,
        ttsSpeed: state.ttsSpeed,
        isVoicePanelCollapsed: state.isVoicePanelCollapsed,
        currentProjectId: state.currentProjectId,
        currentProjectName: state.currentProjectName,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
