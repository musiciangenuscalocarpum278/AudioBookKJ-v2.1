// ==========================================================================
// components/script/ScriptSidebar.tsx
// Left 8/12 column: script editor (line list) + right 4/12: Voice Casting panel.
// Both panels are now in this component to keep the script + voice logic together.
// All shared state from Zustand; complex callbacks passed as props.
// ==========================================================================
import React, { useRef } from 'react';
import {
  Settings, Play, FileText, Volume2, Trash2, Loader2, Save,
  Copy, ArrowUpDown, GripVertical, ChevronDown, ChevronUp,
  PanelRightOpen, X, Upload, Video, Plus
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useProjectStore } from '../../store/useProjectStore';
import { usePlaybackStore } from '../../store/usePlaybackStore';
import { API_BASE } from '../../config';
import type { ScriptLine } from '../../types';

interface ScriptSidebarProps {
  // Script line actions
  addLine: () => void;
  insertLine: (afterIndex: number) => void;
  deleteLine: (id: number) => void;
  playSample: (id: number, text: string, speaker: string) => void;
  handleDragOverContainer: (e: React.DragEvent) => void;
  handleSort: () => void;
  // Voice actions
  createSyntheticVoice: (speaker: string) => void;
  togglePlayVoiceRef: (speaker: string) => void;
  handleSaveProfile: (nextLockedVoices?: Record<string, boolean>) => void;
  // Local UI state (not global enough for store)
  isSortingMode: boolean;
  setIsSortingMode: (v: boolean) => void;
  playingId: number | null;
  isCreatingSynthetic: string | null;
  playingVoiceRef: string | null;
  expandedScriptLines: Set<number>;
  toggleScriptLine: (id: number, e: React.MouseEvent) => void;
  expandedVoices: Set<string>;
  toggleVoice: (speaker: string, e: React.MouseEvent) => void;
  // Refs
  timelineScrollRef: React.RefObject<HTMLDivElement | null>;
  dragItem: React.MutableRefObject<number | null>;
  dragOverItem: React.MutableRefObject<number | null>;
}

export function ScriptSidebar({
  addLine, insertLine, deleteLine, playSample,
  handleDragOverContainer, handleSort,
  createSyntheticVoice, togglePlayVoiceRef, handleSaveProfile,
  isSortingMode, setIsSortingMode, playingId, isCreatingSynthetic,
  playingVoiceRef, expandedScriptLines, toggleScriptLine,
  expandedVoices, toggleVoice,
  timelineScrollRef, dragItem, dragOverItem,
}: ScriptSidebarProps) {
  const script = useProjectStore(s => s.script);
  const setScript = useProjectStore(s => s.setScript);
  const timelineClips = useProjectStore(s => s.timelineClips);
  const speakerVoiceParams = useProjectStore(s => s.speakerVoiceParams);
  const setSpeakerVoiceParams = useProjectStore(s => s.setSpeakerVoiceParams);
  const lockedVoices = useProjectStore(s => s.lockedVoices);
  const renderProgress = useProjectStore(s => s.renderProgress);
  const charactersMetadata = useProjectStore(s => s.charactersMetadata);
  const activeVideoNodeLineIds = usePlaybackStore ? [] : []; // populated by VideoStudio sync
  const zoomLevel = usePlaybackStore(s => s.zoomLevel);
  const isVoicePanelCollapsed = useProjectStore(s => s.isVoicePanelCollapsed);
  const setIsVoicePanelCollapsed = useProjectStore(s => s.setIsVoicePanelCollapsed);
  const setActiveTab = useProjectStore(s => s.setActiveTab);

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

  const [isTtsSettingsExpanded, setIsTtsSettingsExpanded] = React.useState(false);

  const uniqueSpeakersFromScript = Array.from(new Set(script.map(l => l.speaker.toLowerCase())));
  const uniqueSpeakers = Array.from(new Set([...uniqueSpeakersFromScript, ...Object.keys(speakerVoiceParams)]));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingSpeaker, setUploadingSpeaker] = React.useState<string | null>(null);

  const [selectedSpeaker, setSelectedSpeaker] = React.useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);

  React.useEffect(() => {
    if (uniqueSpeakers.length > 0) {
      if (!selectedSpeaker || !uniqueSpeakers.includes(selectedSpeaker)) {
        setSelectedSpeaker(uniqueSpeakers[0]);
      }
    } else {
      setSelectedSpeaker(null);
    }
  }, [uniqueSpeakers, selectedSpeaker]);

  const handleUploadVoiceClick = (speaker: string) => {
    setUploadingSpeaker(speaker);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingSpeaker) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      toast.loading(`Đang tải lên giọng mẫu cho ${uploadingSpeaker}...`, { id: 'upload-voice' });
      formData.append('project_id', useProjectStore.getState().currentProjectId);
      await axios.post(`${API_BASE}/api/upload-voice-ref?speaker=${encodeURIComponent(uploadingSpeaker)}&project_id=${useProjectStore.getState().currentProjectId}`, formData);
      toast.success('Tải giọng mẫu thành công!', { id: 'upload-voice' });
      const nextLockedVoices = { ...lockedVoices, [uploadingSpeaker]: true };
      useProjectStore.getState().setLockedVoices(nextLockedVoices);
      handleSaveProfile(nextLockedVoices);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi khi tải giọng mẫu', { id: 'upload-voice' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadingSpeaker(null);
    }
  };

  const handleDeleteSpeaker = (speaker: string) => {
    if (!window.confirm(`Xóa cấu hình giọng nói và hủy khóa giọng cho nhân vật "${speaker}"?`)) return;

    const nextLockedVoices = { ...lockedVoices };
    delete nextLockedVoices[speaker];
    useProjectStore.getState().setLockedVoices(nextLockedVoices);

    const nextSpeakerVoiceParams = { ...speakerVoiceParams };
    delete nextSpeakerVoiceParams[speaker];
    setSpeakerVoiceParams(nextSpeakerVoiceParams);

    handleSaveProfile(nextLockedVoices);
    toast.success(`Đã xóa cấu hình nhân vật "${speaker}"`);
  };

  return (
    <main
      className="w-full h-full max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10 transition-[grid-template-columns] duration-200 ease-out overflow-hidden"
    >
      {/* ── Left: Script Editor ─────────────────────────────────────────── */}
      <div className={`${isVoicePanelCollapsed ? 'lg:col-span-12' : 'lg:col-span-8'} flex flex-col h-full overflow-hidden space-y-4 transition-[grid-column] duration-200 ease-out`}>
        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-cinematic" />
            Kịch Bản (Script Editor)
          </h2>
          <div className="flex items-center gap-4">
            {/* Re-open Voice Casting panel (visible when collapsed) */}
            {isVoicePanelCollapsed && (
              <button
                onClick={() => setIsVoicePanelCollapsed(false)}
                className="flex items-center gap-1.5 text-sm text-amber-cinematic hover:text-amber-500 transition-colors px-2.5 py-1 rounded bg-amber-cinematic/10 hover:bg-amber-cinematic/20 font-medium"
                title="Mở lại Voice Casting"
              >
                <PanelRightOpen className="w-4 h-4" /> Voice Casting
              </button>
            )}
            {/* Select all */}
            <label className="flex items-center gap-2 text-sm text-zinc-450 cursor-pointer hover:text-zinc-300 transition-colors">
              <input
                type="checkbox"
                className="w-4 h-4 rounded-sm border-zinc-800 bg-zinc-950 text-amber-cinematic focus:ring-amber-cinematic/30 cursor-pointer"
                checked={script.length > 0 && script.every(l => l.selected)}
                onChange={(e) => setScript(script.map(l => ({ ...l, selected: e.target.checked })))}
              />
              Chọn Tất Cả
            </label>
            {/* Sort mode */}
            <button
              onClick={() => setIsSortingMode(!isSortingMode)}
              className={`text-sm flex items-center gap-1 transition-colors px-2 py-1 rounded ${isSortingMode ? 'bg-amber-cinematic/20 text-amber-cinematic font-medium border border-amber-cinematic/30' : 'text-zinc-400 hover:text-zinc-300'}`}
            >
              <ArrowUpDown className="w-4 h-4" /> {isSortingMode ? 'Đang Sắp Xếp (Tắt)' : 'Sắp Xếp'}
            </button>
            {/* Add line */}
            <button
              onClick={addLine}
              className="text-sm text-amber-cinematic hover:text-amber-500 flex items-center gap-1 transition-colors bg-amber-cinematic/10 px-2.5 py-1 rounded hover:bg-amber-cinematic/20 font-medium"
            >
              + Thêm dòng
            </button>
          </div>
        </div>

        {/* Script Lines */}
        <div className="flex-1 overflow-y-auto pl-8 pr-2 space-y-4 custom-scrollbar" onDragOver={handleDragOverContainer}>
          {script.length === 0 && (
            <div className="text-center py-16 border border-dashed border-zinc-800 rounded-md bg-obsidian-panel/30 flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-md bg-amber-cinematic/10 flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 text-amber-cinematic" />
              </div>
              <h3 className="text-zinc-300 font-semibold mb-1">Chưa có kịch bản nào</h3>
              <p className="text-xs text-zinc-500 max-w-xs mx-auto leading-relaxed">
                Mở <span className="text-amber-cinematic font-medium">File ▾</span> ở thanh trên cùng để Upload .md (AI sinh script),
                hoặc bấm <span className="text-amber-cinematic font-medium">+ Thêm dòng</span> ở trên để tạo dòng đầu tiên.
              </p>
            </div>
          )}
          {script.map((line, index) => (
            <React.Fragment key={line.id}>
              <div
                id={`script-line-${line.id}`}
                draggable={isSortingMode}
                onDragStart={() => { if (isSortingMode) dragItem.current = index; }}
                onDragEnter={() => { if (isSortingMode) dragOverItem.current = index; }}
                onDragEnd={handleSort}
                onDragOver={(e) => e.preventDefault()}
                className={`group relative border rounded-md p-4 transition-all duration-300
                ${isSortingMode ? 'cursor-move border-amber-cinematic/50 hover:bg-amber-950/20' : ''}
                ${line.selected && !isSortingMode
                    ? 'bg-obsidian-panel border-amber-cinematic shadow-[0_0_15px_rgba(249,115,22,0.1)] scale-[1.01]'
                    : 'bg-obsidian-panel border-zinc-850'}
                ${!isSortingMode && !line.selected ? 'hover:border-amber-cinematic/40 hover:shadow-lg hover:shadow-amber-cinematic/5' : ''}`}
              >
                {/* Sort grip */}
                {isSortingMode && (
                  <div className="absolute -left-10 top-1/2 -translate-y-1/2 text-amber-cinematic/70">
                    <GripVertical className="w-6 h-6" />
                  </div>
                )}

                {/* Line number + checkbox */}
                <div className={`absolute -left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 ${isSortingMode ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="w-6 h-6 rounded bg-zinc-900 border border-zinc-850 flex items-center justify-center text-xs text-zinc-500 font-mono shadow-sm">
                    {index + 1}
                  </div>
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded-sm border-zinc-800 bg-zinc-950 text-amber-cinematic focus:ring-amber-cinematic/30 cursor-pointer"
                    checked={line.selected || false}
                    onChange={(e) => {
                      const next = [...script];
                      next[index] = { ...next[index], selected: e.target.checked };
                      setScript(next);
                    }}
                  />
                </div>

                {/* Compact header (click to expand) */}
                <div
                  className="ml-4 cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-1"
                  onClick={(e) => {
                    toggleScriptLine(line.id, e);
                    const clip = timelineClips.find(c => c.lineId === line.id);
                    if (clip && timelineScrollRef.current) {
                      const leftPos = clip.startTime * zoomLevel;
                      timelineScrollRef.current.scrollTo({
                        left: Math.max(0, leftPos - timelineScrollRef.current.clientWidth / 2 + 100),
                        behavior: 'smooth',
                      });
                    }
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 overflow-hidden w-full">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-cinematic shrink-0 min-w-[80px]">
                      {line.speaker}
                    </span>
                    <span className="text-sm text-zinc-300 truncate max-w-full sm:max-w-md opacity-80">
                      {line.text || '...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                    {expandedScriptLines.has(line.id) || isSortingMode
                      ? <ChevronUp className="w-4 h-4 text-zinc-500 pointer-events-none" />
                      : <ChevronDown className="w-4 h-4 text-zinc-500 pointer-events-none" />}
                  </div>
                </div>

                {/* Expanded body */}
                <div className={`ml-4 overflow-hidden transition-all duration-300 ${expandedScriptLines.has(line.id) || isSortingMode ? 'max-h-[1000px] opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0 pointer-events-none'}`}>
                  <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-zinc-800/50">
                    {/* Speaker selector */}
                    <div className="w-full sm:w-48 shrink-0 flex flex-col gap-3">
                      <div>
                        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5 block">Speaker (Voice)</label>
                        <select
                          className="w-full bg-zinc-950 border border-zinc-850 rounded px-3 py-2 text-sm text-zinc-250 focus:outline-none focus:ring-1 focus:ring-amber-cinematic/30 appearance-none"
                          value={line.speaker}
                          onChange={(e) => {
                            const next = [...script];
                            next[index] = { ...next[index], speaker: e.target.value };
                            if (!next[index].visual_references || next[index].visual_references!.length === 0) {
                              next[index].visual_references = [e.target.value];
                            }
                            setScript(next);
                          }}
                        >
                          {Array.from(new Set([
                            'narration',
                            ...Object.keys(charactersMetadata).filter(k => charactersMetadata[k].type === 'character'),
                            ...uniqueSpeakers
                          ])).map(s => {
                            const char = charactersMetadata[s];
                            const displayName = char ? `👨 ${char.name}` : (s === 'narration' ? '🎙️ Narration' : `🗣️ ${s}`);
                            return <option key={s} value={s}>{displayName}</option>;
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                          <span>Speed</span>
                          <span className="text-[10px] text-zinc-650 normal-case">Mặc định (Global): {ttsSpeed.toFixed(1)}x</span>
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.5"
                          max="2.0"
                          className="w-full bg-zinc-950 border border-zinc-850 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-cinematic/30"
                          value={line.speed ?? 1.0}
                          onChange={(e) => {
                            const next = [...script];
                            next[index] = { ...next[index], speed: parseFloat(e.target.value) || 1.0 };
                            setScript(next);
                          }}
                        />
                      </div>
                    </div>

                    {/* Text editor */}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider block">Lời thoại</label>
                        <select
                          className="text-xs bg-zinc-900 border border-zinc-800 rounded-sm text-amber-cinematic py-1 px-2 focus:outline-none focus:border-amber-cinematic transition-colors cursor-pointer"
                          onChange={(e) => {
                            const tag = e.target.value;
                            if (!tag) return;
                            const textarea = document.getElementById(`textarea-${line.id}`) as HTMLTextAreaElement;
                            const next = [...script];
                            if (textarea) {
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const before = line.text.substring(0, start);
                              const after = line.text.substring(end);
                              const padL = (before.length > 0 && !before.endsWith(' ')) ? ' ' : '';
                              const padR = (after.length > 0 && !after.startsWith(' ')) ? ' ' : '';
                              const insert = padL + tag + padR;
                              next[index] = { ...next[index], text: before + insert + after };
                              setScript(next);
                              setTimeout(() => {
                                textarea.focus();
                                const pos = start + insert.length;
                                textarea.setSelectionRange(pos, pos);
                              }, 0);
                            } else {
                              next[index] = { ...next[index], text: line.text + (line.text.endsWith(' ') ? '' : ' ') + tag };
                              setScript(next);
                            }
                            e.target.value = '';
                          }}
                        >
                          <option value="">+ Chèn cảm xúc...</option>
                          <option value="[laughter]">😂 Cười gằn [laughter]</option>
                          <option value="[sigh]">😮‍💨 Thở dài [sigh]</option>
                          <option value="[surprise-ah]">😲 Ngạc nhiên A! [surprise-ah]</option>
                          <option value="[surprise-oh]">😯 Ngạc nhiên Ồ! [surprise-oh]</option>
                          <option value="[surprise-wa]">🤯 Bất ngờ Oa! [surprise-wa]</option>
                          <option value="[question-en]">🤔 Thắc mắc Hả? [question-en]</option>
                          <option value="[dissatisfaction-hnn]">😒 Bực dọc Hừ! [dissatisfaction-hnn]</option>
                        </select>
                      </div>
                      <textarea
                        id={`textarea-${line.id}`}
                        className="w-full bg-zinc-950/40 text-zinc-300 resize-none outline-none leading-relaxed mt-2 p-3 rounded border border-zinc-850 hover:border-zinc-800 focus:border-amber-cinematic/30 focus:bg-zinc-950/80 transition-all text-sm sm:text-base font-sans"
                        rows={3}
                        value={line.text}
                        onChange={(e) => {
                          const next = [...script];
                          next[index] = { ...next[index], text: e.target.value };
                          setScript(next);
                        }}
                      />
                    </div>

                    {/* Action buttons */}
                    <div className="flex sm:flex-col justify-end gap-2 shrink-0 items-center">
                      {/* Render status dot — compact replacement for spinner/checkmark chips */}
                      {(() => {
                        const isThisRendering = renderProgress.status === 'rendering' && renderProgress.currentLine === index + 1;
                        const isDone = renderProgress.status === 'done';
                        const isError = renderProgress.status === 'error';
                        if (!isThisRendering && !isDone && !isError) return null;
                        const dotClass = isThisRendering
                          ? 'bg-amber-cinematic animate-pulse shadow-[0_0_6px_rgba(249,115,22,0.8)]'
                          : isError
                            ? 'bg-rose-500'
                            : 'bg-emerald-550 shadow-[0_0_6px_rgba(16,185,129,0.6)]';
                        const tip = isThisRendering ? 'Đang render dòng này...' : isError ? 'Lỗi render' : 'Đã render xong';
                        return <span className={`w-2 h-2 rounded-full ${dotClass}`} title={tip} />;
                      })()}
                      <button
                        onClick={() => playSample(line.id, line.text, line.speaker, line.speed && line.speed !== 1.0 ? line.speed : ttsSpeed)}
                        disabled={playingId !== null}
                        className="p-2 rounded bg-amber-cinematic/10 text-amber-cinematic hover:bg-amber-cinematic/20 hover:text-amber-500 transition-colors disabled:opacity-50 cursor-pointer"
                        title="Nghe thử dòng này"
                      >
                        {playingId === line.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Volume2 className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => setActiveTab('video')}
                        className="p-2 rounded bg-amber-cinematic/10 text-amber-cinematic hover:bg-amber-cinematic/20 hover:text-amber-500 transition-colors cursor-pointer"
                        title="Go to Video Studio to generate video for this scene"
                      >
                        <Video className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => deleteLine(line.id)}
                        className="p-2 rounded bg-rose-500/10 text-rose-450 hover:bg-rose-500/20 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Xoá dòng này"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Insert zone — hover to reveal, hidden in sort mode */}
              {!isSortingMode && (
                <div className="group/insert flex items-center gap-2 h-4 -my-1 cursor-default">
                  <div className="flex-1 h-px bg-zinc-900 group-hover/insert:bg-amber-cinematic/40 transition-colors" />
                  <button
                    onClick={() => insertLine(index)}
                    className="opacity-0 group-hover/insert:opacity-100 transition-opacity shrink-0 flex items-center gap-0.5 px-2 py-0.5 rounded text-[9px] font-bold bg-amber-cinematic hover:bg-amber-glow text-white cursor-pointer"
                    title="Insert line here"
                  >
                    <Plus className="w-2.5 h-2.5" /> Insert
                  </button>
                  <div className="flex-1 h-px bg-zinc-900 group-hover/insert:bg-amber-cinematic/40 transition-colors" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── Right: Voice Casting ─────────────────────────────────────────── */}
      {!isVoicePanelCollapsed && (
        <div className="lg:col-span-4 h-full flex flex-col overflow-hidden panel-enter pb-4">
          <div className="bg-obsidian-panel border border-zinc-800 rounded-md p-5 shadow-xl flex flex-col h-full min-h-0 overflow-y-auto custom-scrollbar">
            {/* Card Header — FIXED */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-amber-cinematic" />
                <h2 className="text-md font-semibold text-zinc-100">Voice Casting</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSaveProfile()}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-cinematic hover:bg-amber-glow text-zinc-950 rounded transition-colors text-[11px] font-bold cursor-pointer"
                  title="Lưu các thiết lập Giọng nói và Google Project ID"
                >
                  <Save className="w-3.5 h-3.5" /> Lưu Cấu Hình
                </button>
                <button
                  onClick={() => setIsVoicePanelCollapsed(true)}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Thu gọn Voice Casting"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Custom Premium Dropdown to Select Speaker */}
            <div className="relative mb-4 shrink-0">
              <label className="text-[9px] uppercase font-bold tracking-wider text-zinc-550 mb-1.5 block">
                Chọn nhân vật để cấu hình giọng nói
              </label>

              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full flex items-center justify-between bg-zinc-950 border border-zinc-850 hover:border-amber-cinematic/50 rounded p-2.5 transition-all text-sm font-semibold cursor-pointer text-zinc-200 focus:outline-none"
              >
                {selectedSpeaker ? (
                  <div className="flex items-center gap-2">
                    <img
                      src={`https://api.dicebear.com/7.x/bottts/svg?seed=${selectedSpeaker}`}
                      alt={selectedSpeaker}
                      className="w-7 h-7 rounded-sm bg-zinc-900 border border-zinc-800 p-0.5"
                    />
                    <span className="capitalize text-xs font-bold text-zinc-200 truncate max-w-[120px]">
                      {charactersMetadata[selectedSpeaker] ? charactersMetadata[selectedSpeaker].name : selectedSpeaker}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-zinc-500">Chưa có Speaker</span>
                )}

                <div className="flex items-center gap-1.5">
                  {selectedSpeaker && (
                    <span className={`text-[8px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded border ${lockedVoices[selectedSpeaker]
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-850'
                      }`}>
                      {lockedVoices[selectedSpeaker] ? 'Locked' : 'No Voice'}
                    </span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {/* Dropdown Options List */}
              {isDropdownOpen && (
                <>
                  {/* Backdrop to close dropdown */}
                  <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />

                  <div className="absolute left-0 right-0 mt-1.5 bg-zinc-950 border border-zinc-850 rounded-md shadow-2xl z-20 max-h-56 overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
                    {uniqueSpeakers.map(speaker => {
                      const isSelected = speaker === selectedSpeaker;
                      const isLocked = lockedVoices[speaker];
                      return (
                        <div
                          key={speaker}
                          className={`w-full flex items-center justify-between rounded p-1.5 transition-colors border ${isSelected
                            ? 'bg-amber-cinematic/10 border-amber-cinematic/30'
                            : 'hover:bg-zinc-900 border-transparent'
                            }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSpeaker(speaker);
                              setIsDropdownOpen(false);
                            }}
                            className="flex-1 flex items-center gap-2 text-left focus:outline-none cursor-pointer"
                          >
                            <img
                              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${speaker}`}
                              alt={speaker}
                              className="w-6 h-6 rounded-sm bg-zinc-900 border border-zinc-850 p-0.5"
                            />
                            <span className={`capitalize text-xs truncate max-w-[120px] ${isSelected ? 'font-bold text-amber-cinematic' : 'text-zinc-300'}`}>
                              {charactersMetadata[speaker] ? charactersMetadata[speaker].name : speaker}
                            </span>
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <span className={`text-[8px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded border ${isLocked
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-zinc-900 text-zinc-400 border-zinc-850'
                              }`}>
                              {isLocked ? 'Locked' : 'No Voice'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSpeaker(speaker);
                              }}
                              className="p-1 rounded hover:bg-rose-500/15 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Xóa/Reset cấu hình nhân vật"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Active Selected Speaker Detail Card */}
            {selectedSpeaker && !isTtsSettingsExpanded && (
              <div className="flex flex-col gap-3.5 bg-zinc-950 border border-zinc-850 rounded p-4 shadow-sm shrink-0">
                {/* Speaker config header with Preview button */}
                <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800/50">
                  <div className="flex items-center gap-2">
                    <img
                      src={`https://api.dicebear.com/7.x/bottts/svg?seed=${selectedSpeaker}`}
                      alt={selectedSpeaker}
                      className="w-7 h-7 rounded bg-zinc-900 border border-zinc-800 p-0.5"
                    />
                    <h3 className="font-semibold text-zinc-200 capitalize text-xs">
                      Thiết lập giọng của nhân vật
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {lockedVoices[selectedSpeaker] && (
                      <button
                        onClick={() => togglePlayVoiceRef(selectedSpeaker)}
                        className={`flex items-center justify-center w-6 h-6 rounded transition-all ${playingVoiceRef === selectedSpeaker
                          ? 'bg-amber-cinematic text-white shadow-[0_0_10px_rgba(249,115,22,0.5)]'
                          : 'bg-amber-cinematic/20 text-amber-cinematic hover:bg-amber-cinematic/40'
                          }`}
                        title="Nghe giọng mẫu"
                      >
                        {playingVoiceRef === selectedSpeaker
                          ? <div className="w-2 h-2 bg-current rounded-sm animate-pulse" />
                          : <Play className="w-3 h-3 fill-current ml-0.5" />}
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteSpeaker(selectedSpeaker)}
                      className="flex items-center justify-center w-6 h-6 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all cursor-pointer"
                      title="Xóa cấu hình nhân vật"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Advanced parameters selectors */}
                <div className="grid grid-cols-3 gap-1.5">
                  {/* Gender */}
                  <div>
                    <label className="text-[8px] uppercase font-bold tracking-wider text-zinc-550 mb-1 block">Giới tính</label>
                    <select
                      className="w-full bg-zinc-950 border border-zinc-850 rounded-sm px-1.5 py-1 text-[11px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-amber-cinematic/30"
                      value={speakerVoiceParams[selectedSpeaker]?.gender || 'male'}
                      onChange={(e) => setSpeakerVoiceParams(prev => ({ ...prev, [selectedSpeaker]: { ...(prev[selectedSpeaker] || { age: 'middle-aged', pitch: 'low pitch' }), gender: e.target.value } }))}
                    >
                      <option value="male"> Nam</option>
                      <option value="female"> Nữ</option>
                    </select>
                  </div>
                  {/* Age */}
                  <div>
                    <label className="text-[8px] uppercase font-bold tracking-wider text-zinc-550 mb-1 block">Độ tuổi</label>
                    <select
                      className="w-full bg-zinc-950 border border-zinc-850 rounded-sm px-1.5 py-1 text-[11px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-amber-cinematic/30"
                      value={speakerVoiceParams[selectedSpeaker]?.age || 'middle-aged'}
                      onChange={(e) => setSpeakerVoiceParams(prev => ({ ...prev, [selectedSpeaker]: { ...(prev[selectedSpeaker] || { gender: 'male', pitch: 'low pitch' }), age: e.target.value } }))}
                    >
                      <option value="child">Trẻ em</option>
                      <option value="teenager">Thiếu niên</option>
                      <option value="young adult">Thanh niên</option>
                      <option value="middle-aged">Trung niên</option>
                      <option value="elderly">Cao tuổi</option>
                    </select>
                  </div>
                  {/* Pitch */}
                  <div>
                    <label className="text-[8px] uppercase font-bold tracking-wider text-zinc-550 mb-1 block">Tone giọng</label>
                    <select
                      className="w-full bg-zinc-950 border border-zinc-850 rounded-sm px-1.5 py-1 text-[11px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-amber-cinematic/30"
                      value={speakerVoiceParams[selectedSpeaker]?.pitch || 'low pitch'}
                      onChange={(e) => setSpeakerVoiceParams(prev => ({ ...prev, [selectedSpeaker]: { ...(prev[selectedSpeaker] || { gender: 'male', age: 'middle-aged' }), pitch: e.target.value } }))}
                    >
                      <option value="very high pitch">Rất cao</option>
                      <option value="high pitch">Cao</option>
                      <option value="moderate pitch">Vừa</option>
                      <option value="low pitch">Trầm</option>
                      <option value="very low pitch">Rất trầm</option>
                    </select>
                  </div>
                </div>

                {/* Upload & Delete Actions */}
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => handleUploadVoiceClick(selectedSpeaker)}
                    className="flex-1 flex justify-center items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold bg-zinc-900 hover:bg-zinc-850 text-zinc-300 rounded transition-colors border border-zinc-800 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-cinematic" />
                    Đổi Giọng Mẫu
                  </button>
                  <button
                    onClick={() => handleDeleteSpeaker(selectedSpeaker)}
                    className="flex-1 flex justify-center items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 rounded transition-colors border border-rose-500/20 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Xóa Nhân Vật
                  </button>
                </div>

                {/* Lock/Synthetic voice generation action */}
                <button
                  onClick={() => createSyntheticVoice(selectedSpeaker)}
                  disabled={isCreatingSynthetic === selectedSpeaker}
                  className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded transition-colors border disabled:opacity-50 ${lockedVoices[selectedSpeaker]
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-cinematic/10 hover:bg-amber-cinematic/20 text-amber-cinematic border-amber-cinematic/20'
                    }`}
                >
                  {isCreatingSynthetic === selectedSpeaker ? <Loader2 className="w-3 h-3 animate-spin" /> : (lockedVoices[selectedSpeaker] ? '↻' : '+')}
                  {lockedVoices[selectedSpeaker] ? 'Tạo Lại (Re-Lock)' : 'Tạo Diễn Viên Ảo (Lock Voice)'}
                </button>
              </div>
            )}
            {!selectedSpeaker && !isTtsSettingsExpanded && (
              <div className="flex-1 flex items-center justify-center bg-zinc-950 border border-zinc-850 rounded p-6 text-center text-xs text-zinc-550">
                Không tìm thấy nhân vật nào trong kịch bản.
              </div>
            )}

            {/* ── TTS Engine Settings ─────────────────────────────────────────── */}
            <div className="mt-4 border-t border-zinc-850 pt-4">
              <button
                type="button"
                onClick={() => setIsTtsSettingsExpanded(!isTtsSettingsExpanded)}
                className="w-full flex items-center justify-between text-left text-xs font-semibold text-zinc-300 hover:text-amber-cinematic transition-colors py-1.5 focus:outline-none cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-zinc-400">🎛️</span>
                  <span>Cấu Hình TTS Nâng Cao</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-zinc-550 transition-transform duration-200 ${isTtsSettingsExpanded ? 'rotate-180 text-amber-cinematic' : ''}`} />
              </button>

              {isTtsSettingsExpanded && (
                <div className="mt-3 space-y-4 bg-zinc-950 border border-zinc-850 rounded-md p-3.5 shadow-inner transition-all duration-300">
                  {/* Denoise Switch */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-zinc-200">Khử Nhiễu (Denoise)</div>
                      <div className="text-[10px] text-zinc-550">Giảm tạp âm nền trong giọng đọc</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTtsDenoise(!ttsDenoise)}
                      className={`w-9 h-5 rounded p-0.5 transition-colors duration-250 focus:outline-none cursor-pointer ${ttsDenoise ? 'bg-amber-cinematic/20 border border-amber-cinematic/40' : 'bg-zinc-900 border border-zinc-800'
                        }`}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded-sm bg-zinc-300 transition-transform duration-250 ${ttsDenoise ? 'translate-x-4 bg-amber-cinematic' : 'translate-x-0'
                          }`}
                      />
                    </button>
                  </div>

                  {/* Post-process Switch */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-zinc-200">Hậu Xử Lý (Post-Process)</div>
                      <div className="text-[10px] text-zinc-550">Tối ưu hóa âm tần đầu ra</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTtsPostprocess(!ttsPostprocess)}
                      className={`w-9 h-5 rounded p-0.5 transition-colors duration-250 focus:outline-none cursor-pointer ${ttsPostprocess ? 'bg-amber-cinematic/20 border border-amber-cinematic/40' : 'bg-zinc-900 border border-zinc-800'
                        }`}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded-sm bg-zinc-300 transition-transform duration-250 ${ttsPostprocess ? 'translate-x-4 bg-amber-cinematic' : 'translate-x-0'
                          }`}
                      />
                    </button>
                  </div>

                  {/* Decoding Steps (num_step) */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-zinc-200">Số Bước Giải Mã (Steps)</label>
                      <span className="text-xs font-bold text-amber-cinematic bg-amber-cinematic/10 px-1.5 py-0.5 rounded border border-amber-cinematic/20 font-mono">{ttsNumStep}</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="64"
                      step="1"
                      className="w-full h-1 bg-zinc-900 rounded-sm appearance-none cursor-pointer accent-amber-cinematic"
                      value={ttsNumStep}
                      onChange={(e) => setTtsNumStep(parseInt(e.target.value))}
                    />
                    <div className="flex justify-between text-[8px] text-zinc-650 font-bold uppercase tracking-wider">
                      <span>10 (Nhanh)</span>
                      <span>64 (Chất Lượng)</span>
                    </div>
                  </div>

                  {/* Emotion/Guidance Scale */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-zinc-200">Cường Độ Cảm Xúc (CFG)</label>
                      <span className="text-xs font-bold text-amber-cinematic bg-amber-cinematic/10 px-1.5 py-0.5 rounded border border-amber-cinematic/20 font-mono">{ttsGuidanceScale.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="5.0"
                      step="0.1"
                      className="w-full h-1 bg-zinc-900 rounded-sm appearance-none cursor-pointer accent-amber-cinematic"
                      value={ttsGuidanceScale}
                      onChange={(e) => setTtsGuidanceScale(parseFloat(e.target.value))}
                    />
                    <div className="flex justify-between text-[8px] text-zinc-650 font-bold uppercase tracking-wider">
                      <span>1.0 (Tự Nhiên)</span>
                      <span>5.0 (Cường Điệu)</span>
                    </div>
                  </div>

                  {/* Global Speed (Tốc Độ Giọng Đọc) */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-zinc-200">Tốc Độ Giọng Đọc (Speed)</label>
                      <span className="text-xs font-bold text-amber-cinematic bg-amber-cinematic/10 px-1.5 py-0.5 rounded border border-amber-cinematic/20 font-mono">{ttsSpeed.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      className="w-full h-1 bg-zinc-900 rounded-sm appearance-none cursor-pointer accent-amber-cinematic"
                      value={ttsSpeed}
                      onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
                    />
                    <div className="flex justify-between text-[8px] text-zinc-650 font-bold uppercase tracking-wider">
                      <span>0.5x (Chậm)</span>
                      <span>2.0x (Nhanh)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <input
        type="file"
        accept="audio/wav, audio/mpeg, audio/mp3"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />
    </main>
  );
}
