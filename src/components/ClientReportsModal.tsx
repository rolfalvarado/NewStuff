"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { TareasAPI, type Task, type Severity } from "@/lib/tareas-api";
import type { System } from "@/app/actions/get-systems";

interface Props {
    system: System;
    onClose: () => void;
}

const SEVERITY_LABEL: Record<Severity, string> = {
    low: "Baja",
    medium: "Media",
    high: "Alta",
    critical: "Crítica",
};

const SEVERITY_COLOR: Record<Severity, { bg: string; fg: string; bd: string }> = {
    low: { bg: "rgba(74, 222, 128, 0.15)", fg: "#16a34a", bd: "rgba(74,222,128,0.4)" },
    medium: { bg: "rgba(59, 130, 246, 0.15)", fg: "#2563eb", bd: "rgba(59,130,246,0.4)" },
    high: { bg: "rgba(245, 158, 11, 0.15)", fg: "#b45309", bd: "rgba(245,158,11,0.4)" },
    critical: { bg: "rgba(239, 68, 68, 0.15)", fg: "#b91c1c", bd: "rgba(239,68,68,0.4)" },
};

const STATUS_LABEL: Record<string, string> = {
    pending: "En espera",
    in_progress: "En curso",
    done: "Resuelta",
};

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
    pending: { bg: "rgba(148, 163, 184, 0.18)", fg: "#475569" },
    in_progress: { bg: "rgba(59, 130, 246, 0.15)", fg: "#1d4ed8" },
    done: { bg: "rgba(74, 222, 128, 0.18)", fg: "#15803d" },
};

function fmtDate(ts?: number | null): string {
    if (!ts) return "";
    return new Date(ts).toLocaleString("es-CL", {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

function getDomain(url: string): string {
    try {
        const u = url.startsWith("http") ? url : `https://${url}`;
        return new URL(u).host.toLowerCase();
    } catch {
        return url.toLowerCase();
    }
}

export default function ClientReportsModal({ system, onClose }: Props) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        TareasAPI.listAll()
            .then((data) => {
                if (cancelled) return;
                setTasks(Array.isArray(data) ? data : []);
            })
            .catch((e) => {
                if (cancelled) return;
                setError(e?.message || "No se pudieron cargar los reportes");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Cierre con Escape
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const domain = useMemo(() => getDomain(system.url_sitio || ""), [system.url_sitio]);
    const empresaLower = (system.nombre_empresa || "").toLowerCase();

    const filtered = useMemo(() => {
        return tasks
            .filter((t) => {
                const c = (t.client || "").toLowerCase().trim();
                if (!c) return false;
                if (domain && c.includes(domain)) return true;
                if (empresaLower && empresaLower.length >= 3 && c.includes(empresaLower)) return true;
                return false;
            })
            .sort((a, b) => b.createdAt - a.createdAt);
    }, [tasks, domain, empresaLower]);

    const counts = useMemo(() => {
        const out = { pending: 0, in_progress: 0, done: 0 };
        for (const t of filtered) {
            if (t.status === "pending") out.pending += 1;
            else if (t.status === "in_progress") out.in_progress += 1;
            else if (t.status === "done") out.done += 1;
        }
        return out;
    }, [filtered]);

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.55)",
                backdropFilter: "blur(3px)",
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "1.5rem",
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "var(--bg-card, #FFFFFF)",
                    color: "var(--text-main, #111827)",
                    width: "100%",
                    maxWidth: "880px",
                    maxHeight: "85vh",
                    borderRadius: "16px",
                    boxShadow: "0 25px 50px -12px rgba(0,0,0,0.35)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    border: "1px solid var(--border-color, #e5e7eb)",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: "1rem 1.25rem",
                        borderBottom: "1px solid var(--border-color, #e5e7eb)",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                    }}
                >
                    <Image
                        src="/Icons/stats-report.svg"
                        alt="Reportes"
                        width={22}
                        height={22}
                        style={{ opacity: 0.75 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "1rem", fontWeight: 700, lineHeight: 1.2 }}>
                            Reportes de {system.nombre_empresa || "(sin nombre)"}
                        </div>
                        <div
                            style={{
                                fontSize: "0.75rem",
                                color: "var(--text-secondary, #6b7280)",
                                fontFamily: "'JetBrains Mono', monospace",
                                marginTop: "0.15rem",
                                wordBreak: "break-all",
                            }}
                        >
                            {system.url_sitio}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        title="Cerrar"
                        style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-secondary, #6b7280)",
                            fontSize: "1.4rem",
                            cursor: "pointer",
                            padding: "0 0.5rem",
                            lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Resumen */}
                <div
                    style={{
                        padding: "0.75rem 1.25rem",
                        borderBottom: "1px solid var(--border-color, #e5e7eb)",
                        display: "flex",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                        background: "var(--bg-main, #f9fafb)",
                    }}
                >
                    <SummaryChip label="Total" value={filtered.length} color="#1f2937" />
                    <SummaryChip label="En espera" value={counts.pending} color="#475569" />
                    <SummaryChip label="En curso" value={counts.in_progress} color="#1d4ed8" />
                    <SummaryChip label="Resueltas" value={counts.done} color="#15803d" />
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.25rem" }}>
                    {loading && (
                        <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted, #9ca3af)" }}>
                            Cargando reportes…
                        </div>
                    )}
                    {error && !loading && (
                        <div
                            style={{
                                padding: "1rem",
                                background: "rgba(239, 68, 68, 0.08)",
                                color: "#b91c1c",
                                border: "1px solid rgba(239,68,68,0.25)",
                                borderRadius: 8,
                                fontSize: "0.85rem",
                            }}
                        >
                            {error}
                        </div>
                    )}
                    {!loading && !error && filtered.length === 0 && (
                        <div
                            style={{
                                padding: "2rem",
                                textAlign: "center",
                                color: "var(--text-muted, #9ca3af)",
                                fontSize: "0.9rem",
                            }}
                        >
                            No hay reportes asociados a este cliente.
                        </div>
                    )}
                    {!loading && !error && filtered.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                            {filtered.map((t) => {
                                const sev = SEVERITY_COLOR[t.severity];
                                const st = STATUS_COLOR[t.status] || STATUS_COLOR.pending;
                                return (
                                    <div
                                        key={t.id}
                                        style={{
                                            border: "1px solid var(--border-color, #e5e7eb)",
                                            borderRadius: 10,
                                            padding: "0.75rem 0.9rem",
                                            background: "var(--bg-card, #FFFFFF)",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "0.4rem",
                                        }}
                                    >
                                        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", alignItems: "flex-start" }}>
                                            <div style={{ fontWeight: 600, fontSize: "0.92rem", lineHeight: 1.25, flex: 1 }}>
                                                {t.title || "(sin título)"}
                                            </div>
                                            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                                <span
                                                    style={{
                                                        fontSize: "0.68rem",
                                                        fontWeight: 700,
                                                        padding: "0.15rem 0.55rem",
                                                        borderRadius: 999,
                                                        background: sev.bg,
                                                        color: sev.fg,
                                                        border: `1px solid ${sev.bd}`,
                                                    }}
                                                >
                                                    {SEVERITY_LABEL[t.severity]}
                                                </span>
                                                <span
                                                    style={{
                                                        fontSize: "0.68rem",
                                                        fontWeight: 700,
                                                        padding: "0.15rem 0.55rem",
                                                        borderRadius: 999,
                                                        background: st.bg,
                                                        color: st.fg,
                                                    }}
                                                >
                                                    {STATUS_LABEL[t.status] || t.status}
                                                </span>
                                            </div>
                                        </div>

                                        {t.description && (
                                            <div
                                                style={{
                                                    fontSize: "0.8rem",
                                                    color: "var(--text-secondary, #6b7280)",
                                                    whiteSpace: "pre-wrap",
                                                    overflow: "hidden",
                                                    display: "-webkit-box",
                                                    WebkitLineClamp: 3,
                                                    WebkitBoxOrient: "vertical",
                                                }}
                                            >
                                                {t.description}
                                            </div>
                                        )}

                                        <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap", fontSize: "0.72rem", color: "var(--text-muted, #6b7280)" }}>
                                            <span>📅 {fmtDate(t.createdAt)}</span>
                                            {t.reporter && <span>👤 {t.reporter}</span>}
                                            {t.modules && <span>🧩 {t.modules}</span>}
                                            {t.assignedToName && <span>🛠 {t.assignedToName}</span>}
                                            {t.releaseVersion && <span>🏷 {t.releaseVersion}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: "0.75rem 1.25rem",
                        borderTop: "1px solid var(--border-color, #e5e7eb)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.75rem",
                        background: "var(--bg-main, #f9fafb)",
                    }}
                >
                    <Link
                        href={`/tareas?client=${encodeURIComponent(system.url_sitio || "")}`}
                        style={{
                            fontSize: "0.78rem",
                            color: "var(--primary, #002C3E)",
                            textDecoration: "none",
                            fontWeight: 600,
                        }}
                    >
                        Abrir módulo Tareas →
                    </Link>
                    <button
                        onClick={onClose}
                        style={{
                            background: "var(--primary, #002C3E)",
                            color: "var(--text-on-primary, #F9F9F9)",
                            border: "none",
                            borderRadius: 8,
                            padding: "0.45rem 0.9rem",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

function SummaryChip({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "0.35rem 0.75rem",
                background: "white",
                border: "1px solid var(--border-color, #e5e7eb)",
                borderRadius: 8,
                minWidth: 80,
            }}
        >
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted, #6b7280)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {label}
            </span>
            <span style={{ fontSize: "1.05rem", fontWeight: 700, color }}>{value}</span>
        </div>
    );
}
