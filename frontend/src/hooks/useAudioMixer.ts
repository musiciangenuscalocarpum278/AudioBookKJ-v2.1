// ==========================================================================
// hooks/useAudioMixer.ts
// Handles mixing and downloading the final audiobook output.
// Audio-only mixes use HTTP (fast pydub). Video mixes use WebSocket so
// FFmpeg progress can be streamed back in real time.
// ==========================================================================
import axios from 'axios';
import toast from 'react-hot-toast';
import type { TimelineClip, TimelineVideoClip, RenderProgress } from '../types';
import { API } from '../config';
import { useProjectStore } from '../store/useProjectStore';

interface UseAudioMixerOptions {
  timelineClips: TimelineClip[];
  timelineVideoClips: TimelineVideoClip[];
  videoAspectRatio: '16:9' | '9:16';
  setRenderProgress: React.Dispatch<React.SetStateAction<RenderProgress>>;
  trackVolumes: Record<number, number>;
  videoTrackVolumes: Record<number, number>;
}

export function useAudioMixer({
  timelineClips,
  timelineVideoClips,
  videoAspectRatio,
  setRenderProgress,
  trackVolumes,
  videoTrackVolumes,
}: UseAudioMixerOptions) {

  const mixAndExport = async (mode: 'all' | 'video_only' | 'audio_only' = 'all') => {
    if (timelineClips.length === 0 && timelineVideoClips.length === 0) {
      toast.error('Không có clip nào trên Timeline!');
      return;
    }

    const hasVideo = timelineVideoClips.length > 0 && mode !== 'audio_only';
    setRenderProgress({ status: 'assembling', currentLine: 0, totalLines: 0, finalAudioUrl: null, finalOutputType: hasVideo ? 'video' : 'audio' });

    let audioPayload = timelineClips.map(c => ({
      filename: c.filename,
      startTime: c.startTime,
      track: c.track,
      volume: c.volume ?? 100,
    }));

    if (mode === 'video_only') {
      audioPayload = [];
    }

    // ── Audio-only mix (fast, use HTTP) ───────────────────────────────────
    if (!hasVideo) {
      try {
        const projectId = useProjectStore.getState().currentProjectId;
        const res = await axios.post(API.mixTimeline, { clips: audioPayload, track_volumes: trackVolumes, project_id: projectId }, { responseType: 'blob' });
        const outUrl = URL.createObjectURL(new Blob([res.data]));
        const anchor = document.createElement('a');
        anchor.href = outUrl;
        anchor.download = 'final_audiobook_mix.mp3';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setRenderProgress({ status: 'done', currentLine: 0, totalLines: 0, finalAudioUrl: outUrl, finalOutputType: 'audio' });
      } catch {
        toast.error('Lỗi khi Mix Timeline!');
        setRenderProgress({ status: 'error', currentLine: 0, totalLines: 0, finalAudioUrl: null });
      }
      return;
    }

    // ── Video mix (slow FFmpeg — stream progress over WebSocket) ──────────
    setRenderProgress(prev => ({ ...prev, status: 'assembling', message: 'Đang kết nối...', currentLine: 0, totalLines: 100 }));

    return new Promise<void>((resolve) => {
      const ws = new WebSocket(API.mixProgressWs);

      ws.onopen = () => {
        const outputFilename = videoAspectRatio === '9:16'
          ? 'final_audiobook_video_9x16.mp4'
          : 'final_audiobook_video_16x9.mp4';

        ws.send(JSON.stringify({
          aspect_ratio: videoAspectRatio,
          output_filename: outputFilename,
          audio_clips: audioPayload,
          track_volumes: trackVolumes,
          video_track_volumes: videoTrackVolumes,
          video_clips: timelineVideoClips.map(c => ({
            videoUrl: c.videoUrl,
            startTime: c.startTime,
            duration: c.duration,
            trimStart: c.trimStart ?? 0,
            keepSound: c.keepSound || false,
            volume: c.volume ?? 100,
            track: c.track ?? 0,
          })),
          project_id: useProjectStore.getState().currentProjectId,
        }));
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data as string);

        if (msg.type === 'status') {
          setRenderProgress(prev => ({ ...prev, status: 'assembling', message: msg.message }));

        } else if (msg.type === 'progress') {
          setRenderProgress(prev => ({ 
            ...prev, 
            status: 'assembling', 
            message: `FFmpeg: ${msg.message}`,
            currentLine: msg.percent != null ? msg.percent : prev.currentLine,
            totalLines: msg.percent != null ? 100 : prev.totalLines 
          }));

        } else if (msg.type === 'done') {
          setRenderProgress(prev => ({ ...prev, status: 'assembling', message: 'Mix xong! Đang tải file về...' }));
          ws.close();
          try {
            const projectId = useProjectStore.getState().currentProjectId;
            const res = await axios.get(API.outputFile, { params: { project_id: projectId }, responseType: 'blob' });
            const outUrl = URL.createObjectURL(new Blob([res.data]));
            const anchor = document.createElement('a');
            anchor.href = outUrl;
            anchor.download = videoAspectRatio === '9:16'
              ? 'final_audiobook_video_9x16.mp4'
              : 'final_audiobook_video_16x9.mp4';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            toast.success('Mix video hoàn tất!');
            setRenderProgress({ status: 'done', currentLine: 0, totalLines: 0, finalAudioUrl: outUrl, message: '', finalOutputType: 'video' });
          } catch {
            toast.error('Mix xong nhưng tải file thất bại!');
            setRenderProgress({ status: 'error', currentLine: 0, totalLines: 0, finalAudioUrl: null, message: '' });
          }
          resolve();

        } else if (msg.type === 'error') {
          if (msg.stderr?.length) console.error('[FFmpeg stderr]\n' + (msg.stderr as string[]).join('\n'));
          toast.error(`Lỗi Mix: ${msg.message}`);
          setRenderProgress({ status: 'error', currentLine: 0, totalLines: 0, finalAudioUrl: null, message: '' });
          ws.close();
          resolve();
        }
      };

      ws.onerror = () => {
        toast.error('Lỗi kết nối WebSocket với backend!');
        setRenderProgress({ status: 'error', currentLine: 0, totalLines: 0, finalAudioUrl: null, message: '' });
        resolve();
      };

      ws.onclose = (e) => {
        // Abnormal close (not triggered by our own ws.close() calls above)
        if (e.code !== 1000 && e.code !== 1005) {
          toast.error('Kết nối WebSocket bị ngắt!');
          setRenderProgress({ status: 'error', currentLine: 0, totalLines: 0, finalAudioUrl: null, message: '' });
          resolve();
        }
      };
    });
  };

  return { mixAndExport };
}
