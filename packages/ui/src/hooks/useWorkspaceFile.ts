import { useEffect, useState } from "react";
import { fetchRunFileContent } from "../api";
import type { WorkspaceFileContent } from "../api";

export interface WorkspaceFileController {
  selectedPath: string | null;
  content: WorkspaceFileContent | null;
  error: string | null;
  select: (path: string) => void;
}

export function useWorkspaceFile(runId: string): WorkspaceFileController {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<WorkspaceFileContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPath === null) {
      setContent(null);
      return;
    }
    let cancelled = false;
    fetchRunFileContent(runId, selectedPath)
      .then((result) => {
        if (!cancelled) {
          setContent(result);
          setError(null);
        }
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setContent(null);
          setError(failure instanceof Error ? failure.message : "Failed to read file");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [runId, selectedPath]);

  return { selectedPath, content, error, select: setSelectedPath };
}
