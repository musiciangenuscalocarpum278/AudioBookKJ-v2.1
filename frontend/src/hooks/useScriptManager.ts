// ==========================================================================
// hooks/useScriptManager.ts
// Script manipulation: export JSON, import JSON, clear timeline.
// These are pure utility functions wired to the shared script state.
// ==========================================================================
import axios from 'axios';
import toast from 'react-hot-toast';
import type { ScriptLine, TimelineClip } from '../types';

import { useProjectStore } from '../store/useProjectStore';
import { API } from '../config';

interface UseScriptManagerOptions {
  script: ScriptLine[];
  setScript: React.Dispatch<React.SetStateAction<ScriptLine[]>>;
  setTimelineClips: React.Dispatch<React.SetStateAction<TimelineClip[]>>;
  setTimelineVideoClips?: React.Dispatch<React.SetStateAction<any[]>>;
  setTimelineTime: React.Dispatch<React.SetStateAction<number>>;
  importInputRef: React.RefObject<HTMLInputElement | null>;
}

export function useScriptManager({
  script,
  setScript,
  setTimelineClips,
  setTimelineVideoClips,
  setTimelineTime,
  importInputRef,
}: UseScriptManagerOptions) {

  /** Export current project to a .json file (v2 clean format) */
  const exportProject = () => {
    const s = useProjectStore.getState();
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      script: s.script,
      timelineClips: s.timelineClips.map(({ audioUrl: _url, ...rest }) => rest),
      timelineVideoClips: s.timelineVideoClips,
      videoNodes: s.videoNodes,
      videoEdges: s.videoEdges,
      charactersMetadata: s.charactersMetadata,
      speakerVoiceParams: s.speakerVoiceParams,
      lockedVoices: s.lockedVoices,
      globalArtStyle: s.globalArtStyle,
      videoAspectRatio: s.videoAspectRatio,
      videoDuration: s.videoDuration,
      flowkitProjectId: s.flowkitProjectId,
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const anchor = document.createElement('a');
    anchor.setAttribute('href', dataStr);
    anchor.setAttribute('download', 'audiobook_project_v2.json');
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  /** Import a .json script file and reset the timeline */
  const handleImportProject = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (Array.isArray(json)) {
          // Backward compat: old format was just an array of script lines
          const withIds = json.map((line: any, idx: number) => ({
            ...line,
            id: typeof line.id === 'number' ? line.id : idx,
          }));
          setScript(withIds);
          setTimelineClips([]);
          setTimelineTime(0);
          await axios.post(API.scriptLines, { lines: withIds, project_id: useProjectStore.getState().currentProjectId });
          toast.success('Đã nạp script thành công!');
        } else if (json && typeof json === 'object') {
          // v2 format: hydrate Zustand then push everything to SQLite
          useProjectStore.setState({
            ...json,
            projectVersion: useProjectStore.getState().projectVersion + 1,
          });

          const pushes: Promise<any>[] = [];
          if (json.script) {
            pushes.push(axios.post(API.scriptLines, { lines: json.script, project_id: useProjectStore.getState().currentProjectId }));
          }
          if (json.timelineClips !== undefined) {
            pushes.push(axios.post(API.timelineClips, {
              audio: json.timelineClips,
              video: json.timelineVideoClips ?? [],
              project_id: useProjectStore.getState().currentProjectId,
            }));
          }
          if (json.videoNodes !== undefined) {
            pushes.push(axios.post(API.videoGraph, {
              nodes: json.videoNodes,
              edges: json.videoEdges ?? [],
              project_id: useProjectStore.getState().currentProjectId,
            }));
          }
          if (json.charactersMetadata) {
            pushes.push(axios.post(API.importEntities, { characters: json.charactersMetadata, project_id: useProjectStore.getState().currentProjectId }));
          }
          pushes.push(axios.post(API.projectProfile, {
            global_art_style: json.globalArtStyle ?? '',
            video_aspect_ratio: json.videoAspectRatio ?? '16:9',
            video_duration: json.videoDuration ?? 8,
            flowkit_project_id: json.flowkitProjectId ?? '',
            locked_voices: json.lockedVoices ?? {},
            speaker_voice_params: json.speakerVoiceParams ?? {},
            project_id: useProjectStore.getState().currentProjectId,
          }));

          const results = await Promise.allSettled(pushes);
          const failed = results.filter(r => r.status === 'rejected').length;
          if (failed > 0) {
            toast.error(`Project loaded but ${failed} SQLite sync(s) failed — some data may not persist after refresh.`);
          } else {
            toast.success('Đã nạp toàn bộ cấu hình Project thành công!');
          }
        }
      } catch {
        toast.error('Lỗi: File JSON không hợp lệ!');
      } finally {
        if (importInputRef.current) importInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  /** Confirm and wipe the timeline */
  const handleClearTimeline = async (type: 'audio' | 'video' | 'all' = 'all') => {
    if (window.confirm(`Bạn có chắc muốn xóa sạch ${type === 'audio' ? 'Audio' : type === 'video' ? 'Video' : 'toàn bộ'} Timeline không?`)) {
      const currentClips = useProjectStore.getState().timelineClips;
      const currentVideoClips = useProjectStore.getState().timelineVideoClips;
      const currentProjectId = useProjectStore.getState().currentProjectId;

      let nextClips = currentClips;
      let nextVideoClips = currentVideoClips;

      if (type === 'audio' || type === 'all') {
        nextClips = [];
        setTimelineClips([]);
      }
      if (type === 'video' || type === 'all') {
        nextVideoClips = [];
        if (setTimelineVideoClips) setTimelineVideoClips([]);
      }
      setTimelineTime(0);

      // Persist directly to SQLite database instantly to ensure perfect sync
      try {
        useProjectStore.getState().setSaveStatus('saving');
        await axios.post(API.timelineClips, {
          audio: nextClips.map(({ audioUrl: _url, ...rest }) => rest),
          video: nextVideoClips,
          project_id: currentProjectId,
        });
        useProjectStore.getState().setSaveStatus('saved');
        setTimeout(() => {
          if (useProjectStore.getState().saveStatus === 'saved') {
            useProjectStore.getState().setSaveStatus('idle');
          }
        }, 1500);
      } catch (err) {
        console.error("Failed to persist timeline clear:", err);
        useProjectStore.getState().setSaveStatus('error');
        toast.error("Lỗi khi lưu trạng thái xóa lên SQLite!");
      }
    }
  };

  /** Start a new project (clear all) */
  const handleNewProject = async () => {
    if (window.confirm('Bạn có chắc muốn tạo Project mới? Mọi dữ liệu hiện tại chưa lưu sẽ bị xóa.')) {
      const pid = useProjectStore.getState().currentProjectId;
      
      useProjectStore.setState({
        script: [],
        timelineClips: [],
        timelineVideoClips: [],
        videoNodes: [],
        videoEdges: [],
        lockedVoices: {},
        speakerVoiceParams: {},
        charactersMetadata: {},
        projectVersion: useProjectStore.getState().projectVersion + 1,
      });
      setTimelineTime(0);

      // Persist directly to SQLite database instantly to ensure perfect sync
      try {
        useProjectStore.getState().setSaveStatus('saving');
        await Promise.all([
          axios.post(API.scriptLines, { lines: [], project_id: pid }),
          axios.post(API.timelineClips, { audio: [], video: [], project_id: pid }),
          axios.post(API.videoGraph, { nodes: [], edges: [], project_id: pid }),
          axios.post(API.importEntities, { characters: {}, project_id: pid }),
          axios.post(API.projectProfile, {
            global_art_style: '',
            video_aspect_ratio: '16:9',
            video_duration: 8,
            flowkit_project_id: '',
            locked_voices: {},
            speaker_voice_params: {},
            project_id: pid,
          })
        ]);
        useProjectStore.getState().setSaveStatus('saved');
        setTimeout(() => {
          if (useProjectStore.getState().saveStatus === 'saved') {
            useProjectStore.getState().setSaveStatus('idle');
          }
        }, 1500);
        toast.success('Đã tạo Project mới và làm sạch dữ liệu!');
      } catch (err) {
        console.error("Failed to persist new project clean state:", err);
        useProjectStore.getState().setSaveStatus('error');
        toast.error("Lỗi khi đồng bộ làm sạch database SQLite!");
      }
    }
  };

  return { exportProject, handleImportProject, handleClearTimeline, handleNewProject };
}
