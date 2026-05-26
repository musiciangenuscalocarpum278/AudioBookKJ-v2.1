import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, Wand2, Loader2, User, Upload, Trash2, CheckCircle, X, Eye, ChevronDown, ChevronRight, Settings, Star, BookMarked, GripVertical, Plus } from 'lucide-react';
import type { CharacterMetadata } from '../../types';
import { API } from '../../config';import { useProjectStore } from '../../store/useProjectStore';

interface VideoAssetsPanelProps {
  charactersMetadata: Record<string, CharacterMetadata>;
  flowkitProjectId: string;
  setFlowkitProjectId: (id: string) => void;
  globalArtStyle: string;
  setGlobalArtStyle: (style: string) => void;
  aspectRatio: '16:9' | '9:16';
  onAspectRatioChange: (ratio: '16:9' | '9:16') => void;
  videoDuration: number;
  onDurationChange: (s: number) => void;
  isExtractingEntities: boolean;
  isGeneratingAsset: string | null;
  enhancingAssetId: string | null;
  script: { length: number };
  onExtractEntities: () => void;
  onAddAsset: () => void | Promise<void>;
  onUpdateAsset: (id: string, field: string, value: string) => void;
  onDeleteEntity: (id: string) => Promise<void>;
  onUploadCharacterImage: (id: string, e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onGenerateAssetImage: (id: string, prompt: string) => Promise<void>;
  onEnhancePrompt: (id: string) => void;
  onSetOfficialVariation: (assetId: string, variationId: string) => void;
  onToggleReference: (assetId: string, variationId: string) => void;
  onDeleteVariation: (assetId: string, variationId: string) => void;
  onPreviewImage: (url: string) => void;
  focusCanvas?: boolean;
}

const VideoAssetsPanel: React.FC<VideoAssetsPanelProps> = ({
  charactersMetadata, flowkitProjectId, setFlowkitProjectId, globalArtStyle, setGlobalArtStyle,
  aspectRatio, onAspectRatioChange, videoDuration, onDurationChange,
  isExtractingEntities, isGeneratingAsset, enhancingAssetId, script,
  onExtractEntities, onAddAsset, onUpdateAsset, onDeleteEntity,
  onUploadCharacterImage, onGenerateAssetImage, onEnhancePrompt,
  onSetOfficialVariation, onToggleReference, onDeleteVariation, onPreviewImage,
  focusCanvas = false,
}) => {
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'assets' | 'settings'>('none');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (focusCanvas) {
      setActiveDrawer('none');
      setSelectedAssetId(null);
    } else {
      setActiveDrawer('assets');
    }
  }, [focusCanvas]);

  const flowkitConnected = true; // Replace with actual store later if needed

  return (
    <div className={`absolute right-4 top-4 z-50 flex gap-3 h-[calc(100%-32px)] pointer-events-none transition-opacity duration-300 ${focusCanvas && activeDrawer === 'none' ? 'opacity-0' : 'opacity-100'}`}>
      
      {/* Drawer Area */}
      {activeDrawer === 'settings' && (
        <div className="pointer-events-auto w-[320px] bg-obsidian-panel/95 backdrop-blur-xl border border-zinc-800/60 shadow-2xl rounded-md flex flex-col h-fit overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-zinc-800/60 bg-obsidian-panel">
            <div className="flex items-center gap-2 text-zinc-200">
              <Settings className="w-4 h-4 text-amber-cinematic" />
              <span className="text-xs font-bold uppercase tracking-wider">Project Settings</span>
            </div>
            <button onClick={() => setActiveDrawer('none')} className="text-zinc-500 hover:text-zinc-200"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">Project ID (Google Labs)</label>
              <input type="text" value={flowkitProjectId} onChange={(e) => setFlowkitProjectId(e.target.value)} className="w-full bg-zinc-950 text-zinc-300 text-xs p-2 rounded-sm border border-zinc-800 focus:border-amber-cinematic focus:outline-none" placeholder="Nhập Project ID từ URL..." />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wider">Global Art Style</label>
              <input type="text" value={globalArtStyle} onChange={(e) => setGlobalArtStyle(e.target.value)} className="w-full bg-zinc-950 text-amber-cinematic text-xs p-2 rounded-sm border border-amber-cinematic/20 focus:border-amber-cinematic focus:outline-none" placeholder="Ví dụ: Cinematic, Ghibli, 3D Pixar..." />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider w-24 shrink-0">Aspect Ratio</label>
              <div className="flex gap-1">
                {(['16:9', '9:16'] as const).map(ratio => (
                  <button key={ratio} onClick={() => onAspectRatioChange(ratio)} className={`px-2 py-1 text-[10px] rounded-sm font-medium transition-colors border ${aspectRatio === ratio ? 'bg-amber-cinematic text-zinc-950 border-amber-cinematic font-bold' : 'bg-zinc-800 text-zinc-300 border-zinc-700/50 hover:bg-zinc-700'}`}>{ratio}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider w-24 shrink-0">Duration</label>
              <div className="flex gap-1">
                {[4, 6, 8].map(s => (
                  <button key={s} onClick={() => onDurationChange(s)} className={`px-2 py-1 text-[10px] rounded-sm font-medium transition-colors border ${videoDuration === s ? 'bg-amber-cinematic text-zinc-950 border-amber-cinematic font-bold' : 'bg-zinc-800 text-zinc-300 border-zinc-700/50 hover:bg-zinc-700'}`}>{s}s</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assets Drawer */}
      {activeDrawer === 'assets' && (
        <div className="pointer-events-auto w-[320px] bg-obsidian-panel/95 backdrop-blur-xl border border-zinc-800/60 shadow-2xl rounded-md flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-zinc-800/60 bg-obsidian-panel">
            <div className="flex items-center gap-2 text-zinc-200">
              <ImageIcon className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider">Visual Assets ({Object.keys(charactersMetadata).length})</span>
            </div>
            <button onClick={() => setActiveDrawer('none')} className="text-zinc-500 hover:text-zinc-200"><X className="w-4 h-4" /></button>
          </div>
          
          <div className="p-3 border-b border-zinc-800/60 space-y-2 shrink-0">
            <button onClick={onExtractEntities} disabled={isExtractingEntities || script.length === 0} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider rounded border border-emerald-500/30 transition-colors disabled:opacity-50">
              {isExtractingEntities ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {isExtractingEntities ? 'Extracting...' : 'Extract from Script'}
            </button>
            <button onClick={onAddAsset} className="w-full flex items-center justify-center gap-2 px-3 py-1.5 border border-dashed border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 text-[10px] font-bold uppercase tracking-wider rounded transition-colors">
              <Plus className="w-3 h-3" /> Add Manually
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {Object.entries(charactersMetadata).map(([id, entity]) => (
              <div 
                key={id} 
                onClick={() => setSelectedAssetId(id)}
                className={`p-2 rounded border cursor-pointer transition-all duration-200 flex items-center gap-3 ${selectedAssetId === id ? 'bg-amber-cinematic/10 border-amber-cinematic/50 shadow-md shadow-amber-cinematic/5' : 'bg-zinc-900/30 border-zinc-855 hover:bg-zinc-800/60'}`}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData('application/reactflow', JSON.stringify({ id, type: 'asset', imagePath: entity.local_image_path, mediaId: entity.media_id }));
                }}
              >
                <div className="w-10 h-10 shrink-0 rounded-sm bg-zinc-950 border border-zinc-800 flex items-center justify-center overflow-hidden">
                  {entity.local_image_path ? <img src={`${API.image}?path=${encodeURIComponent(entity.local_image_path)}&project_id=${useProjectStore.getState().currentProjectId}`} alt={entity.name} className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-zinc-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-zinc-200 text-xs truncate">{entity.name || 'Unnamed Asset'}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${entity.type === 'character' ? 'bg-zinc-800 text-zinc-300 border-zinc-700/50' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                      {entity.type === 'character' ? 'Char' : entity.type === 'location' ? 'Loc' : 'Prop'}
                    </span>
                    {entity.media_id && <CheckCircle className="w-3 h-3 text-emerald-500" />}
                  </div>
                </div>
              </div>
            ))}
            {Object.keys(charactersMetadata).length === 0 && (
              <div className="text-center py-8 px-4 text-zinc-500 text-xs">Chưa có tài nguyên nào.</div>
            )}
          </div>
        </div>
      )}

      {/* Asset Inspector Drawer (Opens beside Assets list when an asset is selected) */}
      {activeDrawer === 'assets' && selectedAssetId && charactersMetadata[selectedAssetId] && (() => {
        const id = selectedAssetId;
        const entity = charactersMetadata[id];
        return (
          <div className="pointer-events-auto w-[340px] bg-obsidian-panel/95 backdrop-blur-xl border border-zinc-800/60 shadow-2xl rounded-md flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-zinc-800/60 bg-obsidian-panel">
              <div className="flex items-center gap-2 text-amber-cinematic">
                <span className="text-xs font-bold uppercase tracking-wider truncate max-w-[200px]">{entity.name || 'Inspector'}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onDeleteEntity(id)} className="text-zinc-500 hover:text-rose-400 p-1"><Trash2 className="w-4 h-4" /></button>
                <button onClick={() => setSelectedAssetId(null)} className="text-zinc-500 hover:text-zinc-200 p-1"><X className="w-4 h-4" /></button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex gap-4">
                <label className="w-20 h-20 shrink-0 bg-zinc-950 rounded-sm border border-zinc-800 flex flex-col items-center justify-center overflow-hidden relative group cursor-pointer" title="Upload Image">
                  <input type="file" className="hidden" accept="image/*" onChange={(e) => onUploadCharacterImage(id, e)} />
                  {entity.local_image_path ? <img src={`${API.image}?path=${encodeURIComponent(entity.local_image_path)}&project_id=${useProjectStore.getState().currentProjectId}`} alt={entity.name} className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-zinc-600" />}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Upload className="w-5 h-5 text-white" /></div>
                </label>
                <div className="flex-1 space-y-2">
                  <input type="text" value={entity.name} onChange={(e) => onUpdateAsset(id, 'name', e.target.value)} className="w-full font-bold text-zinc-200 text-sm bg-zinc-950 border border-zinc-800 focus:border-amber-cinematic rounded-sm p-1.5 outline-none" placeholder="Name" />
                  <select value={entity.type} onChange={(e) => onUpdateAsset(id, 'type', e.target.value)} className="w-full text-xs bg-zinc-950 border border-zinc-800 rounded-sm p-1.5 outline-none text-zinc-300">
                    <option value="character">Character</option>
                    <option value="location">Location</option>
                    <option value="prop">Prop</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-400 mb-1 uppercase tracking-wider">Description</label>
                <textarea value={entity.description || ''} onChange={(e) => onUpdateAsset(id, 'description', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-sm p-2 text-xs text-zinc-300 min-h-16 outline-none focus:border-amber-cinematic" placeholder="Ngoại hình, tính cách..." />
              </div>

              <div className="bg-zinc-950 border border-zinc-850 p-3 rounded-md">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold text-amber-cinematic uppercase tracking-wider">Image Prompt</label>
                  <div className="flex gap-2">
                    <button onClick={() => onEnhancePrompt(id)} disabled={enhancingAssetId === id} className="px-2 py-1 bg-amber-cinematic/15 hover:bg-amber-cinematic/25 text-amber-cinematic border border-amber-cinematic/30 disabled:opacity-50 rounded flex items-center gap-1 text-[9px] font-bold uppercase transition-all duration-200">
                      {enhancingAssetId === id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Enhance
                    </button>
                    <button onClick={() => onGenerateAssetImage(id, entity.image_prompt ? `${entity.image_prompt}, ${globalArtStyle}` : '')} disabled={isGeneratingAsset === id} className="px-2 py-1 bg-amber-cinematic hover:bg-amber-glow text-zinc-950 border border-amber-cinematic/50 disabled:opacity-50 rounded flex items-center gap-1 text-[9px] font-bold uppercase transition-all duration-200">
                      {isGeneratingAsset === id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Gen AI
                    </button>
                  </div>
                </div>
                <textarea value={entity.image_prompt || ''} onChange={(e) => onUpdateAsset(id, 'image_prompt', e.target.value)} className="w-full font-mono text-[10px] bg-zinc-900 border border-zinc-800 rounded-sm p-2 text-zinc-300 min-h-24 outline-none focus:border-amber-cinematic" placeholder="Prompt tạo ảnh chi tiết..." />
              </div>

              {entity.variations && entity.variations.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 mb-2 uppercase tracking-wider">Variations ({entity.variations.length})</label>
                  <div className="space-y-1">
                    {entity.variations.map((v: any) => (
                      <div key={v.id} className="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800/60 rounded-sm p-1.5 group/var" draggable onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('application/reactflow', JSON.stringify({ id, type: 'variation', imagePath: v.local_image_path, mediaId: v.media_id })); }}>
                        <GripVertical className="w-3 h-3 text-zinc-650 cursor-grab" />
                        <div className="w-6 h-6 shrink-0 rounded-sm bg-zinc-950 border border-zinc-800 overflow-hidden">
                          {v.local_image_path ? <img src={`${API.image}?path=${encodeURIComponent(v.local_image_path)}&project_id=${useProjectStore.getState().currentProjectId}`} alt={v.name} className="w-full h-full object-cover" /> : <User className="w-full h-full text-zinc-600 p-1" />}
                        </div>
                        <span className="flex-1 text-[10px] text-zinc-300 truncate">{v.name || 'Var'}</span>
                        <div className="flex items-center opacity-0 group-hover/var:opacity-100 transition-opacity">
                          <button onClick={() => onPreviewImage(v.local_image_path ? `${API.image}?path=${encodeURIComponent(v.local_image_path)}&project_id=${useProjectStore.getState().currentProjectId}` : '')} disabled={!v.local_image_path} className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"><Eye className="w-3 h-3" /></button>
                          <button onClick={() => onSetOfficialVariation(id, v.id)} className={`p-1 ${v.is_official ? 'text-amber-400' : 'text-zinc-500 hover:text-amber-400'}`}><Star className="w-3 h-3" fill={v.is_official ? 'currentColor' : 'none'} /></button>
                          <button onClick={() => onToggleReference(id, v.id)} className={`p-1 ${v.is_reference ? 'text-amber-cinematic' : 'text-zinc-500 hover:text-amber-cinematic'}`}><BookMarked className="w-3 h-3" /></button>
                          <button onClick={() => onDeleteVariation(id, v.id)} className="p-1 text-zinc-500 hover:text-rose-400"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Launcher Bar (Always visible on the far right) */}
      <div className="pointer-events-auto w-14 bg-obsidian-panel border border-zinc-800/60 shadow-xl rounded-md flex flex-col items-center py-4 gap-4 h-fit">
        <button 
          onClick={() => setActiveDrawer(activeDrawer === 'assets' ? 'none' : 'assets')} 
          className={`p-2.5 rounded-sm transition-all border ${activeDrawer === 'assets' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-zinc-800/60'}`}
          title="Visual Assets"
        >
          <ImageIcon className="w-5 h-5" />
        </button>
        <button 
          onClick={onAddAsset}
          className="p-2.5 rounded-sm border border-transparent text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/5 hover:border-emerald-500/10 transition-colors"
          title="Add Asset Manually"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button 
          onClick={onExtractEntities}
          disabled={isExtractingEntities || script.length === 0}
          className="p-2.5 rounded-sm border border-transparent text-zinc-400 hover:text-amber-cinematic hover:bg-amber-cinematic/5 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          title="Extract Visuals from Script"
        >
          <Wand2 className="w-5 h-5" />
        </button>

        <div className="w-8 h-[1px] bg-zinc-800 my-1"></div>

        <button 
          onClick={() => setActiveDrawer(activeDrawer === 'settings' ? 'none' : 'settings')} 
          className={`p-2.5 rounded-sm transition-all border ${activeDrawer === 'settings' ? 'bg-amber-cinematic/10 text-amber-cinematic border-amber-cinematic/30' : 'text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-zinc-800/60'}`}
          title="Project Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default VideoAssetsPanel;
