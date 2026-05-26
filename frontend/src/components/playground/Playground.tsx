// ==========================================================================
// components/playground/Playground.tsx
// OmniVoice Sandbox Playground: Rich split-screen testing environment
// allows tweaking all 10+ advanced voice inference settings in isolation.
// ==========================================================================
import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, Wand2, Loader2, Upload, Download, Trash2, 
  ChevronDown, ChevronUp, Play, Pause, 
  SlidersHorizontal, Globe, FastForward, 
  Hourglass, FileText, Mic, UserCheck, X
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { API } from '../../config';
import { useProjectStore } from '../../store/useProjectStore';

interface SandboxRun {
  id: string;
  filename: string;
  text: string;
  mode: 'instruct' | 'clone';
  language: string;
  instruct?: string;
  ref_audio?: string;
  ref_text?: string;
  speed: number;
  duration_limit?: number;
  audio_duration: number;
  num_step: number;
  guidance_scale: number;
  denoise: boolean;
  postprocess_output: boolean;
  generation_time: number;
  timestamp: number;
}

export default function Playground() {
  // Zustand States
  const script = useProjectStore(s => s.script);
  const speakerVoiceParams = useProjectStore(s => s.speakerVoiceParams);
  const currentProjectId = useProjectStore(s => s.currentProjectId);
  const charactersMetadata = useProjectStore(s => s.charactersMetadata);

  // Unique speakers computation
  const uniqueSpeakersFromScript = Array.from(new Set(script.map(l => l.speaker.toLowerCase())));
  const uniqueSpeakers = Array.from(new Set([...uniqueSpeakersFromScript, ...Object.keys(speakerVoiceParams)]));

  // Apply voice modal states
  const [selectedApplyRun, setSelectedApplyRun] = useState<SandboxRun | null>(null);
  const [targetSpeaker, setTargetSpeaker] = useState<string>('');
  const [syncMode, setSyncMode] = useState<'clone' | 'params'>('clone');
  const [isApplying, setIsApplying] = useState(false);

  // Dynamic split panel resizing state
  const [leftWidth, setLeftWidth] = useState(50); // Mặc định chia 50-50
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const containerRef = useRef<HTMLDivElement>(null);

  // Monitor screen size for responsive layouts
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle global mousemove and mouseup events for dragging
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidthPx = e.clientX - containerRect.left;
      const newWidthPct = (newWidthPx / containerRect.width) * 100;
      
      // Constrain between 30% and 70% as requested by the user
      const boundedPct = Math.max(30, Math.min(70, newWidthPct));
      setLeftWidth(boundedPct);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Adjust cursor style globally during resizing
  useEffect(() => {
    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  useEffect(() => {
    if (selectedApplyRun && uniqueSpeakers.length > 0 && !targetSpeaker) {
      setTargetSpeaker(uniqueSpeakers[0]);
    }
  }, [selectedApplyRun, uniqueSpeakers, targetSpeaker]);

  const handleOpenApplyModal = (run: SandboxRun) => {
    setSelectedApplyRun(run);
    setSyncMode(run.mode === 'instruct' ? 'params' : 'clone');
    if (uniqueSpeakers.length > 0) {
      setTargetSpeaker(uniqueSpeakers[0]);
    }
  };

  const handleConfirmApply = async () => {
    if (!selectedApplyRun || !targetSpeaker) return;
    setIsApplying(true);

    try {
      const res = await axios.post<{ status: string }>(API.playgroundApplyToSpeaker, {
        entry_id: selectedApplyRun.id,
        speaker: targetSpeaker,
        project_id: currentProjectId,
        mode: syncMode
      });

      if (res.data.status === 'success') {
        const speakerId = targetSpeaker.toLowerCase();
        if (syncMode === 'clone') {
          useProjectStore.getState().setLockedVoices(prev => ({
            ...prev,
            [speakerId]: true
          }));
          toast.success(`Đã áp dụng và KHOÁ GIỌNG MẪU cho nhân vật ${targetSpeaker.toUpperCase()} thành công!`);
        } else {
          let gender = 'female';
          let age = 'middle-aged';
          let pitch = 'moderate pitch';

          const parts = (selectedApplyRun.instruct || '').split(',').map(p => p.trim().toLowerCase());
          for (const p of parts) {
            if (p === 'male' || p === 'female') {
              gender = p;
            } else if (['child', 'teenager', 'young adult', 'middle-aged', 'elderly'].includes(p)) {
              age = p;
            } else if (p.includes('pitch')) {
              pitch = p;
            }
          }

          useProjectStore.getState().setSpeakerVoiceParams(prev => ({
            ...prev,
            [speakerId]: { gender, age, pitch }
          }));
          useProjectStore.getState().setLockedVoices(prev => ({
            ...prev,
            [speakerId]: false
          }));
          toast.success(`Đã đồng bộ THAM SỐ CẤU HÌNH (${gender}, ${age}, ${pitch}) cho nhân vật ${targetSpeaker.toUpperCase()} thành công!`);
        }
        setSelectedApplyRun(null);
      } else {
        toast.error('Lỗi không xác định khi áp dụng giọng nói.');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Lỗi khi áp dụng giọng nói cho nhân vật.');
    } finally {
      setIsApplying(false);
    }
  };

  // Input fields
  const [text, setText] = useState('Tiếng gầm thét của "Lõi Ý thức" không giống với bất kỳ âm thanh cơ khí nào.');
  const [mode, setMode] = useState<'instruct' | 'clone'>('instruct');
  
  // Instruct Mode config
  const [instruct, setInstruct] = useState('female, moderate pitch, young adult');
  
  // Individual voice builder states
  const [instructGender, setInstructGender] = useState<'male' | 'female' | ''>('female');
  const [instructAge, setInstructAge] = useState<'child' | 'teenager' | 'young adult' | 'middle-aged' | 'elderly' | ''>('young adult');
  const [instructPitch, setInstructPitch] = useState<'very low pitch' | 'low pitch' | 'moderate pitch' | 'high pitch' | 'very high pitch' | ''>('moderate pitch');
  const [instructStyle, setInstructStyle] = useState<'whisper' | ''>('');
  const [instructAccent, setInstructAccent] = useState<string>('');

  // Clone Mode config (Optimized for Vietnamese: reference audio and phrase start empty)
  const [refAudioFilename, setRefAudioFilename] = useState<string>(''); 
  const [refText, setRefText] = useState('');
  const [isUploadingRef, setIsUploadingRef] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Advanced parameters
  const [language, setLanguage] = useState('Vietnamese');
  const [speed, setSpeed] = useState<number | ''>(''); // default to empty (standard model default)
  const [durationLimit, setDurationLimit] = useState<number | ''>(''); // default to empty (standard model default)
  const [numStep, setNumStep] = useState<number>(32);
  const [guidanceScale, setGuidanceScale] = useState<number>(2.0);
  const [denoise, setDenoise] = useState(true);
  const [postprocessOutput, setPostprocessOutput] = useState(true);

  // UI state
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState<SandboxRun[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // Audio playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  // Quick prompt expressions
  const expressionTags = [
    { label: '[sigh] 😔', value: '[sigh]' },
    { label: '[laughter] 😂', value: '[laughter]' },
    { label: '[gasp] 😲', value: '[gasp]' },
    { label: '[whisper] 🤫', value: '[whisper]' },
    { label: '[dissatisfaction-hnn] 😡', value: '[dissatisfaction-hnn]' },
    { label: '[surprise-oh] 😲', value: '[surprise-oh]' },
  ];

  // Presets for instruct descriptions
  const instructPresets = [
    { name: 'Thì Thầm Sâu Lắng 🤫', desc: 'female, whisper', tag: '[whisper]', descLabel: 'female, whisper + [whisper]' },
    { name: 'Buồn Bã Trầm Tư 😢', desc: 'female, low pitch, middle-aged', tag: '[sigh]', descLabel: 'female, low pitch, middle-aged + [sigh]' },
    { name: 'Giận Dữ Căng Thẳng 😡', desc: 'male, high pitch, young adult', tag: '[dissatisfaction-hnn]', descLabel: 'male, high pitch, young adult + [dissatisfaction-hnn]' },
    { name: 'Hân Hoan Ấm Áp 🥰', desc: 'female, high pitch, young adult', tag: '[laughter]', descLabel: 'female, high pitch, young adult + [laughter]' },
    { name: 'Kịch Tính Đe Dọa 🎭', desc: 'male, low pitch, elderly', tag: '[surprise-oh]', descLabel: 'male, low pitch, elderly + [surprise-oh]' },
  ];

  // Auto-compile individual voice states into the main instruct string
  useEffect(() => {
    const parts: string[] = [];
    if (instructGender) parts.push(instructGender);
    if (instructAge) parts.push(instructAge);
    if (instructPitch) parts.push(instructPitch);
    if (instructStyle) parts.push(instructStyle);
    if (instructAccent) parts.push(instructAccent);
    
    setInstruct(parts.join(', '));
  }, [instructGender, instructAge, instructPitch, instructStyle, instructAccent]);

  // Apply preset with emotion tag injection & voice parameters
  const applyPreset = (preset: { name: string, desc: string, tag?: string }) => {
    // 1. Tag injection in text area
    if (preset.tag) {
      setText(prev => {
        // If text already starts with a tag like [sigh] or [whisper], replace it; otherwise prepend it
        const matchTag = prev.match(/^\[.*?\]\s*/);
        if (matchTag) {
          return prev.replace(/^\[.*?\]\s*/, preset.tag + ' ');
        }
        return preset.tag + ' ' + prev;
      });
      toast.success(`Đã chọn preset: cấu hình instruct chuẩn và tự động chèn tag biểu cảm ${preset.tag}!`);
    } else {
      toast.success('Đã cấu hình giọng đọc thành công.');
    }

    // 2. Parse descriptor parts to synchronize build selectors
    const parts = preset.desc.split(', ');
    
    const hasGender = parts.find(p => p === 'male' || p === 'female');
    setInstructGender((hasGender as any) || '');
    
    const hasAge = parts.find(p => ['child', 'teenager', 'young adult', 'middle-aged', 'elderly'].includes(p));
    setInstructAge((hasAge as any) || '');
    
    const hasPitch = parts.find(p => p.includes('pitch'));
    setInstructPitch((hasPitch as any) || '');
    
    const hasStyle = parts.find(p => p === 'whisper');
    setInstructStyle((hasStyle as any) || '');
    
    const hasAccent = parts.find(p => p.includes('accent'));
    setInstructAccent(hasAccent || '');

    setInstruct(preset.desc);
  };

  // Load history on mount
  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await axios.get<SandboxRun[]>(API.playgroundHistory);
      setHistory(res.data);
    } catch (e) {
      console.error('[Playground] Lỗi tải lịch sử:', e);
      toast.error('Không thể kết nối API Playground.');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Add tag to the text area
  const insertTag = (tag: string) => {
    setText(prev => prev + ' ' + tag + ' ');
  };

  // Handle uploading custom reference voice
  const handleUploadRefFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.wav')) {
      toast.error('Vui lòng chọn file âm thanh định dạng .wav');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    
    setIsUploadingRef(true);
    try {
      const res = await axios.post<{ filename: string, path: string }>(
        API.playgroundUploadRef, 
        formData, 
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setRefAudioFilename(res.data.filename);
      toast.success(`Đã tải file ref: ${file.name}`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Lỗi khi tải file tham chiếu lên.');
    } finally {
      setIsUploadingRef(false);
    }
  };

  // Trigger main voice generation
  const handleGenerate = async () => {
    if (!text.trim()) {
      toast.error('Vui lòng nhập văn bản đích.');
      return;
    }

    if (mode === 'clone' && !refAudioFilename) {
      toast.error('Vui lòng chọn hoặc tải lên một file .wav để nhân bản giọng.');
      return;
    }

    setIsGenerating(true);
    
    // Construct playground API request payload
    const payload = {
      text: text.trim(),
      mode,
      language: language === 'Auto' ? null : language,
      instruct: mode === 'instruct' ? instruct.trim() : null,
      ref_audio_filename: mode === 'clone' ? refAudioFilename : null,
      ref_text: mode === 'clone' ? refText.trim() : null,
      speed: speed === '' ? null : Number(speed),
      duration: durationLimit === '' ? null : Number(durationLimit),
      num_step: numStep,
      guidance_scale: guidanceScale,
      denoise,
      postprocess_output: postprocessOutput
    };

    try {
      toast.loading('AI đang suy luận giọng nói...', { id: 'play-gen' });
      const res = await axios.post<SandboxRun>(API.playgroundGenerate, payload);
      toast.success('Đã sinh giọng nói thành công!', { id: 'play-gen' });
      
      // Prepend to history
      setHistory(prev => [res.data, ...prev]);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Lỗi suy luận OmniVoice.';
      toast.error(msg, { id: 'play-gen' });
    } finally {
      setIsGenerating(false);
    }
  };

  // Delete a sandbox history run
  const handleDelete = async (id: string) => {
    try {
      await axios.delete(API.playgroundDelete(id));
      setHistory(prev => prev.filter(h => h.id !== id));
      toast.success('Đã xóa bản ghi.');
      if (playingId === id) {
        setPlayingId(null);
      }
    } catch (e) {
      toast.error('Lỗi khi xóa bản ghi.');
    }
  };

  // Clear all playground files and records
  const handleClearAll = async () => {
    if (!window.confirm('Bạn có chắc muốn dọn sạch toàn bộ Sandbox? Tất cả file âm thanh tạm và lịch sử thử nghiệm sẽ bị xóa vĩnh viễn.')) {
      return;
    }
    try {
      await axios.delete(API.playgroundClear);
      setHistory([]);
      setPlayingId(null);
      toast.success('Đã dọn sạch Sandbox Playground thành công.');
    } catch (e) {
      toast.error('Lỗi khi dọn dẹp Sandbox.');
    }
  };

  // Dynamic Audio player actions
  const togglePlayAudio = (id: string) => {
    const audio = audioRefs.current[id];
    if (!audio) return;

    if (playingId === id) {
      audio.pause();
      setPlayingId(null);
    } else {
      // Pause active
      if (playingId && audioRefs.current[playingId]) {
        audioRefs.current[playingId].pause();
      }
      audio.play();
      setPlayingId(id);
    }
  };

  const handleAudioEnded = (id: string) => {
    if (playingId === id) {
      setPlayingId(null);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-obsidian-dark">
      {/* 2-column workspace with dynamic flex layouts and interactive drag handle */}
      <div 
        ref={containerRef}
        className="flex-1 flex flex-col md:flex-row h-full overflow-hidden"
      >
        {/* LEFT COLUMN: Designer & Controls */}
        <div 
          style={{ width: isDesktop ? `${leftWidth}%` : '100%' }}
          className="flex flex-col border-r border-zinc-800/60 bg-zinc-950/20 h-full overflow-hidden shrink-0"
        >
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-zinc-800">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-cinematic">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-wide">OmniVoice AI Sandbox</h2>
                <p className="text-xs text-slate-400">Thử nghiệm toàn diện, độc lập & tinh chỉnh 10+ tham số giọng đọc của OmniVoice</p>
              </div>
            </div>

            {/* Text input editor */}
            <div className="bg-slate-900/60 rounded-md border border-slate-850 p-4 mb-6">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Văn Bản Đích (Target Text)</label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                className="w-full h-32 bg-slate-950/75 text-slate-100 rounded-sm p-3 border border-slate-800 focus:border-amber-cinematic focus:outline-none text-sm placeholder-slate-600 resize-none font-sans"
                placeholder="Nhập đoạn văn bản muốn AI đọc..."
              />
              {/* Quick expression badges */}
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-800/40">
                <span className="text-[10px] font-mono text-slate-500 mr-1">Chèn nhanh biểu cảm:</span>
                {expressionTags.map(tag => (
                  <button
                    key={tag.value}
                    onClick={() => insertTag(tag.value)}
                    className="px-2.5 py-1 text-xs rounded-sm bg-slate-800 text-slate-300 border border-slate-700/60 hover:bg-amber-cinematic hover:text-slate-955 hover:border-amber-cinematic transition-all font-medium active:scale-95"
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Inference Mode selector tab */}
            <div className="flex space-x-1 rounded-md bg-slate-950/80 p-1 border border-slate-855 mb-6 w-full">
              <button
                onClick={() => setMode('instruct')}
                className={`flex-1 py-2 text-sm font-semibold rounded transition-all duration-200 flex items-center justify-center gap-2 ${
                  mode === 'instruct'
                    ? 'bg-amber-cinematic text-slate-955 shadow-lg shadow-amber-cinematic/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Wand2 className="w-4 h-4" /> Instruct Mode
              </button>
              <button
                onClick={() => setMode('clone')}
                className={`flex-1 py-2 text-sm font-semibold rounded transition-all duration-200 flex items-center justify-center gap-2 ${
                  mode === 'clone'
                    ? 'bg-amber-cinematic text-slate-955 shadow-lg shadow-amber-cinematic/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <FastForward className="w-4 h-4" /> Voice Cloning Mode
              </button>
            </div>

            {/* Mode configuration inputs */}
            {mode === 'instruct' ? (
              <div className="bg-slate-900/60 rounded-md border border-slate-850 p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mô Tả Phong Cách (Inference Instruct)</label>
                  <span className="text-[10px] text-emerald-400 font-mono font-semibold">Tự động chuẩn hóa</span>
                </div>
                <input
                  type="text"
                  value={instruct}
                  onChange={e => setInstruct(e.target.value)}
                  className="w-full bg-slate-950 text-slate-100 rounded-sm px-3 py-2 text-sm border border-slate-800 focus:border-amber-cinematic focus:outline-none placeholder-slate-600 font-mono text-xs"
                  placeholder="Chuỗi instruct sẽ tự động biên dịch ở đây..."
                />
                
                {/* Visual Voice Builder */}
                <div className="mt-4 pt-4 border-t border-slate-800/60">
                  <span className="block text-[10px] font-mono text-slate-500 mb-3 uppercase tracking-wider font-semibold">Bộ Thiết Kế Giọng Đọc Trực Quan (Voice Designer):</span>
                  
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {/* Gender Selector */}
                    <div>
                      <label className="block text-[9px] font-semibold text-slate-400 mb-1 uppercase tracking-wide">Giới tính</label>
                      <select
                        value={instructGender}
                        onChange={e => setInstructGender(e.target.value as any)}
                        className="w-full bg-slate-950 text-slate-200 rounded-sm px-2.5 py-1.5 text-xs border border-slate-800 focus:outline-none focus:border-amber-cinematic"
                      >
                        <option value="female">Nữ (Female)</option>
                        <option value="male">Nam (Male)</option>
                        <option value="">Không chỉ định</option>
                      </select>
                    </div>

                    {/* Age Selector */}
                    <div>
                      <label className="block text-[9px] font-semibold text-slate-400 mb-1 uppercase tracking-wide">Độ tuổi</label>
                      <select
                        value={instructAge}
                        onChange={e => setInstructAge(e.target.value as any)}
                        className="w-full bg-slate-950 text-slate-200 rounded-sm px-2.5 py-1.5 text-xs border border-slate-800 focus:outline-none focus:border-amber-cinematic"
                      >
                        <option value="young adult">Thanh niên (Young adult)</option>
                        <option value="child">Trẻ em (Child)</option>
                        <option value="teenager">Thiếu niên (Teenager)</option>
                        <option value="middle-aged">Trung niên (Middle-aged)</option>
                        <option value="elderly">Người già (Elderly)</option>
                        <option value="">Không chỉ định</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {/* Pitch Selector */}
                    <div>
                      <label className="block text-[9px] font-semibold text-slate-400 mb-1 uppercase tracking-wide">Tông giọng</label>
                      <select
                        value={instructPitch}
                        onChange={e => setInstructPitch(e.target.value as any)}
                        className="w-full bg-slate-950 text-slate-200 rounded-sm px-2.5 py-1.5 text-xs border border-slate-800 focus:outline-none focus:border-amber-cinematic"
                      >
                        <option value="moderate pitch">Trung bình (Moderate)</option>
                        <option value="very low pitch">Rất trầm (Very low)</option>
                        <option value="low pitch">Trầm (Low)</option>
                        <option value="high pitch">Cao (High)</option>
                        <option value="very high pitch">Rất cao (Very high)</option>
                        <option value="">Không chỉ định</option>
                      </select>
                    </div>

                    {/* Style/Whisper */}
                    <div>
                      <label className="block text-[9px] font-semibold text-slate-400 mb-1 uppercase tracking-wide">Kiểu phát âm</label>
                      <select
                        value={instructStyle}
                        onChange={e => setInstructStyle(e.target.value as any)}
                        className="w-full bg-slate-950 text-slate-200 rounded-sm px-2.5 py-1.5 text-xs border border-slate-800 focus:outline-none focus:border-amber-cinematic"
                      >
                        <option value="">Bình thường</option>
                        <option value="whisper">Thì thầm (Whisper)</option>
                      </select>
                    </div>
                  </div>

                  {/* Accent Selector */}
                  <div className="mb-2">
                    <label className="block text-[9px] font-semibold text-slate-400 mb-1 uppercase tracking-wide">Phát Âm / Giọng điệu (Accent)</label>
                    <select
                      value={instructAccent}
                      onChange={e => setInstructAccent(e.target.value)}
                      className="w-full bg-slate-950 text-slate-200 rounded-sm px-2.5 py-1.5 text-xs border border-slate-800 focus:outline-none focus:border-amber-cinematic"
                    >
                      <option value="">Mặc định (Default Accent)</option>
                      <option value="american accent">Giọng Mỹ (American Accent)</option>
                      <option value="british accent">Giọng Anh (British Accent)</option>
                      <option value="australian accent">Giọng Úc (Australian Accent)</option>
                      <option value="canadian accent">Giọng Canada (Canadian Accent)</option>
                      <option value="indian accent">Giọng Ấn Độ (Indian Accent)</option>
                      <option value="japanese accent">Giọng Nhật Bản (Japanese Accent)</option>
                      <option value="korean accent">Giọng Hàn Quốc (Korean Accent)</option>
                      <option value="russian accent">Giọng Nga (Russian Accent)</option>
                      <option value="portuguese accent">Giọng Bồ Đào Nha (Portuguese Accent)</option>
                      <option value="chinese accent">Giọng Trung Quốc (Chinese Accent)</option>
                    </select>
                  </div>
                </div>

                {/* Preset buttons */}
                <div className="mt-4 pt-4 border-t border-slate-850">
                  <span className="block text-[10px] font-mono text-slate-500 mb-2 uppercase tracking-wide font-semibold">Mẫu cảm xúc ăn liền (Combo Presets):</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {instructPresets.map(preset => (
                      <button
                        key={preset.name}
                        onClick={() => applyPreset(preset)}
                        className="px-3 py-2 text-xs text-left rounded-sm bg-slate-950/45 border border-slate-800 hover:border-amber-cinematic/50 hover:bg-slate-850 text-slate-300 transition-all group"
                        title={preset.descLabel}
                      >
                        <div className="font-semibold text-slate-200 group-hover:text-amber-cinematic transition-colors">{preset.name}</div>
                        <div className="text-[10px] text-slate-500 truncate mt-0.5 font-mono">{preset.descLabel}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/60 rounded-md border border-slate-850 p-4 mb-6">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Giọng Nói Tham Chiếu (Reference Audio File)</label>
                
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <select
                        value={refAudioFilename}
                        onChange={e => setRefAudioFilename(e.target.value)}
                        className="w-full bg-slate-950 text-slate-200 rounded-sm px-3 py-2 text-sm border border-slate-800 focus:outline-none focus:border-amber-cinematic"
                      >
                        <option value="">-- Chưa nạp file giọng mẫu --</option>
                        {refAudioFilename && (
                          <option value={refAudioFilename}>{refAudioFilename}</option>
                        )}
                      </select>
                    </div>
                    
                    {/* File Upload action */}
                    <div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleUploadRefFile}
                        accept=".wav"
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingRef}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700 disabled:opacity-50"
                      >
                        {isUploadingRef ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        Tải file .wav
                      </button>
                    </div>
                  </div>

                  {/* Reference Text input */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Transcript of Reference Audio (ref_text)</label>
                      <span className="text-[10px] text-slate-500 font-mono">Giúp giọng clone khớp từ ngữ chính xác</span>
                    </div>
                    <input
                      type="text"
                      value={refText}
                      onChange={e => setRefText(e.target.value)}
                      className="w-full bg-slate-950 text-slate-200 rounded-sm px-3 py-2 text-sm border border-slate-800 focus:outline-none focus:border-amber-cinematic placeholder-slate-750"
                      placeholder="Nhập câu phiên âm của file audio mẫu (không bắt buộc)..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Collapsible Advanced Parameters */}
            <div className="bg-slate-900/60 rounded-md border border-slate-850 mb-6 overflow-hidden">
              <button
                onClick={() => setIsAdvancedOpen(o => !o)}
                className="w-full px-4 py-3 flex items-center justify-between bg-slate-900/40 border-b border-slate-850 hover:bg-slate-850/30 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <SlidersHorizontal className="w-4 h-4 text-amber-cinematic" />
                  Tham Số Suy Luận Nâng Cao (Advanced Parameters)
                </div>
                {isAdvancedOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {isAdvancedOpen && (
                <div className="p-4 space-y-5">
                  {/* Line 1: Language, Speed, Duration limit */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Language Selector */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-slate-500" /> Language
                      </label>
                      <select
                        value={language}
                        onChange={e => setLanguage(e.target.value)}
                        className="w-full bg-slate-950 text-slate-200 rounded-sm px-2.5 py-1.5 text-xs border border-slate-800 focus:outline-none focus:border-amber-cinematic"
                      >
                        <option value="Auto">Auto-detect</option>
                        <option value="English">English</option>
                        <option value="Chinese">Chinese (zh)</option>
                        <option value="Japanese">Japanese (ja)</option>
                        <option value="Korean">Korean (ko)</option>
                      </select>
                    </div>

                    {/* Speed Modifier */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                          <FastForward className="w-3.5 h-3.5 text-slate-500" /> Speed (Tốc độ)
                        </label>
                        <span className="text-[10px] text-amber-cinematic font-mono font-bold">
                          {speed === '' ? 'Default' : `${speed}x`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0.5"
                          max="2.0"
                          step="0.1"
                          value={speed === '' ? 1.0 : speed}
                          onChange={e => setSpeed(Number(e.target.value))}
                          className="flex-1 accent-amber-cinematic bg-slate-950 h-1.5 rounded-sm appearance-none cursor-pointer"
                        />
                        <button
                          onClick={() => setSpeed('')}
                          className="px-1.5 py-0.5 rounded-sm bg-slate-800 text-[10px] text-slate-400 hover:text-white"
                          title="Khôi phục mặc định"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    {/* Duration Hard Limit */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                          <Hourglass className="w-3.5 h-3.5 text-slate-500" /> Duration (Thời lượng)
                        </label>
                        <span className="text-[10px] text-amber-cinematic font-mono font-bold">
                          {durationLimit === '' ? 'Auto' : `${durationLimit}s`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="1"
                          max="25"
                          step="0.5"
                          value={durationLimit === '' ? 5.0 : durationLimit}
                          onChange={e => setDurationLimit(Number(e.target.value))}
                          className="flex-1 accent-amber-cinematic bg-slate-950 h-1.5 rounded-sm appearance-none cursor-pointer"
                        />
                        <button
                          onClick={() => setDurationLimit('')}
                          className="px-1.5 py-0.5 rounded-sm bg-slate-800 text-[10px] text-slate-400 hover:text-white"
                          title="Khôi phục mặc định"
                        >
                          Auto
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Line 2: Decoding steps, Guidance scale */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-800/40">
                    {/* Decoding steps Slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                          Decoding Steps (num_step)
                        </label>
                        <span className="text-xs text-slate-300 font-mono font-bold bg-slate-950 px-2 py-0.5 rounded-sm border border-slate-800">
                          {numStep}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="64"
                        step="1"
                        value={numStep}
                        onChange={e => setNumStep(Number(e.target.value))}
                        className="w-full accent-amber-cinematic bg-slate-950 h-2 rounded-sm appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-mono">
                        <span>10 (Nhanh, Nháp)</span>
                        <span>32 (Chuẩn)</span>
                        <span>64 (Cao cấp)</span>
                      </div>
                    </div>

                    {/* Guidance Scale Slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                          Guidance Scale (CFG)
                        </label>
                        <span className="text-xs text-slate-300 font-mono font-bold bg-slate-950 px-2 py-0.5 rounded-sm border border-slate-800">
                          {guidanceScale.toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="5.0"
                        step="0.2"
                        value={guidanceScale}
                        onChange={e => setGuidanceScale(Number(e.target.value))}
                        className="w-full accent-amber-cinematic bg-slate-950 h-2 rounded-sm appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-mono">
                        <span>1.0 (Linh hoạt)</span>
                        <span>2.0 (Cân bằng)</span>
                        <span>5.0 (Bám sát mô tả)</span>
                      </div>
                    </div>
                  </div>

                  {/* Line 3: Toggles for Denoise & Postprocess */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-800/40">
                    <label className="flex items-center justify-between p-3 rounded-md bg-slate-950/40 border border-slate-850 cursor-pointer select-none">
                      <div>
                        <div className="text-xs font-semibold text-slate-200">Khử Nhiễu Tự Động (Denoise)</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Giảm nhiễu nền khi sinh âm thanh</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={denoise}
                        onChange={e => setDenoise(e.target.checked)}
                        className="rounded-sm border-slate-800 text-amber-cinematic focus:ring-amber-cinematic focus:ring-offset-obsidian-dark bg-slate-900 w-4 h-4 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3 rounded-md bg-slate-950/40 border border-slate-850 cursor-pointer select-none">
                      <div>
                        <div className="text-xs font-semibold text-slate-200">Hậu Xử Lý (Post-process)</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Xóa lặng thừa, fade-in/out biên âm</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={postprocessOutput}
                        onChange={e => setPostprocessOutput(e.target.checked)}
                        className="rounded-sm border-slate-800 text-amber-cinematic focus:ring-amber-cinematic focus:ring-offset-obsidian-dark bg-slate-900 w-4 h-4 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* End of Scrollable Content Area */}

          {/* Sticky/Fixed Footer for Generate Button */}
          <div className="p-6 border-t border-zinc-800/60 bg-obsidian-dark/80 backdrop-blur-md shrink-0">
            {/* Trigger Voice Generation CTA */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || isUploadingRef}
              className="w-full flex items-center justify-center gap-3 py-3 px-6 text-sm font-semibold rounded bg-amber-cinematic hover:bg-amber-glow text-slate-955 shadow-xl shadow-amber-cinematic/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none group"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>AI đang suy luận mẫu giọng...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5 group-hover:scale-110 transition-transform text-amber-955" />
                  <span>Sinh Giọng Nói Sandbox (Generate)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* DRAG HANDLE BAR (DESKTOP ONLY) */}
        {isDesktop && (
          <div
            onMouseDown={() => setIsResizing(true)}
            className={`hidden md:flex items-center justify-center w-1 cursor-col-resize z-30 relative select-none group border-x border-zinc-900 bg-zinc-950 transition-all ${
              isResizing ? 'bg-amber-cinematic border-amber-cinematic' : 'hover:bg-amber-cinematic/40'
            }`}
            style={{
              marginLeft: '-2px',
              marginRight: '-2px',
            }}
          >
            {/* Visual premium mechanical notch */}
            <div className={`w-[2px] h-8 rounded-full transition-colors ${
              isResizing ? 'bg-black' : 'bg-zinc-800 group-hover:bg-amber-cinematic/80'
            }`} />
          </div>
        )}

        {/* RIGHT COLUMN: History & Comparison Board */}
        <div 
          style={{ width: isDesktop ? `${100 - leftWidth}%` : '100%' }}
          className="flex flex-col bg-obsidian-dark/40 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-zinc-800 shrink-0 min-w-0"
        >
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800/60">
            <div>
              <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-cinematic" />
                Bảng So Sánh & Lịch Sử Sinh
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {history.length} bản thử nghiệm trong session hiện tại
              </p>
            </div>
            {history.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 rounded hover:bg-red-500/10 transition-colors border border-red-500/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Dọn Sandbox
              </button>
            )}
          </div>

          {isLoadingHistory ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-amber-cinematic mb-2" />
              <span className="text-xs font-mono">Đang đồng bộ dữ liệu Sandbox...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-24 text-center px-4">
              <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-850 flex items-center justify-center text-slate-700 mb-4">
                <Mic className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-semibold text-slate-400">Sandbox Chưa Có Dữ Liệu</h4>
              <p className="text-xs text-slate-600 mt-1.5 max-w-xs">
                Thiết lập văn bản bên trái và nhấn Generate để nghe thử giọng nói được sinh ra tức thì.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map(run => {
                const audioUrl = API.playgroundAudio(run.filename);
                return (
                  <div 
                    key={run.id} 
                    className="p-4 rounded-md bg-slate-900 border border-slate-850 hover:border-slate-750 transition-all flex flex-col gap-3 group relative overflow-hidden"
                  >
                    {/* Mode tag indicator ribbon */}
                    <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none overflow-hidden">
                      <div className={`absolute top-[16px] right-[-24px] rotate-45 text-[8px] font-bold text-center uppercase tracking-widest w-24 py-0.5 border-b border-white/5 ${
                        run.mode === 'clone' 
                          ? 'bg-amber-600/30 text-amber-300' 
                          : 'bg-amber-cinematic/30 text-amber-cinematic'
                      }`}>
                        {run.mode}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1 pr-12">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-slate-800 text-slate-400 font-mono">
                        {new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-slate-800 text-slate-300 font-mono font-bold uppercase">
                        {run.language}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-slate-800 text-slate-400 font-mono">
                        Steps: {run.num_step}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-amber-cinematic/10 text-amber-cinematic font-mono">
                        CFG: {run.guidance_scale.toFixed(1)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-slate-800 text-slate-400 font-mono">
                        Speed: {run.speed}x
                      </span>
                      {run.denoise && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-amber-cinematic/10 text-amber-cinematic font-mono">
                          Denoise
                        </span>
                      )}
                      {run.postprocess_output && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-400 font-mono">
                          Postproc
                        </span>
                      )}
                    </div>

                    {/* Custom interactive Audio Player */}
                    <div className="flex items-center gap-3 bg-slate-950 rounded-md p-2 border border-slate-850">
                      <audio
                        ref={el => { if (el) audioRefs.current[run.id] = el; }}
                        src={audioUrl}
                        onEnded={() => handleAudioEnded(run.id)}
                        className="hidden"
                      />
                      
                      {/* Play/Pause Button */}
                      <button
                        onClick={() => togglePlayAudio(run.id)}
                        className={`w-9 h-9 rounded flex items-center justify-center shrink-0 transition-all ${
                          playingId === run.id
                            ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400'
                            : 'bg-amber-cinematic hover:bg-amber-glow text-slate-955'
                        }`}
                      >
                        {playingId === run.id ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                      </button>

                      {/* Diagnostic track progress waveform indicator */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mb-1">
                          <span>{run.audio_duration} giây</span>
                          <span>Sinh trong {run.generation_time}s</span>
                        </div>
                        {/* Audio waveform mock representation */}
                        <div className="h-4 flex items-center gap-0.5 opacity-60">
                          {Array.from({ length: 32 }).map((_, idx) => {
                            const val = Math.abs(Math.sin((idx + parseInt(run.id.slice(-3) || '0')) * 0.8)) * 100;
                            return (
                              <div 
                                key={idx} 
                                className={`w-1 rounded-full transition-all duration-300 ${playingId === run.id ? 'bg-amber-cinematic animate-pulse' : 'bg-slate-700'}`}
                                style={{ height: `${Math.max(20, val)}%` }}
                              />
                            );
                          })}
                        </div>
                      </div>

                      {/* Apply Voice to Character */}
                      <button
                        onClick={() => handleOpenApplyModal(run)}
                        className="w-8 h-8 rounded-sm bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-cinematic hover:text-amber-glow hover:bg-amber-cinematic/10 transition-colors"
                        title="Áp dụng giọng nói này cho nhân vật kịch bản"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>

                      {/* Download link button */}
                      <a
                        href={audioUrl}
                        download={run.filename}
                        className="w-8 h-8 rounded-sm bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        title="Tải file âm thanh mẫu"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>

                      {/* Delete run button */}
                      <button
                        onClick={() => handleDelete(run.id)}
                        className="w-8 h-8 rounded-sm bg-slate-900 border border-slate-800 flex items-center justify-center text-red-500/80 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Xóa mẫu này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Prompt Content */}
                    <div className="text-xs text-slate-300 font-medium leading-relaxed bg-slate-950/40 p-2.5 rounded-sm border border-slate-850/60 max-h-16 overflow-y-auto">
                      {run.text}
                    </div>

                    {/* Instruct or Clone extra detail card text */}
                    {run.mode === 'instruct' ? (
                      run.instruct && (
                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5 font-mono">
                          <span className="font-bold text-slate-400 uppercase text-[9px]">Instruct:</span>
                          <span className="truncate italic">&quot;{run.instruct}&quot;</span>
                        </div>
                      )
                    ) : (
                      run.ref_audio && (
                        <div className="text-[10px] text-slate-500 flex flex-col gap-0.5 font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-400 uppercase text-[9px]">Clone Audio:</span>
                            <span className="truncate">{run.ref_audio}</span>
                          </div>
                          {run.ref_text && (
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-400 uppercase text-[9px]">Clone Text:</span>
                              <span className="truncate italic">&quot;{run.ref_text}&quot;</span>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedApplyRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian-dark/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg bg-obsidian-panel border border-zinc-800/60 rounded-md p-6 shadow-2xl relative flex flex-col gap-4 animate-scale-up">
            <button
              onClick={() => setSelectedApplyRun(null)}
              className="absolute top-4 right-4 p-1.5 rounded-sm text-slate-500 hover:text-slate-300 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 pb-3 border-b border-zinc-800/60">
              <div className="w-9 h-9 rounded-md bg-amber-cinematic/10 border border-amber-cinematic/30 flex items-center justify-center text-amber-cinematic">
                <UserCheck className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-md font-bold text-slate-100">Áp dụng giọng nói cho Nhân vật</h3>
                <p className="text-xs text-slate-400">Thiết lập giọng mẫu hoặc thông số cấu hình của bản thử nghiệm vào kịch bản</p>
              </div>
            </div>

            {/* Target Character Dropdown */}
            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Nhân vật đích (Target Speaker)
              </label>
              {uniqueSpeakers.length > 0 ? (
                <select
                  value={targetSpeaker}
                  onChange={e => setTargetSpeaker(e.target.value)}
                  className="w-full bg-slate-950 text-slate-200 border border-slate-800 rounded-sm p-2.5 text-sm font-semibold focus:outline-none focus:border-amber-cinematic cursor-pointer"
                >
                  {uniqueSpeakers.map(sp => {
                    const charName = charactersMetadata[sp]?.name || sp;
                    return (
                      <option key={sp} value={sp}>
                        {charName.toUpperCase()} ({sp})
                      </option>
                    );
                  })}
                </select>
              ) : (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-sm text-xs text-slate-500 text-center font-semibold">
                  Chưa có nhân vật nào trong dự án
                </div>
              )}
            </div>

            {/* Sync Method Selection */}
            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Phương thức áp dụng (Sync Mode)
              </label>
              <div className="grid grid-cols-1 gap-2.5">
                {/* Method 1: Clone */}
                <button
                  type="button"
                  onClick={() => setSyncMode('clone')}
                  className={`w-full text-left p-3.5 rounded-md border transition-all flex items-start gap-3 group cursor-pointer ${
                    syncMode === 'clone'
                      ? 'bg-amber-cinematic/15 border-amber-cinematic/40 text-amber-cinematic'
                      : 'bg-slate-950/45 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900/50'
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    syncMode === 'clone' ? 'border-amber-cinematic bg-amber-cinematic/20' : 'border-slate-700'
                  }`}>
                    {syncMode === 'clone' && <div className="w-1.5 h-1.5 rounded-full bg-amber-cinematic" />}
                  </div>
                  <div>
                    <div className={`text-xs font-bold ${syncMode === 'clone' ? 'text-slate-100' : 'text-slate-300'}`}>
                      Cách 1: Sao chép & Khóa giọng mẫu (Clone & Lock Voice)
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                      Sử dụng file âm thanh thử nghiệm này làm giọng mẫu chính thức. Mọi câu thoại sau này của nhân vật sẽ được sinh dựa trên giọng này (Voice Cloning).
                    </div>
                  </div>
                </button>

                {/* Method 2: Params */}
                <button
                  type="button"
                  onClick={() => setSyncMode('params')}
                  className={`w-full text-left p-3.5 rounded-md border transition-all flex items-start gap-3 group cursor-pointer ${
                    syncMode === 'params'
                      ? 'bg-amber-cinematic/15 border-amber-cinematic/40 text-amber-cinematic'
                      : 'bg-slate-950/45 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900/50'
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    syncMode === 'params' ? 'border-amber-cinematic bg-amber-cinematic/20' : 'border-slate-700'
                  }`}>
                    {syncMode === 'params' && <div className="w-1.5 h-1.5 rounded-full bg-amber-cinematic" />}
                  </div>
                  <div>
                    <div className={`text-xs font-bold ${syncMode === 'params' ? 'text-slate-100' : 'text-slate-300'}`}>
                      Cách 2: Chỉ cấu hình tham số mô tả (Apply Instruct Params)
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                      Phân tích chuỗi instruct <span className="font-mono text-amber-cinematic font-semibold bg-amber-cinematic/10 px-1 py-0.5 rounded-sm">&quot;{selectedApplyRun.instruct || 'female, moderate pitch, young adult'}&quot;</span> thành các thuộc tính (Giới tính, Độ tuổi, Tông giọng) cho nhân vật.
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Warning if cloning is selected for non-cloned audio or instruct mode */}
            {syncMode === 'clone' && selectedApplyRun.mode === 'instruct' && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-sm flex gap-2">
                <span className="text-amber-400 text-xs mt-0.5">⚠️</span>
                <p className="text-[10px] text-amber-300 leading-normal">
                  <strong>Chú ý:</strong> Bản thử này được sinh bằng <em>Instruct Mode</em> (giọng ảo sinh tự động). Nếu chọn Khóa giọng mẫu, file audio này sẽ được dùng làm ref để nhân bản trực tiếp, giúp giữ được chất giọng y hệt cho các thoại sau này!
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-3 border-t border-slate-800/80 mt-2">
              <button
                type="button"
                onClick={() => setSelectedApplyRun(null)}
                className="flex-1 py-2 px-4 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition-all text-center cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmApply}
                disabled={isApplying || !targetSpeaker}
                className="flex-1 py-2 px-4 text-xs font-semibold rounded bg-amber-cinematic hover:bg-amber-glow text-slate-955 shadow-lg shadow-amber-cinematic/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                Xác nhận Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
