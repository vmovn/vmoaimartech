import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentWorkspace } from '@/hooks/use-workspace';
import type { Database } from '@/integrations/supabase/types';
import { nextDocumentNumber } from '@/lib/sales/sales.functions';
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";

export type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
export type InvoiceInsert = Database['public']['Tables']['invoices']['Insert'];
export type InvoiceUpdate = Database['public']['Tables']['invoices']['Update'];
export type InvoiceLineItem = Database['public']['Tables']['invoice_line_items']['Row'];
export type InvoiceLineItemInsert = Database['public']['Tables']['invoice_line_items']['Insert'];
export type InvoiceStatus = InvoiceRow['status'];
export type PaymentRow = Database['public']['Tables']['payments']['Row'];
export type PaymentInsert = Database['public']['Tables']['payments']['Insert'];
export type PaymentMethod = PaymentRow['method'];

export type InvoiceWithLines = InvoiceRow & {
  line_items: InvoiceLineItem[];
  contact?: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;
  company?: { id: string; name: string } | null;
  deal?: { id: string; title: string } | null;
};

export type InvoiceFilters = { search?: string; status?: InvoiceStatus | 'all'; dealId?: string; contactId?: string };

export type RecurringConfig = {
  enabled: boolean;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  next_run?: string | null;
  until?: string | null;
  occurrences?: number | null;
};

export type ReminderEntry = { at: string; channel: 'email' | 'whatsapp' | 'sms' | 'manual'; note?: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-muted text-muted-foreground' },
  sent: { label: 'Sent', tone: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  viewed: { label: 'Viewed', tone: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400' },
  partial: { label: 'Partial', tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  paid: { label: 'Paid', tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  overdue: { label: 'Overdue', tone: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  void: { label: 'Void', tone: 'bg-muted text-muted-foreground line-through' },
  refunded: { label: 'Refunded', tone: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
};

export function useInvoices(filters: InvoiceFilters = {}) {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ['invoices', wsId, filters],
    enabled: !!wsId,
    queryFn: async (): Promise<InvoiceRow[]> => {
      let q = db.from('invoices').select('*').eq('workspace_id', wsId).is('deleted_at', null);
      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters.dealId) q = q.eq('deal_id', filters.dealId);
      if (filters.contactId) q = q.eq('contact_id', filters.contactId);
      if (filters.search?.trim()) {
        const s = filters.search.trim().replace(/[%,]/g, ' ');
        q = q.or([`invoice_number.ilike.%${sanitizeSearchTerm(s)}%`, `external_ref.ilike.%${sanitizeSearchTerm(s)}%`].join(','));
      }
      const { data, error } = await q.order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      // Auto-mark overdue for display consistency
      const now = new Date().toISOString().slice(0, 10);
      return (data ?? []).map((r: InvoiceRow) => {
        if (r.due_date && r.due_date < now && ['sent', 'viewed', 'partial'].includes(r.status) && Number(r.amount_due) > 0) {
          return { ...r, status: 'overdue' as InvoiceStatus };
        }
        return r;
      });
    },
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['invoice', id],
    enabled: !!id,
    queryFn: async (): Promise<InvoiceWithLines | null> => {
      const { data, error } = await db
        .from('invoices')
        .select(`*,
          line_items:invoice_line_items(*),
          contact:contacts(id, first_name, last_name, email, phone),
          company:companies(id, name),
          deal:deals(id, title)
        `)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const inv = data as InvoiceWithLines;
      inv.line_items = [...(inv.line_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      return inv;
    },
  });
}

export function useInvoicePayments(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['invoice-payments', invoiceId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await db
        .from('payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('paid_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });
}

export type InvoiceFormInput = {
  id?: string;
  quote_id?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  deal_id?: string | null;
  currency: string;
  issue_date: string;
  due_date?: string | null;
  notes?: string | null;
  terms?: string | null;
  external_ref?: string | null;
  recurring?: RecurringConfig | null;
  lines: Array<{
    id?: string;
    product_id?: string | null;
    name: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
    discount_pct: number;
    tax_rate: number;
  }>;
};

export function computeInvoiceTotals(lines: InvoiceFormInput['lines']) {
  let subtotal = 0, discount_total = 0, tax_total = 0;
  const items = lines.map((l) => {
    const gross = Number(l.quantity) * Number(l.unit_price);
    const disc = gross * (Number(l.discount_pct) / 100);
    const net = gross - disc;
    const tax = net * (Number(l.tax_rate) / 100);
    subtotal += gross;
    discount_total += disc;
    tax_total += tax;
    return { ...l, subtotal: gross, total: net + tax };
  });
  const total = subtotal - discount_total + tax_total;
  return { subtotal, discount_total, tax_total, total, items };
}

export function useSaveInvoice() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: InvoiceFormInput) => {
      if (!active?.id) throw new Error('No workspace');
      const wsId = active.id;
      const totals = computeInvoiceTotals(input.lines);

      let invoiceId = input.id;
      let invoiceNumber: string | undefined;

      if (!invoiceId) {
        const { number } = await nextDocumentNumber({ data: { workspaceId: wsId, kind: 'invoice' } });
        invoiceNumber = number;
      }

      // preserve existing custom_fields on update
      let existingCF: Record<string, unknown> = {};
      let existingPaid = 0;
      if (invoiceId) {
        const { data: cur } = await db.from('invoices').select('custom_fields, amount_paid').eq('id', invoiceId).single();
        existingCF = (cur?.custom_fields as Record<string, unknown>) ?? {};
        existingPaid = Number(cur?.amount_paid ?? 0);
      }

      const cf: Record<string, unknown> = { ...existingCF };
      if (input.recurring) cf.recurring = input.recurring;

      const amountPaid = existingPaid;
      const amountDue = Math.max(0, totals.total - amountPaid);

      const payload: Partial<InvoiceInsert> = {
        workspace_id: wsId,
        contact_id: input.contact_id ?? null,
        company_id: input.company_id ?? null,
        deal_id: input.deal_id ?? null,
        quote_id: input.quote_id ?? null,
        currency: input.currency,
        issue_date: input.issue_date,
        due_date: input.due_date ?? null,
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        external_ref: input.external_ref ?? null,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        total: totals.total,
        amount_due: amountDue,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        custom_fields: cf as any,
      };

      if (invoiceId) {
        const { error } = await db.from('invoices').update(payload).eq('id', invoiceId);
        if (error) throw error;
      } else {
        const { data, error } = await db
          .from('invoices')
          .insert({ ...payload, invoice_number: invoiceNumber! })
          .select('id')
          .single();
        if (error) throw error;
        invoiceId = data.id as string;
      }

      await db.from('invoice_line_items').delete().eq('invoice_id', invoiceId);
      if (totals.items.length) {
        const rows: InvoiceLineItemInsert[] = totals.items.map((l, i) => ({
          workspace_id: wsId,
          invoice_id: invoiceId!,
          product_id: l.product_id ?? null,
          name: l.name,
          description: l.description ?? null,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_pct: l.discount_pct,
          tax_rate: l.tax_rate,
          subtotal: l.subtotal,
          total: l.total,
          sort_order: i,
        }));
        const { error } = await db.from('invoice_line_items').insert(rows);
        if (error) throw error;
      }
      return invoiceId!;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice', id] });
    },
  });
}

export function useUpdateInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: InvoiceStatus }) => {
      const patch: InvoiceUpdate = { status };
      const now = new Date().toISOString();
      if (status === 'sent') patch.sent_at = now;
      if (status === 'viewed') patch.viewed_at = now;
      if (status === 'paid') patch.paid_at = now;
      if (status === 'void') patch.voided_at = now;
      const { error } = await db.from('invoices').update(patch).eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice', id] });
    },
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('invoices').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}

async function recomputeInvoiceFromPayments(invoiceId: string) {
  const { data: inv } = await db.from('invoices').select('total').eq('id', invoiceId).single();
  if (!inv) return;
  const { data: pays } = await db.from('payments').select('amount, status').eq('invoice_id', invoiceId);
  const paid = ((pays ?? []) as { amount: number; status: string }[])
    .filter((p) => p.status === 'succeeded')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const total = Number(inv.total || 0);
  const due = Math.max(0, total - paid);
  let status: InvoiceStatus = 'sent';
  if (paid <= 0) status = 'sent';
  else if (paid >= total) status = 'paid';
  else status = 'partial';
  const patch: InvoiceUpdate = { amount_paid: paid, amount_due: due, status };
  if (status === 'paid') patch.paid_at = new Date().toISOString();
  await db.from('invoices').update(patch).eq('id', invoiceId);
}

export function useRecordPayment() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (p: {
      invoice_id: string;
      amount: number;
      method: PaymentMethod;
      reference?: string | null;
      notes?: string | null;
      paid_at?: string | null;
      status?: PaymentRow['status'];
    }) => {
      if (!active?.id) throw new Error('No workspace');
      const { data: inv } = await db.from('invoices').select('currency, contact_id, deal_id').eq('id', p.invoice_id).single();
      const row: PaymentInsert = {
        workspace_id: active.id,
        invoice_id: p.invoice_id,
        amount: p.amount,
        method: p.method,
        status: p.status ?? 'succeeded',
        reference: p.reference ?? null,
        notes: p.notes ?? null,
        paid_at: p.paid_at ?? new Date().toISOString(),
        currency: inv?.currency ?? 'USD',
        contact_id: inv?.contact_id ?? null,
        deal_id: inv?.deal_id ?? null,
      };
      const { error } = await db.from('payments').insert(row);
      if (error) throw error;
      await recomputeInvoiceFromPayments(p.invoice_id);
      return p.invoice_id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['invoice-payments', id] });
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, invoice_id }: { id: string; invoice_id: string }) => {
      const { error } = await db.from('payments').delete().eq('id', id);
      if (error) throw error;
      await recomputeInvoiceFromPayments(invoice_id);
      return invoice_id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['invoice-payments', id] });
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useLogReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, entry }: { id: string; entry: ReminderEntry }) => {
      const { data: cur } = await db.from('invoices').select('custom_fields').eq('id', id).single();
      const cf = ((cur?.custom_fields as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      const reminders = Array.isArray(cf.reminders) ? (cf.reminders as ReminderEntry[]) : [];
      cf.reminders = [entry, ...reminders].slice(0, 100);
      const { error } = await db.from('invoices').update({ custom_fields: cf }).eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => qc.invalidateQueries({ queryKey: ['invoice', id] }),
  });
}

export function useEnsureInvoiceShareToken() {
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const { data: existing } = await db.from('invoices').select('public_token').eq('id', id).single();
      if (existing?.public_token) return existing.public_token as string;
      const token = crypto.randomUUID();
      const { error } = await db.from('invoices').update({ public_token: token }).eq('id', id);
      if (error) throw error;
      return token;
    },
  });
}

export function readRecurring(inv: InvoiceRow | InvoiceWithLines | null | undefined): RecurringConfig | null {
  const cf = (inv?.custom_fields as Record<string, unknown> | undefined) ?? {};
  const r = cf.recurring as RecurringConfig | undefined;
  return r ?? null;
}

export function readReminders(inv: InvoiceRow | InvoiceWithLines | null | undefined): ReminderEntry[] {
  const cf = (inv?.custom_fields as Record<string, unknown> | undefined) ?? {};
  const r = cf.reminders;
  return Array.isArray(r) ? (r as ReminderEntry[]) : [];
}
