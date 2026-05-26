import React from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { User, MapPin, X } from 'lucide-react';
import { VideoStudioContext } from './VideoStudioContext';
import { API } from '../../config';
import { useProjectStore } from '../../store/useProjectStore';

const AssetNodeCard = ({ id, data }: NodeProps) => {
  const context = React.useContext(VideoStudioContext);
  const { setNodes } = useReactFlow();
  const metadata = context?.charactersMetadata?.[(data.baseAssetId as string) || id];
  const name = metadata ? metadata.name + (data.baseAssetId ? ' (Var)' : '') : data.name;
  const imagePath = data.baseAssetId ? data.imagePath : (metadata?.local_image_path || data.imagePath);
  const assetType = metadata?.type || data.assetType;

  return (
    <div className="bg-[#18181b]/95 border border-zinc-800 p-2.5 shadow-md w-48 flex items-center gap-2.5 group relative rounded-xl">
      <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-850 flex items-center justify-center overflow-hidden flex-shrink-0">
        {imagePath ? (
          <img
            src={`${API.image}?path=${encodeURIComponent(imagePath as string)}&project_id=${
              useProjectStore.getState().currentProjectId
            }`}
            alt={name as string}
            className="w-full h-full object-cover"
          />
        ) : assetType === 'character' ? (
          <User className="w-4 h-4 text-zinc-500" />
        ) : (
          <MapPin className="w-4 h-4 text-zinc-500" />
        )}
      </div>
      <div className="flex-1 min-w-0 pr-4">
        <div className="text-xs font-mono font-bold text-zinc-200 truncate">{name as string}</div>
        <div className="text-[8px] font-mono uppercase tracking-wider text-zinc-500">{assetType as string}</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setNodes((nds) => nds.filter((n) => n.id !== id));
        }}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 p-1 bg-zinc-900 border border-zinc-800 rounded-md transition-opacity cursor-pointer shadow-sm"
        title="Delete Node"
        aria-label="Delete Node"
      >
        <X className="w-2.5 h-2.5" />
      </button>
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-zinc-950 border border-zinc-700 hover:border-amber-cinematic rounded-full"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-zinc-950 border border-zinc-700 hover:border-amber-cinematic rounded-full"
      />
    </div>
  );
};

export default React.memo(AssetNodeCard, (prevProps, nextProps) => {
  if (prevProps.id !== nextProps.id) return false;

  const p = prevProps.data;
  const n = nextProps.data;
  if (p.baseAssetId !== n.baseAssetId) return false;
  if (p.name !== n.name) return false;
  if (p.imagePath !== n.imagePath) return false;
  if (p.assetType !== n.assetType) return false;

  return true;
});

// label placeholder aria-label
