/**
 * Centralized demo credentials. Consumed by /auth, /demo-login, and the
 * provisioner server function. Update this list to change what visitors see.
 */
export type DemoAccount = {
  key: "user" | "agent" | "admin";
  label: string;
  email: string;
  password: string;
  description: string;
  /** Platform role assigned via public.user_roles (app_role enum). */
  platformRole?: "superadmin" | "support";
  accent: string; // tailwind gradient classes
  redirect: string;
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    key: "user",
    label: "User",
    email: "user@demo.com",
    password: "User123!",
    description: "End-user workspace view. Read-only access across most surfaces.",
    accent: "from-sky-500/15 to-sky-500/5",
    redirect: "/dashboard",
  },
  {
    key: "agent",
    label: "Agent",
    email: "agent@demo.com",
    password: "Agent123!",
    description: "Inbox operator. Reply to conversations, manage contacts, run tasks.",
    platformRole: "support",
    accent: "from-emerald-500/15 to-emerald-500/5",
    redirect: "/dashboard",
  },
  {
    key: "admin",
    label: "Admin",
    email: "admin@demo.com",
    password: "Admin123!",
    description: "Full administrator. Access Super Admin, billing, plugins, settings.",
    platformRole: "superadmin",
    accent: "from-violet-500/15 to-violet-500/5",
    redirect: "/dashboard",
  },
];

export const DEMO_MODE_STORAGE_KEY = "swiffer.demo-mode.v1";
