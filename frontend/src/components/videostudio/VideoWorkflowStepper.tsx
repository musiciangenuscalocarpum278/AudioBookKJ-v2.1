import React from 'react';
import { Image as ImageIcon, Wand2, LayoutTemplate, Film, ChevronRight } from 'lucide-react';
import type { ScriptLine, CharacterMetadata } from '../../types';

export type WorkflowStep = 'assets' | 'director' | 'storyboard' | 'render';

interface VideoWorkflowStepperProps {
  activeStep: WorkflowStep;
  onStepChange: (step: WorkflowStep) => void;
  script: ScriptLine[];
  charactersMetadata: Record<string, CharacterMetadata>;
  nodes: any[]; // ReactFlow nodes
}

export const VideoWorkflowStepper: React.FC<VideoWorkflowStepperProps> = ({
  activeStep, onStepChange, script, charactersMetadata, nodes
}) => {
  const steps = [
    { id: 'assets', label: '1. Visual Assets', icon: ImageIcon, 
      status: Object.keys(charactersMetadata).length > 0 ? `${Object.keys(charactersMetadata).length} items` : 'Empty' },
    { id: 'director', label: '2. AI Director', icon: Wand2,
      status: script.length > 0 ? 'Ready' : 'No Script' },
    { id: 'storyboard', label: '3. Storyboard', icon: LayoutTemplate,
      status: (() => {
        const scenes = nodes.filter(n => n.type === 'scene').length;
        return scenes > 0 ? `${scenes} scenes` : 'Pending';
      })() },
    { id: 'render', label: '4. Render', icon: Film,
      status: (() => {
        const videos = nodes.filter(n => n.type === 'video').length;
        return videos > 0 ? `${videos} clips` : 'Wait';
      })() }
  ];

  return (
    <div className="w-full bg-obsidian-panel border-b border-zinc-800/60 shrink-0 flex items-center px-4 h-14 relative z-20">
      <div className="flex items-center gap-1 mx-auto">
        {steps.map((step, idx) => {
          const isActive = activeStep === step.id;
          const Icon = step.icon;
          return (
            <React.Fragment key={step.id}>
              <button
                onClick={() => onStepChange(step.id as WorkflowStep)}
                className={`flex items-center gap-3 px-4 py-1.5 rounded-none border transition-all duration-200 ${
                  isActive
                    ? 'bg-amber-cinematic text-zinc-950 border-amber-cinematic shadow-md shadow-amber-cinematic/10 font-bold'
                    : 'bg-zinc-900/30 border-zinc-800/40 hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className={`p-1.5 rounded-none border ${isActive ? 'bg-zinc-950/20 border-zinc-950/20 text-zinc-950' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-left flex flex-col">
                  <span className={`text-xs font-bold uppercase tracking-wider ${isActive ? 'text-zinc-950' : 'text-zinc-300'}`}>{step.label}</span>
                  <span className={`text-[10px] ${isActive ? 'text-zinc-900/90' : 'text-zinc-500'}`}>{step.status}</span>
                </div>
              </button>
              {idx < steps.length - 1 && (
                <ChevronRight className="w-4 h-4 text-zinc-700 mx-1" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
