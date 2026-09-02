/**
 * Shared Ollama in-flight fairness. Complements the existing per-minute
 * rate limiter: this bounds concurrent calls so one host cannot saturate
 * the shared CPU Ollama process.
 *
 * Per-process (replica-local). Remaining limitation: N replicas can each
 * hold the configured cap. Defaults stay conservative for a 16-core host.
 */
export const DEFAULT_OLLAMA_MAX_CONCURRENCY = 2;
export const DEFAULT_OLLAMA_WORKSPACE_MAX_CONCURRENCY = 1;

export type OllamaFairnessEnv = {
  OLLAMA_MAX_CONCURRENCY?: string;
  OLLAMA_WORKSPACE_MAX_CONCURRENCY?: string;
};

export class CountingSemaphore {
  private inFlight = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(readonly max: number) {
    if (max < 1) throw new Error("semaphore max must be >= 1");
  }

  get active(): number {
    return this.inFlight;
  }

  async acquire(): Promise<() => void> {
    while (this.inFlight >= this.max) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.inFlight += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inFlight -= 1;
      const next = this.waiters.shift();
      if (next) next();
    };
  }
}

function parseBound(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function readOllamaMaxConcurrency(env: OllamaFairnessEnv = process.env): number {
  return parseBound(env.OLLAMA_MAX_CONCURRENCY, DEFAULT_OLLAMA_MAX_CONCURRENCY, 1, 8);
}

export function readOllamaWorkspaceMaxConcurrency(env: OllamaFairnessEnv = process.env): number {
  const global = readOllamaMaxConcurrency(env);
  const per = parseBound(
    env.OLLAMA_WORKSPACE_MAX_CONCURRENCY,
    DEFAULT_OLLAMA_WORKSPACE_MAX_CONCURRENCY,
    1,
    4,
  );
  return Math.min(per, global);
}

let globalSemaphore: CountingSemaphore | null = null;
const workspaceSemaphores = new Map<string, CountingSemaphore>();
let configuredGlobal = 0;
let configuredWorkspace = 0;

function globalGate(): CountingSemaphore {
  const max = readOllamaMaxConcurrency();
  if (!globalSemaphore || configuredGlobal !== max) {
    globalSemaphore = new CountingSemaphore(max);
    configuredGlobal = max;
  }
  return globalSemaphore;
}

function workspaceGate(workspaceId: string): CountingSemaphore {
  const max = readOllamaWorkspaceMaxConcurrency();
  const existing = workspaceSemaphores.get(workspaceId);
  if (!existing || configuredWorkspace !== max) {
    if (configuredWorkspace !== max) workspaceSemaphores.clear();
    configuredWorkspace = max;
    const next = new CountingSemaphore(max);
    workspaceSemaphores.set(workspaceId, next);
    return next;
  }
  return existing;
}

/** Test helper: drop singleton state between cases. */
export function resetOllamaFairnessForTests(): void {
  globalSemaphore = null;
  workspaceSemaphores.clear();
  configuredGlobal = 0;
  configuredWorkspace = 0;
}

/** Shared platform Ollama only. Premium Credits / BYOK skip this gate. */
export function shouldApplyOllamaFairness(executionMode: string): boolean {
  return executionMode === "platform_local";
}

export async function withOllamaFairness<T>(
  workspaceId: string,
  fn: () => Promise<T>,
): Promise<T> {
  // Per-workspace first so a noisy tenant cannot hold a global slot while
  // waiting on its own cap.
  const releaseWorkspace = await workspaceGate(workspaceId).acquire();
  try {
    const releaseGlobal = await globalGate().acquire();
    try {
      return await fn();
    } finally {
      releaseGlobal();
    }
  } finally {
    releaseWorkspace();
  }
}

export function ollamaFairnessSnapshot(): { globalActive: number; globalMax: number } {
  const gate = globalGate();
  return { globalActive: gate.active, globalMax: gate.max };
}
