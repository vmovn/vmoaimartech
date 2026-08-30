import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSetupStatus } from "@/lib/setup/setup.functions";

/** Legacy vendor installer URL. Product setup is the only bootstrap flow. */
export const Route = createFileRoute("/install")({
  beforeLoad: async () => {
    const status = await getSetupStatus();
    throw redirect({ to: status.setupComplete ? "/auth" : "/setup" });
  },
  component: () => null,
});
