import { useCallback, useMemo, useRef } from 'react';
import React from 'react';
import { useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import type { Connection, Edge, Node } from '@xyflow/react';
import { useProjectStore } from '../store/useProjectStore';
import type { CharacterMetadata } from '../types';
import AssetNodeCard from '../components/videostudio/AssetNodeCard';
import SceneNodeCard from '../components/videostudio/SceneNodeCard';
import VideoNodeCard from '../components/videostudio/VideoNodeCard';
import DeletableEdge from '../components/videostudio/DeletableEdge';

export function useNodeGraph({
  charactersMetadata,
  onLineIdsChange,
}: {
  charactersMetadata: Record<string, CharacterMetadata>;
  onLineIdsChange: (ids: number[]) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [reactFlowInstance, setReactFlowInstance] = React.useState<any>(null);
  const [hydrated, setHydrated] = React.useState(false);

  // Refs to manage safe synchronization, preventing race conditions on hydration or project switches
  const expectedNodesRef = useRef<any[]>([]);
  const expectedEdgesRef = useRef<any[]>([]);
  const isSyncingRef = useRef(false);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  React.useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  React.useEffect(() => { edgesRef.current = edges; }, [edges]);

  const lastPersistedNodes = useRef(nodes);
  const lastPersistedEdges = useRef(edges);

  const isUnmountingRef = React.useRef(false);
  React.useEffect(() => {
    isUnmountingRef.current = false;
    return () => {
      isUnmountingRef.current = true;
    };
  }, []);

  const persistVideoNodes = useProjectStore((s) => s.setVideoNodes);
  const persistVideoEdges = useProjectStore((s) => s.setVideoEdges);
  const projectVersion = useProjectStore((s) => s.projectVersion);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);

  const _hasHydrated = useProjectStore((s) => s._hasHydrated);

  const applyJobStatus = React.useCallback((rawNodes: any[]) => {
    const store = useProjectStore.getState();
    const ops = new Set(store.processingJobs.operationNames);
    const medias = new Set(store.processingJobs.mediaIds);
    return rawNodes.map((n: any) => ({
      ...n,
      data: {
        ...n.data,
        isGeneratingVideo: n.type === 'video' && (
          (n.data?.opName && ops.has(n.data.opName)) ||
          (n.data?.mediaId && medias.has(n.data.mediaId))
        ),
        isGeneratingFrame: false,
      },
    }));
  }, []);

  // Load nodes and edges from store on mount — safe default: isGeneratingVideo = false
  // projectVersion effect below will correct it once App.tsx finishes the server fetch
  React.useEffect(() => {
    if (!_hasHydrated) return;
    if (hydrated) return;

    const initialNodes = useProjectStore.getState().videoNodes;
    const initialEdges = useProjectStore.getState().videoEdges;
    const mappedNodes = applyJobStatus(initialNodes);

    expectedNodesRef.current = mappedNodes;
    expectedEdgesRef.current = initialEdges;
    isSyncingRef.current = true;

    setNodes(mappedNodes);
    if (initialEdges.length > 0) setEdges(initialEdges);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_hasHydrated, hydrated]);

  const graphSaveTimer = useRef<any>(undefined);

  // Persist to store + debounced save to SQLite whenever the graph changes
  React.useEffect(() => {
    if (!hydrated) return;
    if (isUnmountingRef.current) return;

    // If currently syncing (due to project switch or page reload), wait until React Flow's local state 
    // actually updates and matches the expected mapped values from the store.
    if (isSyncingRef.current) {
      const currentIds = new Set(nodes.map(n => n.id));
      const expectedIds = expectedNodesRef.current.map(n => n.id);
      const isMatch = expectedIds.length === nodes.length && expectedIds.every(id => currentIds.has(id));

      if (!isMatch) {
        // Local React state has not flushed yet, skip saving to prevent overwriting store with stale/empty data
        return;
      }
      isSyncingRef.current = false;
    }

    lastPersistedNodes.current = nodes;
    lastPersistedEdges.current = edges;
    persistVideoNodes(nodes);
    persistVideoEdges(edges);
    clearTimeout(graphSaveTimer.current);
    graphSaveTimer.current = setTimeout(() => {
      // Intentionally left blank: Saving is managed centrally by App.tsx to avoid race conditions on page load.
    }, 2000);
  }, [nodes, edges, persistVideoNodes, persistVideoEdges, hydrated]);

  // Sync FROM Store when project version bumps or project switches
  React.useEffect(() => {
    if (!hydrated) return;
    const store = useProjectStore.getState();
    const mappedNodes = applyJobStatus(store.videoNodes);
    const loadedEdges = store.videoEdges;

    expectedNodesRef.current = mappedNodes;
    expectedEdgesRef.current = loadedEdges;
    isSyncingRef.current = true;

    setNodes(mappedNodes);
    setEdges(loadedEdges);
  }, [projectVersion, currentProjectId, setNodes, setEdges, applyJobStatus, hydrated]);

  const nodeTypes = useMemo(() => ({ asset: AssetNodeCard, scene: SceneNodeCard, video: VideoNodeCard }), []);
  const edgeTypes = useMemo(() => ({ default: DeletableEdge }), []);

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const dataString = event.dataTransfer.getData('application/reactflow');
      if (!dataString || !reactFlowInstance) return;

      const dragData = JSON.parse(dataString);
      const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const asset = charactersMetadata[dragData.id];
      if (!asset) return;

      setNodes((nds) => nds.concat({
        id: `v_${dragData.id}_${Date.now()}`,
        type: 'asset',
        position,
        data: {
          name: asset.name + (dragData.type === 'variation' ? ' (Var)' : ''),
          assetType: asset.type,
          imagePath: dragData.imagePath,
          mediaId: dragData.mediaId,
          baseAssetId: dragData.type === 'variation' ? dragData.id : null,
        },
      }));
    },
    [reactFlowInstance, charactersMetadata, setNodes]
  );

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: any[] }) => {
      if (selectedNodes.length === 0) { onLineIdsChange([]); return; }
      const sel = selectedNodes[0];
      const parseIds = (linesStr: string) =>
        linesStr.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));

      if (sel.type === 'scene' && sel.data?.lines) {
        onLineIdsChange(parseIds(sel.data.lines as string));
      } else if (sel.type === 'video') {
        const edge = edgesRef.current.find((e) => e.target === sel.id);
        if (edge) {
          const sceneNode = nodesRef.current.find((n) => n.id === edge.source && n.type === 'scene');
          if (sceneNode?.data?.lines) {
            onLineIdsChange(parseIds(sceneNode.data.lines as string));
            return;
          }
        }
        onLineIdsChange([]);
      } else {
        onLineIdsChange([]);
      }
    },
    [onLineIdsChange]
  );

  return {
    nodes, setNodes, onNodesChange,
    edges, setEdges, onEdgesChange,
    nodesRef, edgesRef,
    nodeTypes, edgeTypes,
    onConnect, onDragOver, onDrop,
    handleSelectionChange,
    reactFlowInstance, setReactFlowInstance,
  };
}
