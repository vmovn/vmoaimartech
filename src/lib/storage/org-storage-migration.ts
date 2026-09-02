/**
 * localStorage schema migration for org-scoped state.
 *
 * The stored active org key is versioned (`pmai.org.active.v1`). When we
 * bump the schema — key rename, value shape change, new derived caches that
 * must be purged — increment `CURRENT_ORG_STORAGE_VERSION` and add a step in
 * `runOrgStorageMigrations()` that walks a stored version forward.
 *
 * Migration rules:
 * - Run once at app boot, before any hook reads the active org.
 * - Never leak org-scoped cached data across schema changes: when the shape
 *   is unknown, drop derived caches and keep only a validated UUID id.
 * - Idempotent and SSR-safe (no-op when `window` is undefined).
 */
const VERSION_KEY = "pmai.org.storage.version";
const LEGACY_VERSION_KEY = "swiffer.org.storage.version";
export const CURRENT_ORG_STORAGE_VERSION = 4;

/** Historical namespaces: Wadiff (v3) then Swiffer (v4) folded into pmai. */
const LEGACY_BRAND_FOLDS: Array<{ from: string; to: string }> = [
  { from: "wadiff.", to: "pmai." },
  { from: "wadiff:", to: "pmai:" },
  { from: "swiffer.", to: "pmai." },
  { from: "swiffer:", to: "pmai:" },
];

const ACTIVE_ORG_KEY = "pmai.org.active.v1";
const ACTIVE_WS_KEY = "pmai.workspace.active.v1";
const LEGACY_ACTIVE_ORG_KEYS = [
  "pmai.org.active",
  "pmai.active.org",
  "swiffer.org.active.v1",
  "swiffer.org.active",
  "swiffer.active.org",
  "activeOrgId",
];
const LEGACY_ACTIVE_WS_KEYS = [
  "pmai.workspace.active",
  "swiffer.workspace.active.v1",
  "swiffer.workspace.active",
  "activeWorkspaceId",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}
function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Purge every org-scoped derived cache we're aware of. Called whenever the
 * schema version is unknown or advances past a shape change: it prevents
 * an old-shape cache from being re-hydrated against new-shape readers.
 *
 * The active org id and workspace id are intentionally NOT wiped here —
 * callers pass them through explicitly.
 */
function purgeOrgScopedDerivedCaches() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      // Anything under pmai.org.* other than the active id/version is
      // treated as an org-scoped derived cache and dropped on migration.
      if (
        (k.startsWith("pmai.org.") || k.startsWith("swiffer.org.")) &&
        k !== ACTIVE_ORG_KEY &&
        k !== VERSION_KEY &&
        k !== LEGACY_VERSION_KEY
      ) {
        keys.push(k);
      }
      if (k.startsWith("pmai.query.") || k.startsWith("swiffer.query.")) keys.push(k);
    }
    keys.forEach(safeRemove);
  } catch {
    /* ignore */
  }
}

function readAnyLegacyOrgId(): string | null {
  for (const legacy of LEGACY_ACTIVE_ORG_KEYS) {
    const raw = safeGet(legacy);
    if (raw && UUID_RE.test(raw)) return raw;
  }
  return null;
}
function readAnyLegacyWorkspaceId(): string | null {
  for (const legacy of LEGACY_ACTIVE_WS_KEYS) {
    const raw = safeGet(legacy);
    if (raw && UUID_RE.test(raw)) return raw;
  }
  return null;
}

/**
 * Rebrand fold-forward: copy wadiff.* / swiffer.* entries to the matching
 * pmai.* key (without clobbering an existing value) and drop the old one.
 * Runs before the version read so the stored schema version survives the rename.
 */
function migrateLegacyBrandNamespace() {
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      const fold = LEGACY_BRAND_FOLDS.find((p) => k.startsWith(p.from));
      if (!fold) continue;
      const next = `${fold.to}${k.slice(fold.from.length)}`;
      const value = safeGet(k);
      if (value != null && safeGet(next) == null) safeSet(next, value);
      stale.push(k);
    }
    stale.forEach(safeRemove);
    const legacyVersion = safeGet(LEGACY_VERSION_KEY);
    if (legacyVersion != null && safeGet(VERSION_KEY) == null) {
      safeSet(VERSION_KEY, legacyVersion);
    }
    safeRemove(LEGACY_VERSION_KEY);
  } catch {
    /* ignore */
  }
}

export function runOrgStorageMigrations(): number {
  if (typeof window === "undefined") return CURRENT_ORG_STORAGE_VERSION;

  migrateLegacyBrandNamespace();

  const storedRaw = safeGet(VERSION_KEY);
  const stored = storedRaw != null ? Number.parseInt(storedRaw, 10) : NaN;
  let version = Number.isFinite(stored) && stored > 0 ? stored : 0;

  if (version === CURRENT_ORG_STORAGE_VERSION) return version;

  // v0 -> v1: adopt the versioned `pmai.org.active.v1` key. Fold any
  // pre-versioned legacy keys forward, then drop them. Purge unknown
  // shaped derived caches so nothing rehydrates against new readers.
  if (version < 1) {
    const currentActive = safeGet(ACTIVE_ORG_KEY);
    if (!currentActive || !UUID_RE.test(currentActive)) {
      const legacyOrg = readAnyLegacyOrgId();
      if (legacyOrg) safeSet(ACTIVE_ORG_KEY, legacyOrg);
      else if (currentActive) safeRemove(ACTIVE_ORG_KEY); // corrupt value
    }
    const currentWs = safeGet(ACTIVE_WS_KEY);
    if (!currentWs || !UUID_RE.test(currentWs)) {
      const legacyWs = readAnyLegacyWorkspaceId();
      if (legacyWs) safeSet(ACTIVE_WS_KEY, legacyWs);
      else if (currentWs) safeRemove(ACTIVE_WS_KEY);
    }
    LEGACY_ACTIVE_ORG_KEYS.forEach(safeRemove);
    LEGACY_ACTIVE_WS_KEYS.forEach(safeRemove);
    purgeOrgScopedDerivedCaches();
    version = 1;
  }

  // v1 -> v2: query-key hashing became org-scoped (see
  // `src/lib/query/org-scope.ts`). Any previously persisted query cache is
  // now unaddressable, so drop derived caches to prevent stale reads.
  if (version < 2) {
    purgeOrgScopedDerivedCaches();
    version = 2;
  }

  // v2 -> v3: product rebrand Wadiff -> Swiffer (then folded to pmai above).
  if (version < 3) {
    purgeOrgScopedDerivedCaches();
    version = 3;
  }

  // v3 -> v4: product rebrand Swiffer -> PM.ai.vn. Storage keys moved from
  // `swiffer.*` to `pmai.*` (handled above); drop leftover vendor-namespace caches.
  if (version < 4) {
    purgeOrgScopedDerivedCaches();
    version = 4;
  }

  safeSet(VERSION_KEY, String(CURRENT_ORG_STORAGE_VERSION));
  return CURRENT_ORG_STORAGE_VERSION;
}

// Auto-run at module load so any subsequent `getActiveOrgId()` reader sees
// the migrated shape. Guarded for SSR / worker contexts.
if (typeof window !== "undefined") {
  try {
    runOrgStorageMigrations();
  } catch {
    /* never let a migration failure break app boot */
  }
}
