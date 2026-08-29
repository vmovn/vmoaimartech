/**
 * <Brand /> — renders the active brand name (workspace white-label, then
 * platform settings, then the shipped default). Use this instead of writing
 * the product name into JSX so white-label deployments never leak it.
 */
import { useBrandName } from "@/hooks/use-brand-name";

export function Brand() {
  return <>{useBrandName()}</>;
}
