import { describe, expect, it } from "vitest";
import { ENVIRONMENT_CAPABILITIES, ENVIRONMENT_VARIABLES } from "@/lib/environment/environment-catalog";
import { LAUNCH_GUIDANCE, LAUNCH_KEY_CHECKLIST, PRODUCTION_COOLIFY_CHECKLIST } from "./launch-guidance";

describe("launch-guidance catalog coverage", () => {
  it("covers every environment catalog capability", () => {
    const missing = ENVIRONMENT_CAPABILITIES.filter((capability) => !LAUNCH_GUIDANCE[capability.id]).map(
      (capability) => capability.id,
    );
    expect(missing).toEqual([]);
  });

  it("only highlights keys that belong to that capability", () => {
    for (const [id, guidance] of Object.entries(LAUNCH_GUIDANCE)) {
      const allowed = new Set(
        ENVIRONMENT_VARIABLES.filter((variable) => variable.capability === id).map((variable) => variable.key),
      );
      const stray = guidance.keys.filter((key) => !allowed.has(key));
      expect(stray, id).toEqual([]);
    }
  });

  it("checklists only name catalog keys", () => {
    const catalogKeys = new Set(ENVIRONMENT_VARIABLES.map((variable) => variable.key));
    for (const item of [...LAUNCH_KEY_CHECKLIST, ...PRODUCTION_COOLIFY_CHECKLIST]) {
      expect(catalogKeys.has(item.key), item.key).toBe(true);
    }
  });
});
