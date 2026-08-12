import type { RunState } from "@adhd/core";
import { findPipeline, flattenPipelineStages } from "@adhd/core";
import type { CSSProperties } from "react";
import { stagePresentation } from "../run-utils";
import type { Dir } from "../theme";
import { GOLD, RADIUS, SPACE } from "../theme";
import { GateMarker } from "./GateMarker";
import { StageNode } from "./StageNode";

const RULE_THICKNESS = 2;

function gateStub(awaiting: boolean, d: Dir): CSSProperties {
  return {
    width: SPACE.xl,
    height: RULE_THICKNESS,
    borderRadius: RADIUS.xs,
    background: awaiting ? GOLD : d.border,
  };
}

interface ConnectorProps {
  d: Dir;
  dim?: boolean;
}

function Connector({ d, dim }: ConnectorProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", width: SPACE.xxxl, flexShrink: 0 }}>
      <div style={{ flex: 1, height: RULE_THICKNESS, borderRadius: RADIUS.xs, background: dim ? "rgba(0,0,0,0.07)" : d.accentMid }} />
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
  const pipeline = findPipeline(run.pipelineId);
  const stageDefs = new Map(
    (pipeline ? flattenPipelineStages(pipeline) : []).map((def) => [def.id, def]),
  );

  return (
    <div style={{ flexShrink: 0, overflowX: "auto", padding: `${SPACE.xxxl}px ${SPACE.x4l}px` }}>
      <div style={{ display: "flex", alignItems: "center", minWidth: "max-content" }}>
        {run.stages.map((stage, i) => {
          const def = stageDefs.get(stage.id);
          const isLast = i === run.stages.length - 1;

          const node = (
            <StageNode
              stageId={stage.id}
              skill={stage.skill}
              label={stage.label}
              status={stagePresentation(stage)}
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
              <div style={gateStub(gateAwaiting, d)} />
              <GateMarker
                index={gateIndex}
                d={d}
                awaiting={gateAwaiting}
                onApprove={gateAwaiting ? () => onApprove(stage.id) : undefined}
              />
              <div style={gateStub(gateAwaiting, d)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
