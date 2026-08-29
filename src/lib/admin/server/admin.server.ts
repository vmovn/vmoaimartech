import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getAdminKpisInternal() {
  const [orgs, users, tickets, announcements] = await Promise.all([
    supabaseAdmin.from("organizations").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("platform_support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
    supabaseAdmin.from("platform_announcements").select("id", { count: "exact", head: true }).not("published_at", "is", null),
  ]);

  return {
    workspaces: orgs.count ?? 0,
    users: users.count ?? 0,
    openTickets: tickets.count ?? 0,
    liveAnnouncements: announcements.count ?? 0,
  };
}
