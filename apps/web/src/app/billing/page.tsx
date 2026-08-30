"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { trackEvent } from "../../lib/track";
import { useAuth } from "../../context/AuthContext";

interface BillingStatus {
  plan: string;
  planStatus: string;
  planName: string;
  maxAccounts: number;
  maxSeats: number;
  maxPostsPerMonth: number | null;
  accountsUsed: number;
  postsThisMonth: number;
  trialDaysLeft: number;
  trialExpired: boolean;
  trialEndsAt: string | null;
  hasDodoSub: boolean;
  workspaceId: string;
  workspaceName: string;
}

const PLANS = [
  {
    id: "creator",
    name: "Creator",
    priceInr: "₹550",
    priceUsd: "$9",
    period: "/mo",
    description: "Para creadores solitarios construyendo su audiencia",
    color: "#5b63d3",
    maxAccounts: 5,
    maxPostsPerMonth: 400,
    features: [
      { text: "5 cuentas conectadas", included: true },
      { text: "400 publicaciones / mes", included: true },
      { text: "Múltiples plataformas", included: true },
      { text: "Programación masiva por CSV", included: true },
      { text: "Plantillas de publicaciones", included: true },
      { text: "Calendario y arrastrar para reprogramar", included: true },
      { text: "Automatización de primer comentario", included: true },
      { text: "1 miembro de equipo", included: true },
      { text: "Reels e Historias", included: true },
      { text: "Personalización por plataforma", included: true },
      { text: "Publicar en X/Twitter", included: false },
      { text: "Acceso a API y MCP", included: false },
      { text: "Webhooks salientes", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceInr: "₹1,700",
    priceUsd: "$29",
    period: "/mo",
    description: "Para usuarios avanzados que publican sin límites",
    color: "#7c3aed",
    maxAccounts: 15,
    maxPostsPerMonth: null,
    popular: true,
    features: [
      { text: "15 cuentas conectadas", included: true },
      { text: "Publicaciones ilimitadas", included: true },
      { text: "Múltiples plataformas", included: true },
      { text: "Programación masiva por CSV", included: true },
      { text: "Plantillas de publicaciones", included: true },
      { text: "Calendario y arrastrar para reprogramar", included: true },
      { text: "Automatización de primer comentario", included: true },
      { text: "2 miembros de equipo", included: true },
      { text: "Reels e Historias", included: true },
      { text: "Personalización por plataforma", included: true },
      { text: "Publicar en X/Twitter (100/mes)", included: true },
      { text: "Acceso a API y MCP", included: true },
      { text: "Webhooks salientes", included: true },
    ],
  },
  {
    id: "team",
    name: "Team",
    priceInr: "₹2,600",
    priceUsd: "$49",
    period: "/mo",
    description: "Para agencias y equipos pequeños",
    color: "#0891b2",
    maxAccounts: 50,
    maxPostsPerMonth: null,
    features: [
      { text: "50 cuentas conectadas", included: true },
      { text: "Publicaciones ilimitadas", included: true },
      { text: "Múltiples plataformas", included: true },
      { text: "Programación masiva por CSV", included: true },
      { text: "Plantillas de publicaciones", included: true },
      { text: "Calendario y arrastrar para reprogramar", included: true },
      { text: "Automatización de primer comentario", included: true },
      { text: "4 miembros de equipo", included: true },
      { text: "Reels e Historias", included: true },
      { text: "Personalización por plataforma", included: true },
      { text: "Publicar en X/Twitter (100/mes)", included: true },
      { text: "Acceso a API y MCP", included: true },
      { text: "Webhooks salientes", included: true },
    ],
  },
];

function StatusBadge({ status, trialDaysLeft, trialEndsAt }: { status: string; trialDaysLeft: number; trialEndsAt?: string | null }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{ backgroundColor: "#052e16", color: "#4ade80", border: "1px solid #14532d" }}>
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        Activo
      </span>
    );
  }
  if (status === "trialing") {
    const expired = trialEndsAt ? new Date(trialEndsAt) < new Date() : false;
    if (expired) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ backgroundColor: "#1f0a0a", color: "#f87171", border: "1px solid #7f1d1d" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          Prueba finalizada
        </span>
      );
    }
    const urgent = trialDaysLeft <= 3;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{
          backgroundColor: urgent ? "#1c1209" : "#1c1a10",
          color: urgent ? "#fb923c" : "#fbbf24",
          border: `1px solid ${urgent ? "#7c2d12" : "#78560a"}`,
        }}>
        <span className={`w-1.5 h-1.5 rounded-full ${urgent ? "bg-orange-400 animate-pulse" : "bg-amber-400"}`} />
        {trialDaysLeft === 0 ? "La prueba termina hoy" : `Quedan ${trialDaysLeft} día${trialDaysLeft === 1 ? "" : "s"}`}
      </span>
    );
  }
  if (status === "on_hold") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{ backgroundColor: "#1f0a0a", color: "#f87171", border: "1px solid #7f1d1d" }}>
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        Pago fallido
      </span>
    );
  }
  if (status === "cancelling") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{ backgroundColor: "#1c1209", color: "#fb923c", border: "1px solid #7c2d12" }}>
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
        Se cancela al final del período
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{ backgroundColor: "#1a1a1a", color: "#666", border: "1px solid #2a2a2a" }}>
        Cancelado
      </span>
    );
  }
  return null;
}

function UsageBar({
  label, used, max, color, warningAt = 80,
}: {
  label: string; used: number; max: number | null; color: string; warningAt?: number;
}) {
  if (max === null) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "#aaaaaa" }}>{label}</span>
        <span className="text-xs font-semibold" style={{ color: "#ededed" }}>{used} <span style={{ color: "#444" }}>/ ∞</span></span>
      </div>
    );
  }
  const pct = max === 0 ? 100 : Math.min(100, Math.round((used / max) * 100));
  const isHigh = pct >= warningAt;
  const isFull = pct >= 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium" style={{ color: "#aaaaaa" }}>{label}</span>
        <span className="text-xs font-semibold tabular-nums"
          style={{ color: isFull ? "#ef4444" : isHigh ? "#fb923c" : "#ededed" }}>
          {used} <span style={{ color: "#666" }}>/ {max}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#1f1f1f" }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: isFull ? "#ef4444" : isHigh ? "#fb923c" : color }} />
      </div>
      {isFull && (
        <p className="mt-1.5 text-xs" style={{ color: "#fb923c" }}>
          Límite alcanzado - mejora tu plan para continuar.
        </p>
      )}
    </div>
  );
}

const CANCEL_REASONS = [
  "Muy caro",
  "Faltan funcionalidades que necesito",
  "Encontré una mejor alternativa",
  "Solo lo necesitaba temporalmente",
  "Problemas técnicos",
  "Otro",
];

function CancelModal({ onConfirm, onClose, loading }: {
  onConfirm: (reason: string, feedback: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ backgroundColor: "#111111", border: "1px solid #2a2a2a" }}>
        <h2 className="text-base font-bold mb-1" style={{ color: "#ededed" }}>Cancelar suscripción</h2>
        <p className="text-xs mb-5" style={{ color: "#777" }}>
          Mantendrás el acceso hasta el final del período de facturación actual.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-2">
              ¿Por qué cancelas? <span style={{ color: "#999" }}>(opcional)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CANCEL_REASONS.map((r) => (
                <button key={r} onClick={() => setReason(reason === r ? "" : r)}
                  className="text-left text-xs px-3 py-2 rounded-xl transition-all"
                  style={reason === r
                    ? { backgroundColor: "#1a1a3a", color: "#ededed", border: "1px solid #5b63d350" }
                    : { backgroundColor: "#0a0a0a", color: "#999", border: "1px solid #4d4d4d" }}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-2">
              ¿Algo más que debamos saber? <span style={{ color: "#999" }}>(opcional)</span>
            </label>
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={3}
              placeholder="Ayúdanos a mejorar Posthive…"
              className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-white/10"
              style={{ backgroundColor: "#0a0a0a", border: "1px solid #2a2a2a", color: "#ededed" }}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-gray-100"
            style={{ backgroundColor: "#ffffff", color: "#0a0a0a" }}>
            Mantener suscripción
          </button>
          <button onClick={() => onConfirm(reason, feedback)} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
            style={{ backgroundColor: "#1a0a0a", color: "#f87171", border: "1px solid #3a1a1a" }}>
            {loading ? "Cancelando…" : "Confirmar cancelación"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BillingContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isOwner = !user || user.role === "owner";
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isIndia, setIsIndia] = useState(true);
  const { success: toastSuccess, error: toastError } = useToast();
  const success = searchParams.get("success");

  useEffect(() => {
    const tz = user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    setIsIndia(tz === "Asia/Kolkata");
  }, [user?.timezone]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_BILLING !== "true") { setLoading(false); return; }
    apiFetch<BillingStatus>("/billing/status")
      .then(setStatus)
      .finally(() => setLoading(false));
  }, []);

  async function checkout(planId: string) {
    setCheckingOut(planId);
    trackEvent("checkout_clicked", { planId, isTrialing, isActive });
    try {
      // Existing subscribers (trialing, active, or cancelling) — change plan in place, no new checkout
      if (isTrialing || isActive || isCancelling) {
        const result = await apiFetch<{ ok?: boolean; url?: string }>("/billing/change-plan", {
          method: "POST",
          body: JSON.stringify({ planId }),
        });
        if (result.url) {
          window.location.href = result.url;
          return;
        }
        // Refetch full status so planStatus, plan, and all fields are in sync
        apiFetch<BillingStatus>("/billing/status").then(setStatus).catch(() => {});
        toastSuccess("¡Plan actualizado exitosamente!");
        return;
      }
      // New users — open Dodo checkout
      const { url } = await apiFetch<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId }),
      });
      window.location.href = url;
    } catch (err) {
      toastError(String(err));
    } finally {
      setCheckingOut(null);
    }
  }

  async function cancelSubscription(reason: string, feedback: string) {
    setCancelling(true);
    try {
      await apiFetch("/billing/cancel", {
        method: "POST",
        body: JSON.stringify({ reason: reason || undefined, feedback: feedback || undefined }),
      });
      setCancelDone(true);
      setShowCancelModal(false);
      setStatus((s) => s ? { ...s, planStatus: "cancelling" } : s);
      toastSuccess("Suscripción cancelada mantendrás el acceso hasta que termine el período de facturación.");
    } catch (err) {
      toastError(String(err));
    } finally {
      setCancelling(false);
    }
  }

  const currentPlanDef = PLANS.find((p) => p.id === status?.plan);
  const isTrialing = status?.planStatus === "trialing";
  const isCancelled = status?.planStatus === "cancelled";
  const isCancelling = status?.planStatus === "cancelling";
  const isOnHold = status?.planStatus === "on_hold";
  const isActive = status?.planStatus === "active";
  const hasDodoSub = status?.hasDodoSub ?? false;

  const billingEnabled = process.env.NEXT_PUBLIC_ENABLE_BILLING === "true";

  const now = new Date();
  const monthName = now.toLocaleString("default", { month: "long" });
  const planPrice = (plan: typeof PLANS[number]) => isIndia ? plan.priceInr : plan.priceUsd;

  if (!billingEnabled) {
    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: "#0a0a0a" }}>
        <div className="flex items-center pl-16 pr-4 md:px-8 flex-shrink-0"
          style={{ height: 65, borderBottom: "1px solid #2a2a2a", backgroundColor: "#111111" }}>
          <div>
            <h1 className="text-lg font-bold" style={{ color: "#ededed" }}>Facturación</h1>
            <p className="text-xs mt-0.5" style={{ color: "#888888" }}>Instancia autoalojada</p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: "#111111", border: "1px solid #2a2a2a" }}>
              <svg className="w-7 h-7" fill="none" stroke="#5b63d3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
            <h2 className="text-lg font-bold mb-2" style={{ color: "#ededed" }}>Modo autoalojado</h2>
            <p className="text-sm leading-relaxed" style={{ color: "#888888" }}>
              La facturación está deshabilitada en esta instancia. Todas las funcionalidades están desbloqueadas sin límites.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: "#0a0a0a" }}>
      {showCancelModal && (
        <CancelModal
          onConfirm={cancelSubscription}
          onClose={() => setShowCancelModal(false)}
          loading={cancelling}
        />
      )}

      {/* Header */}
      <div className="pl-16 pr-4 md:px-8 flex-shrink-0 flex items-center" style={{ height: 65, borderBottom: "1px solid #2a2a2a" }}>
        <div className="min-w-0">
          <h1 className="text-lg font-bold" style={{ color: "#ededed" }}>Facturación y planes</h1>
          <p className="text-xs mt-0.5 truncate hidden sm:block" style={{ color: "#aaaaaa" }}>
            {status?.workspaceName ?? "Gestiona tu suscripción y uso"}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">

        {/* Success banner */}
        {success && (
          <div className="flex items-center gap-3 px-5 py-4 rounded-2xl"
            style={{ backgroundColor: "#052e16", border: "1px solid #14532d" }}>
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="#4ade80" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              {isActive ? (
                <>
                  <p className="text-sm font-semibold" style={{ color: "#4ade80" }}>
                    {`Plan ${status?.planName} activado `} ¡ya está todo listo!
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#86efac" }}>
                    Tu suscripción ya está activa. Empieza a programar publicaciones en todas tus cuentas.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold" style={{ color: "#4ade80" }}>¡Prueba iniciada — ya está todo listo!</p>
                  <p className="text-xs mt-0.5" style={{ color: "#86efac" }}>Tu prueba gratuita de 14 días ya está activa. Sin cargo hasta que termine.</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Status banners */}
        {isOnHold && (
          <div className="flex items-start gap-3 px-5 py-4 rounded-2xl"
            style={{ backgroundColor: "#1f0a0a", border: "1px solid #7f1d1d" }}>
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="#f87171" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#f87171" }}>Pago fallido</p>
              <p className="text-xs mt-1" style={{ color: "#888" }}>
                No pudimos procesar tu último pago. Actualiza tu método de pago en el portal de Dodo para restaurar el acceso completo.
              </p>
            </div>
          </div>
        )}

        {isCancelled && (
          <div className="flex items-start gap-3 px-5 py-4 rounded-2xl"
            style={{ backgroundColor: "#1a1a1a", border: "1px solid #2a2a2a" }}>
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="#555" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#888" }}>Suscripción cancelada</p>
              <p className="text-xs mt-1" style={{ color: "#555" }}>
                Tu acceso terminó. Suscríbete a un plan abajo para seguir programando publicaciones.
              </p>
            </div>
          </div>
        )}

        {/* Current plan card */}
        {!loading && status && !isCancelled && (
          <div className="rounded-2xl p-6" style={{ backgroundColor: "#111111", border: "1px solid #2a2a2a" }}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-3">
                  Plan actual
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold" style={{ color: "#ededed" }}>{status.planName}</h2>
                  <StatusBadge status={status.planStatus} trialDaysLeft={status.trialDaysLeft} trialEndsAt={status.trialEndsAt} />
                </div>
                {isTrialing && status.trialEndsAt && (() => {
                  const trialExpired = new Date(status.trialEndsAt) < new Date();
                  return (
                    <p className="text-xs mt-2" style={{ color: trialExpired ? "#f87171" : undefined }}>
                      {trialExpired ? (
                        <>Prueba finalizada el{" "}
                          <span style={{ color: "#f87171", fontWeight: 600 }}>
                            {new Date(status.trialEndsAt).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}
                          </span>
                          {" "}— suscríbete para restaurar el acceso.
                        </>
                      ) : (
                        <>La prueba expira el{" "}
                          <span style={{ color: "#888" }}>
                            {new Date(status.trialEndsAt).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}
                          </span>
                          {status.trialDaysLeft <= 3 ? " suscríbete ahora para no perder el acceso." : "."}
                        </>
                      )}
                    </p>
                  );
                })()}
                {(isActive || isCancelling) && (
                  <p className="text-xs mt-1.5" style={{ color: "#555" }}>
                    {status.maxAccounts} cuentas · {status.maxPostsPerMonth === null ? "publicaciones ilimitadas" : `${status.maxPostsPerMonth} publicaciones/mes`}
                  </p>
                )}
              </div>
              {isActive && hasDodoSub && !isCancelling && isOwner && (
                <a href="https://app.dodopayments.com" target="_blank" rel="noreferrer"
                  className="flex-shrink-0 text-xs font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-70"
                  style={{ backgroundColor: "#161616", color: "#999", border: "1px solid #555" }}>
                  Gestionar ↗
                </a>
              )}
            </div>

            {/* Cancelling notice */}
            {(isCancelling || cancelDone) && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl mb-4"
                style={{ backgroundColor: "#1c1209", border: "1px solid #7c2d1230" }}>
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="#fb923c" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs" style={{ color: "#888" }}>
                  Tu suscripción se cancelará al final del período de facturación actual. Mantienes el acceso completo hasta entonces.
                </p>
              </div>
            )}

            {/* Usage bars */}
            <div className="pt-5 space-y-4" style={{ borderTop: "1px solid #2a2a2a" }}>
              <UsageBar
                label="Cuentas conectadas"
                used={status.accountsUsed}
                max={status.maxAccounts}
                color={currentPlanDef?.color ?? "#5b63d3"}
              />
              <UsageBar
                label={`Publicaciones programadas - ${monthName}`}
                used={status.postsThisMonth}
                max={status.maxPostsPerMonth}
                color={currentPlanDef?.color ?? "#5b63d3"}
                warningAt={85}
              />
            </div>

            {/* Cancel link */}
            {isActive && hasDodoSub && !isCancelling && !cancelDone && isOwner && (
              <div className="mt-5 pt-4 flex justify-end" style={{ borderTop: "1px solid #2a2a2a" }}>
                <button onClick={() => setShowCancelModal(true)}
                  className="text-xs underline transition-opacity hover:opacity-70"
                  style={{ color: "#ef4444" }}>
                  Cancelar suscripción
                </button>
              </div>
            )}
          </div>
        )}

        {/* Skeleton */}
        {loading && (
          <div className="rounded-2xl p-6 animate-pulse" style={{ backgroundColor: "#111111", border: "1px solid #2a2a2a" }}>
            <div className="h-3 w-20 rounded mb-3" style={{ backgroundColor: "#2a2a2a" }} />
            <div className="h-7 w-36 rounded mb-2" style={{ backgroundColor: "#2a2a2a" }} />
            <div className="mt-5 pt-5 space-y-3" style={{ borderTop: "1px solid #2a2a2a" }}>
              <div className="h-2 w-full rounded" style={{ backgroundColor: "#2a2a2a" }} />
              <div className="h-2 w-full rounded" style={{ backgroundColor: "#2a2a2a" }} />
            </div>
          </div>
        )}

        {/* Plan cards */}
        <div>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "#ededed" }}>
                {isActive ? "Cambiar de plan" : isTrialing ? "Mejora tu plan" : isCancelling ? "Reactivar suscripción" : "Elige un plan"}
              </h3>
              <p className="text-xs mt-1" style={{ color: "#444" }}>
                {isActive
                  ? "Cambiar de plan los cambios tienen efecto de inmediato"
                  : isCancelling
                  ? "Elige un plan para continuar tu acceso actual se mantiene hasta que termine el período de facturación"
                  : "Suscríbete para mantener el acceso después de que termine tu prueba"}
              </p>
            </div>
            {/* Currency toggle */}
            <div className="flex shrink-0 p-0.5 rounded-lg" style={{ backgroundColor: "#1a1a1a", border: "1px solid #2a2a2a" }}>
              {([{ label: "INR ₹", india: true }, { label: "USD $", india: false }] as const).map(({ label, india }) => (
                <button
                  key={label}
                  onClick={() => setIsIndia(india)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    border: "none",
                    cursor: "pointer",
                    backgroundColor: isIndia === india ? "#ffffff" : "transparent",
                    color: isIndia === india ? "#0a0a0a" : "#666",
                    transition: "all 0.15s",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PLANS.map((plan) => {
              const isCurrent = status?.plan === plan.id && (isActive || isTrialing);
              const planOrder = ["creator", "pro", "team"];
              const currentIdx = planOrder.indexOf(status?.plan ?? "");
              const thisIdx = planOrder.indexOf(plan.id);
              const isUpgrade = thisIdx > currentIdx;
              const changeLabel = isUpgrade ? `Mejorar a ${plan.name}` : `Bajar a ${plan.name}`;

              return (
                <div key={plan.id} className="relative rounded-2xl flex flex-col overflow-hidden"
                  style={{
                    backgroundColor: "#111111",
                    border: isCurrent
                      ? `1px solid ${plan.color}60`
                      : plan.popular
                      ? `1px solid ${plan.color}35`
                      : "1px solid #2a2a2a",
                  }}>

                  {plan.popular && <div className="h-px w-full" style={{ backgroundColor: plan.color }} />}

                  <div className="p-6 flex-1 flex flex-col">
                    <div className="mb-4 h-5 flex items-center gap-2">
                      {plan.popular && (
                        <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${plan.color}18`, color: plan.color, border: `1px solid ${plan.color}35` }}>
                          MÁS POPULAR
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: "#1a1a1a", color: "#555", border: "1px solid #2a2a2a" }}>
                          PLAN ACTUAL
                        </span>
                      )}
                    </div>

                    <p className="font-bold text-base" style={{ color: "#ededed" }}>{plan.name}</p>
                    <p className="text-xs mt-1 mb-4" style={{ color: "#555" }}>{plan.description}</p>

                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-3xl font-bold tracking-tight" style={{ color: "#ededed" }}>{planPrice(plan)}</span>
                      <span className="text-sm">{plan.period}</span>
                    </div>
                    <p className="text-[11px] mb-4">{isIndia ? "facturado en INR" : "facturado en USD"}</p>

                    <div className="flex gap-2 mb-5 flex-wrap">
                      <span className="text-[11px] font-semibold px-2 py-1 rounded-lg"
                        style={{ backgroundColor: plan.color + "15", color: plan.color, border: `1px solid ${plan.color}30` }}>
                        {plan.maxAccounts} cuentas
                      </span>
                      <span className="text-[11px] font-semibold px-2 py-1 rounded-lg"
                        style={{ backgroundColor: plan.color + "15", color: plan.color, border: `1px solid ${plan.color}30` }}>
                        {plan.maxPostsPerMonth === null ? "∞ publicaciones/mes" : `${plan.maxPostsPerMonth} publicaciones/mes`}
                      </span>
                    </div>

                    <ul className="space-y-2.5 flex-1 mb-6">
                      {plan.features.map((f) => (
                        <li key={f.text} className="flex items-start gap-2.5">
                          {f.included ? (
                            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              style={{ color: plan.color }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              style={{ color: "#3a3a3a" }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                          <span className="text-sm leading-snug" style={{ color: f.included ? "#ccc" : "#444" }}>{f.text}</span>
                        </li>
                      ))}
                    </ul>

                    {isCurrent ? (
                      <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
                        style={{ backgroundColor: "#161616", color: "#555", border: "1px solid #222" }}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Plan actual
                      </div>
                    ) : (() => {
                      const cancellingOtherPlan = isCancelling && status?.plan !== plan.id;
                      const btnDisabled = !!checkingOut || !isOwner || cancellingOtherPlan;
                      const btnTitle = !isOwner
                        ? "Solo el propietario del espacio de trabajo puede gestionar la facturación"
                        : cancellingOtherPlan
                        ? "Reactiva tu plan actual primero, luego cambia"
                        : undefined;
                      return (
                        <button onClick={() => !btnDisabled && checkout(plan.id)} disabled={btnDisabled}
                          title={btnTitle}
                          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 active:scale-[0.98]"
                          style={{ backgroundColor: "#ffffff", color: "#0a0a0a" }}>
                          {checkingOut === plan.id
                            ? ((isTrialing || isActive || isCancelling) ? "Cambiando de plan…" : "Abriendo pago…")
                            : (isTrialing || isActive)
                            ? changeLabel
                            : isCancelling
                            ? `Reactivar ${plan.name}`
                            : isCancelled
                            ? `Suscribirse a ${plan.name}`
                            : "Iniciar prueba gratuita"}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-center text-xs">
            {isIndia ? "Precios en Rupias Indias (INR)" : "Precios en Dólares (USD)"} · facturado mensualmente
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-8 pb-4">
          {[
            { path: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", text: "Pago seguro vía Dodo" },
            { path: "M6 18L18 6M6 6l12 12", text: "Cancela cuando quieras" },
          ].map(({ path, text }) => (
            <div key={text} className="flex items-center gap-2 text-xs">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
              </svg>
              {text}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingContent />
    </Suspense>
  );
}
