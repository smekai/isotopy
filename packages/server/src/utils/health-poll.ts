export type HealthProbe = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean }>;

export interface HealthPollDependencies {
  probe: HealthProbe;
  now: () => Date;
  sleep: (milliseconds: number) => Promise<void>;
}

export interface HealthPollInput {
  url: string;
  timeoutMs: number;
  intervalMs: number;
  signal?: AbortSignal;
}

async function probeOnce(
  deps: HealthPollDependencies,
  url: string,
  intervalMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const attempt = AbortSignal.any([
    AbortSignal.timeout(intervalMs),
    ...(signal === undefined ? [] : [signal]),
  ]);
  try {
    return (await deps.probe(url, { signal: attempt })).ok;
  } catch {
    return false;
  }
}

export async function pollUntilHealthy(
  deps: HealthPollDependencies,
  input: HealthPollInput,
): Promise<boolean> {
  const deadline = deps.now().getTime() + input.timeoutMs;
  while (!input.signal?.aborted && deps.now().getTime() <= deadline) {
    if (await probeOnce(deps, input.url, input.intervalMs, input.signal)) {
      return true;
    }
    if (deps.now().getTime() + input.intervalMs > deadline) {
      break;
    }
    await deps.sleep(input.intervalMs);
  }
  return false;
}
