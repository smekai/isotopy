// The Anticipate vehicle. AAAAA's second phase says every external interaction
// is declared up front, *including the inputs it must receive* — so this is not
// a passive stub. Each `anticipate()` states both what the engine will be asked
// to do and what it answers; `verify()` then asserts the calls actually arrived,
// in order, with matching inputs, and that nothing extra was called.
//
// Registered via `setEngineAdapter()` (packages/server/src/engines/registry.ts),
// which is what keeps a component test from ever spawning a real CLI.
import { assert, expect } from "vitest";
import type { EngineId, StageUsage } from "@adhd/core";
import { detectEngineLimit } from "../../src/domain/engine-limit.ts";
import type {
  EngineAdapter,
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
   */
  asks(question: string, sessionId: string, usage?: StageUsage): FakeEngine;
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
  private unexpected = 0;

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
            sessionId,
          };
          if (usage !== undefined) response.usage = usage;
          return Promise.resolve(response);
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
    check("permissionMode", ctx.permissionMode, anticipation.permissionMode);
    check("persona", ctx.appendSystemPrompt, anticipation.persona);
    check("prompt", ctx.prompt, anticipation.prompt);
    check("resumeSessionId", ctx.resumeSessionId, anticipation.resumeSessionId);
  }
}
