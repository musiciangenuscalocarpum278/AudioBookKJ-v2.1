import React from 'react';
import type { CharacterMetadata } from '../../types';

export interface VideoStudioContextType {
  onGenFrame: (nodeId: string) => void;
  onGenVideo: (nodeId: string) => void;
  onRegenScenePrompt: (nodeId: string) => Promise<void>;
  onGenIntentPrompt: (nodeId: string, videoNodeId: string) => void;
  onContinueScene: (nodeId: string, afterVideoNodeId: string) => void;
  onRegenVideoNode: (nodeId: string, videoNodeId: string) => void;
  onExtractLastFrame: (nodeId: string, videoUrl: string) => Promise<void>;
  onDeleteScene: (nodeId: string) => void;
  aspectRatio: '16:9' | '9:16';
  videoDuration: number;
  charactersMetadata: Record<string, CharacterMetadata>;
}

export const VideoStudioContext = React.createContext<VideoStudioContextType | null>(null);
