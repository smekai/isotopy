import type { RunState } from "@adhd/core";
import { SEQUENTIAL_PIPELINE, flattenPipelineStages } from "@adhd/core";
import type { Dir } from "../theme";
import { GOLD } from "../theme";
import { GateMarker } from "./GateMarker";
import { StageNode } from "./StageNode";

const STAGE_DEFS = new Map(
  flattenPipelineStages(SEQUENTIAL_PIPELINE).map((def) => [def.id, def]),
);

interface ConnectorProps {
  d: Dir;
  dim?: boolean;
}

function Connector({ d, dim }: ConnectorProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", width: 20, flexShrink: 0 }}>
      <div style={{ flex: 1, height: 2, borderRadius: 1, background: dim ? "rgba(0,0,0,0.07)" : d.accentMid }} />
    </div>
  );
}

export interface PipelineRowProps {
  run: RunState;
  d: Dir;
  focusedId: string | null;
  onNodeClick: (stageId: string) => void;
  onApprove: (stageId: string) => void;
}

export function PipelineRow({ run, d, focusedId, onNodeClick, onApprove }: PipelineRowProps) {
  let gateCounter = 0;

  return (
    <div style={{ flexShrink: 0, overflowX: "auto", padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", minWidth: "max-content" }}>
        {run.stages.map((stage, i) => {
          const def = STAGE_DEFS.get(stage.id);
          const isLast = i === run.stages.length - 1;

          const node = (
            <StageNode
              stageId={stage.id}
              label={stage.label}
              status={stage.status}
              d={d}
              focused={focusedId === stage.id}
              onClick={() => onNodeClick(stage.id)}
            />
          );

          if (isLast) {
            return <div key={stage.id}>{node}</div>;
          }

          if (!def?.gateAfter) {
            return (
              <div key={stage.id} style={{ display: "flex", alignItems: "center" }}>
                {node}
                <Connector d={d} dim={stage.status === "pending" || stage.status === "skipped"} />
              </div>
            );
          }

          const gateIndex = ++gateCounter;
          const gateAwaiting = stage.status === "awaiting";

          return (
            <div key={stage.id} style={{ display: "flex", alignItems: "center" }}>
              {node}
              <div style={{ width: 12, height: 2, borderRadius: 1, background: gateAwaiting ? GOLD : d.border }} />
              <GateMarker
                index={gateIndex}
                d={d}
                awaiting={gateAwaiting}
                onApprove={gateAwaiting ? () => onApprove(stage.id) : undefined}
              />
              <div style={{ width: 12, height: 2, borderRadius: 1, background: gateAwaiting ? GOLD : d.border }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
