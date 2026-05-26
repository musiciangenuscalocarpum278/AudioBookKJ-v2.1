// ==========================================================================
// src/config.ts
// Central configuration — single source of truth for API endpoints.
// Change VITE_API_URL in .env to switch between local dev and production.
// ==========================================================================

export const API_BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:8000';

export const API = {
  // Audio
  audio:              `${API_BASE}/api/audio`,
  renderLine:         `${API_BASE}/api/render-line`,
  testVoice:          `${API_BASE}/api/test-voice`,
  createSyntheticVoice: `${API_BASE}/api/create-synthetic-voice`,
  assembleAudio:      `${API_BASE}/api/assemble-audio`,
  mixTimeline:        `${API_BASE}/api/mix-timeline`,
  mixVideoTimeline:   `${API_BASE}/api/mix-video-timeline`,

  // Script / AI
  generateScript:     `${API_BASE}/api/generate-script`,
  regenVisualPrompt:  `${API_BASE}/api/regen-visual-prompt`,
  extractEntities:    `${API_BASE}/api/extract-entities`,
  enhancePrompt:      `${API_BASE}/api/enhance-prompt`,
  enhanceMotion:      `${API_BASE}/api/enhance-motion`,
  generateScenePrompt:`${API_BASE}/api/generate-scene-prompt`,

  // Video
  generateSceneVideo:   `${API_BASE}/api/generate-scene-video`,
  checkVideoStatus:     `${API_BASE}/api/check-video-status`,
  video:                `${API_BASE}/api/video`,
  generateStoryboard:   `${API_BASE}/api/generate-storyboard`,
  generateSceneFrame:   `${API_BASE}/api/generate-scene-frame`,
  generateIntentPrompt: `${API_BASE}/api/generate-intent-prompt`,
  extractLastFrame:     `${API_BASE}/api/extract-last-frame`,
  uploadLocalImage:     `${API_BASE}/api/upload-local-image`,

  // Assets / Characters
  createAsset:        `${API_BASE}/api/create-asset`,
  image:              `${API_BASE}/api/image`,
  uploadCharacterImage: `${API_BASE}/api/upload-character-image`,
  generateAssetImage: `${API_BASE}/api/generate-asset-image`,
  downloadAssetImage: `${API_BASE}/api/download-asset-image`,
  deleteVariation:    `${API_BASE}/api/delete-variation`,
  updateAsset:        `${API_BASE}/api/update-asset`,
  setOfficialVariation: `${API_BASE}/api/set-official-variation`,
  toggleReferenceVariation: `${API_BASE}/api/toggle-reference-variation`,

  // Project
  projectState:       `${API_BASE}/api/project-state`,
  projectProfile:     `${API_BASE}/api/project-profile`,
  scriptLines:        `${API_BASE}/api/script-lines`,
  timelineClips:      `${API_BASE}/api/timeline-clips`,
  videoGraph:         `${API_BASE}/api/video-graph`,
  projects:           `${API_BASE}/api/projects`,
  cleanup:            `${API_BASE}/api/cleanup`,
  importEntities:     `${API_BASE}/api/import-entities`,
  charactersMetadata: `${API_BASE}/api/characters-metadata`,


  // Migration & Cleanup
  mediaInventory:     `${API_BASE}/api/media-inventory`,
  mediaMigrate:       `${API_BASE}/api/media-migrate`,
  mediaCleanupPreview:`${API_BASE}/api/media-cleanup-preview`,
  mediaCleanupApply:  `${API_BASE}/api/media-cleanup-apply`,

  // FlowKit
  flowkitWs:          `${API_BASE.replace(/^http/, 'ws')}/ws/flowkit`,
  flowkitCallback:    `${API_BASE}/api/ext/callback`,
  flowkitStatus:      `${API_BASE}/api/flowkit-status`,

  // Mix progress (WebSocket) + output file download
  mixProgressWs:      `${API_BASE.replace(/^http/, 'ws')}/ws/mix-progress`,
  outputFile:         `${API_BASE}/api/output-file`,

  // Playground Sandbox
  playgroundGenerate:  `${API_BASE}/api/playground/generate`,
  playgroundUploadRef: `${API_BASE}/api/playground/upload-ref`,
  playgroundHistory:   `${API_BASE}/api/playground/history`,
  playgroundClear:     `${API_BASE}/api/playground/clear`,
  playgroundApplyToSpeaker: `${API_BASE}/api/playground/apply-to-speaker`,
  playgroundDelete:    (id: string) => `${API_BASE}/api/playground/delete/${id}`,
  playgroundAudio:     (filename: string) => `${API_BASE}/api/playground/audio/${filename}`,
} as const;
