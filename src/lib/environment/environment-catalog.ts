import rawCatalog from "./environment-catalog.json";

export type EnvironmentRequiredness =
  "REQUIRED" | "CONDITIONAL" | "OPTIONAL" | "DEV_ONLY" | "CI_ONLY";
export type EnvironmentScope =
  "BUILD_PUBLIC" | "RUNTIME_SERVER" | "SUPABASE_EDGE" | "LOCAL_ONLY" | "CI";
export type EnvironmentCategory = "core" | "platform" | "integration" | "deployment" | "local";
export type EnvironmentStatus =
  | "READY"
  | "NOT_CONFIGURED"
  | "OPTIONAL"
  | "INVALID"
  | "UNAVAILABLE"
  | "DEVELOPMENT_ONLY"
  | "NEEDS_ATTENTION";

export type EnvironmentVariableMetadata = {
  key: string;
  capability: string;
  nameEn: string;
  nameVi: string;
  purpose: string;
  requiredness: EnvironmentRequiredness;
  scope: EnvironmentScope;
  secret: "YES" | "NO";
  setupBlocking: "YES" | "NO";
  enabledWhen: string;
  validation: string;
  readSites: string[];
  coolify: "YES" | "NO" | "CONDITIONAL";
};

export type EnvironmentCapabilityMetadata = {
  id: string;
  category: EnvironmentCategory;
  nameEn: string;
  nameVi: string;
  descriptionEn: string;
  descriptionVi: string;
  features: string[];
};

export const ENVIRONMENT_CATALOG = rawCatalog as {
  capabilities: EnvironmentCapabilityMetadata[];
  variables: EnvironmentVariableMetadata[];
};

export const ENVIRONMENT_VARIABLES = ENVIRONMENT_CATALOG.variables;
export const ENVIRONMENT_CAPABILITIES = ENVIRONMENT_CATALOG.capabilities;
