// The Anticipate vehicle. AAAAA's second phase says every external interaction
// is declared up front, *including the inputs it must receive* — so this is not
// a passive stub. Each `anticipate()` states both what the engine will be asked
// to do and what it answers; `verify()` then asserts the calls actually arrived,
// in order, with matching inputs, and that nothing extra was called.
//
// Registered via `setEngineAdapter()` (packages/server/src/engines/registry.ts),
// which is what keeps a component test from ever spawning a real CLI.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assert, expect } from "vitest";
import type {
  EngineId,
  ModelOptionDraft,
  OrchestratorDecision,
  RunArtifacts,
  StageUsage,
} from "@adhd/core";
import { detectEngineLimit } from "../../src/domain/rules/engine-limit.ts";
import type {
  EngineAdapter,
  LiveModelLayer,
  EngineRunContext,
  EngineRunResult,
} from "../../src/engines/types.ts";

/** A string equals it exactly; a RegExp must match it. */
export type Matcher = string | RegExp;

/** What a stage's engine call is expected to look like. Every field optional. */
export interface Anticipation {
  /** Working directory the box runs in — the shared workspace for a run. */
  cwd?: Matcher;
  model?: string;
  effort?: string;
  permissionMode?: string;
  /** The persona injected for this stage (`appendSystemPrompt`). */
  persona?: Matcher;
  /** The prompt the box receives, task plus any upstream handoff. */
  prompt?: Matcher;
  /** The CLI session this call is expected to continue, if any. */
  resumeSessionId?: string;
  /** Label used in failure messages, e.g. "Developer". */
  as?: string;
}

type Responder = (ctx: EngineRunContext) => Promise<EngineRunResult>;

interface Scripted {
  anticipation: Anticipation;
  respond: Responder;
}

/** Chainable outcome for one anticipated call. */
export interface AnticipationOutcome {
  /** The box succeeds and reports this text, having spent `usage` if given. */
  reports(result: string, usage?: StageUsage): FakeEngine;
  /** The engine itself fails (non-zero exit, crash, timeout). */
  fails(errorMessage: string): FakeEngine;
  /** The plan limit is reached. `raw` is the CLI line the reset time is parsed from. */
  hitsLimit(raw: string): FakeEngine;
  /** Blocks until the run is aborted — the vehicle for abort tests. */
  hangsUntilAborted(): FakeEngine;
  /**
   * The box stops and asks, handing back a session id. A real CLI would print
   * this on its event stream; the workflow feeds it back as `resumeSessionId`.
   * Omit the id for a CLI that cannot resume (Cursor) — the next turn then
   * replays the conversation instead of continuing a session.
   */
  asks(question: string, sessionId?: string, usage?: StageUsage): FakeEngine;
  /**
   * The box reports this exact text and hands back a session id. What parks the
   * stage is in the text itself — which is how a stage whose output protocol is
   * a decision block rather than a `QUESTION:` line stops to ask. The id is
   * optional for the same reason it is on `asks`.
   */
  parks(result: string, sessionId?: string, usage?: StageUsage): FakeEngine;
  /**
   * The box writes a file into the workspace before reporting — the only way a
   * scripted engine leaves behind what a real agent would, which is what the
   * run's change set is measured from.
   */
  writes(files: Record<string, string>, result: string): FakeEngine;
}

/** What the Orchestrator's post-run review returns; both halves default. */
export interface RunReviewScript {
  artifacts?: Partial<RunArtifacts>;
  decision?: OrchestratorDecision;
  as?: string;
}

const DEFAULT_REVIEW_ARTIFACTS: RunArtifacts = {
  summary: "The run finished.",
  deliveredScope: [],
  decisions: [],
  knowledge: [],
  findings: [],
};

const DEFAULT_REVIEW_DECISION: OrchestratorDecision = {
  action: "stop",
  reason: "Nothing further was asked of this orchestration",
};

export function fencedBlock(fence: string, payload: unknown): string {
  return `\`\`\`${fence}\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

async function writeIntoWorkspace(
  cwd: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(cwd, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
}

function describeMatcher(matcher: Matcher): string {
  return typeof matcher === "string" ? matcher : String(matcher);
}

function matches(actual: string | undefined, matcher: Matcher): boolean {
  if (actual === undefined) {
    return false;
  }
  return typeof matcher === "string" ? actual === matcher : matcher.test(actual);
}

export class FakeEngine implements EngineAdapter {
  readonly id: EngineId;
  private readonly scripted: Scripted[] = [];
  /** Every context received, in order — the raw material for `verify()`. */
  readonly calls: EngineRunContext[] = [];
  /** How often the roster asked this engine to list its models — proves caching. */
  liveModelLookups = 0;
  private unexpected = 0;
  private liveModelScript: () => Promise<LiveModelLayer> = () => Promise.resolve({ options: [] });
  private configured: ModelOptionDraft | undefined;

  constructor(id: EngineId = "claude-code") {
    this.id = id;
  }

  /**
   * Declare the next engine call. Order matters: the first anticipation answers
   * the first call. Returns the outcome so the whole thing reads as one
   * statement in the Anticipate block.
   */
  anticipate(anticipation: Anticipation = {}): AnticipationOutcome {
    const push = (respond: Responder): FakeEngine => {
      this.scripted.push({ anticipation, respond });
      return this;
    };
    return {
      reports: (result, usage) =>
        push(() => {
          const response: EngineRunResult = {
            success: true,
            exitCode: 0,
            result,
          };
          if (usage !== undefined) response.usage = usage;
          return Promise.resolve(response);
        }),
      fails: (errorMessage) =>
        push(() => Promise.resolve({ success: false, exitCode: 1, errorMessage })),
      hitsLimit: (raw) =>
        push(() =>
          Promise.resolve({
            success: false,
            exitCode: 1,
            errorMessage: raw,
            limit: detectEngineLimit(this.id, raw),
          }),
        ),
      asks: (question, sessionId, usage) =>
        push(() => {
          const response: EngineRunResult = {
            success: true,
            exitCode: 0,
            result: `Working on it.

QUESTION: ${question}`,
          };
          if (sessionId !== undefined) response.sessionId = sessionId;
          if (usage !== undefined) response.usage = usage;
          return Promise.resolve(response);
        }),
      parks: (result, sessionId, usage) =>
        push(() => {
          const response: EngineRunResult = {
            success: true,
            exitCode: 0,
            result,
          };
          if (sessionId !== undefined) response.sessionId = sessionId;
          if (usage !== undefined) response.usage = usage;
          return Promise.resolve(response);
        }),
      writes: (files, result) =>
        push(async (ctx) => {
          await writeIntoWorkspace(ctx.cwd, files);
          return { success: true, exitCode: 0, result };
        }),
      hangsUntilAborted: () =>
        push(
          (ctx) =>
            new Promise<EngineRunResult>((resolve) => {
              const finish = () =>
                resolve({ success: false, exitCode: null, errorMessage: "Aborted" });
              // Abort can land before the adapter is even entered.
              if (ctx.signal.aborted) {
                finish();
                return;
              }
              ctx.signal.addEventListener("abort", finish, { once: true });
            }),
        ),
    };
  }

  /**
   * Declare the Orchestrator's post-run review — the trailing engine call every
   * non-orchestration run now makes before it completes. Overrides let a test
   * about the decision loop script what the review returns; the defaults keep a
   * test that is about something else to one line.
   */
  anticipateRunReview(review: RunReviewScript = {}): FakeEngine {
    const artifacts = { ...DEFAULT_REVIEW_ARTIFACTS, ...review.artifacts };
    const decision = review.decision ?? DEFAULT_REVIEW_DECISION;
    return this.anticipate({ as: review.as ?? "Orchestrator review" }).reports(
      [
        "Reviewed the run.",
        fencedBlock("adhd-run-artifacts", artifacts),
        fencedBlock("adhd-orchestrator-decision", decision),
      ].join("\n\n"),
    );
  }

  /**
   * Resolve once `count` calls have arrived. A stage is marked "running" before
   * its persona is loaded, so waiting on run status is not enough to know the
   * engine was actually entered — abort tests need this instead.
   */
  async waitForCall(count = 1, timeoutMs = 5_000): Promise<EngineRunContext> {
    const deadline = Date.now() + timeoutMs;
    while (this.calls.length < count && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const ctx = this.calls[count - 1];
    assert(ctx, `FakeEngine: timed out waiting for call #${count}; saw ${this.calls.length}`);
    return ctx;
  }

  /** The context of the nth engine call (0-based); fails if it never arrived. */
  callAt(index: number): EngineRunContext {
    const ctx = this.calls[index];
    assert(ctx, `FakeEngine: no call at index ${index}; saw ${this.calls.length}`);
    return ctx;
  }

  /** Declare what `agent models` and its kin answer for this engine. */
  offersLiveModels(options: ModelOptionDraft[]): FakeEngine {
    this.liveModelScript = () => Promise.resolve({ options });
    return this;
  }

  /** The CLI is present but its model listing fails — a broken install, a timeout. */
  failsLiveModels(message: string): FakeEngine {
    this.liveModelScript = () => Promise.reject(new Error(message));
    return this;
  }

  /** Declare the model this engine's own config file names. */
  hasConfiguredModel(draft: ModelOptionDraft): FakeEngine {
    this.configured = draft;
    return this;
  }

  liveModels(): Promise<LiveModelLayer> {
    this.liveModelLookups += 1;
    return this.liveModelScript();
  }

  configuredModel(): ModelOptionDraft | undefined {
    return this.configured;
  }

  /** EngineAdapter surface — the orchestrator calls this per engine-backed stage. */
  run(ctx: EngineRunContext): Promise<EngineRunResult> {
    this.calls.push(ctx);
    const next = this.scripted[this.calls.length - 1];
    if (!next) {
      // Don't throw here: the orchestrator swallows adapter errors into a failed
      // stage, which would hide the mistake. Count it and let verify() report.
      this.unexpected += 1;
      return Promise.resolve({
        success: false,
        exitCode: null,
        errorMessage: "FakeEngine: unanticipated engine call",
      });
    }
    return next.respond(ctx);
  }

  /**
   * Assert the anticipations held: same number of calls, in order, each with
   * the declared inputs. Call once at the end of the Assert block.
   */
  verify(): void {
    expect(this.unexpected, "engine was called more times than anticipated").toBe(0);
    expect(this.calls.length, "anticipated engine calls that never happened").toBe(
      this.scripted.length,
    );
    this.scripted.forEach((scripted, index) => {
      this.verifyCall(scripted, index);
    });
  }

  private verifyCall({ anticipation }: Scripted, index: number): void {
    const ctx = this.calls[index];
    const who = anticipation.as ?? `call #${index + 1}`;
    assert(ctx !== undefined, `${who}: no engine call was recorded at index ${index}`);
    const check = (
      field: string,
      actual: string | undefined,
      matcher: Matcher | undefined,
    ) => {
      expect(
        matcher === undefined || matches(actual, matcher),
        `${who}: ${field} was ${JSON.stringify(actual)}, expected ${describeMatcher(matcher ?? "")}`,
      ).toBe(true);
    };
    check("cwd", ctx.cwd, anticipation.cwd);
    check("model", ctx.model, anticipation.model);
    check("effort", ctx.effort, anticipation.effort);
    check("permissionMode", ctx.permissionMode, anticipation.permissionMode);
    check("persona", ctx.appendSystemPrompt, anticipation.persona);
    check("prompt", ctx.prompt, anticipation.prompt);
    check("resumeSessionId", ctx.resumeSessionId, anticipation.resumeSessionId);
  }
}
