/**
 * Shared landing-page content used by both the rendered sections and the
 * structured data (JSON-LD) in the route head, so the markup search engines
 * read can never drift from what visitors see.
 */

function resolveSiteUrl(): string {
  const configured =
    typeof window !== "undefined" ? window.location.origin : process.env.APP_ORIGIN;
  if (!configured) return "";
  try {
    return new URL(configured).origin;
  } catch {
    return "";
  }
}

export const SITE_URL = resolveSiteUrl();
export const OG_IMAGE_URL = `${SITE_URL}/api/public/og.png`;

export const LANDING_TITLE = "Swiffer — WhatsApp CRM, Shared Inbox & AI Automation";

export const LANDING_DESCRIPTION =
  "Swiffer is a self-hosted WhatsApp CRM: shared team inbox, sales pipeline, AI chatbots, broadcast campaigns and commerce on the official Cloud API.";

export const LANDING_SOCIAL_DESCRIPTION =
  "Run sales, support and marketing on WhatsApp from one multi-tenant platform. Official Cloud API, AI Studio, automations and self-hosting.";

export const FAQ_CATEGORIES = [
  { id: "product", label: "Product" },
  { id: "channels", label: "Channels" },
  { id: "ai", label: "AI & automation" },
  { id: "security", label: "Security" },
  { id: "deployment", label: "Deployment" },
  { id: "pricing", label: "Pricing & licensing" },
] as const;

export type FaqCategoryId = (typeof FAQ_CATEGORIES)[number]["id"];

export type Faq = {
  /** Stable slug used for the `#faq-<id>` deep link. */
  id: string;
  category: FaqCategoryId;
  q: string;
  a: string;
};

export const LANDING_FAQS: Faq[] = [
  {
    id: "self-host",
    category: "deployment",
    q: "Can I self-host Swiffer?",
    a: "Yes — ship it with Docker, Cloudflare Workers, a VPS via systemd, or cPanel. Full instructions in the docs.",
  },
  {
    id: "cloud-api",
    category: "channels",
    q: "Do you support the official WhatsApp Cloud API?",
    a: "Yes. Swiffer is built directly on Meta's Cloud API — no third-party gateways or proxies.",
  },
  {
    id: "multi-tenant",
    category: "security",
    q: "Is it truly multi-tenant?",
    a: "Every workspace is fully isolated at the row level with RLS, dedicated storage paths, and role-scoped policies.",
  },
  {
    id: "license",
    category: "pricing",
    q: "What's included with a license?",
    a: "Full source, database migrations, docs portal, PWA assets, and 6 months of support with lifetime updates.",
  },
  {
    id: "ai-providers",
    category: "ai",
    q: "Which AI providers are supported?",
    a: "Gemini, OpenAI, Anthropic, DeepSeek and OpenRouter — behind a single abstraction you can swap at any time. Workspace BYOK is optional.",
  },
  {
    id: "white-label",
    category: "product",
    q: "Can I white-label it?",
    a: "Yes. Branding, PWA icons, colors, domain and email sender are all configurable per tenant.",
  },
  {
    id: "other-channels",
    category: "channels",
    q: "Which channels beyond WhatsApp are supported?",
    a: "Telegram, Instagram, Facebook Messenger, the embeddable live chat widget, plus email and SMS accounts — all landing in the same unified inbox.",
  },
  {
    id: "shared-inbox",
    category: "product",
    q: "How does the shared team inbox work?",
    a: "Conversations from every channel merge into one threaded timeline with assignment, SLA timers, internal notes, typing indicators and unified unread badges.",
  },
  {
    id: "templates",
    category: "channels",
    q: "Can I manage WhatsApp message templates?",
    a: "Yes. Create, submit and version templates with media headers, variable editing and a picker that fills variables before sending.",
  },
  {
    id: "chatbots",
    category: "ai",
    q: "Can bots hand off to a human agent?",
    a: "The chatbot builder supports multi-language triggers, skills-based routing and operator handoff that hands the thread to the right agent mid-conversation.",
  },
  {
    id: "automation",
    category: "ai",
    q: "Is there a no-code workflow builder?",
    a: "Yes — a visual builder for triggers, conditions and actions across messaging, CRM records, campaigns and webhooks.",
  },
  {
    id: "crm",
    category: "product",
    q: "Does it include a CRM and sales pipeline?",
    a: "Contacts, companies, deals and a drag-and-drop pipeline are built in, with contact matching that links every conversation to the right record.",
  },
  {
    id: "data-security",
    category: "security",
    q: "How is my data protected?",
    a: "Row-level security on every table, encrypted channel credentials, scoped API keys, audit logs for platform changes and a built-in security scan dashboard.",
  },
  {
    id: "payments",
    category: "pricing",
    q: "Which payment gateways can I bill with?",
    a: "Stripe and Paddle are wired end to end — plan-to-price mapping, checkout, webhooks for renewals and cancellations, plus sandbox and live environments.",
  },
  {
    id: "migration",
    category: "deployment",
    q: "Can I use my own domain and email sender?",
    a: "Yes. Custom domains, per-tenant white-label branding and your own transactional email sending domain are all supported.",
  },
  {
    id: "mobile",
    category: "product",
    q: "Is there a mobile experience?",
    a: "The app is an installable PWA with push notifications, and the inbox is fully optimised for phones and tablets.",
  },
];

/** JSON-LD graph for the landing page: product, site search, and the FAQ. */
export function landingJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Swiffer",
        url: SITE_URL,
        logo: `${SITE_URL}/icon-512.png`,
        description: LANDING_SOCIAL_DESCRIPTION,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "Swiffer",
        description: LANDING_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: "Swiffer",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "CRM",
        operatingSystem: "Web, iOS, Android",
        url: SITE_URL,
        image: OG_IMAGE_URL,
        description: LANDING_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#organization` },
        featureList: [
          "Shared WhatsApp team inbox",
          "Sales pipeline and CRM",
          "AI chatbots and AI Studio",
          "Broadcast and drip campaigns",
          "No-code workflow automation",
          "WhatsApp commerce and catalogues",
          "Multi-tenant workspaces with RLS",
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: LANDING_FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}
