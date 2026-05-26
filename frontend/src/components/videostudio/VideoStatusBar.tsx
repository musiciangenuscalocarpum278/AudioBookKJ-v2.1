import React from 'react';
import { Loader2, Wand2, MonitorPlay } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';

const VideoStatusBar: React.FC = () => {
  const videoProgress = useProjectStore((s) => s.videoProgress);
  const { status, message, currentStep, totalSteps } = videoProgress;

  if (status === 'idle') return null;

  const percentage = totalSteps > 0 ? Math.min(100, Math.max(0, (currentStep / totalSteps) * 100)) : 100;
  
  let Icon = Loader2;
  let iconClass = "w-5 h-5 animate-spin text-amber-cinematic";
  let borderClass = "border-amber-cinematic/30";
  let glowClass = "shadow-[0_0_20px_rgba(249,115,22,0.15)]";

  if (status === 'storyboarding') {
    Icon = Wand2;
    iconClass = "w-5 h-5 animate-pulse text-amber-cinematic";
    borderClass = "border-amber-cinematic/30";
    glowClass = "shadow-[0_0_20px_rgba(249,115,22,0.15)]";
  } else if (status === 'rendering') {
    Icon = MonitorPlay;
    iconClass = "w-5 h-5 animate-pulse text-emerald-400";
    borderClass = "border-emerald-500/30";
    glowClass = "shadow-[0_0_20px_rgba(16,185,129,0.2)]";
  } else if (status === 'success') {
    Icon = Wand2;
    iconClass = "w-5 h-5 text-emerald-400";
    borderClass = "border-emerald-500/50";
    glowClass = "shadow-[0_0_20px_rgba(16,185,129,0.4)]";
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4 transition-all duration-500 ease-out translate-y-0 opacity-100">
      <div className={`relative overflow-hidden bg-obsidian-panel/90 backdrop-blur-md rounded-none border ${borderClass} ${glowClass} flex items-center p-4 gap-4`}>
        
        {/* Left Icon */}
        <div className="shrink-0 flex items-center justify-center bg-zinc-900/50 border border-zinc-800 rounded-none p-2">
          <Icon className={iconClass} />
        </div>

        {/* Center: Text Marquee */}
        <div className="flex-1 min-w-0 overflow-hidden relative h-6">
          {/* Use simple CSS animation for marquee */}
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes slide-text {
              0% { transform: translateX(10%); opacity: 0; }
              10% { transform: translateX(0); opacity: 1; }
              90% { transform: translateX(0); opacity: 1; }
              100% { transform: translateX(-10%); opacity: 0; }
            }
            .animate-slide-text {
              animation: slide-text 2s ease-in-out infinite alternate;
            }
          `}} />
          <div className="absolute inset-0 flex items-center whitespace-nowrap overflow-hidden text-sm font-medium text-zinc-200">
            {message}
          </div>
        </div>

        {/* Right: Steps Counter (Optional, subtle) */}
        {totalSteps > 0 && status !== 'success' && (
          <div className="shrink-0 text-xs font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded-none border border-zinc-800">
            {currentStep}/{totalSteps}
          </div>
        )}

        {/* Bottom Progress Bar */}
        <div className="absolute bottom-0 left-0 h-1 bg-zinc-900 w-full">
          <div 
            className="h-full bg-gradient-to-r from-amber-cinematic via-amber-glow to-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default VideoStatusBar;
