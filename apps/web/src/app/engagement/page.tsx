"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../lib/api";
import { PlatformIcon } from "../../components/PlatformIcon";
import { useToast } from "../../components/Toast";

const BG = "#0a0a0a";
const SURFACE = "#111111";
const BORDER = "#2a2a2a";
const TEXT = "#ededed";
const MUTED = "#888888";

interface InstagramAccount {
  id: string;
  platform: string;
  displayName: string;
  avatarUrl: string | null;
}

interface EngagementLog {
  id: string;
  commentId: string;
  commenterUsername: string | null;
  commentText: string;
  publicReplySentAt: string | null;
  dmStatus: "pending" | "sent" | "failed";
  dmError: string | null;
  source: "webhook" | "polling";
  createdAt: string;
}

interface EngagementRule {
  id: string;
  accountId: string;
  account: InstagramAccount;
  name: string;
  keyword: string;
  matchType: "partial" | "whole_word";
  targetMode: "any" | "specific";
  targetMediaId: string | null;
  publicReplyEnabled: boolean;
  publicReplyText: string | null;
  dmText: string;
  enabled: boolean;
  createdAt: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%", backgroundColor: BG, border: `1px solid ${BORDER}`,
  borderRadius: 10, padding: "8px 12px", fontSize: 13, color: TEXT, outline: "none",
};
const labelStyle: React.CSSProperties = { color: "#aaa" };

function emptyForm() {
  return {
    accountId: "",
    name: "",
    keyword: "",
    matchType: "partial" as "partial" | "whole_word",
    targetMode: "any" as "any" | "specific",
    targetMediaId: "",
    publicReplyEnabled: true,
    publicReplyText: "",
    dmText: "",
    enabled: true,
  };
}

export default function EngagementPage() {
  const { toast } = useToast();

  const [rules, setRules] = useState<EngagementRule[]>([]);
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logsByRule, setLogsByRule] = useState<Record<string, EngagementLog[]>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, accountsRes] = await Promise.all([
        apiFetch<{ rules: EngagementRule[] }>("/engagement/rules"),
        apiFetch<{ accounts: InstagramAccount[] }>("/accounts"),
      ]);
      setRules(rulesRes.rules ?? []);
      setAccounts((accountsRes.accounts ?? []).filter((a) => a.platform === "instagram"));
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudieron cargar las reglas", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setShowModal(true);
  }

  function openEdit(rule: EngagementRule) {
    setEditingId(rule.id);
    setForm({
      accountId: rule.accountId,
      name: rule.name,
      keyword: rule.keyword,
      matchType: rule.matchType,
      targetMode: rule.targetMode,
      targetMediaId: rule.targetMediaId ?? "",
      publicReplyEnabled: rule.publicReplyEnabled,
      publicReplyText: rule.publicReplyText ?? "",
      dmText: rule.dmText,
      enabled: rule.enabled,
    });
    setShowModal(true);
  }

  async function saveRule(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...form,
        targetMediaId: form.targetMode === "specific" ? form.targetMediaId.trim() : undefined,
        publicReplyText: form.publicReplyEnabled ? form.publicReplyText : undefined,
      };
      if (editingId) {
        await apiFetch(`/engagement/rules/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
        toast("Regla actualizada", "success");
      } else {
        await apiFetch("/engagement/rules", { method: "POST", body: JSON.stringify(body) });
        toast("Regla creada", "success");
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo guardar la regla", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(rule: EngagementRule) {
    try {
      await apiFetch(`/engagement/rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo actualizar", "error");
    }
  }

  async function deleteRule(id: string) {
    setDeletingId(id);
    try {
      await apiFetch(`/engagement/rules/${id}`, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast("Regla eliminada", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo eliminar", "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleLogs(rule: EngagementRule) {
    if (expandedId === rule.id) { setExpandedId(null); return; }
    setExpandedId(rule.id);
    if (!logsByRule[rule.id]) {
      try {
        const res = await apiFetch<{ logs: EngagementLog[] }>(`/engagement/rules/${rule.id}/logs`);
        setLogsByRule((prev) => ({ ...prev, [rule.id]: res.logs ?? [] }));
      } catch {
        setLogsByRule((prev) => ({ ...prev, [rule.id]: [] }));
      }
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="pl-16 pr-4 md:px-8 flex-shrink-0 flex items-center justify-between" style={{ height: 65, borderBottom: `1px solid ${BORDER}` }}>
        <div className="min-w-0">
          <h1 className="text-lg font-bold" style={{ color: TEXT }}>Auto-respuestas</h1>
          <p className="text-xs mt-0.5 hidden sm:block" style={{ color: MUTED }}>
            Responde comentarios de Instagram con una palabra clave: respuesta pública + mensaje privado automático
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{ backgroundColor: "#ffffff", color: "#0a0a0a", border: "none", borderRadius: 9, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          Crear regla
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-4">
        {loading ? (
          <p className="text-sm" style={{ color: MUTED }}>Cargando…</p>
        ) : rules.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
            <p className="text-sm" style={{ color: MUTED }}>
              Todavía no creaste ninguna regla de auto-respuesta.
              {accounts.length === 0 && (
                <> Necesitás una cuenta de Instagram conectada — andá a <a href="/accounts" style={{ color: "#5b63d3" }}>Cuentas</a>.</>
              )}
            </p>
          </div>
        ) : (
          rules.map((rule) => (
            <div key={rule.id} className="rounded-2xl overflow-hidden" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-3 px-5 py-4">
                <PlatformIcon platform="instagram" size={20} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: TEXT }}>{rule.name}</p>
                  <p className="text-xs" style={{ color: MUTED }}>
                    {rule.account.displayName} · palabra clave &quot;{rule.keyword}&quot; ({rule.matchType === "whole_word" ? "palabra completa" : "coincidencia parcial"})
                    {" · "}{rule.targetMode === "any" ? "cualquier post" : `post específico`}
                  </p>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={rule.enabled
                    ? { backgroundColor: "#052e16", color: "#4ade80", border: "1px solid #14532d" }
                    : { backgroundColor: "#1c1008", color: "#fb923c", border: "1px solid #7c2d12" }}>
                  {rule.enabled ? "Activa" : "Pausada"}
                </span>
                <button onClick={() => toggleLogs(rule)}
                  style={{ fontSize: 12, color: MUTED, background: "none", border: "none", cursor: "pointer" }}>
                  {expandedId === rule.id ? "Ocultar actividad" : "Ver actividad"}
                </button>
                <button onClick={() => toggleEnabled(rule)}
                  style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, backgroundColor: "#1a1a1a", color: TEXT, cursor: "pointer" }}>
                  {rule.enabled ? "Pausar" : "Activar"}
                </button>
                <button onClick={() => openEdit(rule)}
                  style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, backgroundColor: "#1a1a1a", color: TEXT, cursor: "pointer" }}>
                  Editar
                </button>
                <button onClick={() => deleteRule(rule.id)} disabled={deletingId === rule.id}
                  style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, border: "1px solid #7c2d12", backgroundColor: "#1c1008", color: "#fb923c", cursor: "pointer" }}>
                  {deletingId === rule.id ? "…" : "Eliminar"}
                </button>
              </div>

              {expandedId === rule.id && (
                <div className="px-5 pb-4 space-y-2" style={{ borderTop: `1px solid ${BORDER}` }}>
                  <p className="text-xs pt-3" style={{ color: MUTED }}>Últimos comentarios detectados</p>
                  {(logsByRule[rule.id]?.length ?? 0) === 0 ? (
                    <p className="text-xs" style={{ color: MUTED }}>Sin actividad todavía.</p>
                  ) : (
                    logsByRule[rule.id].map((log) => (
                      <div key={log.id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate" style={{ color: TEXT }}>
                            {log.commenterUsername ? `@${log.commenterUsername}: ` : ""}{log.commentText}
                          </p>
                          <p className="text-[11px]" style={{ color: MUTED }}>
                            {new Date(log.createdAt).toLocaleString()} · {log.source === "polling" ? "detectado por barrido" : "webhook"}
                          </p>
                        </div>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={
                            log.dmStatus === "sent" ? { backgroundColor: "#052e16", color: "#4ade80", border: "1px solid #14532d" }
                            : log.dmStatus === "failed" ? { backgroundColor: "#1c1008", color: "#fb923c", border: "1px solid #7c2d12" }
                            : { backgroundColor: "#1a1a1a", color: MUTED, border: `1px solid ${BORDER}` }
                          }>
                          {log.dmStatus === "sent" ? "DM enviado" : log.dmStatus === "failed" ? "DM falló" : "Pendiente"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create/edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop">
          <div className="w-full max-w-md rounded-2xl p-6 modal-panel overflow-y-auto" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, maxHeight: "90vh" }}>
            <h2 className="text-base font-bold mb-1" style={{ color: TEXT }}>{editingId ? "Editar regla" : "Crear regla"}</h2>
            <p className="text-xs mb-5" style={{ color: MUTED }}>
              Cuando alguien comente con esta palabra clave, se le responde en público (opcional) y se le envía un mensaje privado.
            </p>
            <form onSubmit={saveRule} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Cuenta de Instagram</label>
                <select required value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))} style={inputStyle}>
                  <option value="">Elegí una cuenta…</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Nombre de la regla</label>
                <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Precio en comentarios" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Palabra clave</label>
                <input required value={form.keyword} onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
                  placeholder="Ej: precio" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Tipo de coincidencia</label>
                <select value={form.matchType} onChange={(e) => setForm((f) => ({ ...f, matchType: e.target.value as "partial" | "whole_word" }))} style={inputStyle}>
                  <option value="partial">Parcial (aparece en cualquier parte del comentario)</option>
                  <option value="whole_word">Palabra completa</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Aplicar a</label>
                <select value={form.targetMode} onChange={(e) => setForm((f) => ({ ...f, targetMode: e.target.value as "any" | "specific" }))} style={inputStyle}>
                  <option value="any">Cualquier post reciente</option>
                  <option value="specific">Un post específico</option>
                </select>
              </div>
              {form.targetMode === "specific" && (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={labelStyle}>ID del post de Instagram</label>
                  <input required value={form.targetMediaId} onChange={(e) => setForm((f) => ({ ...f, targetMediaId: e.target.value }))}
                    placeholder="Ej: 17912345678901234" style={inputStyle} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="publicReplyEnabled" checked={form.publicReplyEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, publicReplyEnabled: e.target.checked }))} />
                <label htmlFor="publicReplyEnabled" className="text-xs font-medium" style={labelStyle}>Responder también en público, debajo del comentario</label>
              </div>
              {form.publicReplyEnabled && (
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Respuesta pública</label>
                  <textarea required rows={2} value={form.publicReplyText} onChange={(e) => setForm((f) => ({ ...f, publicReplyText: e.target.value }))}
                    placeholder="Ej: ¡Te escribimos por privado! 📩" style={{ ...inputStyle, resize: "vertical" as const }} />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Mensaje privado (DM)</label>
                <textarea required rows={3} value={form.dmText} onChange={(e) => setForm((f) => ({ ...f, dmText: e.target.value }))}
                  placeholder="Ej: ¡Hola! Acá tenés toda la info sobre precios: desagendado.com/precios" style={{ ...inputStyle, resize: "vertical" as const }} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="enabled" checked={form.enabled}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
                <label htmlFor="enabled" className="text-xs font-medium" style={labelStyle}>Regla activa</label>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  style={{ flex: 1, padding: "8px", borderRadius: 10, fontSize: 13, fontWeight: 600, backgroundColor: "#1a1a1a", color: TEXT, border: `1px solid ${BORDER}`, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, padding: "8px", borderRadius: 10, fontSize: 13, fontWeight: 600, backgroundColor: "#ffffff", color: "#0a0a0a", border: "none", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}>
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
