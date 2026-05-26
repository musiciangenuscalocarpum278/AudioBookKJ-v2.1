import { BaseEdge, getBezierPath, useReactFlow, EdgeLabelRenderer, useNodes } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { X } from 'lucide-react';

const DeletableEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  source,
  target,
  animated,
}: EdgeProps) => {
  const { setEdges } = useReactFlow();
  const nodes = useNodes();
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target);
  const isConnectedToSelectedNode = !!(sourceNode?.selected || targetNode?.selected);

  let activeStyle = { ...style };
  if (selected) {
    activeStyle = { ...activeStyle, stroke: '#ef4444', strokeWidth: 3 };
  } else if (isConnectedToSelectedNode) {
    activeStyle = {
      ...activeStyle,
      stroke: '#f97316',
      strokeWidth: 3.5,
      filter: 'drop-shadow(0px 0px 8px rgba(249, 115, 22, 0.95))',
    };
  }

  const isAnimated = !!(animated || isConnectedToSelectedNode);

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={activeStyle}
        className={isAnimated ? 'react-flow__edge-path animated' : 'react-flow__edge-path'}
      />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <button
              className="w-5 h-5 bg-zinc-950 border border-rose-500 rounded-none flex items-center justify-center text-rose-500 hover:bg-rose-950/40 hover:text-rose-300 transition-all cursor-pointer shadow-md shadow-rose-950/20"
              onClick={(e) => {
                e.stopPropagation();
                setEdges((es) => es.filter((e) => e.id !== id));
              }}
              title="Delete connection"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default DeletableEdge;
