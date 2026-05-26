// ==========================================================================
// store/usePlaybackStore.ts
// Timeline playback + DAW interaction state.
// NOT persisted — always starts fresh on page reload.
// ==========================================================================
import { create } from 'zustand';

interface PlaybackState {
  // ── Playback ─────────────────────────────────────────────────────────────
  isPlayingTimeline: boolean;
  setIsPlayingTimeline: (playing: boolean | ((prev: boolean) => boolean)) => void;

  timelineTime: number;
  setTimelineTime: (time: number | ((prev: number) => number)) => void;

  // ── Zoom ─────────────────────────────────────────────────────────────────
  zoomLevel: number;
  setZoomLevel: (zoom: number) => void;

  // ── Timeline height (resizable panel) ────────────────────────────────────
  timelineHeight: number;
  setTimelineHeight: (h: number) => void;

  // ── Audio clip drag ──────────────────────────────────────────────────────
  draggingTimelineClipId: string | null;
  setDraggingTimelineClipId: (id: string | null) => void;

  timelineDragStartX: number;
  setTimelineDragStartX: (x: number) => void;

  timelineDragStartY: number;
  setTimelineDragStartY: (y: number) => void;

  timelineDragStartStartTime: number;
  setTimelineDragStartStartTime: (t: number) => void;

  timelineDragStartTrack: number;
  setTimelineDragStartTrack: (track: number) => void;

  // ── Video clip drag & resize ─────────────────────────────────────────────
  draggingVideoClipId: string | null;
  setDraggingVideoClipId: (id: string | null) => void;

  resizingVideoClipId: string | null;
  setResizingVideoClipId: (id: string | null) => void;

  videoResizeEdge: 'left' | 'right' | null;
  setVideoResizeEdge: (edge: 'left' | 'right' | null) => void;

  videoDragStartDuration: number;
  setVideoDragStartDuration: (d: number) => void;

  videoDragStartTrimStart: number;
  setVideoDragStartTrimStart: (t: number) => void;

  // ── Selection ─────────────────────────────────────────────────────────────
  selectedTimelineVideoClipId: string | null;
  setSelectedTimelineVideoClipId: (id: string | null) => void;

  selectedTimelineAudioClipId: string | null;
  setSelectedTimelineAudioClipId: (id: string | null) => void;

  selectedTimelineVideoClipIds: string[];
  setSelectedTimelineVideoClipIds: (ids: string[] | ((prev: string[]) => string[])) => void;

  selectedTimelineAudioClipIds: string[];
  setSelectedTimelineAudioClipIds: (ids: string[] | ((prev: string[]) => string[])) => void;

  groupDragStartPositions: Record<string, { startTime: number; track: number }>;
  setGroupDragStartPositions: (positions: Record<string, { startTime: number; track: number }>) => void;

  selectionBox: { startX: number; startY: number; endX: number; endY: number } | null;
  setSelectionBox: (box: { startX: number; startY: number; endX: number; endY: number } | null) => void;
}

function loadTimelineHeight(): number {
  try {
    const saved = localStorage.getItem('audiobook_timeline_height');
    return saved ? parseInt(saved) : 260;
  } catch {
    return 260;
  }
}

export const usePlaybackStore = create<PlaybackState>()((set) => ({
  // ── Playback ─────────────────────────────────────────────────────────────
  isPlayingTimeline: false,
  setIsPlayingTimeline: (playingOrUpdater) =>
    set((state) => ({
      isPlayingTimeline:
        typeof playingOrUpdater === 'function'
          ? playingOrUpdater(state.isPlayingTimeline)
          : playingOrUpdater,
    })),

  timelineTime: 0,
  setTimelineTime: (timeOrUpdater) =>
    set((state) => ({
      timelineTime:
        typeof timeOrUpdater === 'function' ? timeOrUpdater(state.timelineTime) : timeOrUpdater,
    })),

  // ── Zoom ─────────────────────────────────────────────────────────────────
  zoomLevel: 50,
  setZoomLevel: (zoom) => set({ zoomLevel: zoom }),

  // ── Timeline height ───────────────────────────────────────────────────────
  timelineHeight: loadTimelineHeight(),
  setTimelineHeight: (h) => {
    localStorage.setItem('audiobook_timeline_height', h.toString());
    set({ timelineHeight: h });
  },

  // ── Audio clip drag ──────────────────────────────────────────────────────
  draggingTimelineClipId: null,
  setDraggingTimelineClipId: (id) => set({ draggingTimelineClipId: id }),

  timelineDragStartX: 0,
  setTimelineDragStartX: (x) => set({ timelineDragStartX: x }),

  timelineDragStartY: 0,
  setTimelineDragStartY: (y) => set({ timelineDragStartY: y }),

  timelineDragStartStartTime: 0,
  setTimelineDragStartStartTime: (t) => set({ timelineDragStartStartTime: t }),

  timelineDragStartTrack: 0,
  setTimelineDragStartTrack: (track) => set({ timelineDragStartTrack: track }),

  // ── Video clip drag & resize ─────────────────────────────────────────────
  draggingVideoClipId: null,
  setDraggingVideoClipId: (id) => set({ draggingVideoClipId: id }),

  resizingVideoClipId: null,
  setResizingVideoClipId: (id) => set({ resizingVideoClipId: id }),

  videoResizeEdge: null,
  setVideoResizeEdge: (edge) => set({ videoResizeEdge: edge }),

  videoDragStartDuration: 0,
  setVideoDragStartDuration: (d) => set({ videoDragStartDuration: d }),

  videoDragStartTrimStart: 0,
  setVideoDragStartTrimStart: (t) => set({ videoDragStartTrimStart: t }),

  // ── Selection ─────────────────────────────────────────────────────────────
  selectedTimelineVideoClipId: null,
  setSelectedTimelineVideoClipId: (id) => set({ selectedTimelineVideoClipId: id }),

  selectedTimelineAudioClipId: null,
  setSelectedTimelineAudioClipId: (id) => set({ selectedTimelineAudioClipId: id }),

  selectedTimelineVideoClipIds: [],
  setSelectedTimelineVideoClipIds: (idsOrUpdater) =>
    set((state) => ({
      selectedTimelineVideoClipIds:
        typeof idsOrUpdater === 'function'
          ? idsOrUpdater(state.selectedTimelineVideoClipIds)
          : idsOrUpdater,
    })),

  selectedTimelineAudioClipIds: [],
  setSelectedTimelineAudioClipIds: (idsOrUpdater) =>
    set((state) => ({
      selectedTimelineAudioClipIds:
        typeof idsOrUpdater === 'function'
          ? idsOrUpdater(state.selectedTimelineAudioClipIds)
          : idsOrUpdater,
    })),

  groupDragStartPositions: {},
  setGroupDragStartPositions: (positions) => set({ groupDragStartPositions: positions }),

  selectionBox: null,
  setSelectionBox: (box) => set({ selectionBox: box }),
}));
