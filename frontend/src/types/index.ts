// ==========================================================================
// src/types/index.ts
// Central type definitions for the entire AudioBook Studio frontend.
// Import from here instead of re-declaring in each component.
// ==========================================================================

// ── Script & Characters ───────────────────────────────────────────────────

export interface ScriptLine {
  id: number;
  speaker: string;
  text: string;
  visual_references?: string[];  // IDs of entities used as visual references
  image_prompt?: string;
  motion_prompt?: string;        // Motion prompt for AI Video generation
  video_url?: string;            // URL of generated video after render
  video_nodes?: InlineVideoNode[]; // Array of nodes for Continuation Scene
  is_image_generated?: boolean;
  selected?: boolean;
  speed?: number;
}

export interface CharacterMetadata {
  type: string;
  name: string;
  description: string;
  image_prompt: string;
  local_image_path: string;
  media_id: string | null;
  last_uploaded_at: number;
  references?: string[];
  variations?: any[];
  variation_context?: string;
}

// ── Timeline: Audio ───────────────────────────────────────────────────────

export interface TimelineClip {
  id: string;         // e.g. `clip_1_1234567`
  lineId: number;
  speaker: string;
  audioUrl: string;
  filename: string;
  track: number;
  startTime: number;
  duration: number;
  volume?: number;    // Clip-specific volume multiplier (default 1.0)
  stale?: boolean;    // true when the audio file is missing on the server
}

// ── Timeline: Video ───────────────────────────────────────────────────────

export interface TimelineVideoClip {
  id: string;
  lineId: number;
  videoUrl: string;
  startTime: number;
  duration: number;
  track?: number;     // Video track index (V1, V2, etc.)
  trimStart?: number;
  keepSound?: boolean;
  volume?: number;
}

// ── Video Studio: Inline Continuation Nodes ──────────────────────────────

export interface InlineVideoNode {
  id: string;
  // Prompt fields
  userIntent?: string;        // Vietnamese intent (AI Mode)
  negativePrompt?: string;    // Vietnamese negative (AI Mode)
  aiPrompt?: string;          // Gemini-generated English prompt (AI Mode output)
  directPrompt?: string;      // English prompt override per-node (Direct Mode)
  // Last-frame continuity (populated for continuation nodes, index >= 1)
  lastFrameUrl?: string;      // Served URL for display
  lastFrameMediaId?: string;  // FlowKit media_id used as start_image
  // Generation state
  opName?: string;
  mediaId?: string;
  videoUrl?: string;
  isGeneratingPrompt?: boolean;
  isExtractingFrame?: boolean;
  isGeneratingVideo?: boolean;
}

// ── Voice & Rendering ─────────────────────────────────────────────────────

export interface VoiceParams {
  gender: string;
  age: string;
  pitch: string;
}

export interface RenderProgress {
  status: 'idle' | 'rendering' | 'assembling' | 'done' | 'error';
  currentLine: number;
  totalLines: number;
  finalAudioUrl: string | null;
  finalOutputType?: 'audio' | 'video';
  message?: string;
}

export type VideoTaskStatus = 'idle' | 'extracting' | 'storyboarding' | 'rendering' | 'error' | 'success';

export type VideoModelProfile = 'ultra_low_priority' | 'google_pro';

export interface VideoProgress {
  status: VideoTaskStatus;
  message: string;
  currentStep: number;
  totalSteps: number;
}

export type DirectorRunMode =
  | { type: 'all_missing' }
  | { type: 'selected_lines'; lineIds: number[] }
  | { type: 'from_line'; lineId: number }
  | { type: 'range'; startLineId: number; endLineId: number }
  | { type: 'retry_failed' }
  | { type: 'regenerate_scene'; sceneId: string };
