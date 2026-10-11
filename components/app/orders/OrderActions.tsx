"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { cancelOrderAction, fulfillOrderAction, refundOrderAction } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { formatMoney } from "@/lib/format";
import { fromCents, toCents } from "@/lib/money";
import { refundFormSchema, type RefundFormValues } from "@/lib/validators/orders";

type Props = {
  slug: string; orderId: string; currency: string;
  status: string; paymentStatus: string; fulfillmentStatus: string;
  remainingCents: number; refundable: boolean; canFulfill: boolean; canManage: boolean;
};
type Dialog = null | "ship" | "cancel" | "refund";

export function OrderActions(p: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, start] = useTransition();
  const [tracking, setTracking] = useState("");
  const [error, setError] = useState<string>();
  const close = () => { setDialog(null); setError(undefined); };

  const run = (fn: () => Promise<{ error?: string }>, ok: string) =>
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (r.error) { setError(r.error); toast.error(r.error); return; }
      toast.success(ok); close(); router.refresh();
    });

  const { register, handleSubmit, control, formState: { errors } } = useForm<RefundFormValues>({
    resolver: zodResolver(refundFormSchema),
    defaultValues: { amount: fromCents(p.remainingCents), restock: false, reason: "" },
  });
  const amount = useWatch({ control, name: "amount" });
  const canRestock = p.fulfillmentStatus === "unfulfilled" && /^\d+(\.\d{1,2})?$/.test(amount) && toCents(amount) === p.remainingCents;

  const confirmed = p.status === "confirmed" && ["paid", "partially_refunded"].includes(p.paymentStatus);
  const canShip = p.canFulfill && confirmed && p.fulfillmentStatus === "unfulfilled";
  const canDeliver = p.canFulfill && confirmed && p.fulfillmentStatus === "shipped";
  const canCancel = p.canManage && p.status === "pending";
  const canRefund = p.canManage && p.refundable && p.remainingCents > 0;
  if (!canShip && !canDeliver && !canCancel && !canRefund) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {canShip && <Button onClick={() => setDialog("ship")}>Mark as shipped</Button>}
      {canDeliver && <Button disabled={pending} onClick={() => run(() => fulfillOrderAction(p.slug, p.orderId, "delivered", ""), "Marked as delivered")}>Mark as delivered</Button>}
      {canRefund && <Button variant="ghost" onClick={() => setDialog("refund")}>Refund</Button>}
      {canCancel && <Button variant="ghost" className="text-red-300" onClick={() => setDialog("cancel")}>Cancel order</Button>}

      <Modal open={dialog === "ship"} onClose={close} title="Mark as shipped">
        <div className="space-y-4">
          <Field id="tracking" label="Tracking number (optional)" value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={100} />
          <p className="text-sm text-muted">The customer is emailed if email is configured.</p>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <Button className="w-full" disabled={pending} onClick={() => run(() => fulfillOrderAction(p.slug, p.orderId, "shipped", tracking), "Marked as shipped")}>
            {pending ? "Saving…" : "Confirm shipment"}
          </Button>
        </div>
      </Modal>

      <Modal open={dialog === "cancel"} onClose={close} title="Cancel this order?">
        <p className="text-sm text-muted">The customer hasn&apos;t paid. Reserved stock goes straight back on the shelf.</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>Keep order</Button>
          <Button className="bg-red-500 hover:bg-red-500/90" disabled={pending} onClick={() => run(() => cancelOrderAction(p.slug, p.orderId), "Order cancelled")}>
            {pending ? "Cancelling…" : "Cancel order"}
          </Button>
        </div>
      </Modal>

      <Modal open={dialog === "refund"} onClose={close} title="Refund this order">
        <form noValidate className="space-y-4"
          onSubmit={handleSubmit((v) => run(() => refundOrderAction(p.slug, p.orderId, { ...v, restock: v.restock && canRestock }), "Refund issued"))}>
          <Field id="refund-amount" label={`Amount (up to ${formatMoney(p.remainingCents, p.currency)})`} inputMode="decimal" error={errors.amount?.message} {...register("amount")} />
          <Field id="refund-reason" label="Reason (optional)" error={errors.reason?.message} {...register("reason")} />
          <label className={`flex items-start gap-3 text-sm ${canRestock ? "" : "opacity-50"}`}>
            <input type="checkbox" disabled={!canRestock} className="mt-1" {...register("restock")} />
            <span>Return items to stock and cancel the order
              <span className="block text-xs text-muted">Only for a full refund of an order that hasn&apos;t shipped.</span></span>
          </label>
          <p className="text-xs text-muted">Refunds are sent to the customer&apos;s card through Stripe and can&apos;t be undone.</p>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "Refunding…" : "Issue refund"}</Button>
        </form>
      </Modal>
    </div>
  );
}
