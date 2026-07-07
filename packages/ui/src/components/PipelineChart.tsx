import type { PipelineDefinition, StageState } from "@adhd/core";

interface NodeLayout {
  id: string;
  label: string;
  x: number;
  y: number;
  status: StageState["status"];
}

interface EdgeLayout {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

const NODE_WIDTH = 128;
const NODE_HEIGHT = 56;
const GROUP_GAP = 72;
const NODE_GAP = 24;
const PARALLEL_GAP = 88;

function statusColor(status: StageState["status"]): string {
  switch (status) {
    case "running":
      return "#3b82f6";
    case "passed":
      return "#22c55e";
    case "failed":
      return "#ef4444";
    default:
      return "#64748b";
  }
}

function buildLayout(
  pipeline: PipelineDefinition,
  stages: StageState[],
): { nodes: NodeLayout[]; edges: EdgeLayout[]; width: number; height: number } {
  const statusById = new Map(stages.map((stage) => [stage.id, stage.status]));
  const nodes: NodeLayout[] = [];
  const edges: EdgeLayout[] = [];

  let cursorX = 40;
  let maxY = 40;

  for (const group of pipeline.groups) {
    const groupNodes: NodeLayout[] = [];

    if (group.mode === "sequential") {
      let x = cursorX;
      const y = 80;
      for (const stage of group.stages) {
        const node = {
          id: stage.id,
          label: stage.label,
          x,
          y,
          status: statusById.get(stage.id) ?? "pending",
        };
        groupNodes.push(node);
        x += NODE_WIDTH + NODE_GAP;
      }
      maxY = Math.max(maxY, y + NODE_HEIGHT);
      cursorX = x + GROUP_GAP;
    } else {
      let y = 40;
      const x = cursorX;
      for (const stage of group.stages) {
        const node = {
          id: stage.id,
          label: stage.label,
          x,
          y,
          status: statusById.get(stage.id) ?? "pending",
        };
        groupNodes.push(node);
        y += NODE_HEIGHT + PARALLEL_GAP;
      }
      maxY = Math.max(maxY, y);
      cursorX += NODE_WIDTH + GROUP_GAP;
    }

    for (let index = 0; index < groupNodes.length - 1; index += 1) {
      const from = groupNodes[index];
      const to = groupNodes[index + 1];
      if (group.mode === "sequential") {
        edges.push({
          from: { x: from.x + NODE_WIDTH, y: from.y + NODE_HEIGHT / 2 },
          to: { x: to.x, y: to.y + NODE_HEIGHT / 2 },
        });
      }
    }

    nodes.push(...groupNodes);
  }

  for (let groupIndex = 0; groupIndex < pipeline.groups.length - 1; groupIndex += 1) {
    const currentGroup = pipeline.groups[groupIndex];
    const nextGroup = pipeline.groups[groupIndex + 1];
    const currentNodes = nodes.filter((node) =>
      currentGroup.stages.some((stage) => stage.id === node.id),
    );
    const nextNodes = nodes.filter((node) =>
      nextGroup.stages.some((stage) => stage.id === node.id),
    );
    if (currentNodes.length === 0 || nextNodes.length === 0) {
      continue;
    }

    const from = currentNodes[currentNodes.length - 1];
    const to = nextNodes[0];
    edges.push({
      from: { x: from.x + NODE_WIDTH, y: from.y + NODE_HEIGHT / 2 },
      to: { x: to.x, y: to.y + NODE_HEIGHT / 2 },
    });
  }

  return {
    nodes,
    edges,
    width: Math.max(cursorX + 40, 720),
    height: Math.max(maxY + 40, 220),
  };
}

interface PipelineChartProps {
  pipeline: PipelineDefinition;
  stages: StageState[];
}

export function PipelineChart({ pipeline, stages }: PipelineChartProps) {
  const { nodes, edges, width, height } = buildLayout(pipeline, stages);

  return (
    <svg
      className="pipeline-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Pipeline chart"
    >
      <defs>
        <marker
          id="arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
        </marker>
      </defs>

      {edges.map((edge, index) => (
        <line
          key={`edge-${index}`}
          x1={edge.from.x}
          y1={edge.from.y}
          x2={edge.to.x}
          y2={edge.to.y}
          stroke="#94a3b8"
          strokeWidth="2"
          markerEnd="url(#arrow)"
        />
      ))}

      {nodes.map((node) => (
        <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
          <rect
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            rx="10"
            fill="#0f172a"
            stroke={statusColor(node.status)}
            strokeWidth="3"
          />
          <text
            x={NODE_WIDTH / 2}
            y={NODE_HEIGHT / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#e2e8f0"
            fontSize="13"
            fontFamily="Segoe UI, sans-serif"
          >
            {node.label}
          </text>
          {node.status === "running" && (
            <circle
              cx={NODE_WIDTH - 12}
              cy={12}
              r="5"
              fill="#3b82f6"
              className="pulse"
            />
          )}
        </g>
      ))}
    </svg>
  );
}
