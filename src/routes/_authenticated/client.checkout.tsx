import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { Loader2, MapPin, Truck, CreditCard, ClipboardList, CheckCircle2, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  myGetCart, myListAddresses, mySaveAddress, myListShipping, mySelectShipping,
  myApplyTax, myPlaceOrder, myApplyPromoCode, myRemovePromoCode,
} from '@/lib/commerce/client-checkout.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';

export const Route = createFileRoute('/_authenticated/client/checkout')({ component: CheckoutPage });

const money = (v: number, ccy = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy }).format(v ?? 0);

type Addr = {
  street1: string; street2?: string; city: string; region?: string;
  postal_code: string; country: string; name?: string;
};

function CheckoutPage() {
  const navigate = useNavigate();
  const getCart = useServerFn(myGetCart);
  const listAddr = useServerFn(myListAddresses);
  const saveAddr = useServerFn(mySaveAddress);
  const listShip = useServerFn(myListShipping);
  const selectShip = useServerFn(mySelectShipping);
  const applyTax = useServerFn(myApplyTax);
  const placeOrder = useServerFn(myPlaceOrder);
  const applyPromo = useServerFn(myApplyPromoCode);
  const removePromo = useServerFn(myRemovePromoCode);

  const cartQ = useQuery({ queryKey: ['client-cart'], queryFn: () => getCart() });
  const addrQ = useQuery({ queryKey: ['client-addresses'], queryFn: () => listAddr() });

  const [shippingAddr, setShippingAddr] = useState<Addr>({
    street1: '', city: '', postal_code: '', country: 'US',
  });
  const [selectedAddrId, setSelectedAddrId] = useState<string | 'new'>('new');
  const [shippingRateId, setShippingRateId] = useState<string>('');
  const [payment, setPayment] = useState<'card' | 'cod' | 'bank_transfer' | 'wallet' | 'payment_link'>('card');
  const [notes, setNotes] = useState('');
  const [promoInput, setPromoInput] = useState('');
  const [placing, setPlacing] = useState(false);

  const shipQ = useQuery({
    queryKey: ['client-shipping', shippingAddr.country],
    queryFn: () => listShip({ data: { country: shippingAddr.country } }),
    enabled: !!shippingAddr.country,
  });

  const cart = cartQ.data?.cart as {
    id: string; currency: string; subtotal: number; discount: number; shipping: number; tax: number; total: number;
    promo_code?: string | null;
    applied_promotions?: Array<{ promotion_id: string; name: string; code: string | null; amount_off_cents: number; free_shipping: boolean }>;
  } | undefined;

  const applyPromoM = useMutation({
    mutationFn: (code: string) => applyPromo({ data: { cartId: cart!.id, code } }),
    onSuccess: () => { setPromoInput(''); cartQ.refetch(); toast.success('Promo applied'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removePromoM = useMutation({
    mutationFn: () => removePromo({ data: { cartId: cart!.id } }),
    onSuccess: () => cartQ.refetch(),
  });

  const selectShipM = useMutation({
    mutationFn: (rateId: string) => selectShip({ data: { cartId: cart!.id, rateId } }),
    onSuccess: () => cartQ.refetch(),
  });
  const applyTaxM = useMutation({
    mutationFn: (v: { country: string; region?: string }) =>
      applyTax({ data: { cartId: cart!.id, ...v } }),
    onSuccess: () => cartQ.refetch(),
  });

  async function applyChosenAddress() {
    let addr: Addr = shippingAddr;
    if (selectedAddrId !== 'new') {
      const list = addrQ.data as Array<{ id: string; street1: string; street2: string | null; city: string; region: string | null; postal_code: string; country: string }> | undefined;
      const chosen = list?.find((a) => a.id === selectedAddrId);
      if (chosen) {
        addr = {
          street1: chosen.street1, street2: chosen.street2 ?? undefined, city: chosen.city,
          region: chosen.region ?? undefined, postal_code: chosen.postal_code, country: chosen.country,
        };
        setShippingAddr(addr);
      }
    } else if (addr.street1 && addr.city && addr.postal_code) {
      await saveAddr({ data: { addressType: 'shipping', ...addr } });
      addrQ.refetch();
    }
    if (addr.country) applyTaxM.mutate({ country: addr.country, region: addr.region });
    return addr;
  }

  async function submitOrder() {
    if (!cart) return;
    const addr = await applyChosenAddress();
    if (!addr.street1 || !addr.city || !addr.postal_code) { toast.error('Please enter a shipping address'); return; }
    if (shippingRateId) await selectShip({ data: { cartId: cart.id, rateId: shippingRateId } });
    setPlacing(true);
    try {
      const res = await placeOrder({
        data: { cartId: cart.id, shippingAddress: addr, paymentMethod: payment, notes: notes || undefined },
      });
      toast.success(`Order ${res.orderNumber} placed`);
      navigate({ to: '/client/order-confirmation/$id', params: { id: res.orderId } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setPlacing(false); }
  }

  if (cartQ.isLoading) return <div className="p-8"><Loader2 className="w-4 h-4 animate-spin" /></div>;
  if (!cart) return null;
  const rates = (shipQ.data as Array<{ id: string; name: string; price: number; estimated_days_min: number | null; estimated_days_max: number | null }> | undefined) ?? [];
  const savedAddrs = (addrQ.data as Array<{ id: string; label: string | null; street1: string; city: string; region: string | null; postal_code: string; country: string }> | undefined) ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        {/* Address */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h3 className="flex items-center gap-2 font-semibold"><MapPin className="w-4 h-4" /> Shipping address</h3>
          {savedAddrs.length > 0 && (
            <RadioGroup value={selectedAddrId} onValueChange={(v) => setSelectedAddrId(v as string)} className="mt-3 space-y-2">
              {savedAddrs.map((a) => (
                <label key={a.id} className="flex items-start gap-2 rounded-md border border-border p-3 cursor-pointer">
                  <RadioGroupItem value={a.id} className="mt-1" />
                  <div className="text-sm">
                    <p className="font-medium">{a.label ?? 'Address'}</p>
                    <p className="text-muted-foreground">{a.street1}, {a.city} {a.region ?? ''} {a.postal_code}, {a.country}</p>
                  </div>
                </label>
              ))}
              <label className="flex items-start gap-2 rounded-md border border-border p-3 cursor-pointer">
                <RadioGroupItem value="new" className="mt-1" />
                <p className="text-sm font-medium">Use a new address</p>
              </label>
            </RadioGroup>
          )}
          {(selectedAddrId === 'new' || savedAddrs.length === 0) && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="col-span-2"><Label>Street</Label><Input value={shippingAddr.street1} onChange={(e) => setShippingAddr({ ...shippingAddr, street1: e.target.value })} /></div>
              <div><Label>City</Label><Input value={shippingAddr.city} onChange={(e) => setShippingAddr({ ...shippingAddr, city: e.target.value })} /></div>
              <div><Label>Region / State</Label><Input value={shippingAddr.region ?? ''} onChange={(e) => setShippingAddr({ ...shippingAddr, region: e.target.value })} /></div>
              <div><Label>Postal code</Label><Input value={shippingAddr.postal_code} onChange={(e) => setShippingAddr({ ...shippingAddr, postal_code: e.target.value })} /></div>
              <div><Label>Country</Label><Input value={shippingAddr.country} onChange={(e) => setShippingAddr({ ...shippingAddr, country: e.target.value.toUpperCase() })} maxLength={2} /></div>
            </div>
          )}
        </section>

        {/* Shipping method */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h3 className="flex items-center gap-2 font-semibold"><Truck className="w-4 h-4" /> Shipping method</h3>
          {shipQ.isLoading ? <p className="text-sm text-muted-foreground mt-2">Loading rates…</p> :
            rates.length === 0 ? <p className="text-sm text-muted-foreground mt-2">No shipping options available for this destination.</p> : (
              <RadioGroup value={shippingRateId} onValueChange={(v) => { setShippingRateId(v); selectShipM.mutate(v); }} className="mt-3 space-y-2">
                {rates.map((r) => (
                  <label key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value={r.id} />
                      <div className="text-sm">
                        <p className="font-medium">{r.name}</p>
                        {(r.estimated_days_min || r.estimated_days_max) &&
                          <p className="text-xs text-muted-foreground">{r.estimated_days_min ?? '?'}–{r.estimated_days_max ?? '?'} days</p>}
                      </div>
                    </div>
                    <span className="font-semibold">{money(r.price, cart.currency)}</span>
                  </label>
                ))}
              </RadioGroup>
            )}
        </section>

        {/* Payment */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h3 className="flex items-center gap-2 font-semibold"><CreditCard className="w-4 h-4" /> Payment method</h3>
          <RadioGroup value={payment} onValueChange={(v) => setPayment(v as typeof payment)} className="mt-3 space-y-2">
            {[
              { v: 'card', l: 'Credit / debit card' },
              { v: 'payment_link', l: 'Payment link (email/WhatsApp)' },
              { v: 'bank_transfer', l: 'Bank transfer' },
              { v: 'wallet', l: 'Digital wallet' },
              { v: 'cod', l: 'Cash on delivery' },
            ].map((o) => (
              <label key={o.v} className="flex items-center gap-2 rounded-md border border-border p-3 cursor-pointer">
                <RadioGroupItem value={o.v} />
                <span className="text-sm">{o.l}</span>
              </label>
            ))}
          </RadioGroup>
        </section>

        {/* Notes */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h3 className="flex items-center gap-2 font-semibold"><ClipboardList className="w-4 h-4" /> Order notes</h3>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions, gift message…" className="mt-3" rows={3} />
        </section>
      </div>

      {/* Review */}
      <aside className="rounded-xl border border-border bg-surface p-4 space-y-3 h-fit">
        <h3 className="font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Review</h3>

        {/* Promo code */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium"><Tag className="w-3.5 h-3.5" /> Promo code</div>
          <div className="flex gap-2">
            <Input
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              placeholder="Enter code"
              className="h-9"
              onKeyDown={(e) => { if (e.key === 'Enter' && promoInput.trim()) applyPromoM.mutate(promoInput.trim()); }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!promoInput.trim() || applyPromoM.isPending}
              onClick={() => applyPromoM.mutate(promoInput.trim())}
            >Apply</Button>
          </div>
          {(cart.applied_promotions ?? []).length > 0 && (
            <div className="space-y-1">
              {(cart.applied_promotions ?? []).map((p) => (
                <div key={p.promotion_id} className="flex items-center justify-between rounded-sm border border-border bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Badge variant="outline" className="text-[11px] capitalize">{p.code ?? 'auto'}</Badge>
                    <span className="truncate text-emerald-700 dark:text-emerald-300">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                      {p.free_shipping ? 'Free shipping' : `−${money(p.amount_off_cents / 100, cart.currency)}`}
                    </span>
                    {p.code && (
                      <button
                        onClick={() => removePromoM.mutate()}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Remove promo"
                      ><X className="w-3 h-3" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-sm space-y-1 border-t border-border pt-3">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{money(cart.subtotal, cart.currency)}</span></div>
          {cart.discount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>−{money(cart.discount, cart.currency)}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>{money(cart.shipping, cart.currency)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{money(cart.tax, cart.currency)}</span></div>
          <div className="border-t border-border pt-2 flex justify-between font-semibold text-base"><span>Total</span><span>{money(cart.total, cart.currency)}</span></div>
        </div>
        <Button className="w-full h-9" disabled={placing} onClick={submitOrder}>
          {placing && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Place order
        </Button>
        <p className="text-[11px] text-muted-foreground">By placing this order you agree to the terms of service and privacy policy.</p>
      </aside>
    </div>
  );
}
