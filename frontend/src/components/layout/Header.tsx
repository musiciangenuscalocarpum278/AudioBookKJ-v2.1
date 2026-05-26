// ==========================================================================
// components/layout/Header.tsx
// Top navigation bar: logo, tab switcher, action buttons.
// State (activeTab, renderProgress) from Zustand.
// Callbacks passed as props (handleRenderAll, handleMixAndExport, etc.)
// because they rely on business logic still in App.tsx.
//
// Button hierarchy convention used across the app:
//   Primary CTA (top-level)  : rounded-full bg-{color}-600 hover:bg-{color}-500
//                              text-white shadow-lg shadow-{color}-500/25
//                              px-5 py-2 + optional hover:scale-105
//   Primary (in-panel)       : rounded-lg  bg-indigo-600 hover:bg-indigo-500
//                              text-white  (e.g. Voice Casting "Lưu Cấu Hình")
//   Secondary / tertiary     : rounded-full text-slate-300 hover:bg-slate-800
//                              (ghost; e.g. File menu trigger)
//   Tinted inline action     : rounded-lg  bg-{color}-500/10 text-{color}-400
//                              (e.g. per-row buttons in ScriptSidebar)
//
// Semantic colors:
//   indigo = primary (Render, Voice config, AI Director)
//   amber  = secondary action (Mix & Export)
//   emerald = success / move-forward (Sync To Timeline, Download)
//   red    = danger (Delete)
// ==========================================================================
import React, { useRef, useState, useEffect } from 'react';
import {
  Mic, Video, Settings, Play, Pause, Download,
  Upload, Save, FolderOpen, Loader2, ChevronDown, Trash2, Plus, CheckCircle2, AlertCircle, Database, Sparkles
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useProjectStore } from '../../store/useProjectStore';
import { API } from '../../config';
import { NewProjectModal } from './NewProjectModal';
import { MigrationCleanupModal } from './MigrationCleanupModal';

interface Project { id: string; name: string; }

interface HeaderProps {
  // File ops
  handleImportProject: (e: React.ChangeEvent<HTMLInputElement>) => void;
  exportProject: () => void;
  handleNewProject: () => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  // Actions
  handleRenderAll: () => void;
  handleMixAndExport: (mode?: 'all' | 'video_only' | 'audio_only') => void;
  handleSyncToTimeline: () => void;
  handleCancelRender: () => void;
  handleSwitchProject: (id: string, name: string) => void;
  handleCreateProject: (name: string, root: string) => void;
  // Loading states
  isGenerating: boolean;
}

export function Header({
  handleImportProject,
  exportProject,
  handleNewProject,
  handleFileUpload,
  handleRenderAll,
  handleMixAndExport,
  handleSyncToTimeline,
  handleCancelRender,
  handleSwitchProject,
  handleCreateProject,
  isGenerating,
}: HeaderProps) {
  const activeTab            = useProjectStore(s => s.activeTab);
  const setActiveTab         = useProjectStore(s => s.setActiveTab);
  const renderProgress       = useProjectStore(s => s.renderProgress);
  const script               = useProjectStore(s => s.script);
  const timelineVideoClips   = useProjectStore(s => s.timelineVideoClips);
  const videoAspectRatio     = useProjectStore(s => s.videoAspectRatio);
  const flowkitConnected     = useProjectStore(s => s.flowkitConnected);
  const setFlowkitConnected  = useProjectStore(s => s.setFlowkitConnected);
  const saveStatus           = useProjectStore(s => s.saveStatus);
  const currentProjectName   = useProjectStore(s => s.currentProjectName);
  const currentProjectId     = useProjectStore(s => s.currentProjectId);

  const importInputRef  = useRef<HTMLInputElement>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const fileMenuRef     = useRef<HTMLDivElement>(null);
  const exportMenuRef   = useRef<HTMLDivElement>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (!fileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) setFileMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [fileMenuOpen]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportMenuOpen]);

  // Fetch project list whenever the file menu opens
  useEffect(() => {
    if (!fileMenuOpen) return;
    axios.get(API.projects).then(r => setProjects(r.data)).catch(() => {});
  }, [fileMenuOpen]);

  // Poll FlowKit connection status every 10s
  useEffect(() => {
    const check = () => axios.get(API.flowkitStatus)
      .then(r => setFlowkitConnected(r.data.connected))
      .catch(() => setFlowkitConnected(false));
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, [setFlowkitConnected]);

  const isRendering = renderProgress.status === 'rendering' || renderProgress.status === 'assembling';
  const selectedCount = script.filter(l => l.selected).length;

  const renderButtonLabel = renderProgress.status === 'rendering'
    ? `Đang Render (${renderProgress.currentLine}/${renderProgress.totalLines})`
    : renderProgress.status === 'assembling'
    ? 'Đang Ghép Nối...'
    : selectedCount > 0
    ? `Render Selected (${selectedCount})`
    : 'Render All';

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-obsidian-dark">
      <div className="max-w-7xl mx-auto px-4 h-16 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">

        {/* Logo */}
        <div className="flex items-center gap-3 justify-self-start min-w-0 overflow-hidden">
          <div className="w-9 h-9 rounded-md bg-zinc-950 border border-zinc-800 flex items-center justify-center relative overflow-hidden group">
            <div className="flex gap-[2px] items-center">
              <div className="w-[2px] h-3 bg-amber-cinematic rounded-sm animate-pulse" />
              <div className="w-[2px] h-5 bg-amber-glow rounded-sm animate-pulse" style={{ animationDelay: '150ms' }} />
              <div className="w-[2px] h-4 bg-zinc-400 rounded-sm animate-pulse" style={{ animationDelay: '300ms' }} />
              <div className="w-[2px] h-2 bg-zinc-600 rounded-sm" />
            </div>
          </div>
          <h1 className="text-sm font-extrabold uppercase tracking-wider text-slate-100 flex items-center gap-1.5 font-sans shrink-0">
            Studio <span className="text-amber-cinematic">Noir</span>
          </h1>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-zinc-950 p-0.5 border border-zinc-850 w-fit justify-self-center rounded-md">
          <button
            id="tab-audio"
            onClick={() => setActiveTab('audio')}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all duration-150 flex items-center gap-2 cursor-pointer ${
              activeTab === 'audio'
                ? 'bg-amber-cinematic text-black font-extrabold shadow-[0_0_8px_rgba(249,115,22,0.35)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
            }`}
          >
            <Mic className="w-3.5 h-3.5" /> Audio Studio
          </button>
          <button
            id="tab-video"
            onClick={() => setActiveTab('video')}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all duration-150 flex items-center gap-2 cursor-pointer ${
              activeTab === 'video'
                ? 'bg-amber-cinematic text-black font-extrabold shadow-[0_0_8px_rgba(249,115,22,0.35)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
            }`}
          >
            <Video className="w-3.5 h-3.5" /> Video Studio
          </button>
          <button
            id="tab-post-production"
            onClick={() => setActiveTab('post-production')}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all duration-150 flex items-center gap-2 cursor-pointer ${
              activeTab === 'post-production'
                ? 'bg-amber-cinematic text-black font-extrabold shadow-[0_0_8px_rgba(249,115,22,0.35)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
            }`}
          >
            <Settings className="w-3.5 h-3.5" /> Post-Production
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 justify-self-end justify-end">

          {/* Global Actions: File Menu */}
          {/* Hidden file inputs */}
          <input
            type="file" accept=".json" className="hidden" aria-label="Import Project"
            ref={importInputRef}
            onChange={handleImportProject}
          />
          <input
            type="file" accept=".md,.txt" className="hidden" aria-label="Upload Script File"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />

          {/* File menu (Load / Save / Upload) */}
          <div className="relative" ref={fileMenuRef}>
            <button
              id="btn-file-menu"
              onClick={() => setFileMenuOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded text-zinc-300 hover:text-white hover:bg-zinc-900 border border-zinc-850 cursor-pointer transition-colors"
              title="File operations"
            >
              {isGenerating
                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-cinematic" />
                : <FolderOpen className="w-3.5 h-3.5" />}
              {isGenerating ? 'Đang nhờ AI...' : 'File'}
              <ChevronDown className={`w-3 h-3 transition-transform ${fileMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {fileMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-56 rounded-md bg-zinc-950 border border-zinc-800 shadow-2xl py-1 z-50"
                role="menu"
              >
                <button
                  onClick={() => { setFileMenuOpen(false); setNewProjectModalOpen(true); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wide text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors font-bold"
                >
                  <Plus className="w-4 h-4 text-emerald-500" />
                  <span className="flex-1 text-left font-bold text-emerald-500">New Project</span>
                </button>
                <div className="my-1 border-t border-zinc-850" />
                <button
                  onClick={() => { importInputRef.current?.click(); setFileMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wide text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors font-bold"
                >
                  <FolderOpen className="w-4 h-4 text-zinc-500" />
                  <span className="flex-1 text-left">Load Project (JSON)</span>
                </button>
                <button
                  onClick={() => { exportProject(); setFileMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wide text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors font-bold"
                >
                  <Save className="w-4 h-4 text-zinc-500" />
                  <span className="flex-1 text-left">Save Project (JSON)</span>
                </button>

                {projects.length > 0 && (
                  <>
                    <div className="my-1 border-t border-zinc-850" />
                    <div className="px-3 py-1 text-[9px] text-zinc-500 uppercase tracking-widest font-extrabold">Switch Project</div>
                    <div className="max-h-[140px] overflow-y-auto border-y border-zinc-900/60 bg-zinc-950/40 py-1">
                      {projects.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { handleSwitchProject(p.id, p.name); setFileMenuOpen(false); }}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-wide text-left transition-colors font-bold ${
                            p.id === currentProjectId ? 'text-amber-cinematic bg-amber-cinematic/5' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-sm shrink-0 ${p.id === currentProjectId ? 'bg-amber-cinematic shadow-[0_0_6px_#f97316]' : 'bg-zinc-700'}`} />
                          <span className="flex-1 truncate">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {activeTab === 'audio' && (
                  <>
                    <div className="my-1 border-t border-zinc-850" />
                    <button
                      onClick={() => { fileInputRef.current?.click(); setFileMenuOpen(false); }}
                      disabled={isGenerating}
                      className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wide text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors disabled:opacity-50 disabled:hover:bg-transparent font-bold"
                    >
                      <Upload className="w-4 h-4 text-zinc-500" />
                      <span className="flex-1 text-left">Upload .md (AI gen script)</span>
                    </button>
                  </>
                )}
                <div className="my-1 border-t border-zinc-850" />
                <button
                  onClick={() => { setActiveTab('playground'); setFileMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wide text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors font-bold"
                >
                  <Sparkles className="w-4 h-4 text-amber-cinematic animate-pulse" />
                  <span className="flex-1 text-left font-bold text-amber-cinematic">OmniVoice Playground</span>
                </button>
                <div className="my-1 border-t border-zinc-850" />
                <button
                  onClick={() => {
                    setFileMenuOpen(false);
                    setMigrationModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wide text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors font-bold"
                >
                  <Database className="w-4 h-4 text-amber-cinematic" />
                  <span className="flex-1 text-left">Storage & Migration</span>
                </button>
              </div>
            )}
          </div>

          {/* Audio Studio Actions */}
          {activeTab === 'audio' && (
            <>
              <button
                id="btn-render-all"
                onClick={handleRenderAll}
                disabled={isRendering || isGenerating}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded bg-amber-cinematic hover:bg-amber-glow text-black transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-[0_0_10px_rgba(249,115,22,0.25)]"
              >
                {isRendering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                {renderButtonLabel}
              </button>
            </>
          )}

          {/* Post-Production Actions */}
          {activeTab === 'post-production' && (
            <>
            <div className="relative" ref={exportMenuRef}>
              <button
                id="btn-mix-export"
                onClick={() => setExportMenuOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded text-zinc-300 hover:text-white hover:bg-zinc-900 border border-zinc-850 cursor-pointer transition-colors"
                title="Export & Download"
              >
                <Download className="w-3.5 h-3.5" />
                Export
                <ChevronDown className={`w-3 h-3 transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {exportMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 rounded-md bg-zinc-950 border border-zinc-800 shadow-2xl py-1 z-50">
                  <button
                    onClick={() => { setExportMenuOpen(false); handleMixAndExport('all'); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wide text-amber-cinematic hover:bg-zinc-900 hover:text-amber-glow transition-colors text-left font-bold"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Mix & Export All
                  </button>
                  <button
                    onClick={() => { setExportMenuOpen(false); handleMixAndExport('video_only'); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wide text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors text-left font-bold"
                  >
                    <Video className="w-4 h-4 fill-current text-amber-cinematic" />
                    Video Only
                  </button>
                  <button
                    onClick={() => { setExportMenuOpen(false); handleMixAndExport('audio_only'); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wide text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors text-left font-bold"
                  >
                    <Mic className="w-4 h-4 fill-current text-amber-cinematic" />
                    Audio Only
                  </button>
                  
                  {renderProgress.status === 'done' && renderProgress.finalAudioUrl && (
                    <>
                      <div className="my-1 border-t border-zinc-850" />
                      <a
                        href={renderProgress.finalAudioUrl}
                        download={renderProgress.finalOutputType === 'video' ? `Final_Audiobook_Video_${videoAspectRatio.replace(':', 'x')}.mp4` : 'Final_Audiobook.mp3'}
                        onClick={() => setExportMenuOpen(false)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-wide text-emerald-400 hover:bg-zinc-900 hover:text-emerald-300 transition-colors text-left font-bold"
                      >
                        <Download className="w-4 h-4" />
                        {renderProgress.finalOutputType === 'video' ? 'Tải Video Về' : 'Tải Audio Về'}
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>
            </>
          )}

          {/* Video Studio Actions */}
          {activeTab === 'video' && (
            <button
              id="btn-sync-timeline"
              onClick={() => { handleSyncToTimeline(); setActiveTab('post-production'); }}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
            >
              <Video className="w-3.5 h-3.5 fill-current" />
              Sync To Timeline
            </button>
          )}
        </div>

      </div>

      {/* Bottom sticky status strip — visible during render/mix */}
      {(renderProgress.status === 'rendering' || renderProgress.status === 'assembling') && (
        <div className="relative h-[28px] bg-zinc-950 border-t border-zinc-850 flex items-center justify-center overflow-hidden w-full">
          {/* Progress bar background fill */}
          {renderProgress.totalLines > 0 ? (
            <div
              className={`absolute top-0 left-0 bottom-0 transition-all duration-300 ${renderProgress.status === 'rendering' ? 'bg-amber-cinematic/10' : 'bg-amber-glow/20'}`}
              style={{ width: `${Math.min(100, (renderProgress.currentLine / renderProgress.totalLines) * 100)}%` }}
            >
               {/* Glowing right edge */}
               <div className={`absolute top-0 right-0 bottom-0 w-[2px] shadow-[0_0_8px_rgba(249,115,22,0.6)] ${renderProgress.status === 'rendering' ? 'bg-amber-cinematic' : 'bg-amber-glow'}`} />
            </div>
          ) : (
            <div className={`absolute top-0 left-0 bottom-0 w-full animate-pulse opacity-10 bg-amber-cinematic`} />
          )}
          
          {/* Text layer */}
          <div className="relative z-10 flex items-center gap-3 text-[10px] uppercase font-mono font-bold text-zinc-300 tracking-wider">
            {renderProgress.status === 'rendering' ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin text-amber-cinematic" /> Đang Render Câu Thoại ({renderProgress.currentLine}/{renderProgress.totalLines})</>
            ) : (
              <><Loader2 className="w-3.5 h-3.5 animate-spin text-amber-glow" /> {renderProgress.message || 'Đang xử lý...'}</>
            )}
            {renderProgress.status === 'rendering' && (
              <button
                onClick={handleCancelRender}
                className="ml-2 px-2 py-0.5 rounded bg-red-950/60 border border-red-900/40 hover:bg-red-900 text-red-400 hover:text-white text-[9px] font-bold tracking-wider transition-colors uppercase cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
      </header>

      {newProjectModalOpen && (
        <NewProjectModal
          onClose={() => setNewProjectModalOpen(false)}
          onSubmit={(name, root) => {
            handleCreateProject(name, root);
            setNewProjectModalOpen(false);
          }}
        />
      )}

      {migrationModalOpen && (
        <MigrationCleanupModal onClose={() => setMigrationModalOpen(false)} />
      )}

      {/* Floating System HUD Panel */}
      <div className="fixed bottom-4 right-4 z-[100] flex items-center gap-3.5 bg-zinc-950/90 border border-zinc-800/80 backdrop-blur-md px-3 py-1.5 rounded-md shadow-[0_0_20px_rgba(0,0,0,0.8),_0_0_2px_rgba(249,115,22,0.15)] hover:border-zinc-700/90 transition-all duration-300 hover:shadow-[0_0_25px_rgba(0,0,0,0.9),_0_0_5px_rgba(249,115,22,0.25)] select-none text-[10px] font-mono tracking-wider text-zinc-400 group/hud">
        {/* Connection status (FlowKit) */}
        <div className="flex items-center gap-1.5 border-r border-zinc-850/60 pr-3 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-sm ${flowkitConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.7)]' : 'bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.7)]'}`} />
          <span className="text-zinc-600 uppercase font-bold text-[8px]">FLOWKIT:</span>
          <span className={flowkitConnected ? 'text-emerald-400 font-extrabold' : 'text-rose-400 font-extrabold'}>
            {flowkitConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        {/* Database Save Status */}
        <div className="flex items-center gap-1.5 border-r border-zinc-850/60 pr-3 shrink-0">
          <span className="text-zinc-600 uppercase font-bold text-[8px]">SAVE:</span>
          <span className={`font-extrabold transition-colors duration-200 ${
            saveStatus === 'saved'
              ? 'text-emerald-400'
              : saveStatus === 'saving'
              ? 'text-amber-cinematic animate-pulse'
              : saveStatus === 'error'
              ? 'text-rose-400 animate-pulse font-black'
              : 'text-zinc-550'
          }`}>
            {saveStatus.toUpperCase()}
          </span>
        </div>

        {/* Active Project Name */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-zinc-600 uppercase font-bold text-[8px]">PRJ:</span>
          <span className="text-amber-cinematic font-extrabold truncate max-w-[110px] group-hover/hud:max-w-[200px] transition-all duration-300" title={currentProjectName}>
            {currentProjectName.toUpperCase()}
          </span>
        </div>
      </div>
    </>
  );
}
