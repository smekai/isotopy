import type { RunEvent } from "@adhd/core";

interface LogPanelProps {
  events: RunEvent[];
}

export function LogPanel({ events }: LogPanelProps) {
  const lines = events
    .filter((event) => event.message)
    .map((event) => ({
      id: `${event.ts}-${event.type}-${event.stageId ?? "run"}`,
      text: `[${event.ts.slice(11, 19)}] ${
        event.stageId ? `${event.stageId}: ` : ""
      }${event.message}`,
    }));

  return (
    <section className="log-panel">
      <header>
        <h2>Live logs</h2>
        <span>{lines.length} events</span>
      </header>
      <div className="log-scroll">
        {lines.length === 0 ? (
          <p className="muted">Start a run to see agent activity.</p>
        ) : (
          lines.map((line) => (
            <div key={line.id} className="log-line">
              {line.text}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
