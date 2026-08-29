// Seed data used until the workspace is populated. Serves the "provider-agnostic"
// contract: the Inbox / Contacts / Campaigns UIs work with these shapes today,
// and swapping in real Supabase reads is a one-line hook change.

export type Contact = {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
  tags: string[];
  lastSeenAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
  status?: "queued" | "sent" | "delivered" | "read" | "failed";
};

export type Conversation = {
  id: string;
  contact: Contact;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
  status: "open" | "pending" | "resolved" | "snoozed";
  assignee?: string;
  aiSummary?: string;
};

const now = Date.now();
const ago = (m: number) => new Date(now - m * 60_000).toISOString();

export const mockContacts: Contact[] = [
  { id: "c1", name: "Aisha Rahman", phone: "+1 415 555 0132", tags: ["lead", "enterprise"], lastSeenAt: ago(3) },
  { id: "c2", name: "Marcus Chen", phone: "+44 20 7946 0812", tags: ["customer"], lastSeenAt: ago(18) },
  { id: "c3", name: "Elena Rossi", phone: "+39 02 9876 5432", tags: ["trial"], lastSeenAt: ago(45) },
  { id: "c4", name: "Yuki Tanaka", phone: "+81 3 6440 8811", tags: ["customer", "vip"], lastSeenAt: ago(120) },
  { id: "c5", name: "Diego Fernández", phone: "+52 55 4160 2200", tags: ["lead"], lastSeenAt: ago(240) },
  { id: "c6", name: "Priya Kapoor", phone: "+91 22 6100 3300", tags: ["support"], lastSeenAt: ago(360) },
  { id: "c7", name: "Nora Bakke", phone: "+47 22 05 08 00", tags: ["customer"], lastSeenAt: ago(720) },
  { id: "c8", name: "Samuel Osei", phone: "+233 30 274 8000", tags: ["lead", "referral"], lastSeenAt: ago(1440) },
];

export const mockConversations: Conversation[] = [
  { id: "cv1", contact: mockContacts[0], lastMessage: "Sounds great — send over the proposal today?", lastMessageAt: ago(2), unread: 2, status: "open", assignee: "You", aiSummary: "Enterprise lead, discussed pricing tier and integration timeline. Ready for proposal." },
  { id: "cv2", contact: mockContacts[1], lastMessage: "Thanks! I'll test the new webhook flow.", lastMessageAt: ago(24), unread: 0, status: "open", assignee: "You" },
  { id: "cv3", contact: mockContacts[2], lastMessage: "Can we schedule the onboarding call?", lastMessageAt: ago(55), unread: 1, status: "pending" },
  { id: "cv4", contact: mockContacts[3], lastMessage: "Renewal confirmed. Invoice on the way.", lastMessageAt: ago(130), unread: 0, status: "resolved" },
  { id: "cv5", contact: mockContacts[4], lastMessage: "Do you offer a Spanish-language template?", lastMessageAt: ago(260), unread: 3, status: "open" },
  { id: "cv6", contact: mockContacts[5], lastMessage: "Ticket #4432 — password reset link expired.", lastMessageAt: ago(400), unread: 0, status: "snoozed" },
];

export const mockMessages: Record<string, Message[]> = {
  cv1: [
    { id: "m1", conversationId: "cv1", direction: "inbound", body: "Hey — following up on our chat last week about the enterprise plan.", createdAt: ago(90) },
    { id: "m2", conversationId: "cv1", direction: "outbound", body: "Hi Aisha! Absolutely — happy to walk through it. What's your team size looking like?", createdAt: ago(88), status: "read" },
    { id: "m3", conversationId: "cv1", direction: "inbound", body: "We'd start at 40 seats and grow to ~120 by Q3.", createdAt: ago(60) },
    { id: "m4", conversationId: "cv1", direction: "outbound", body: "Perfect. Our Growth plan covers that up to 100 seats, and we bump to Enterprise beyond.", createdAt: ago(58), status: "read" },
    { id: "m5", conversationId: "cv1", direction: "inbound", body: "Sounds great — send over the proposal today?", createdAt: ago(2) },
  ],
  cv2: [
    { id: "m6", conversationId: "cv2", direction: "outbound", body: "Deployed the fix for the webhook retry issue.", createdAt: ago(30), status: "delivered" },
    { id: "m7", conversationId: "cv2", direction: "inbound", body: "Thanks! I'll test the new webhook flow.", createdAt: ago(24) },
  ],
};

export const mockCampaigns = [
  { id: "cp1", name: "Black Friday Preview — VIP", status: "scheduled" as const, audience: "vip", scheduled_at: "Nov 20, 9:00 AM", sent: 0, delivered: 0, read: 0, size: 412 },
  { id: "cp2", name: "Product Update: v2.4 Release", status: "completed" as const, audience: "customers", scheduled_at: "Nov 12, 10:30 AM", sent: 2841, delivered: 2790, read: 2115, size: 2841 },
  { id: "cp3", name: "Trial Expiring Reminder", status: "running" as const, audience: "trial", scheduled_at: "Live", sent: 84, delivered: 82, read: 41, size: 210 },
  { id: "cp4", name: "Winback — Churned 90d", status: "draft" as const, audience: "churned", scheduled_at: "—", sent: 0, delivered: 0, read: 0, size: 618 },
];

export const mockAutomations = [
  { id: "a1", name: "Welcome new contact", trigger: "New contact added", status: "active" as const, runs: 1284, updated: "2d ago" },
  { id: "a2", name: "AI auto-responder — off hours", trigger: "Inbound msg between 8pm–8am", status: "active" as const, runs: 3921, updated: "5h ago" },
  { id: "a3", name: "Tag hot leads", trigger: 'Keyword: "pricing", "demo"', status: "active" as const, runs: 447, updated: "1d ago" },
  { id: "a4", name: "Escalate to human", trigger: "AI confidence < 60%", status: "paused" as const, runs: 92, updated: "1w ago" },
  { id: "a5", name: "Post-purchase check-in (day 7)", trigger: "Order completed + 7d", status: "draft" as const, runs: 0, updated: "just now" },
];

export const analyticsSeries = Array.from({ length: 14 }).map((_, i) => ({
  day: `D${i + 1}`,
  sent: 200 + Math.round(Math.sin(i / 2) * 60 + Math.random() * 40 + i * 12),
  delivered: 190 + Math.round(Math.sin(i / 2) * 55 + Math.random() * 40 + i * 11),
  read: 120 + Math.round(Math.sin(i / 2.5) * 45 + Math.random() * 30 + i * 8),
}));
