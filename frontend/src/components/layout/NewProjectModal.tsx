import React, { useState } from 'react';
import { FolderOpen, X } from 'lucide-react';

interface NewProjectModalProps {
  onClose: () => void;
  onSubmit: (name: string, root: string) => void;
}

export function NewProjectModal({ onClose, onSubmit }: NewProjectModalProps) {
  const [name, setName] = useState('My Audiobook');
  const [root, setRoot] = useState('');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-obsidian-panel border border-zinc-800/60 rounded-md shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60 bg-zinc-950/20">
          <h3 className="font-semibold text-slate-200 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-amber-cinematic" /> New Project
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 rounded-sm hover:bg-zinc-800">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Project Name</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)}
              className="w-full bg-obsidian-dark border border-zinc-800/60 rounded-sm px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-cinematic focus:ring-1 focus:ring-amber-cinematic placeholder-slate-600"
              placeholder="e.g. Harry Potter Chapter 1"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Project Folder (Optional)</label>
            <input 
              type="text" 
              value={root} 
              onChange={e => setRoot(e.target.value)}
              className="w-full bg-obsidian-dark border border-zinc-800/60 rounded-sm px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-cinematic focus:ring-1 focus:ring-amber-cinematic placeholder-slate-600 font-mono"
              placeholder="e.g. D:\Audiobooks\Project1"
            />
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              Dành cho việc lưu trữ riêng biệt. Nếu để trống, dự án sẽ được tạo trong thư mục mặc định <code>audiobook_builder/projects</code>.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-zinc-800/60 bg-zinc-950/20">
          <button onClick={onClose} className="px-4 py-1.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-zinc-800 rounded transition-colors">
            Cancel
          </button>
          <button 
            onClick={() => {
              if (name.trim()) onSubmit(name.trim(), root.trim());
            }}
            disabled={!name.trim()}
            className="px-4 py-1.5 text-sm font-semibold bg-amber-cinematic hover:bg-amber-glow disabled:opacity-50 text-zinc-950 rounded transition-colors flex items-center gap-1.5"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
