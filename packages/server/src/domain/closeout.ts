import type {
  CleanupCandidate,
  CloseoutFinding,
  FollowUpTaskDraft,
  ProductManagerCloseout,
  TaskPriority,
} from "@adhd/core";

const CLOSEOUT_BLOCK = /```adhd-closeout\s*([\s\S]*?)```/i;
const PRIORITIES = new Set<TaskPriority>(["P0", "P1", "P2", "P3", "P4"]);

export interface ParsedCloseout {
  report: ProductManagerCloseout;
  validationErrors: string[];
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.flatMap((entry) =>
        typeof entry === "string" && entry.trim() ? [entry.trim()] : [],
      ))]
    : [];
}

function findingsOf(value: unknown): CloseoutFinding[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const finding = recordOf(entry);
    const id = typeof finding?.id === "string" ? finding.id.trim() : "";
    const title =
      typeof finding?.title === "string" ? finding.title.trim() : "";
    const severity = finding?.severity;
    const evidence =
      typeof finding?.evidence === "string" ? finding.evidence.trim() : "";
    if (
      !id ||
      !title ||
      (severity !== "blocking" && severity !== "non_blocking")
    ) {
      return [];
    }
    return [{
      id,
      title,
      severity,
      ...(evidence ? { evidence } : {}),
    }];
  });
}

function tasksOf(value: unknown): FollowUpTaskDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const task = recordOf(entry);
    const findingId =
      typeof task?.findingId === "string" ? task.findingId.trim() : "";
    const title = typeof task?.title === "string" ? task.title.trim() : "";
    const description =
      typeof task?.description === "string" ? task.description.trim() : "";
    const priority = task?.priority;
    if (
      !findingId ||
      !title ||
      !description ||
      typeof priority !== "string" ||
      !PRIORITIES.has(priority as TaskPriority)
    ) {
      return [];
    }
    return [{
      findingId,
      title,
      description,
      priority: priority as TaskPriority,
      tags: stringsOf(task?.tags),
    }];
  });
}

function cleanupOf(value: unknown): CleanupCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const candidate = recordOf(entry);
    const relativePath =
      typeof candidate?.relativePath === "string"
        ? candidate.relativePath.trim()
        : "";
    const reason =
      typeof candidate?.reason === "string" ? candidate.reason.trim() : "";
    return relativePath && reason ? [{ relativePath, reason }] : [];
  });
}

function emptyCloseout(summary: string): ProductManagerCloseout {
  return {
    summary,
    deliveredScope: [],
    decisions: [],
    knowledge: [],
    findings: [],
    tasks: [],
    completedTaskIds: [],
    unresolvedTaskIds: [],
    cleanup: [],
  };
}

export function parseProductManagerCloseout(output: string): ParsedCloseout {
  const block = CLOSEOUT_BLOCK.exec(output)?.[1];
  if (!block) {
    return {
      report: emptyCloseout(output.trim() || "Product Manager produced no closeout text."),
      validationErrors: ["Missing fenced adhd-closeout JSON block"],
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(block);
  } catch {
    return {
      report: emptyCloseout(output.trim()),
      validationErrors: ["adhd-closeout block is not valid JSON"],
    };
  }
  const record = recordOf(value);
  const summary =
    typeof record?.summary === "string" ? record.summary.trim() : "";
  if (!summary) {
    return {
      report: emptyCloseout(output.trim()),
      validationErrors: ["adhd-closeout summary is required"],
    };
  }
  const findings = findingsOf(record?.findings);
  const tasks = tasksOf(record?.tasks);
  const findingIds = new Set(findings.map((finding) => finding.id));
  const linkedTasks = tasks.filter((task) => findingIds.has(task.findingId));
  const validationErrors =
    linkedTasks.length === tasks.length
      ? []
      : ["Every follow-up task must reference a declared finding"];
  return {
    report: {
      summary,
      deliveredScope: stringsOf(record?.deliveredScope),
      decisions: stringsOf(record?.decisions),
      knowledge: stringsOf(record?.knowledge),
      findings,
      tasks: linkedTasks,
      completedTaskIds: stringsOf(record?.completedTaskIds),
      unresolvedTaskIds: stringsOf(record?.unresolvedTaskIds),
      cleanup: cleanupOf(record?.cleanup),
      ...(typeof record?.nextRecommendation === "string" &&
      record.nextRecommendation.trim()
        ? { nextRecommendation: record.nextRecommendation.trim() }
        : {}),
    },
    validationErrors,
  };
}
