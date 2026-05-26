import React, { useState } from 'react';
import { X, CheckCircle2, AlertTriangle, ChevronRight, Wand2, RefreshCw } from 'lucide-react';
import type { ScriptLine, CharacterMetadata, DirectorRunMode } from '../../types';

interface DirectorReadinessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (mode: DirectorRunMode) => void;
  script: ScriptLine[];
  charactersMetadata: Record<string, CharacterMetadata>;
  selectedSceneId?: string;
  selectedLineIds?: number[];
}

export const DirectorReadinessModal: React.FC<DirectorReadinessModalProps> = ({
  isOpen, onClose, onGenerate, script, charactersMetadata, selectedSceneId, selectedLineIds
}) => {
  const [runMode, setRunMode] = useState<DirectorRunMode>({ type: 'all_missing' });

  if (!isOpen) return null;

  const hasScript = script.length > 0;
  const hasAssets = Object.keys(charactersMetadata).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="bg-obsidian-panel border border-zinc-800 rounded-none shadow-2xl w-[480px] max-w-full overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/40">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-amber-cinematic" />
            <h2 className="text-md font-bold uppercase tracking-wider text-zinc-100">AI Director Checklist</h2>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <p className="text-xs text-zinc-300 leading-relaxed">
            Trước khi AI Director tiến hành phân cảnh (Storyboard), hãy đảm bảo bạn đã chuẩn bị đầy đủ tài nguyên để có kết quả tốt nhất.
          </p>
          
          <div className="flex flex-col gap-3">
            <div className={`flex items-start gap-3 p-3 rounded-none border ${hasScript ? 'bg-emerald-950/10 border-emerald-900/30' : 'bg-rose-950/20 border-rose-900/30'}`}>
              {hasScript ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />}
              <div>
                <h3 className={`text-xs font-bold uppercase tracking-wider ${hasScript ? 'text-emerald-300' : 'text-rose-300'}`}>Kịch bản (Script)</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  {hasScript ? `Đã có ${script.length} dòng kịch bản.` : 'Chưa có kịch bản nào. Bắt buộc phải có kịch bản để phân cảnh.'}
                </p>
              </div>
            </div>

            <div className={`flex items-start gap-3 p-3 rounded-none border ${hasAssets ? 'bg-emerald-950/10 border-emerald-900/30' : 'bg-amber-cinematic/5 border-amber-cinematic/20'}`}>
              {hasAssets ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-cinematic shrink-0" />}
              <div>
                <h3 className={`text-xs font-bold uppercase tracking-wider ${hasAssets ? 'text-emerald-300' : 'text-amber-cinematic'}`}>Tài nguyên hình ảnh (Visual Assets)</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  {hasAssets 
                    ? `Đã khai báo ${Object.keys(charactersMetadata).length} tài nguyên (Nhân vật/Bối cảnh).` 
                    : 'Chưa khai báo Visual Assets. AI có thể sinh ảnh không nhất quán nếu thiếu tài nguyên tham chiếu.'}
                </p>
              </div>
            </div>
            </div>

            {hasScript && (
              <div className="flex flex-col gap-2 mt-2 bg-zinc-950/40 p-3 rounded-none border border-zinc-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 text-amber-cinematic" /> Director Run Mode</h3>
                
                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors">
                  <input type="radio" checked={runMode.type === 'all_missing'} onChange={() => setRunMode({ type: 'all_missing' })} className="accent-amber-cinematic cursor-pointer bg-zinc-950 border-zinc-800 text-amber-cinematic focus:ring-amber-cinematic/20" />
                  Chỉ tạo Storyboard cho các câu chưa có (Mặc định)
                </label>

                {selectedSceneId && (
                  <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors">
                    <input type="radio" checked={runMode.type === 'regenerate_scene'} onChange={() => setRunMode({ type: 'regenerate_scene', sceneId: selectedSceneId })} className="accent-amber-cinematic cursor-pointer bg-zinc-950 border-zinc-800 text-amber-cinematic focus:ring-amber-cinematic/20" />
                    Tạo lại Scene đang chọn ({selectedSceneId})
                  </label>
                )}

                {selectedLineIds && selectedLineIds.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors">
                    <input type="radio" checked={runMode.type === 'from_line'} onChange={() => setRunMode({ type: 'from_line', lineId: selectedLineIds[0] })} className="accent-amber-cinematic cursor-pointer bg-zinc-950 border-zinc-800 text-amber-cinematic focus:ring-amber-cinematic/20" />
                    Chạy lại từ dòng kịch bản đang chọn (Dòng {selectedLineIds[0]})
                  </label>
                )}
              </div>
            )}
        </div>

        <div className="px-5 py-4 border-t border-zinc-800 bg-zinc-950/40 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-none text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800/80 transition-all"
          >
            Quay lại chuẩn bị thêm
          </button>
          <button 
            onClick={() => {
              onClose();
              onGenerate(runMode);
            }}
            disabled={!hasScript}
            className="px-4 py-2 rounded-none text-xs font-bold uppercase tracking-wider bg-amber-cinematic hover:bg-amber-glow text-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed border border-amber-cinematic/50 flex items-center gap-1.5 shadow-md shadow-amber-cinematic/10 transition-all duration-200"
          >
            {hasAssets ? 'Tạo Storyboard' : 'Bỏ qua & Tạo Storyboard'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
