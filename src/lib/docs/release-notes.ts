import { APP_RELEASE_CHANNEL, APP_VERSION } from "@/lib/app-version";
import type { PdfBlock } from "@/lib/docs/simple-pdf";

export interface ReleaseNotes {
  version: string;
  date: string;
  headline: string;
  sections: { title: string; items: string[] }[];
}

/** Release notes for the current version, mirroring docs/changelog.html. */
export const CURRENT_RELEASE_NOTES: ReleaseNotes = {
  version: APP_VERSION,
  date: "2026",
  headline:
    "Version 4.4.6 is a security and access-control release: hardened row-level security across billing, invites and platform settings, role-aware Developer Center access, new RLS regression suites, and WhatsApp Forms delivered end to end.",
  sections: [
    {
      title: "Security & RLS",
      items: [
        "Fixed a PostgREST filter-injection path, restricted billing_documents deletions, locked down public.settings, and tightened policies on payment_methods, billing_document_templates and workspace_invitations so invite tokens are readable only by an admin or the invitee.",
        "SECURITY DEFINER functions audited and pinned to a fixed search_path, licensing logic isolated, and administrative functions refactored to verify the caller before performing privileged work.",
        "Rate limiting restored for vcard_views, social channel tokens moved behind column-level grants, and an XSS sink removed from the public footer.",
      ],
    },
    {
      title: "RLS regression testing",
      items: [
        "A DB-free static migration policy guard asserts the exact allow/deny shape of billing template and invitation policies per role.",
        "A live per-role harness mints ephemeral users for every organization and workspace role and verifies insert/update/delete on billing templates, invite-token privacy, and cross-tenant denial for every role.",
        "Automated security scans run in CI so new findings block merges.",
      ],
    },
    {
      title: "Developer Center & access control",
      items: [
        "Navigation entries and sensitive actions are hidden for users without the required organization role, backed by requireOrgRole loader guards and integration tests covering 403 responses.",
        "The 403 page now names the missing organization role and links to team & roles so users can request access.",
        "In-app organization switcher plus org-scoped API key management with selectable scopes.",
      ],
    },
    {
      title: "WhatsApp",
      items: [
        "WhatsApp Forms (Meta Flows) end to end: publishing, a composer picker, and nfm_reply ingestion, with centralized WhatsApp Catalog logic.",
        "Friendly error messages when publishing a form or sending from the composer fails, translating raw Meta and backend errors into actionable guidance.",
      ],
    },
    {
      title: "Platform & operations",
      items: [
        "Organization settings load reactively, Super Admin brand leaks fixed, Billing portal empty states corrected, and Developer Center / Booking overview crashes resolved.",
        "Incremental TypeScript compilation and query typing fixes cut warm typechecks to seconds; version, release manifest, container images and compose tags aligned to v4.4.6.",
      ],
    },
  ],
};

export function releaseNotesToPdfBlocks(notes: ReleaseNotes): PdfBlock[] {
  const blocks: PdfBlock[] = [
    { type: "title", text: `Swiffer v${notes.version}` },
    { type: "subtitle", text: `Release notes \u00b7 ${APP_RELEASE_CHANNEL} \u00b7 ${notes.date}` },
    { type: "rule" },
    { type: "text", text: notes.headline },
  ];
  for (const section of notes.sections) {
    blocks.push({ type: "heading", text: section.title });
    for (const item of section.items) blocks.push({ type: "bullet", text: item });
  }
  blocks.push({ type: "space", size: 14 });
  blocks.push({ type: "rule" });
  blocks.push({
    type: "subtitle",
    text: "Full history: /docs/changelog.html \u00b7 (c) 2026 Swiffer",
  });
  return blocks;
}
