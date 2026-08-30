"use client";

import { useState } from "react";
import { DateTimePicker } from "./DateTimePicker";

interface Props {
  baseScheduledFor: string; // "YYYY-MM-DDTHH:mm", local
  initialExtra: string[]; // previously configured extra dates, local format
  onClose: () => void;
  onApply: (extra: string[]) => void;
}

type Frequency = "daily" | "weekly" | "monthly";
type EndType = "count" | "until";

const WEEKDAYS = [
  { value: 1, label: "L" },
  { value: 2, label: "M" },
  { value: 3, label: "X" },
  { value: 4, label: "J" },
  { value: 5, label: "V" },
  { value: 6, label: "S" },
  { value: 0, label: "D" },
];

const MAX_OCCURRENCES = 100;

function pad(n: number) { return String(n).padStart(2, "0"); }

function parseLocal(v: string): Date {
  const [date, time] = v.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, m] = (time ?? "09:00").split(":").map(Number);
  return new Date(y, mo - 1, d, h, m);
}

function toLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfWeek(d: Date): Date {
  // Monday-anchored week
  const day = (d.getDay() + 6) % 7;
  const s = new Date(d);
  s.setDate(d.getDate() - day);
  s.setHours(0, 0, 0, 0);
  return s;
}

export interface RecurrenceRule {
  frequency: Frequency;
  interval: number;
  daysOfWeek: number[]; // only used for weekly
  endType: EndType;
  endCount: number;
  endUntil: string; // "YYYY-MM-DD"
}

export function expandRecurrence(base: Date, rule: RecurrenceRule): Date[] {
  const extra: Date[] = [];
  const interval = Math.max(1, rule.interval || 1);
  const untilDate = rule.endType === "until" && rule.endUntil ? new Date(`${rule.endUntil}T23:59:59`) : null;
  const maxCount = rule.endType === "count" ? Math.min(Math.max(1, rule.endCount || 1), MAX_OCCURRENCES) - 1 : MAX_OCCURRENCES - 1;

  if (rule.frequency === "daily") {
    for (let i = 1; extra.length < maxCount; i++) {
      const next = new Date(base);
      next.setDate(base.getDate() + i * interval);
      if (untilDate && next > untilDate) break;
      extra.push(next);
    }
  } else if (rule.frequency === "weekly") {
    const days = rule.daysOfWeek.length ? rule.daysOfWeek : [base.getDay()];
    const baseWeekStart = startOfWeek(base);
    for (let dayOffset = 1; extra.length < maxCount && dayOffset < 7 * interval * MAX_OCCURRENCES; dayOffset++) {
      const candidate = new Date(base);
      candidate.setDate(base.getDate() + dayOffset);
      if (!days.includes(candidate.getDay())) continue;
      const candidateWeekStart = startOfWeek(candidate);
      const weeksSince = Math.round((candidateWeekStart.getTime() - baseWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weeksSince % interval !== 0) continue;
      const next = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate(), base.getHours(), base.getMinutes());
      if (untilDate && next > untilDate) break;
      extra.push(next);
    }
  } else {
    for (let i = 1; extra.length < maxCount; i++) {
      const next = new Date(base.getFullYear(), base.getMonth() + i * interval, base.getDate(), base.getHours(), base.getMinutes());
      if (untilDate && next > untilDate) break;
      extra.push(next);
    }
  }

  return extra.slice(0, MAX_OCCURRENCES - 1);
}

export function RepeatScheduleModal({ baseScheduledFor, initialExtra, onClose, onApply }: Props) {
  const [mode, setMode] = useState<"dates" | "recurring">("dates");
  const [dates, setDates] = useState<string[]>(initialExtra.length ? initialExtra : []);
  const [rule, setRule] = useState<RecurrenceRule>({
    frequency: "weekly",
    interval: 1,
    daysOfWeek: [],
    endType: "count",
    endCount: 4,
    endUntil: "",
  });

  const base = parseLocal(baseScheduledFor);

  function addDateRow() {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    setDates((prev) => [...prev, toLocal(d)]);
  }

  function removeDateRow(i: number) {
    setDates((prev) => prev.filter((_, idx) => idx !== i));
  }

  function toggleWeekday(v: number) {
    setRule((r) => ({
      ...r,
      daysOfWeek: r.daysOfWeek.includes(v) ? r.daysOfWeek.filter((d) => d !== v) : [...r.daysOfWeek, v],
    }));
  }

  const recurringPreview = mode === "recurring" ? expandRecurrence(base, rule) : [];

  function handleApply() {
    if (mode === "dates") {
      const clean = dates.filter(Boolean).filter((d) => toLocal(parseLocal(d)) !== toLocal(base));
      onApply(clean);
    } else {
      onApply(recurringPreview.map(toLocal));
    }
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#1a1a1a", borderColor: "#3a3a3a", color: "#ededed",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ backgroundColor: "#111111", border: "1px solid #2a2a2a", maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid #2a2a2a" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "#ededed" }}>Repetir publicación</h2>
            <p className="text-xs mt-0.5" style={{ color: "#888" }}>Publica el mismo contenido en varias fechas y horas</p>
          </div>
          <button onClick={onClose} className="text-lg leading-none hover:opacity-60 transition-opacity" style={{ color: "#888" }}>✕</button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 px-6 pt-4">
          {(["dates", "recurring"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors"
              style={mode === m
                ? { backgroundColor: "#5b63d3", color: "#fff" }
                : { backgroundColor: "#1a1a1a", color: "#888", border: "1px solid #2a2a2a" }}>
              {m === "dates" ? "Fechas específicas" : "Recurrente"}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-3">
          {mode === "dates" ? (
            <>
              <p className="text-xs" style={{ color: "#888" }}>
                La fecha principal ({base.toLocaleDateString([], { month: "short", day: "numeric" })} · {pad(base.getHours())}:{pad(base.getMinutes())}) ya está programada. Agrega fechas adicionales para publicar el mismo contenido también en esos momentos.
              </p>
              <div className="space-y-2">
                {dates.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <DateTimePicker value={d} onChange={(v) => setDates((prev) => prev.map((p, idx) => idx === i ? v : p))} dropdownDirection="down" />
                    <button type="button" onClick={() => removeDateRow(i)}
                      className="text-xs px-2 py-1 rounded-lg transition hover:bg-white/10"
                      style={{ color: "#f87171", border: "1px solid #7f1d1d" }}>
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addDateRow}
                className="text-xs px-3 py-2 rounded-xl transition hover:opacity-80"
                style={{ backgroundColor: "#1a1a1a", color: "#818cf8", border: "1px solid #3730a3" }}>
                + Agregar fecha
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold" style={{ color: "#888" }}>Cada</label>
                <input type="number" min={1} value={rule.interval}
                  onChange={(e) => setRule((r) => ({ ...r, interval: Number(e.target.value) }))}
                  className="w-16 rounded-lg border px-2 py-1.5 text-sm focus:outline-none"
                  style={inputStyle} />
                <select value={rule.frequency}
                  onChange={(e) => setRule((r) => ({ ...r, frequency: e.target.value as Frequency }))}
                  className="rounded-lg border px-2 py-1.5 text-sm focus:outline-none"
                  style={inputStyle}>
                  <option value="daily">día(s)</option>
                  <option value="weekly">semana(s)</option>
                  <option value="monthly">mes(es)</option>
                </select>
              </div>

              {rule.frequency === "weekly" && (
                <div>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: "#888" }}>Repetir en</p>
                  <div className="flex gap-1.5">
                    {WEEKDAYS.map((wd) => (
                      <button key={wd.value} type="button" onClick={() => toggleWeekday(wd.value)}
                        className="w-8 h-8 rounded-lg text-xs font-semibold transition"
                        style={rule.daysOfWeek.includes(wd.value)
                          ? { backgroundColor: "#5b63d3", color: "#fff" }
                          : { backgroundColor: "#1a1a1a", color: "#888", border: "1px solid #2a2a2a" }}>
                        {wd.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "#888" }}>Termina</p>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-xs" style={{ color: "#ccc" }}>
                    <input type="radio" checked={rule.endType === "count"} onChange={() => setRule((r) => ({ ...r, endType: "count" }))} />
                    Después de
                    <input type="number" min={1} max={MAX_OCCURRENCES} disabled={rule.endType !== "count"}
                      value={rule.endCount}
                      onChange={(e) => setRule((r) => ({ ...r, endCount: Number(e.target.value) }))}
                      className="w-16 rounded-lg border px-2 py-1 text-xs focus:outline-none disabled:opacity-40"
                      style={inputStyle} />
                    publicaciones
                  </label>
                  <label className="flex items-center gap-2 text-xs" style={{ color: "#ccc" }}>
                    <input type="radio" checked={rule.endType === "until"} onChange={() => setRule((r) => ({ ...r, endType: "until" }))} />
                    Hasta el
                    <input type="date" disabled={rule.endType !== "until"}
                      value={rule.endUntil}
                      onChange={(e) => setRule((r) => ({ ...r, endUntil: e.target.value }))}
                      className="rounded-lg border px-2 py-1 text-xs focus:outline-none disabled:opacity-40"
                      style={inputStyle} />
                  </label>
                </div>
              </div>

              <p className="text-xs" style={{ color: "#666" }}>
                Se generarán {recurringPreview.length} publicación{recurringPreview.length !== 1 ? "es" : ""} adicional{recurringPreview.length !== 1 ? "es" : ""} (más la fecha principal ya programada) — máximo {MAX_OCCURRENCES} en total.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderTop: "1px solid #2a2a2a" }}>
          <button onClick={onClose} className="text-sm font-medium hover:opacity-70 transition-opacity" style={{ color: "#888" }}>
            Cancelar
          </button>
          <button onClick={handleApply}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-gray-100"
            style={{ backgroundColor: "#ffffff", color: "#0a0a0a" }}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
