// ==========================================================================
// hooks/useTimelinePlayback.ts
// Controls timeline play/pause, seek, and the rAF animation loop.
// Accepts audio/video refs from the parent so DOM elements stay in-tree.
// ==========================================================================
import { useEffect, useRef } from 'react';
import type { TimelineClip, TimelineVideoClip } from '../types';

interface UseTimelinePlaybackOptions {
  isPlayingTimeline: boolean;
  setIsPlayingTimeline: React.Dispatch<React.SetStateAction<boolean>>;
  timelineTime: number;
  setTimelineTime: React.Dispatch<React.SetStateAction<number>>;
  timelineClips: TimelineClip[];
  timelineVideoClips: TimelineVideoClip[];
  timelineAudioRefs: React.MutableRefObject<{ [id: string]: HTMLAudioElement }>;
  timelineVideoRefs: React.MutableRefObject<{ [id: string]: HTMLVideoElement }>;
  trackVolumes: Record<number, number>;
  videoTrackVolumes: Record<number, number>;
}

export function useTimelinePlayback({
  isPlayingTimeline,
  setIsPlayingTimeline,
  timelineTime,
  setTimelineTime,
  timelineClips,
  timelineVideoClips,
  timelineAudioRefs,
  timelineVideoRefs,
  trackVolumes,
  videoTrackVolumes,
}: UseTimelinePlaybackOptions) {

  const animationRef   = useRef<number | undefined>(undefined);
  const lastUpdateRef  = useRef<number | undefined>(undefined);
  const shouldAttemptPlay = (media: HTMLMediaElement) => {
    const src = media.currentSrc || media.src || '';
    if (!src) return false;
    if (media.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) return false;
    return true;
  };
  const safePlay = (media: HTMLMediaElement, label: string) => {
    if (!shouldAttemptPlay(media)) return;
    media.play().catch((err) => {
      if (err?.name === 'AbortError') return;
      console.warn(`[Timeline Playback] Failed to play ${label}`, err);
    });
  };

  /** Seek to an absolute time and sync all audio/video elements */
  const seekTimelineTo = (newTime: number) => {
    // Resume Web Audio API context if suspended
    const ac = (window as any).globalAudioContext;
    if (ac && ac.state === 'suspended') ac.resume();

    setTimelineTime(newTime);

    timelineClips.forEach(clip => {
      const audio = timelineAudioRefs.current[clip.id];
      if (!audio) return;
      if (newTime >= clip.startTime && newTime < clip.startTime + clip.duration) {
        audio.currentTime = newTime - clip.startTime;
        const finalVol = ((clip.volume ?? 100) / 100) * ((trackVolumes[clip.track] ?? 100) / 100);
        audio.volume = Math.min(1, Math.max(0, finalVol));
        if (isPlayingTimeline) safePlay(audio, `audio clip ${clip.id}`);
      } else {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    timelineVideoClips.forEach(clip => {
      const video = timelineVideoRefs.current[clip.id];
      if (!video) return;
      if (newTime >= clip.startTime && newTime < clip.startTime + clip.duration) {
        video.currentTime = newTime - clip.startTime + (clip.trimStart || 0);
        const finalVol = ((clip.volume ?? 100) / 100) * ((videoTrackVolumes[clip.track ?? 0] ?? 100) / 100);
        video.volume = Math.min(1, Math.max(0, finalVol));
        if (isPlayingTimeline) safePlay(video, `video clip ${clip.id}`);
      } else {
        video.pause();
      }
    });
  };

  /** Toggle play/pause — restarts from beginning if past the end */
  const toggleTimelinePlay = () => {
    if (!isPlayingTimeline) {
      // Resume Web Audio API context if suspended (Browser autoplay policy)
      const ac = (window as any).globalAudioContext;
      if (ac && ac.state === 'suspended') {
        ac.resume();
      }

      let startFrom = timelineTime;
      const maxTime =
        timelineClips.length > 0
          ? Math.max(...timelineClips.map(c => c.startTime + c.duration))
          : 20;
      if (timelineTime > maxTime) {
        setTimelineTime(0);
        startFrom = 0;
      }

      // Pre-calculate which clips should play immediately
      const activeAudioIds = new Set(
        timelineClips.filter(c => startFrom >= c.startTime && startFrom < c.startTime + c.duration).map(c => c.id)
      );
      const activeVideoIds = new Set(
        timelineVideoClips.filter(c => startFrom >= c.startTime && startFrom < c.startTime + c.duration).map(c => c.id)
      );

      // Unlock all other audio elements to bypass autoplay restrictions in rAF
      Object.entries(timelineAudioRefs.current).forEach(([id, audio]) => {
        if (audio && !activeAudioIds.has(id)) {
          const origMuted = audio.muted;
          audio.muted = true;
          const p = audio.play();
          if (p !== undefined) {
            p.then(() => {
              audio.pause();
              audio.muted = origMuted;
            }).catch(() => {
              audio.muted = origMuted;
            });
          }
        }
      });

      // Unlock all other video elements
      Object.entries(timelineVideoRefs.current).forEach(([id, video]) => {
        if (video && !activeVideoIds.has(id)) {
          const origMuted = video.muted;
          video.muted = true;
          const p = video.play();
          if (p !== undefined) {
            p.then(() => {
              video.pause();
              video.muted = origMuted;
            }).catch(() => {
              video.muted = origMuted;
            });
          }
        }
      });

      // Activate clips already under the playhead
      timelineClips.forEach(clip => {
        const audio = timelineAudioRefs.current[clip.id];
        if (audio && startFrom >= clip.startTime && startFrom < clip.startTime + clip.duration) {
          audio.currentTime = startFrom - clip.startTime;
          const finalVol = ((clip.volume ?? 100) / 100) * ((trackVolumes[clip.track] ?? 100) / 100);
          audio.volume = Math.min(1, Math.max(0, finalVol));
          safePlay(audio, `audio clip ${clip.id}`);
        }
      });
      timelineVideoClips.forEach(clip => {
        const video = timelineVideoRefs.current[clip.id];
        if (video && startFrom >= clip.startTime && startFrom < clip.startTime + clip.duration) {
          video.currentTime = startFrom - clip.startTime + (clip.trimStart || 0);
          const finalVol = ((clip.volume ?? 100) / 100) * ((videoTrackVolumes[clip.track ?? 0] ?? 100) / 100);
          video.volume = Math.min(1, Math.max(0, finalVol));
          safePlay(video, `video clip ${clip.id}`);
        }
      });
    }
    setIsPlayingTimeline(prev => !prev);
  };

  // rAF animation loop
  useEffect(() => {
    if (isPlayingTimeline) {
      lastUpdateRef.current = performance.now();

      const tick = () => {
        const now = performance.now();
        const delta = (now - (lastUpdateRef.current ?? now)) / 1000;
        lastUpdateRef.current = now;

        setTimelineTime(prevTime => {
          const newTime = prevTime + delta;

          timelineClips.forEach(clip => {
            if (prevTime <= clip.startTime && newTime > clip.startTime) {
              const audio = timelineAudioRefs.current[clip.id];
              if (audio) {
                audio.currentTime = 0;
                const finalVol = ((clip.volume ?? 100) / 100) * ((trackVolumes[clip.track] ?? 100) / 100);
                audio.volume = Math.min(1, Math.max(0, finalVol));
                safePlay(audio, `audio clip ${clip.id}`);
              }
            }
          });

          timelineVideoClips.forEach(clip => {
            if (prevTime <= clip.startTime && newTime > clip.startTime) {
              const video = timelineVideoRefs.current[clip.id];
              if (video) {
                video.currentTime = clip.trimStart || 0;
                const finalVol = ((clip.volume ?? 100) / 100) * ((videoTrackVolumes[clip.track ?? 0] ?? 100) / 100);
                video.volume = Math.min(1, Math.max(0, finalVol));
                safePlay(video, `video clip ${clip.id}`);
              }
            }
          });

          return newTime;
        });

        animationRef.current = requestAnimationFrame(tick);
      };

      animationRef.current = requestAnimationFrame(tick);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      Object.values(timelineAudioRefs.current).forEach(a => a?.pause());
      Object.values(timelineVideoRefs.current).forEach(v => v?.pause());
    }

    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isPlayingTimeline, timelineClips, timelineVideoClips, trackVolumes, videoTrackVolumes]);

  // Live update video volume when timelineVideoClips or videoTrackVolumes changes
  useEffect(() => {
    timelineVideoClips.forEach(clip => {
      const video = timelineVideoRefs.current[clip.id];
      if (video && timelineTime >= clip.startTime && timelineTime < clip.startTime + clip.duration) {
        const finalVol = ((clip.volume ?? 100) / 100) * ((videoTrackVolumes[clip.track ?? 0] ?? 100) / 100);
        video.volume = Math.min(1, Math.max(0, finalVol));
      }
    });
  }, [timelineVideoClips, videoTrackVolumes, timelineTime]);

  return { seekTimelineTo, toggleTimelinePlay };
}
