import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAiSettings, updateAiSettings, getAiQuotaUsage,
  listAiAuditLogs, listAiProviderOptions,
  type AiSettings, type AiSettingsQuotaUsage, type AiAuditLogEntry, type AiSettingsOption,
} from "@/lib/ai/settings.functions";
import { toast } from "sonner";
import {
  getPremiumCreditSummary,
  listPremiumCreditMembers,
  setPremiumCreditMemberLimit,
} from "@/lib/ai/premium-credits.functions";

export type { AiSettings, AiSettingsQuotaUsage, AiAuditLogEntry, AiSettingsOption };

export function useAiSettings(workspaceId: string | undefined) {
  const fn = useServerFn(getAiSettings);
  return useQuery({
    queryKey: ["ai-settings", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
}

export function useAiSettingsMutation(workspaceId: string | undefined) {
  const fn = useServerFn(updateAiSettings);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AiSettings>) =>
      fn({ data: { workspaceId: workspaceId!, patch: patch as any } }),
    onSuccess: (data) => {
      qc.setQueryData(["ai-settings", workspaceId], data);
      qc.invalidateQueries({ queryKey: ["ai-audit-logs", workspaceId] });
      toast.success("AI settings saved");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });
}

export function useAiQuotaUsage(workspaceId: string | undefined) {
  const fn = useServerFn(getAiQuotaUsage);
  return useQuery({
    queryKey: ["ai-quota-usage", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    refetchInterval: 60_000,
  });
}

export function useAiAuditLogs(workspaceId: string | undefined) {
  const fn = useServerFn(listAiAuditLogs);
  return useQuery({
    queryKey: ["ai-audit-logs", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId!, limit: 100 } }),
    enabled: !!workspaceId,
  });
}

export function useAiProviderOptions(workspaceId: string | undefined) {
  const fn = useServerFn(listAiProviderOptions);
  return useQuery({
    queryKey: ["ai-provider-options", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
}

export function usePremiumCreditSummary(workspaceId: string | undefined) {
  const fn = useServerFn(getPremiumCreditSummary);
  return useQuery({
    queryKey: ["premium-credit-summary", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    refetchInterval: 60_000,
  });
}

export function usePremiumCreditMembers(workspaceId: string | undefined, enabled: boolean) {
  const fn = useServerFn(listPremiumCreditMembers);
  return useQuery({
    queryKey: ["premium-credit-members", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId && enabled,
  });
}

export function usePremiumCreditMemberMutation(workspaceId: string | undefined) {
  const fn = useServerFn(setPremiumCreditMemberLimit);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; monthlyLimit: number | null; dailyLimit: number | null }) =>
      fn({ data: { workspaceId: workspaceId!, ...input } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["premium-credit-summary", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["premium-credit-members", workspaceId] });
      toast.success("Premium Credit limit saved");
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Failed to save Premium Credit limit"),
  });
}
