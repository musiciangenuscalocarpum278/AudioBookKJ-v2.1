import React, { useState, useEffect } from 'react';
import { Database, Trash2, X, RefreshCw, Archive, CheckCircle2, AlertCircle } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { API } from '../../config';

interface MigrationCleanupModalProps {
  onClose: () => void;
}

type Tab = 'migrate' | 'cleanup';

export function MigrationCleanupModal({ onClose }: MigrationCleanupModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('migrate');
  const [loading, setLoading] = useState(false);

  // Migration State
  const [inventory, setInventory] = useState<any[]>([]);
  const [legacyCount, setLegacyCount] = useState(0);

  // Cleanup State
  const [orphans, setOrphans] = useState<any[]>([]);
  const [caches, setCaches] = useState<any[]>([]);
  const [cleanupSummary, setCleanupSummary] = useState<any>(null);

  useEffect(() => {
    if (activeTab === 'migrate') {
      fetchInventory();
    } else {
      fetchCleanupPreview();
    }
  }, [activeTab]);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await axios.get(API.mediaInventory);
      setInventory(res.data.inventory || []);
      setLegacyCount(res.data.legacy_count || 0);
    } catch (err) {
      toast.error('Failed to fetch media inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleMigrate = async () => {
    if (inventory.length === 0) return;
    setLoading(true);
    toast.loading('Đang migrate file sang Project...', { id: 'migrate' });
    try {
      const res = await axios.post(API.mediaMigrate, { items: inventory });
      toast.success(`Migrate thành công ${res.data.migrated} files!`, { id: 'migrate' });
      fetchInventory();
    } catch (err) {
      toast.error('Lỗi khi migrate media', { id: 'migrate' });
    } finally {
      setLoading(false);
    }
  };

  const fetchCleanupPreview = async () => {
    setLoading(true);
    try {
      const res = await axios.post(API.mediaCleanupPreview);
      setOrphans(res.data.orphans || []);
      setCaches(res.data.caches || []);
      setCleanupSummary(res.data.summary);
    } catch (err) {
      toast.error('Failed to load cleanup preview');
    } finally {
      setLoading(false);
    }
  };

  const handleCleanup = async () => {
    const filesToDelete = [...orphans.map(o => o.path), ...caches.map(c => c.path)];
    if (filesToDelete.length === 0) return;
    
    if (!window.confirm(`Bạn có chắc muốn xoá vĩnh viễn ${filesToDelete.length} files rác/cache không?`)) return;

    setLoading(true);
    toast.loading('Đang dọn dẹp ổ đĩa...', { id: 'cleanup' });
    try {
      const res = await axios.post(API.mediaCleanupApply, { files: filesToDelete });
      toast.success(`Đã xoá ${res.data.deleted_count} files, giải phóng ${res.data.freed_mb} MB!`, { id: 'cleanup' });
      fetchCleanupPreview();
    } catch (err) {
      toast.error('Lỗi khi xoá files', { id: 'cleanup' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-obsidian-panel border border-zinc-800/60 rounded-md shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60 bg-zinc-950/20">
          <h3 className="font-semibold text-slate-200 flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-cinematic" /> Media Storage Manager
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 rounded-sm hover:bg-zinc-800">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex border-b border-zinc-800/60 bg-zinc-950/10">
          <button
            onClick={() => setActiveTab('migrate')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'migrate' ? 'text-amber-cinematic border-b-2 border-amber-cinematic bg-zinc-800/30' : 'text-slate-400 hover:text-slate-300 hover:bg-zinc-800/50'}`}
          >
            <Archive className="w-4 h-4" />
            Migrate Legacy Media
          </button>
          <button
            onClick={() => setActiveTab('cleanup')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'cleanup' ? 'text-rose-400 border-b-2 border-rose-500 bg-zinc-800/30' : 'text-slate-400 hover:text-slate-300 hover:bg-zinc-800/50'}`}
          >
            <Trash2 className="w-4 h-4" />
            Cleanup Storage
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'migrate' && (
            <div className="space-y-4">
              <div className="bg-amber-cinematic/10 border border-amber-cinematic/20 rounded-md p-4">
                <h4 className="text-amber-cinematic font-medium flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4" />
                  Chuyển đổi dữ liệu cũ sang Project Scoped
                </h4>
                <p className="text-sm text-slate-300 leading-relaxed mb-4">
                  Hệ thống tìm thấy <strong>{legacyCount}</strong> file media đang sử dụng cấu trúc cũ (nằm trong thư mục chung temp_audio, images,...). Việc Migrate sẽ copy các file này vào đúng thư mục Project hiện tại và cập nhật đường dẫn trong Database, đảm bảo an toàn không gây lỗi mất file.
                </p>
                <button
                  onClick={handleMigrate}
                  disabled={loading || legacyCount === 0}
                  className="bg-amber-cinematic hover:bg-amber-glow disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 px-4 py-2 rounded text-sm font-semibold flex items-center gap-2 transition-colors"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                  Tiến hành Migrate {legacyCount} files
                </button>
              </div>

              {legacyCount === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500/50 mb-2" />
                  <p>Tuyệt vời! Không có file Legacy nào cần chuyển đổi.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'cleanup' && (
            <div className="space-y-4">
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-md p-4">
                <h4 className="text-rose-400 font-medium flex items-center gap-2 mb-2">
                  <Trash2 className="w-4 h-4" />
                  Dọn dẹp file Rác & Cache
                </h4>
                <p className="text-sm text-slate-300 leading-relaxed mb-4">
                  Tìm thấy <strong>{cleanupSummary?.orphan_count || 0}</strong> file mồ côi (Orphan) không còn được sử dụng và <strong>{cleanupSummary?.cache_count || 0}</strong> file Cache tạm thời. Xoá các file này sẽ giúp bạn tiết kiệm dung lượng ổ cứng đáng kể.
                </p>
                <div className="flex gap-4 mb-4">
                  <div className="bg-obsidian-dark p-3 rounded-sm border border-zinc-800/60 flex-1">
                    <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Orphan Files</div>
                    <div className="text-lg font-mono text-slate-200">{cleanupSummary?.orphan_size_mb || 0} MB</div>
                  </div>
                  <div className="bg-obsidian-dark p-3 rounded-sm border border-zinc-800/60 flex-1">
                    <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Cache Files</div>
                    <div className="text-lg font-mono text-slate-200">{cleanupSummary?.cache_size_mb || 0} MB</div>
                  </div>
                </div>
                <button
                  onClick={handleCleanup}
                  disabled={loading || (cleanupSummary?.orphan_count === 0 && cleanupSummary?.cache_count === 0)}
                  className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-semibold flex items-center gap-2 transition-colors"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Giải phóng {((cleanupSummary?.orphan_size_mb || 0) + (cleanupSummary?.cache_size_mb || 0)).toFixed(2)} MB
                </button>
              </div>

               {(!cleanupSummary || (cleanupSummary.orphan_count === 0 && cleanupSummary.cache_count === 0)) && !loading && (
                <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500/50 mb-2" />
                  <p>Ổ cứng đang rất sạch sẽ, không có file rác nào!</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
