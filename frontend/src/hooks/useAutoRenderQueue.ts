import { useState, useEffect, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';
import toast from 'react-hot-toast';
import { useProjectStore } from '../store/useProjectStore';

interface UseAutoRenderQueueProps {
  nodesRef: React.MutableRefObject<Node[]>;
  edgesRef: React.MutableRefObject<Edge[]>;
  onGenFrame: (nodeId: string) => Promise<void> | void;
  onGenVideo: (nodeId: string) => Promise<void> | void;
  onRegenVideoNode: (nodeId: string, videoNodeId: string) => Promise<void> | void;
  onExtractLastFrame: (nodeId: string, videoUrl: string) => Promise<void> | void;
  setNodes: (updater: (nds: Node[]) => Node[]) => void;
}

export function useAutoRenderQueue({
  nodesRef,
  edgesRef,
  onGenFrame,
  onGenVideo,
  onRegenVideoNode,
  onExtractLastFrame,
  setNodes
}: UseAutoRenderQueueProps) {
  const [isAutoRendering, setIsAutoRendering] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [totalScenes, setTotalScenes] = useState(0);
  const [completedScenes, setCompletedScenes] = useState(0);
  const retryTracker = useRef<Record<string, { count: number, nextRetry: number }>>({});

  const toggleAutoRender = () => {
    setIsAutoRendering(prev => !prev);
  };

  useEffect(() => {
    if (!isAutoRendering) {
      setProgressText('');
      if (useProjectStore.getState().videoProgress.status === 'rendering') {
        useProjectStore.getState().setVideoProgress({ status: 'idle' });
      }
      
      // Force clear generation states if stuck
      setNodes(nds => nds.map(n => {
        if (n.data.isGenerating || n.data.isGeneratingVideo) {
          return { ...n, data: { ...n.data, isGenerating: false, isGeneratingVideo: false } };
        }
        return n;
      }));
      
      retryTracker.current = {};
      return;
    }

    const interval = setInterval(() => {
      const sceneNodes = nodesRef.current.filter(n => n.type === 'scene').sort((a, b) => {
        const idA = parseInt(a.id.replace('shot_', '')) || 0;
        const idB = parseInt(b.id.replace('shot_', '')) || 0;
        return idA - idB;
      });

      setTotalScenes(sceneNodes.length);

      let activeNode: Node | null = null;
      let totalCompleted = 0;
      
      for (const scene of sceneNodes) {
        const outgoingVideoEdge = edgesRef.current.find(e => e.source === scene.id && e.target.startsWith('video_'));
        
        if (outgoingVideoEdge) {
           const videoNode = nodesRef.current.find(n => n.id === outgoingVideoEdge.target);
           if (videoNode && !videoNode.data.isGeneratingVideo && videoNode.data.videoUrl) {
              totalCompleted++;
              continue; 
           }
        }
        
        // Found the first incomplete scene
        activeNode = scene;
        break;
      }
      
      setCompletedScenes(totalCompleted);
      setProgressText(`Rendering ${totalCompleted}/${sceneNodes.length} Scenes...`);
      
      if (!activeNode) {
         setIsAutoRendering(false);
         useProjectStore.getState().setVideoProgress({
           status: 'success',
           message: "Auto-Render hoàn tất!",
           currentStep: sceneNodes.length,
           totalSteps: sceneNodes.length,
         });
         setTimeout(() => useProjectStore.getState().setVideoProgress({ status: 'idle' }), 3000);
         toast.success("✨ Auto-Render All completed successfully!");
         return;
      }

      useProjectStore.getState().setVideoProgress({
        status: 'rendering',
        message: `Đang chờ Google Labs cấp GPU để quay cảnh ${activeNode.data?.name || activeNode.id}...`,
        currentStep: totalCompleted,
        totalSteps: sceneNodes.length,
      });
      
      // Prevent parallel generation to respect rate limits and credit usage
      const isAnyGenerating = nodesRef.current.some(n => n.data.isGenerating || n.data.isGeneratingVideo);
      if (isAnyGenerating) return; 

      // Check dependencies
      const incomingEdges = edgesRef.current.filter(e => e.target === activeNode!.id);
      const depEdge = incomingEdges.find(e => e.source.startsWith('shot_') || e.source.startsWith('video_'));
      
      let isLocked = false;
      let hasUpstreamVideo = false;
      let upstreamVideoUrl = '';
      
      if (depEdge) {
        const prevNode = nodesRef.current.find(n => n.id === depEdge.source);
        if (prevNode) {
           if (prevNode.type === 'scene') {
               isLocked = true; 
           } else if (prevNode.type === 'video') {
              hasUpstreamVideo = true;
              if (prevNode.data.videoUrl) {
                  upstreamVideoUrl = prevNode.data.videoUrl as string;
              }
              if (prevNode.data.isGeneratingVideo || !upstreamVideoUrl) {
                  isLocked = true;
              }
           }
        }
      }
      
      if (isLocked) return; 
      
      // Node is unlocked, perform next required action
      if (!activeNode.data.frameMediaId) {
         if (hasUpstreamVideo && upstreamVideoUrl) {
            console.log(`[Auto-Render] Extracting frame for ${activeNode.id} from ${upstreamVideoUrl}`);
            onExtractLastFrame(activeNode.id, upstreamVideoUrl);
         } else {
            const tracker = retryTracker.current[activeNode.id] || { count: 0, nextRetry: 0 };
            
            if (tracker.count >= 10) {
              setIsAutoRendering(false);
              useProjectStore.getState().setVideoProgress({ status: 'error', message: 'Tạm ngưng Auto-Render vì máy chủ quá tải.' });
              toast.error('Google Labs đang quá tải. Đã thử 10 lần không thành công. Hãy đợi vài phút rồi chạy lại nhé!');
              return;
            }

            if (Date.now() < tracker.nextRetry) {
              const remainingSec = Math.ceil((tracker.nextRetry - Date.now()) / 1000);
              setProgressText(`Đang chờ máy chủ hạ nhiệt (${remainingSec}s)...`);
              useProjectStore.getState().setVideoProgress({
                status: 'rendering',
                message: `Chờ máy chủ tạo ảnh (${remainingSec}s)...`,
                currentStep: totalCompleted,
                totalSteps: sceneNodes.length,
              });
              return;
            }

            console.log(`[Auto-Render] Generating frame for ${activeNode.id} (Attempt ${tracker.count + 1})`);
            retryTracker.current[activeNode.id] = { count: tracker.count + 1, nextRetry: Date.now() + 30000 };
            onGenFrame(activeNode.id);
         }
      } else {
         const outgoingVideoEdge = edgesRef.current.find(e => e.source === activeNode!.id && e.target.startsWith('video_'));
         if (!outgoingVideoEdge) {
            console.log(`[Auto-Render] Generating video for ${activeNode.id}`);
            onGenVideo(activeNode.id);
         } else {
            const videoNode = nodesRef.current.find(n => n.id === outgoingVideoEdge.target);
            if (videoNode && !videoNode.data.isGeneratingVideo && !videoNode.data.videoUrl) {
               const tracker = retryTracker.current[videoNode.id] || { count: 0, nextRetry: 0 };
               
               if (tracker.count >= 10) {
                 setIsAutoRendering(false);
                 useProjectStore.getState().setVideoProgress({ status: 'error', message: 'Tạm ngưng Auto-Render vì máy chủ quá tải.' });
                 toast.error('Google Labs đang quá tải. Đã thử 10 lần không thành công. Hãy đợi vài phút rồi chạy lại nhé!');
                 return;
               }

               if (Date.now() < tracker.nextRetry) {
                 const remainingSec = Math.ceil((tracker.nextRetry - Date.now()) / 1000);
                 setProgressText(`Đang chờ máy chủ hạ nhiệt (${remainingSec}s)...`);
                 useProjectStore.getState().setVideoProgress({
                   status: 'rendering',
                   message: `Đang chờ Server Video Google (${remainingSec}s)...`,
                   currentStep: totalCompleted,
                   totalSteps: sceneNodes.length,
                 });
                 return;
               }

               console.log(`[Auto-Render] Retrying failed video for ${activeNode.id} (Attempt ${tracker.count + 1})`);
               retryTracker.current[videoNode.id] = { count: tracker.count + 1, nextRetry: Date.now() + 60000 }; // Timeout 1 minute
               onRegenVideoNode(activeNode.id, videoNode.id);
            }
         }
      }
      
    }, 3000); // Poll every 3 seconds
    
    return () => clearInterval(interval);
  }, [isAutoRendering, nodesRef, edgesRef, onGenFrame, onGenVideo, onExtractLastFrame]);

  return {
    isAutoRendering,
    toggleAutoRender,
    progressText,
    totalScenes,
    completedScenes
  };
}
