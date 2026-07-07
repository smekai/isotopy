import { useEffect, useMemo, useState } from "react";
import type { PipelineDefinition } from "@adhd/core";
import { fetchPipelines, startRun } from "./api";
import { PipelineChart } from "./components/PipelineChart";
import { LogPanel } from "./components/LogPanel";
import { useRunEvents } from "./hooks/useRunEvents";

export function App() {
  const [pipelines, setPipelines] = useState<PipelineDefinition[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("sequential");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { run, events } = useRunEvents(activeRunId);

  useEffect(() => {
    void fetchPipelines()
      .then(setPipelines)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load pipelines");
      });
  }, []);

  const selectedPipeline = useMemo(
    () => pipelines.find((pipeline) => pipeline.id === selectedPipelineId),
    [pipelines, selectedPipelineId],
  );

  const stages = run?.stages ?? [];

  async function handleStartRun() {
    setLoading(true);
    setError(null);
    try {
      const created = await startRun(selectedPipelineId);
      setActiveRunId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start run");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">ADHD prototype</p>
          <h1>Artificial Development, Human Directed</h1>
          <p className="subtitle">
            Watch fake agents move through a pipeline — sequential or parallel —
            to validate the product direction with your team.
          </p>
        </div>
        <div className="controls">
          <label>
            Pipeline
            <select
              value={selectedPipelineId}
              onChange={(event) => setSelectedPipelineId(event.target.value)}
            >
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleStartRun} disabled={loading}>
            {loading ? "Starting..." : "Start run"}
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <main className="dashboard">
        <section className="chart-panel">
          <header>
            <h2>Pipeline</h2>
            {run && (
              <span className={`status-pill status-${run.status}`}>
                {run.status}
              </span>
            )}
          </header>
          {selectedPipeline ? (
            <PipelineChart pipeline={selectedPipeline} stages={stages} />
          ) : (
            <p className="muted">Loading pipeline...</p>
          )}
          {selectedPipeline && (
            <p className="pipeline-description">{selectedPipeline.description}</p>
          )}
        </section>

        <LogPanel events={events} />
      </main>
    </div>
  );
}
