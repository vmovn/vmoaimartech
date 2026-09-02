/**
 * Canonical PM.ai.vn AI task policy — product metadata, not a router.
 *
 * Runtime remains: ai_feature_config → runChat/runEmbed → provider registry.
 * This module does not encode provider IDs or model IDs.
 */

export type ExecutionMode = "platform_local" | "premium_credits" | "workspace_byok";
export type TaskClass = "utility" | "premium" | "hybrid";
export type TaskInteraction = "background" | "user_visible" | "hybrid";

export type AiTaskPolicy = {
  id: string;
  taskClass: TaskClass;
  allowedExecutionModes: ExecutionMode[];
  defaultExecutionMode: ExecutionMode;
  interaction: TaskInteraction;
  description: string;
};

const LOCAL: ExecutionMode[] = ["platform_local"];
const PREMIUM: ExecutionMode[] = ["premium_credits", "workspace_byok"];
const HYBRID: ExecutionMode[] = ["premium_credits", "workspace_byok", "platform_local"];

function task(
  id: string,
  taskClass: TaskClass,
  interaction: TaskInteraction,
  description: string,
): AiTaskPolicy {
  const allowedExecutionModes = taskClass === "utility" ? LOCAL : taskClass === "hybrid" ? HYBRID : PREMIUM;
  const defaultExecutionMode: ExecutionMode = taskClass === "utility" ? "platform_local" : "premium_credits";
  return { id, taskClass, allowedExecutionModes, defaultExecutionMode, interaction, description };
}

/** Conservative P0 Platform Local allowlist (max 5). Not a silent generative fallback. */
export const PLATFORM_LOCAL_TASK_IDS = [
  "conversation_intelligence",
  "tag_suggestions",
  "helpdesk.analyze",
  "helpdesk.priority",
  "helpdesk.tags",
] as const;

export const UNKNOWN_TASK_POLICY: AiTaskPolicy = task(
  "*",
  "premium",
  "user_visible",
  "Unlisted AI features default to Premium Credits or workspace BYOK. They never silently use Platform Local AI.",
);

const POLICIES: AiTaskPolicy[] = [
  task("conversation_intelligence", "utility", "background", "Combined conversation summary, intent, sentiment and tags for CRM."),
  task("tag_suggestions", "utility", "background", "Constrained JSON tag suggestions for CRM records."),
  task("helpdesk.analyze", "utility", "background", "Combined ticket classification: priority, sentiment, intent, tags, short summary."),
  task("helpdesk.priority", "utility", "background", "Constrained ticket priority classification."),
  task("helpdesk.tags", "utility", "background", "Constrained helpdesk tag suggestions."),

  task("helpdesk.intent", "hybrid", "background", "Ticket intent classification. Prefer premium; local only when explicitly routed."),
  task("helpdesk.sentiment", "hybrid", "background", "Ticket sentiment classification. Prefer premium; local only when explicitly routed."),
  task("helpdesk_triage", "hybrid", "background", "Agent triage JSON. Prefer premium; local only when explicitly routed."),
  task("search_query_expansion", "hybrid", "background", "Search query expansion. Prefer premium; local only when explicitly routed."),
  task("widget-analysis", "hybrid", "background", "Widget message analysis. Prefer premium; local only when explicitly routed."),
  task("workflow.ai.sentiment", "hybrid", "background", "Workflow sentiment node. Prefer premium; local only when explicitly routed."),
  task("workflow.ai.intent", "hybrid", "background", "Workflow intent node. Prefer premium; local only when explicitly routed."),
  task("workflow.ai.categorize", "hybrid", "background", "Workflow categorize node. Prefer premium; local only when explicitly routed."),
  task("workflow.ai.extract", "hybrid", "background", "Workflow extract node. Prefer premium; local only when explicitly routed."),

  task("reply_assistant", "premium", "user_visible", "Customer-facing reply drafts."),
  task("helpdesk_reply", "premium", "user_visible", "Helpdesk reply drafts."),
  task("helpdesk.reply", "premium", "user_visible", "Helpdesk reply drafts."),
  task("helpdesk_next_actions", "premium", "user_visible", "Helpdesk next-action suggestions."),
  task("helpdesk.resolution", "premium", "user_visible", "Helpdesk resolution plans."),
  task("helpdesk.escalation", "premium", "user_visible", "Helpdesk escalation recommendations."),
  task("helpdesk.conv_summary", "premium", "user_visible", "Helpdesk conversation summaries for agents."),
  task("helpdesk.ticket_summary", "premium", "user_visible", "Structured ticket briefs."),
  task("helpdesk.assign", "premium", "user_visible", "Helpdesk assignment recommendations."),
  task("helpdesk.duplicates", "premium", "user_visible", "Duplicate ticket detection."),
  task("sales_assistant", "premium", "user_visible", "Deal-aware sales assistant."),
  task("marketing_assistant", "premium", "user_visible", "Marketing copy and campaign assistant."),
  task("customer_insights", "premium", "user_visible", "Customer insight narratives."),
  task("lead_qualification", "premium", "user_visible", "Lead qualification."),
  task("chatbot", "premium", "user_visible", "Workspace chatbot replies."),
  task("chatbot.oneshot", "premium", "user_visible", "Chatbot one-shot generation."),
  task("chatbot_test", "premium", "user_visible", "Chatbot test conversations."),
  task("chatbot:messenger", "premium", "user_visible", "Messenger chatbot replies."),
  task("chatbot:instagram", "premium", "user_visible", "Instagram chatbot replies."),
  task("kb_answer", "premium", "user_visible", "Knowledge-base answers."),
  task("portal_assistant", "premium", "user_visible", "Client portal assistant."),
  task("client_portal_chat", "premium", "user_visible", "Client portal chat."),
  task("client_portal_self_help", "premium", "user_visible", "Client portal self-help."),
  task("ai_conversation", "premium", "user_visible", "In-app AI conversation."),
  task("ai_conversation_stream", "premium", "user_visible", "Streaming AI conversation."),
  task("automations", "premium", "user_visible", "Automation AI steps."),
  task("commerce_ai", "premium", "user_visible", "Commerce recommendations and copy."),
  task("campaign_ab_suggestions", "premium", "user_visible", "Campaign A/B suggestions."),
  task("widget-reply", "premium", "user_visible", "Live-chat widget replies."),
  task("livechat-summary", "premium", "user_visible", "Live-chat summaries."),
  task("translation", "premium", "user_visible", "Message translation."),
  task("widget-translate", "premium", "user_visible", "Widget translation."),
  task("search_summary", "premium", "user_visible", "Search result summaries."),
  task("search_insights", "premium", "user_visible", "Search insights."),
  task("mobile_ai_search", "premium", "user_visible", "Mobile AI search."),
  task("mobile_reply_suggest", "premium", "user_visible", "Mobile reply suggestions."),
  task("workspace_summary", "premium", "user_visible", "Workspace intelligence rollup."),
  task("platform_provider_test", "premium", "user_visible", "Super Admin provider connectivity test."),
  task("ai_suggest_best_time", "premium", "user_visible", "Booking best-time suggestions."),
  task("ai_reschedule_recs", "premium", "user_visible", "Booking reschedule recommendations."),
  task("ai_travel_time", "premium", "user_visible", "Booking travel-time estimates."),
  task("ai_meeting_summary", "premium", "user_visible", "Meeting summaries."),
  task("ai_meeting_prep", "premium", "user_visible", "Meeting prep."),
  task("ai_followup", "premium", "user_visible", "Meeting follow-up drafts."),
  task("ai_smart_availability", "premium", "user_visible", "Smart availability."),
  task("ai_nl_scheduling", "premium", "user_visible", "Natural-language scheduling."),
  task("knowledge_base_embedding", "premium", "background", "KB embeddings. Premium/BYOK only so vector dimensions stay provider-owned."),
  task("omnichannel_analyze", "premium", "user_visible", "Omnichannel customer analysis."),
  task("omnichannel_translate", "premium", "user_visible", "Omnichannel translation."),
  task("omnichannel_timeline_summary", "premium", "user_visible", "Omnichannel timeline summary."),
  task("omnichannel_search", "premium", "user_visible", "Omnichannel AI search."),
  task("workflow.ai.reply", "premium", "user_visible", "Workflow reply node."),
  task("workflow.ai.summarize", "premium", "user_visible", "Workflow summarize node."),
  task("workflow.ai.crm_note", "premium", "user_visible", "Workflow CRM note node."),
  task("workflow.ai.email", "premium", "user_visible", "Workflow email node."),
  task("workflow.ai.rewrite", "premium", "user_visible", "Workflow rewrite node."),
  task("workflow.ai.translate", "premium", "user_visible", "Workflow translate node."),
  task("workflow.ai.classify_lead", "premium", "user_visible", "Workflow lead classification node."),
  task("workflow.ai.followup", "premium", "user_visible", "Workflow follow-up node."),
  task("workflow.ai.decision", "premium", "user_visible", "Workflow decision node."),
];

export const AI_TASK_POLICIES: Record<string, AiTaskPolicy> = Object.fromEntries(
  POLICIES.map((p) => [p.id, p]),
);

export function listAiTaskPolicies(): AiTaskPolicy[] {
  return POLICIES.slice();
}

export function getTaskPolicy(feature: string | null | undefined): AiTaskPolicy {
  if (!feature) return UNKNOWN_TASK_POLICY;
  return AI_TASK_POLICIES[feature] ?? UNKNOWN_TASK_POLICY;
}

export function isPlatformLocalTask(feature: string | null | undefined): boolean {
  return !!feature && (PLATFORM_LOCAL_TASK_IDS as readonly string[]).includes(feature);
}
