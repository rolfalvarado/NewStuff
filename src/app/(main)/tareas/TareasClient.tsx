"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import styles from "./tareas.module.css";
import {
    TareasAPI,
    getWeekKey,
    weekBounds,
    elapsedMs,
    remainingMs,
    progressPct,
    resolveAttachmentUrl,
    ATTACHMENTS,
    type Task,
    type TaskCategory,
    type Severity,
    type TareasIdentity,
    type PublishedVersion,
    type Attachment,
    type Subtask,
} from "@/lib/tareas-api";

// ---- Helpers de adjuntos ----
function fmtBytes(b: number): string {
    if (!b && b !== 0) return "";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / (1024 * 1024)).toFixed(1) + " MB";
}
function fmtSeconds(s: number): string {
    const t = Math.max(0, Math.round(s));
    const m = Math.floor(t / 60);
    const ss = t % 60;
    return `${m}:${String(ss).padStart(2, "0")}`;
}
function fileKind(mime: string): "image" | "video" | "pdf" | "other" {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime === "application/pdf") return "pdf";
    return "other";
}
function getVideoDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve(isFinite(v.duration) ? v.duration : 0);
        };
        v.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("No se pudo leer el video"));
        };
        v.src = url;
    });
}

interface PendingFile {
    id: string;
    file: File;
    kind: "image" | "video" | "pdf" | "other";
    previewUrl?: string;
    durationSeconds?: number;
    error?: string;
}

type View = "stack" | "release" | "archive";

interface Props {
    identity: TareasIdentity;
}

// =================== Helpers ===================
function initials(name: string): string {
    return name
        .replace(/\(.*?\)/g, "")
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

function fmtAgo(ts?: number | null): string {
    if (!ts) return "";
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "recién";
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.floor(h / 24)} d`;
}

function fmtDate(ts?: number | null): string {
    if (!ts) return "";
    return new Date(ts).toLocaleString("es-CL", {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

function fmtMs(ms: number): string {
    const total = Math.max(0, Math.floor(Math.abs(ms) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const SEVERITY_LABEL: Record<Severity, string> = {
    low: "Baja",
    medium: "Media",
    high: "Alta",
    critical: "Crítica",
};

const STATUS_LABEL: Record<string, string> = {
    pending: "En espera",
    in_progress: "En curso",
    done: "Resuelta",
};

// =================== LiveTimer ===================
function LiveTimer({ task, compact, tick }: { task: Task; compact?: boolean; tick: number }) {
    const elapsed = elapsedMs(task, tick);
    const remaining = remainingMs(task, tick);
    const pct = progressPct(task, tick);
    const overdue = remaining < 0;
    const displayMs = overdue ? -remaining : remaining;

    const ringColor = overdue
        ? "#ef4444"
        : pct > 75
            ? "#f59e0b"
            : task.assignedColor || "#22c55e";

    const R = 14;
    const C = 2 * Math.PI * R;
    const dashOffset = C * (1 - Math.min(1, pct / 100));

    if (compact) {
        return (
            <div className={styles.timer}>
                <div className={styles.timerCircle}>
                    <svg viewBox="0 0 36 36" className={styles.timerSvg}>
                        <circle cx="18" cy="18" r={R} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3" />
                        <circle
                            cx="18"
                            cy="18"
                            r={R}
                            fill="none"
                            stroke={ringColor}
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={C}
                            strokeDashoffset={dashOffset}
                            style={{ transition: "stroke-dashoffset 500ms" }}
                        />
                    </svg>
                </div>
                <div className={styles.timerText}>
                    <div className={`${styles.timerValue} ${overdue ? styles.timerValueOverdue : ""}`}>
                        {fmtMs(displayMs)}
                    </div>
                    <div className={styles.timerLabel}>{overdue ? "Excedido" : "Restante"}</div>
                </div>
            </div>
        );
    }

    const Rl = 28;
    const Cl = 2 * Math.PI * Rl;
    const dashOffsetLg = Cl * (1 - Math.min(1, pct / 100));
    return (
        <div className={styles.timer}>
            <div className={styles.timerCircleLg}>
                <svg viewBox="0 0 64 64" className={styles.timerSvg}>
                    <circle cx="32" cy="32" r={Rl} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="5" />
                    <circle
                        cx="32"
                        cy="32"
                        r={Rl}
                        fill="none"
                        stroke={ringColor}
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={Cl}
                        strokeDashoffset={dashOffsetLg}
                        style={{ transition: "stroke-dashoffset 500ms" }}
                    />
                </svg>
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        color: overdue ? "#ef4444" : "var(--text-main)",
                    }}
                >
                    {Math.round(pct)}%
                </div>
            </div>
            <div className={styles.timerText}>
                <div className={styles.timerLabel}>{overdue ? "Excedido" : "Restante"}</div>
                <div
                    style={{
                        fontSize: "1.5rem",
                        fontWeight: 700,
                        color: overdue ? "#ef4444" : "var(--text-main)",
                    }}
                >
                    {fmtMs(displayMs)}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    Transcurrido {fmtMs(elapsed)} / Asignado {task.estimateMinutes} min
                </div>
            </div>
        </div>
    );
}

// =================== Severity chip styles ===================
function severityChipStyle(sev: Severity): React.CSSProperties {
    switch (sev) {
        case "low":
            return { background: "#f1f5f9", color: "#475569", borderColor: "#cbd5e1" };
        case "medium":
            return {
                background: "rgba(30, 136, 229, 0.1)",
                color: "#1565c0",
                borderColor: "rgba(30, 136, 229, 0.3)",
            };
        case "high":
            return {
                background: "rgba(245, 158, 11, 0.12)",
                color: "#c2410c",
                borderColor: "rgba(245, 158, 11, 0.4)",
            };
        case "critical":
            return {
                background: "rgba(239, 68, 68, 0.12)",
                color: "#b91c1c",
                borderColor: "rgba(239, 68, 68, 0.4)",
            };
    }
}

// =================== TaskCard ===================
function TaskCard({
    task,
    priority,
    featured,
    mode,
    tick,
    onOpen,
    onAssign,
    onPause,
    onResume,
    onComplete,
    onDelete,
}: {
    task: Task;
    priority: number;
    featured?: boolean;
    mode: "support" | "dev";
    tick: number;
    onOpen: (t: Task) => void;
    onAssign?: (t: Task) => void;
    onPause?: (t: Task) => void;
    onResume?: (t: Task) => void;
    onComplete?: (t: Task) => void;
    onDelete?: (t: Task) => void;
}) {
    const isInProgress = task.status === "in_progress";
    const isDone = task.status === "done";
    const isPaused = !!task.pausedAt;

    const cardClasses = [
        styles.taskCard,
        featured ? styles.taskCardFeatured : "",
        isInProgress ? styles.taskCardInProgress : "",
        isDone ? styles.taskCardDone : "",
    ]
        .filter(Boolean)
        .join(" ");

    const priClasses = [
        styles.priorityBox,
        featured ? styles.priorityBoxFeatured : "",
        priority === 1 && !isDone ? styles.priorityBoxFirst : "",
        priority === 2 && !isDone ? styles.priorityBoxSecond : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <article className={cardClasses}>
            <div className={styles.priorityCol}>
                <div className={priClasses}>{priority}</div>
                {task.category === "project" && <span className={styles.projectChip}>PROYECTO</span>}
            </div>

            <div className={styles.taskBody}>
                <div className={styles.taskRow}>
                    <h3
                        className={`${styles.taskTitle} ${featured ? styles.taskTitleFeatured : ""}`}
                        onClick={() => onOpen(task)}
                    >
                        {task.title}
                    </h3>
                    <span className={styles.severityChip} style={severityChipStyle(task.severity)}>
                        <span className={styles.dot}></span>
                        {SEVERITY_LABEL[task.severity]}
                    </span>
                </div>

                {featured && task.description && <p className={styles.taskDesc}>{task.description}</p>}

                <div className={styles.metaRow}>
                    <span className={styles.metaItem}>📍 <strong>{task.client}</strong></span>
                    {task.modules && <span className={styles.metaItem}>🧩 {task.modules}</span>}
                    <span className={styles.metaItem}>👤 {task.reporter}</span>
                    {task.subtasks && task.subtasks.length > 0 && (() => {
                        const total = task.subtasks.length;
                        const done = task.subtasks.filter((s) => s.done).length;
                        const allDone = done === total;
                        return (
                            <span
                                className={`${styles.subtaskBadge} ${allDone ? styles.subtaskBadgeDone : ""}`}
                                title={`${done} de ${total} pasos completados`}
                            >
                                {allDone ? "✓" : "✦"} {done}/{total}
                            </span>
                        );
                    })()}
                </div>

                <div className={styles.actionsRow}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}>
                        {isInProgress && <LiveTimer task={task} compact tick={tick} />}
                        {isInProgress && task.assignedToName && (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0 }}>
                                <span
                                    className={styles.userInitials}
                                    style={{ background: task.assignedColor || "#1E88E5" }}
                                >
                                    {initials(task.assignedToName)}
                                </span>
                                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                                    {task.assignedToName}
                                </span>
                            </div>
                        )}
                        {!isInProgress && (
                            <span
                                className={`${styles.statusChip} ${
                                    isDone ? styles.statusDone : styles.statusPending
                                }`}
                            >
                                {STATUS_LABEL[task.status]}
                            </span>
                        )}
                    </div>

                    <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
                        {mode === "dev" && task.status === "pending" && (
                            <button
                                className={`${styles.smallBtn} ${styles.smallBtnPrimary}`}
                                onClick={() => onAssign?.(task)}
                            >
                                Tomar
                            </button>
                        )}
                        {mode === "dev" && isInProgress && !isPaused && (
                            <button className={styles.smallBtn} onClick={() => onPause?.(task)} title="Pausar">
                                ⏸
                            </button>
                        )}
                        {mode === "dev" && isInProgress && isPaused && (
                            <button className={styles.smallBtn} onClick={() => onResume?.(task)} title="Reanudar">
                                ▶
                            </button>
                        )}
                        {mode === "dev" && isInProgress && (
                            <button
                                className={`${styles.smallBtn} ${styles.smallBtnSuccess}`}
                                onClick={() => onComplete?.(task)}
                            >
                                Resolver
                            </button>
                        )}
                        <button className={styles.iconBtn} onClick={() => onOpen(task)} title="Ver detalle">
                            👁
                        </button>
                        {mode === "support" && task.status === "pending" && (
                            <button
                                className={`${styles.smallBtn} ${styles.smallBtnDanger}`}
                                onClick={() => onDelete?.(task)}
                                title="Eliminar"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}

// =================== Modal genérico ===================
function ModalShell({
    open,
    onClose,
    children,
    title,
    size = "lg",
}: {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
    size?: "sm" | "md" | "lg";
}) {
    if (!open) return null;
    const cls = `${styles.modalContent} ${size === "sm" ? styles.modalSm : ""} ${
        size === "md" ? styles.modalMd : ""
    }`;
    return (
        <div className={styles.modalBackdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={cls} role="dialog" aria-modal="true">
                <div className={styles.modalHeader}>
                    {title && <h2 className={styles.modalTitle}>{title}</h2>}
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
                        ✕
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

// =================== Lightbox para preview ===================
function Lightbox({ att, onClose }: { att: Attachment | null; onClose: () => void }) {
    if (!att) return null;
    const url = resolveAttachmentUrl(att);
    return (
        <div className={styles.lightboxBackdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={styles.lightboxContent}>
                {att.kind === "image" && <img src={url} alt={att.name} />}
                {att.kind === "video" && <video src={url} controls autoPlay />}
                {att.kind === "pdf" && (
                    <iframe
                        src={url}
                        style={{ width: "90vw", height: "85vh", border: "none", background: "white" }}
                        title={att.name}
                    />
                )}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={att.name}
                        className={styles.lightboxClose}
                        style={{ textDecoration: "none" }}
                    >
                        ⬇ Descargar
                    </a>
                    <button className={styles.lightboxClose} onClick={onClose}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

// =================== Detail modal ===================
function TaskDetailModal({
    task,
    onClose,
    tick,
    isDev,
    identityName,
    onChangeCategory,
    onAdjustTime,
    onSaveDevNotes,
    onAddSubtask,
    onToggleSubtask,
    onEditSubtask,
    onRemoveSubtask,
}: {
    task: Task | null;
    onClose: () => void;
    tick: number;
    isDev: boolean;
    identityName: string;
    onChangeCategory: (t: Task) => void;
    onAdjustTime: (t: Task, newMinutes: number) => void;
    onSaveDevNotes: (t: Task, notes: string) => void;
    onAddSubtask: (t: Task, title: string) => void;
    onToggleSubtask: (t: Task, sub: Subtask) => void;
    onEditSubtask: (t: Task, sub: Subtask, newTitle: string) => void;
    onRemoveSubtask: (t: Task, sub: Subtask) => void;
}) {
    const [preview, setPreview] = useState<Attachment | null>(null);
    const [adjustValue, setAdjustValue] = useState<number>(0);
    const [notesDraft, setNotesDraft] = useState<string>("");
    const [newSubtask, setNewSubtask] = useState<string>("");
    const [editingSubId, setEditingSubId] = useState<string | null>(null);
    const [editingSubText, setEditingSubText] = useState<string>("");

    useEffect(() => {
        if (task) {
            setAdjustValue(task.estimateMinutes || 0);
            setNotesDraft(task.devNotes || "");
            setNewSubtask("");
            setEditingSubId(null);
        }
    }, [task?.id, task?.estimateMinutes, task?.devNotes]);

    if (!task) return null;
    const attachments = task.attachments || [];
    const subtasks = (task.subtasks || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const subDone = subtasks.filter((s) => s.done).length;
    const subPct = subtasks.length ? (subDone / subtasks.length) * 100 : 0;

    const showTimeEditor =
        isDev &&
        (task.status === "in_progress" || task.status === "pending") &&
        !!task.estimateMinutes;

    const showDevTools = isDev && task.status !== "done";

    const adjust = (deltaMin: number) => {
        const next = Math.max(1, (task.estimateMinutes || 0) + deltaMin);
        onAdjustTime(task, next);
    };

    const submitNewSubtask = () => {
        const title = newSubtask.trim();
        if (!title) return;
        onAddSubtask(task, title);
        setNewSubtask("");
    };

    const commitEditSubtask = (sub: Subtask) => {
        const t = editingSubText.trim();
        if (!t || t === sub.title) {
            setEditingSubId(null);
            return;
        }
        onEditSubtask(task, sub, t);
        setEditingSubId(null);
    };
    return (
        <ModalShell open={!!task} onClose={onClose} title={task.title}>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
                <span
                    className={styles.severityChip}
                    style={
                        task.category === "project"
                            ? {
                                  background: "rgba(139, 92, 246, 0.12)",
                                  color: "#6d28d9",
                                  borderColor: "rgba(139, 92, 246, 0.3)",
                              }
                            : {
                                  background: "rgba(30, 136, 229, 0.1)",
                                  color: "#1565c0",
                                  borderColor: "rgba(30, 136, 229, 0.3)",
                              }
                    }
                >
                    {task.category === "project" ? "Desarrollo · largo" : "Día a día"}
                </span>
                <span className={styles.severityChip} style={severityChipStyle(task.severity)}>
                    Severidad: {SEVERITY_LABEL[task.severity]}
                </span>
                <span
                    className={`${styles.statusChip} ${
                        task.status === "done"
                            ? styles.statusDone
                            : task.status === "in_progress"
                                ? styles.statusInProgress
                                : styles.statusPending
                    }`}
                >
                    {STATUS_LABEL[task.status]}
                </span>
                {isDev && task.status !== "done" && (
                    <button
                        type="button"
                        className={styles.smallBtn}
                        onClick={() => onChangeCategory(task)}
                        title="Reclasificar la tarea"
                        style={{ marginLeft: "auto" }}
                    >
                        {task.category === "project"
                            ? "↩ Mover a día a día"
                            : "🛠 Convertir en proyecto"}
                    </button>
                )}
            </div>

            <p style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap", marginBottom: "1rem" }}>
                {task.description || "—"}
            </p>

            {task.status === "in_progress" && task.estimateMinutes && (
                <div className={styles.detailField}>
                    <LiveTimer task={task} tick={tick} />
                </div>
            )}

            {showTimeEditor && (
                <div className={styles.detailField} style={{ marginBottom: "0.6rem" }}>
                    <div className={styles.label}>Ajustar tiempo asignado</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                        Actual: <strong style={{ color: "var(--text-main)", fontFamily: "monospace" }}>
                            {task.estimateMinutes} min
                        </strong>
                        {task.estimateMinutes && task.estimateMinutes >= 60 && (
                            <> · {(task.estimateMinutes / 60).toFixed(task.estimateMinutes % 60 === 0 ? 0 : 1)} h</>
                        )}
                    </div>

                    {/* Quick deltas */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "0.5rem" }}>
                        {[-60, -30, -15, +15, +30, +60, +120].map((d) => (
                            <button
                                key={d}
                                type="button"
                                className={styles.smallBtn}
                                onClick={() => adjust(d)}
                                disabled={d < 0 && (task.estimateMinutes || 0) + d < 1}
                                title={d > 0 ? `Sumar ${d} min` : `Restar ${Math.abs(d)} min`}
                            >
                                {d > 0 ? `+${d}m` : `${d}m`}
                            </button>
                        ))}
                    </div>

                    {/* Set exact */}
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                        <input
                            type="number"
                            min={1}
                            max={60000}
                            step={5}
                            value={adjustValue}
                            onChange={(e) => setAdjustValue(Number(e.target.value))}
                            className={styles.input}
                            style={{ maxWidth: "120px", fontFamily: "monospace" }}
                        />
                        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>min</span>
                        <button
                            type="button"
                            className={`${styles.smallBtn} ${styles.smallBtnPrimary}`}
                            onClick={() => onAdjustTime(task, adjustValue)}
                            disabled={!adjustValue || adjustValue === task.estimateMinutes}
                        >
                            Guardar
                        </button>
                    </div>
                </div>
            )}

            <div className={styles.detailGrid}>
                <div className={styles.detailField}>
                    <div className={styles.label}>Cliente</div>
                    <div style={{ fontWeight: 600 }}>{task.client}</div>
                </div>
                <div className={styles.detailField}>
                    <div className={styles.label}>Módulos</div>
                    <div style={{ fontWeight: 600 }}>{task.modules || "—"}</div>
                </div>
                <div className={styles.detailField} style={{ gridColumn: "1 / -1" }}>
                    <div className={styles.label}>Reportado por</div>
                    <div style={{ fontWeight: 600 }}>{task.reporter}</div>
                </div>
            </div>

            <div className={styles.detailField} style={{ marginTop: "0.6rem" }}>
                <div className={styles.label}>Pasos para reproducir</div>
                <pre
                    style={{
                        whiteSpace: "pre-wrap",
                        fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
                        fontSize: "0.82rem",
                        color: "var(--text-secondary)",
                        margin: 0,
                    }}
                >
                    {task.steps || "—"}
                </pre>
            </div>

            {task.assignedToName && (
                <div className={styles.detailField} style={{ marginTop: "0.6rem" }}>
                    <div className={styles.label}>Asignado a</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span
                            className={styles.userInitials}
                            style={{ background: task.assignedColor || "#1E88E5" }}
                        >
                            {initials(task.assignedToName)}
                        </span>
                        <strong>{task.assignedToName}</strong>
                        {task.estimateMinutes && (
                            <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontFamily: "monospace" }}>
                                {task.estimateMinutes} min asignados
                            </span>
                        )}
                    </div>
                </div>
            )}

            {task.releaseVersion && (
                <div className={styles.detailField} style={{ marginTop: "0.6rem" }}>
                    <div className={styles.label}>Liberada en versión</div>
                    <div style={{ fontWeight: 700, fontFamily: "monospace", color: "#15803d" }}>
                        ✓ {task.releaseVersion} · {fmtDate(task.releasedAt)}
                    </div>
                </div>
            )}

            {/* ===== Dev tools (notas + subtareas). Visible solo a dev y no en done ===== */}
            {showDevTools && (
                <div className={styles.devToolsBox}>
                    <div className={styles.devToolsTitle}>🧰 Herramientas de desarrollo</div>

                    {/* Notas dev */}
                    <div style={{ marginBottom: "0.85rem" }}>
                        <div className={styles.label}>Notas / análisis ampliado</div>
                        <textarea
                            className={styles.notesArea}
                            placeholder="Anota investigación, hipótesis, decisiones técnicas, observaciones del código…"
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            rows={4}
                        />
                        <div className={styles.notesActions}>
                            <span>
                                {notesDraft === (task.devNotes || "")
                                    ? "Sin cambios"
                                    : `${notesDraft.length} caracteres sin guardar`}
                            </span>
                            <div style={{ marginLeft: "auto", display: "flex", gap: "0.4rem" }}>
                                {notesDraft !== (task.devNotes || "") && (
                                    <button
                                        type="button"
                                        className={styles.smallBtn}
                                        onClick={() => setNotesDraft(task.devNotes || "")}
                                    >
                                        Descartar
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className={`${styles.smallBtn} ${styles.smallBtnPrimary}`}
                                    onClick={() => onSaveDevNotes(task, notesDraft)}
                                    disabled={notesDraft === (task.devNotes || "")}
                                >
                                    Guardar notas
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Subtareas */}
                    <div>
                        <div className={styles.label}>Pasos / subtareas</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                            Divide la tarea en pasos manejables. Marca cada paso al completarlo.
                        </div>

                        {subtasks.length > 0 && (
                            <div className={styles.subtaskHeader}>
                                <div className={styles.subtaskProgress}>
                                    <div
                                        className={styles.subtaskProgressFill}
                                        style={{ width: `${subPct}%` }}
                                    />
                                </div>
                                <div className={styles.subtaskCount}>
                                    {subDone} / {subtasks.length}
                                </div>
                            </div>
                        )}

                        <div className={styles.subtaskList}>
                            {subtasks.map((s) => {
                                const isEditing = editingSubId === s.id;
                                return (
                                    <div
                                        key={s.id}
                                        className={`${styles.subtaskItem} ${s.done ? styles.subtaskItemDone : ""}`}
                                    >
                                        <button
                                            type="button"
                                            className={`${styles.subtaskCheckbox} ${
                                                s.done ? styles.subtaskCheckboxDone : ""
                                            }`}
                                            onClick={() => onToggleSubtask(task, s)}
                                            title={s.done ? "Desmarcar" : "Marcar como hecho"}
                                        >
                                            {s.done ? "✓" : ""}
                                        </button>

                                        {isEditing ? (
                                            <input
                                                className={styles.subtaskTitle}
                                                value={editingSubText}
                                                autoFocus
                                                onChange={(e) => setEditingSubText(e.target.value)}
                                                onBlur={() => commitEditSubtask(s)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        commitEditSubtask(s);
                                                    }
                                                    if (e.key === "Escape") {
                                                        setEditingSubId(null);
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <span
                                                className={`${styles.subtaskTitle} ${
                                                    s.done ? styles.subtaskTitleDone : ""
                                                }`}
                                                onDoubleClick={() => {
                                                    setEditingSubId(s.id);
                                                    setEditingSubText(s.title);
                                                }}
                                                title="Doble-click para editar"
                                                style={{ cursor: "text" }}
                                            >
                                                {s.title}
                                            </span>
                                        )}

                                        {s.done && s.completedBy && (
                                            <span className={styles.subtaskMeta}>· {s.completedBy}</span>
                                        )}

                                        <button
                                            type="button"
                                            className={styles.iconBtn}
                                            onClick={() => onRemoveSubtask(task, s)}
                                            title="Eliminar paso"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Add new */}
                        <div className={styles.subtaskAdd}>
                            <span style={{ color: "var(--text-muted)" }}>＋</span>
                            <input
                                className={styles.subtaskAddInput}
                                placeholder="Nuevo paso… (Enter para añadir)"
                                value={newSubtask}
                                onChange={(e) => setNewSubtask(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        submitNewSubtask();
                                    }
                                }}
                                maxLength={240}
                            />
                            {newSubtask.trim().length > 0 && (
                                <button
                                    type="button"
                                    className={`${styles.smallBtn} ${styles.smallBtnPrimary}`}
                                    onClick={submitNewSubtask}
                                >
                                    Añadir
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Vista de notas/checklist en modo lectura para soporte si existe contenido */}
            {!isDev && (task.devNotes || (task.subtasks && task.subtasks.length > 0)) && (
                <div className={styles.detailField} style={{ marginTop: "0.6rem" }}>
                    {task.devNotes && (
                        <div style={{ marginBottom: "0.5rem" }}>
                            <div className={styles.label}>Notas del desarrollador</div>
                            <p
                                style={{
                                    whiteSpace: "pre-wrap",
                                    fontSize: "0.85rem",
                                    color: "var(--text-secondary)",
                                    margin: 0,
                                }}
                            >
                                {task.devNotes}
                            </p>
                        </div>
                    )}
                    {subtasks.length > 0 && (
                        <div>
                            <div className={styles.label}>
                                Pasos · {subDone} / {subtasks.length}
                            </div>
                            <div className={styles.subtaskHeader}>
                                <div className={styles.subtaskProgress}>
                                    <div
                                        className={styles.subtaskProgressFill}
                                        style={{ width: `${subPct}%` }}
                                    />
                                </div>
                            </div>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                                {subtasks.map((s) => (
                                    <li
                                        key={s.id}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "0.4rem",
                                            padding: "0.25rem 0",
                                            fontSize: "0.85rem",
                                            color: s.done ? "var(--text-muted)" : "var(--text-main)",
                                            textDecoration: s.done ? "line-through" : "none",
                                        }}
                                    >
                                        <span style={{ color: s.done ? "#22c55e" : "var(--text-muted)" }}>
                                            {s.done ? "✓" : "○"}
                                        </span>
                                        {s.title}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {attachments.length > 0 && (
                <div className={styles.detailField} style={{ marginTop: "0.6rem" }}>
                    <div className={styles.label}>Adjuntos ({attachments.length})</div>
                    <div className={styles.gallery}>
                        {attachments.map((a) => {
                            const url = resolveAttachmentUrl(a);
                            return (
                                <div key={a.id} className={styles.galleryTile}>
                                    {a.kind === "image" ? (
                                        <div className={styles.galleryMedia} onClick={() => setPreview(a)}>
                                            <img src={url} alt={a.name} />
                                        </div>
                                    ) : a.kind === "video" ? (
                                        <div className={styles.galleryMedia} onClick={() => setPreview(a)}>
                                            <video src={url} muted />
                                        </div>
                                    ) : a.kind === "pdf" ? (
                                        <div className={styles.galleryFile} onClick={() => setPreview(a)}>
                                            📄
                                        </div>
                                    ) : (
                                        <div className={styles.galleryFile}>📎</div>
                                    )}
                                    <div className={styles.galleryFooter}>
                                        <span className={styles.galleryName} title={a.name}>
                                            {a.name}
                                        </span>
                                        <a
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            download={a.name}
                                            className={styles.galleryAction}
                                        >
                                            ⬇
                                        </a>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <Lightbox att={preview} onClose={() => setPreview(null)} />
        </ModalShell>
    );
}

// =================== Assign modal ===================
function AssignTimeModal({
    task,
    devUser,
    onClose,
    onConfirm,
}: {
    task: Task | null;
    devUser: TareasIdentity | null;
    onClose: () => void;
    onConfirm: (minutes: number, responsable: string) => void;
}) {
    const [custom, setCustom] = useState(60);
    const [hours, setHours] = useState(8);
    const [responsable, setResponsable] = useState("");

    useEffect(() => {
        if (task) {
            setCustom(60);
            setHours(8);
            setResponsable(devUser?.name || "");
        }
    }, [task, devUser]);

    if (!task) return null;

    const quickPresets = [
        { label: "15 min", v: 15, hint: "Ajuste ultra rápido" },
        { label: "30 min", v: 30, hint: "Fix pequeño" },
        { label: "1 h", v: 60, hint: "Bug típico del día" },
        { label: "2 h", v: 120, hint: "Requiere investigación" },
        { label: "4 h", v: 240, hint: "Medio día" },
        { label: "8 h", v: 480, hint: "Día completo" },
    ];

    const longPresets = [
        { label: "16 h", v: 16 * 60, hint: "2 días de trabajo" },
        { label: "24 h", v: 24 * 60, hint: "3 días de trabajo" },
        { label: "40 h", v: 40 * 60, hint: "1 semana" },
        { label: "80 h", v: 80 * 60, hint: "2 semanas" },
        { label: "120 h", v: 120 * 60, hint: "3 semanas" },
        { label: "160 h", v: 160 * 60, hint: "1 mes" },
    ];

    const canConfirm = responsable.trim().length >= 2;
    const tryConfirm = (mins: number) => {
        if (!canConfirm) return;
        onConfirm(mins, responsable.trim());
    };

    return (
        <ModalShell open={!!task} onClose={onClose} title="Asignarme esta tarea" size="md">
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                ¿Cuánto tiempo estimas que te tomará resolver{" "}
                <strong style={{ color: "var(--text-main)" }}>"{task.title}"</strong>?
                <br />
                Al confirmar, el cronómetro arranca en vivo para todos.
            </p>

            {/* Responsable */}
            <div className={styles.detailField}>
                <div className={styles.label}>Responsable</div>
                <input
                    type="text"
                    className={styles.input}
                    placeholder="Nombre de quien toma esta tarea"
                    value={responsable}
                    onChange={(e) => setResponsable(e.target.value)}
                    maxLength={80}
                />
                {!canConfirm && responsable.length > 0 && (
                    <div className={styles.fieldError}>Mínimo 2 caracteres.</div>
                )}
            </div>

            {/* Presets cortos */}
            <div className={styles.label} style={{ marginTop: "1rem" }}>
                Día a día / fixes cortos
            </div>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "0.5rem",
                    marginBottom: "1rem",
                }}
            >
                {quickPresets.map((p) => (
                    <button
                        key={p.v}
                        className={styles.categoryBtn}
                        onClick={() => tryConfirm(p.v)}
                        disabled={!canConfirm}
                        style={{
                            textAlign: "left",
                            opacity: canConfirm ? 1 : 0.4,
                            cursor: canConfirm ? "pointer" : "not-allowed",
                        }}
                    >
                        <div style={{ fontWeight: 700, fontSize: "1rem", fontFamily: "monospace" }}>
                            {p.label}
                        </div>
                        <div className={styles.categoryHint}>{p.hint}</div>
                    </button>
                ))}
            </div>

            {/* Presets largos */}
            <div className={styles.label}>Desarrollo a largo plazo</div>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "0.5rem",
                    marginBottom: "1rem",
                }}
            >
                {longPresets.map((p) => (
                    <button
                        key={p.v}
                        className={styles.categoryBtn}
                        onClick={() => tryConfirm(p.v)}
                        disabled={!canConfirm}
                        style={{
                            textAlign: "left",
                            opacity: canConfirm ? 1 : 0.4,
                            cursor: canConfirm ? "pointer" : "not-allowed",
                        }}
                    >
                        <div style={{ fontWeight: 700, fontSize: "1rem", fontFamily: "monospace" }}>
                            {p.label}
                        </div>
                        <div className={styles.categoryHint}>{p.hint}</div>
                    </button>
                ))}
            </div>

            {/* Custom horas */}
            <div className={styles.detailField}>
                <div className={styles.label}>Horas de desarrollo</div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                        type="number"
                        min={1}
                        max={1000}
                        step={1}
                        value={hours}
                        onChange={(e) => setHours(Number(e.target.value))}
                        className={styles.input}
                        style={{ maxWidth: "140px", fontFamily: "monospace" }}
                    />
                    <button
                        className="btn btn-primary"
                        onClick={() => tryConfirm(Math.max(1, Math.round(hours)) * 60)}
                        disabled={!canConfirm || !hours}
                        style={{ padding: "0.55rem 1rem" }}
                    >
                        Iniciar con {hours} h
                    </button>
                </div>
            </div>

            {/* Custom minutos */}
            <div className={styles.detailField} style={{ marginTop: "0.6rem" }}>
                <div className={styles.label}>Tiempo personalizado (minutos)</div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                        type="number"
                        min={5}
                        max={60000}
                        step={5}
                        value={custom}
                        onChange={(e) => setCustom(Number(e.target.value))}
                        className={styles.input}
                        style={{ maxWidth: "140px", fontFamily: "monospace" }}
                    />
                    <button
                        className="btn btn-primary"
                        onClick={() => tryConfirm(custom)}
                        disabled={!canConfirm || !custom}
                        style={{ padding: "0.55rem 1rem" }}
                    >
                        Iniciar con {custom} min
                    </button>
                </div>
            </div>

            {devUser && (
                <div style={{ marginTop: "1rem", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                    Sesión de{" "}
                    <span
                        className={styles.severityChip}
                        style={{
                            background: devUser.color + "22",
                            color: devUser.color,
                            borderColor: devUser.color + "55",
                        }}
                    >
                        {devUser.name}
                    </span>
                </div>
            )}
        </ModalShell>
    );
}

// =================== Main client ===================
export default function TareasClient({ identity }: Props) {
    const isDev = identity.role === "dev";

    // Tasks
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentWeek, setCurrentWeek] = useState<string>(getWeekKey());
    const [view, setView] = useState<View>("stack");
    const [tick, setTick] = useState(Date.now());
    const [error, setError] = useState<string | null>(null);

    // Released versions cache (release tab)
    const [versions, setVersions] = useState<PublishedVersion[]>([]);

    // UI state
    const [detail, setDetail] = useState<Task | null>(null);
    const [assigning, setAssigning] = useState<Task | null>(null);
    const [filter, setFilter] = useState<"all" | "mine" | "free">("all");
    const [formOpen, setFormOpen] = useState(true);
    const [touched, setTouched] = useState(false);
    const [archiveQuery, setArchiveQuery] = useState("");
    const [archiveCategory, setArchiveCategory] = useState<"all" | "daily" | "project">("all");
    const [archiveWeek, setArchiveWeek] = useState<string>("all");
    const [nextVersion, setNextVersion] = useState<string>("v1.0.0");
    const [confirmPublish, setConfirmPublish] = useState(false);
    const [toasts, setToasts] = useState<
        { id: string; title: string; msg?: string; kind: "success" | "info" | "release" }[]
    >([]);

    const [form, setForm] = useState({
        title: "",
        description: "",
        steps: "",
        client: "",
        modules: "",
        category: "daily" as TaskCategory,
        severity: "medium" as Severity,
    });

    // Adjuntos pendientes de subir (validados localmente)
    const [pendingAttachments, setPendingAttachments] = useState<PendingFile[]>([]);
    const [uploadingAttachments, setUploadingAttachments] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const addFiles = useCallback(async (files: FileList | File[]) => {
        const incoming = Array.from(files);
        const next: PendingFile[] = [];
        const errors: string[] = [];
        for (const f of incoming) {
            if (pendingAttachments.length + next.length >= ATTACHMENTS.MAX_FILES) {
                errors.push(`Máximo ${ATTACHMENTS.MAX_FILES} archivos por reporte.`);
                break;
            }
            const kind = fileKind(f.type);
            const id = "p_" + Math.random().toString(36).slice(2, 9);
            const item: PendingFile = { id, file: f, kind };

            if (!ATTACHMENTS.ACCEPTED_MIME.includes(f.type as any)) {
                item.error = `Tipo no permitido (${f.type || "desconocido"}).`;
            } else if (f.size > ATTACHMENTS.MAX_BYTES_PER_FILE) {
                item.error = `Excede ${fmtBytes(ATTACHMENTS.MAX_BYTES_PER_FILE)}.`;
            } else if (kind === "video") {
                try {
                    const d = await getVideoDuration(f);
                    item.durationSeconds = d;
                    if (d > ATTACHMENTS.MAX_VIDEO_SECONDS) {
                        item.error = `Video supera ${ATTACHMENTS.MAX_VIDEO_SECONDS}s (${fmtSeconds(d)}).`;
                    }
                } catch (e: any) {
                    item.error = "No se pudo validar la duración.";
                }
            }

            if (kind === "image" || kind === "video") {
                item.previewUrl = URL.createObjectURL(f);
            }
            next.push(item);
        }
        if (next.length) setPendingAttachments((prev) => [...prev, ...next]);
        if (errors.length) alert(errors.join("\n"));
    }, [pendingAttachments.length]);

    function removePending(id: string) {
        setPendingAttachments((prev) => {
            const removed = prev.find((p) => p.id === id);
            if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
            return prev.filter((p) => p.id !== id);
        });
    }

    function clearPending() {
        pendingAttachments.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
        setPendingAttachments([]);
    }

    const pushToast = useCallback(
        (t: { title: string; msg?: string; kind: "success" | "info" | "release" }) => {
            const id = "t_" + Math.random().toString(36).slice(2, 9);
            setToasts((prev) => [...prev, { id, ...t }]);
            setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 6000);
        },
        []
    );

    // Carga tareas
    const refresh = useCallback(async () => {
        try {
            setError(null);
            const [all, wk] = await Promise.all([TareasAPI.listAll(), TareasAPI.currentWeek()]);
            setTasks(all);
            setCurrentWeek(wk);
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Error al cargar tareas");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // Polling cada 15s para sincronizar con el resto de usuarios
    useEffect(() => {
        const id = setInterval(refresh, 15000);
        return () => clearInterval(id);
    }, [refresh]);

    // Tick para timers
    useEffect(() => {
        const id = setInterval(() => setTick(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    // Cargar versiones cuando se entre a la vista release
    useEffect(() => {
        if (view !== "release") return;
        TareasAPI.publishedVersions()
            .then((v) => {
                setVersions(v);
                if (v.length > 0) {
                    const last = v[0].version;
                    setNextVersion(suggestNextVersion(last));
                }
            })
            .catch((e) => console.error(e));
    }, [view, tasks]);

    // Derivados
    const activeTasks = useMemo(() => tasks.filter((t) => t.weekKey === currentWeek), [tasks, currentWeek]);
    const dailyStack = useMemo(
        () =>
            activeTasks
                .filter((t) => t.category === "daily" && t.status !== "done")
                .sort((a, b) => a.createdAt - b.createdAt),
        [activeTasks]
    );
    const projectStack = useMemo(
        () =>
            activeTasks
                .filter((t) => t.category === "project" && t.status !== "done")
                .sort((a, b) => a.createdAt - b.createdAt),
        [activeTasks]
    );
    const doneThisWeek = useMemo(
        () =>
            activeTasks
                .filter((t) => t.status === "done")
                .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)),
        [activeTasks]
    );
    const releaseQueue = useMemo(
        () =>
            tasks
                .filter((t) => t.status === "done" && t.includeInRelease && !t.releaseVersion)
                .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)),
        [tasks]
    );
    const candidates = useMemo(
        () =>
            tasks
                .filter((t) => t.status === "done" && !t.releaseVersion)
                .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)),
        [tasks]
    );

    function filterTasks(list: Task[]): Task[] {
        if (filter === "mine") return list.filter((t) => t.assignedToId === identity.id);
        if (filter === "free") return list.filter((t) => !t.assignedToId);
        return list;
    }

    const dailyDisplay = useMemo(() => filterTasks(dailyStack), [dailyStack, filter, identity]);
    const projectDisplay = useMemo(() => filterTasks(projectStack), [projectStack, filter, identity]);

    const inProgressMine = useMemo(
        () =>
            activeTasks.filter(
                (t) => t.assignedToId === identity.id && t.status === "in_progress"
            ),
        [activeTasks, identity]
    );

    /** Todas las tareas en curso (cualquier dev). Se usa en la vista de soporte. */
    const inProgressAll = useMemo(
        () =>
            activeTasks
                .filter((t) => t.status === "in_progress")
                .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0)),
        [activeTasks]
    );

    /** Tareas resueltas hoy (últimas 24 h). Pequeño extra para dar contexto a soporte. */
    const resolvedRecently = useMemo(() => {
        const now = Date.now();
        return tasks
            .filter((t) => t.status === "done" && t.completedAt && now - t.completedAt < 24 * 3600 * 1000)
            .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
            .slice(0, 5);
    }, [tasks]);

    // ===== Acciones =====
    async function submitForm() {
        setTouched(true);
        if (
            form.title.trim().length < 5 ||
            form.description.trim().length < 10 ||
            form.client.trim().length < 2
        ) {
            return;
        }
        // Si hay adjuntos con error, no permitimos enviar
        const validAttachments = pendingAttachments.filter((p) => !p.error);
        const hasErrors = pendingAttachments.some((p) => p.error);
        if (hasErrors) {
            alert("Hay archivos con errores. Quítalos antes de enviar.");
            return;
        }
        try {
            const created = await TareasAPI.create({
                title: form.title.trim(),
                description: form.description.trim(),
                steps: form.steps.trim(),
                client: form.client.trim(),
                modules: form.modules.trim(),
                category: form.category,
                severity: form.severity,
                reporter: identity.name,
                reporterId: identity.id,
            });

            let finalTask = created;
            if (validAttachments.length > 0) {
                setUploadingAttachments(true);
                try {
                    const durations: Record<string, number> = {};
                    validAttachments.forEach((p) => {
                        if (p.kind === "video" && p.durationSeconds) {
                            durations[p.file.name] = p.durationSeconds;
                        }
                    });
                    finalTask = await TareasAPI.uploadAttachments(
                        created.id,
                        validAttachments.map((p) => p.file),
                        durations
                    );
                } catch (e: any) {
                    pushToast({
                        title: "Reporte enviado, adjuntos fallaron",
                        msg: e.message || "Reintenta desde el detalle.",
                        kind: "info",
                    });
                } finally {
                    setUploadingAttachments(false);
                }
            }

            setTasks((prev) => [...prev, finalTask]);
            setForm({
                title: "",
                description: "",
                steps: "",
                client: "",
                modules: "",
                category: "daily",
                severity: "medium",
            });
            setTouched(false);
            clearPending();
            pushToast({ title: "Reporte enviado", msg: "Se está posicionando en la pila.", kind: "success" });
        } catch (e: any) {
            alert("Error al crear la tarea: " + (e.message || e));
        }
    }

    async function confirmAssign(minutes: number, responsable: string) {
        if (!assigning) return;
        const name = (responsable || identity.name).trim() || identity.name;
        try {
            const updated = await TareasAPI.assign(assigning.id, {
                minutes,
                assignedToId: identity.id,
                assignedToName: name,
                assignedColor: identity.color,
            });
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setAssigning(null);
        } catch (e: any) {
            alert("Error al asignar: " + (e.message || e));
        }
    }

    async function onPause(t: Task) {
        try {
            const u = await TareasAPI.pause(t.id);
            setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
        } catch (e: any) {
            alert("Error al pausar: " + (e.message || e));
        }
    }
    async function onResume(t: Task) {
        try {
            const u = await TareasAPI.resume(t.id);
            setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
        } catch (e: any) {
            alert("Error al reanudar: " + (e.message || e));
        }
    }
    async function onComplete(t: Task) {
        try {
            const u = await TareasAPI.complete(t.id);
            setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            pushToast({ title: "Tarea resuelta", msg: t.title, kind: "success" });
        } catch (e: any) {
            alert("Error al completar: " + (e.message || e));
        }
    }
    async function onDelete(t: Task) {
        if (t.reporterId !== identity.id || t.status !== "pending") return;
        if (!confirm("¿Eliminar este reporte?")) return;
        try {
            await TareasAPI.remove(t.id);
            setTasks((prev) => prev.filter((x) => x.id !== t.id));
        } catch (e: any) {
            alert("Error al eliminar: " + (e.message || e));
        }
    }
    async function onToggleRelease(t: Task) {
        try {
            const u = await TareasAPI.toggleRelease(t.id);
            setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
        } catch (e: any) {
            alert("Error: " + (e.message || e));
        }
    }
    async function onChangeCategory(t: Task) {
        const next: TaskCategory = t.category === "project" ? "daily" : "project";
        try {
            const u = await TareasAPI.update(t.id, { category: next });
            setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            setDetail((cur) => (cur && cur.id === u.id ? u : cur));
        } catch (e: any) {
            alert("Error al reclasificar: " + (e.message || e));
        }
    }
    async function onAdjustTime(t: Task, newMinutes: number) {
        const minutes = Math.max(1, Math.round(newMinutes));
        if (minutes === t.estimateMinutes) return;
        try {
            const u = await TareasAPI.update(t.id, { estimateMinutes: minutes });
            setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            setDetail((cur) => (cur && cur.id === u.id ? u : cur));
        } catch (e: any) {
            alert("Error al ajustar tiempo: " + (e.message || e));
        }
    }
    async function onSaveDevNotes(t: Task, notes: string) {
        try {
            const u = await TareasAPI.update(t.id, { devNotes: notes });
            setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            setDetail((cur) => (cur && cur.id === u.id ? u : cur));
            pushToast({ title: "Notas guardadas", kind: "success" });
        } catch (e: any) {
            alert("Error al guardar notas: " + (e.message || e));
        }
    }
    async function onAddSubtask(t: Task, title: string) {
        try {
            const u = await TareasAPI.addSubtask(t.id, title, identity.name);
            setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            setDetail((cur) => (cur && cur.id === u.id ? u : cur));
        } catch (e: any) {
            alert("Error al agregar paso: " + (e.message || e));
        }
    }
    async function onToggleSubtask(t: Task, sub: { id: string; done: boolean }) {
        try {
            const u = await TareasAPI.updateSubtask(t.id, sub.id, {
                done: !sub.done,
                completedBy: identity.name,
            });
            setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            setDetail((cur) => (cur && cur.id === u.id ? u : cur));
        } catch (e: any) {
            alert("Error al actualizar paso: " + (e.message || e));
        }
    }
    async function onEditSubtask(t: Task, sub: { id: string }, newTitle: string) {
        try {
            const u = await TareasAPI.updateSubtask(t.id, sub.id, { title: newTitle });
            setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            setDetail((cur) => (cur && cur.id === u.id ? u : cur));
        } catch (e: any) {
            alert("Error al renombrar paso: " + (e.message || e));
        }
    }
    async function onRemoveSubtask(t: Task, sub: { id: string }) {
        if (!confirm("¿Eliminar este paso?")) return;
        try {
            const u = await TareasAPI.removeSubtask(t.id, sub.id);
            setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            setDetail((cur) => (cur && cur.id === u.id ? u : cur));
        } catch (e: any) {
            alert("Error al eliminar paso: " + (e.message || e));
        }
    }
    async function onPublishRelease() {
        if (!releaseQueue.length || !nextVersion.trim()) return;
        try {
            const result = await TareasAPI.publishRelease(nextVersion.trim());
            const updatedIds = new Set(result.data.map((t) => t.id));
            setTasks((prev) => prev.map((t) => (updatedIds.has(t.id) ? result.data.find((u) => u.id === t.id)! : t)));
            setConfirmPublish(false);
            pushToast({
                title: `Versión ${result.version} publicada`,
                msg: `${result.count} mejora(s) liberada(s) oficialmente`,
                kind: "release",
            });
            setNextVersion(suggestNextVersion(result.version));
            const v = await TareasAPI.publishedVersions();
            setVersions(v);
        } catch (e: any) {
            alert("Error al publicar: " + (e.message || e));
        }
    }

    function suggestNextVersion(v: string): string {
        const m = v.match(/^(v?)(\d+)(?:\.(\d+))?(?:\.(\d+))?$/i);
        if (!m) return v;
        const [, prefix, major, minor, patch] = m;
        if (patch !== undefined) return `${prefix}${major}.${minor}.${Number(patch) + 1}`;
        if (minor !== undefined) return `${prefix}${major}.${Number(minor) + 1}.0`;
        return `${prefix}${Number(major) + 1}.0.0`;
    }

    // ===== Archive view =====
    const archiveWeeks = useMemo(() => {
        const set = new Set<string>();
        tasks.forEach((t) => set.add(t.weekKey));
        return Array.from(set).sort().reverse();
    }, [tasks]);

    function weekLabel(wk: string) {
        const { start, end } = weekBounds(wk);
        const fmt = (d: Date) => d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
        const endDisp = new Date(end);
        endDisp.setUTCDate(endDisp.getUTCDate() - 1);
        return `${wk} · ${fmt(start)}–${fmt(endDisp)}`;
    }

    const archiveFiltered = useMemo(() => {
        const text = archiveQuery.trim().toLowerCase();
        return tasks
            .filter((t) => (archiveWeek === "all" ? true : t.weekKey === archiveWeek))
            .filter((t) => (archiveCategory === "all" ? true : t.category === archiveCategory))
            .filter((t) => {
                if (!text) return true;
                const hay = [
                    t.title,
                    t.description,
                    t.client,
                    t.modules,
                    t.reporter,
                    t.assignedToName || "",
                ]
                    .join(" ")
                    .toLowerCase();
                return hay.includes(text);
            })
            .sort((a, b) => b.createdAt - a.createdAt);
    }, [tasks, archiveQuery, archiveWeek, archiveCategory]);

    const archiveGrouped = useMemo(() => {
        const out: Record<string, Task[]> = {};
        archiveFiltered.forEach((t) => {
            (out[t.weekKey] ||= []).push(t);
        });
        return out;
    }, [archiveFiltered]);

    // ============ Render ============
    return (
        <div className={styles.wrapper}>
            {/* Toasts */}
            <div className={styles.toastStack}>
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`${styles.toast} ${
                            t.kind === "success" ? styles.toastSuccess : t.kind === "release" ? styles.toastRelease : ""
                        }`}
                    >
                        <div style={{ flex: 1 }}>
                            <div className={styles.toastTitle}>{t.title}</div>
                            {t.msg && <div className={styles.toastMsg}>{t.msg}</div>}
                        </div>
                        <button className={styles.closeBtn} onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}>
                            ✕
                        </button>
                    </div>
                ))}
            </div>

            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Tareas</h1>
                    <p className={styles.subtitle}>
                        Hola <strong style={{ color: "var(--text-main)" }}>{identity.name}</strong> ·
                        Semana <code style={{ fontFamily: "monospace" }}>{currentWeek}</code>
                    </p>
                </div>

                <div className={styles.metricGrid}>
                    <div className={styles.metricCard}>
                        <div className={styles.metricLabel}>En espera</div>
                        <div className={`${styles.metricValue} ${styles.metricValueAccent}`}>
                            {dailyStack.filter((t) => t.status === "pending").length}
                        </div>
                    </div>
                    <div className={styles.metricCard}>
                        <div className={styles.metricLabel}>En curso</div>
                        <div className={`${styles.metricValue} ${styles.metricValueOk}`}>
                            {activeTasks.filter((t) => t.status === "in_progress").length}
                        </div>
                    </div>
                    <div className={styles.metricCard}>
                        <div className={styles.metricLabel}>Resueltas</div>
                        <div className={styles.metricValue}>{doneThisWeek.length}</div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${view === "stack" ? styles.tabActive : ""}`}
                    onClick={() => setView("stack")}
                >
                    Pila activa
                </button>
                <button
                    className={`${styles.tab} ${view === "release" ? styles.tabActive : ""}`}
                    onClick={() => setView("release")}
                >
                    Versiones
                </button>
                <button
                    className={`${styles.tab} ${view === "archive" ? styles.tabActive : ""}`}
                    onClick={() => setView("archive")}
                >
                    Archivo
                </button>
            </div>

            {error && (
                <div
                    style={{
                        background: "rgba(245, 158, 11, 0.08)",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                        color: "#92400e",
                        padding: "0.75rem 1rem",
                        borderRadius: "var(--radius-md)",
                        fontSize: "0.85rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                    }}
                >
                    <span style={{ fontSize: "1rem" }}>⚠️</span>
                    <span style={{ flex: 1 }}>{error}</span>
                    <button
                        type="button"
                        className={styles.smallBtn}
                        onClick={() => refresh()}
                    >
                        Reintentar
                    </button>
                </div>
            )}

            <div className={styles.contentWrap}>
                {/* ============ STACK VIEW ============ */}
                {view === "stack" && (
                    <>
                        {/* Filter tabs (dev) */}
                        {isDev && (
                            <div style={{ marginBottom: "0.85rem" }}>
                                <div className={styles.filterGroup}>
                                    <button
                                        className={`${styles.filterBtn} ${filter === "all" ? styles.filterBtnActive : ""}`}
                                        onClick={() => setFilter("all")}
                                    >
                                        Todo
                                    </button>
                                    <button
                                        className={`${styles.filterBtn} ${filter === "free" ? styles.filterBtnActive : ""}`}
                                        onClick={() => setFilter("free")}
                                    >
                                        Sin asignar
                                    </button>
                                    <button
                                        className={`${styles.filterBtn} ${filter === "mine" ? styles.filterBtnActive : ""}`}
                                        onClick={() => setFilter("mine")}
                                    >
                                        Solo mías
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Live activity panel (vista soporte) */}
                        {!isDev && (inProgressAll.length > 0 || resolvedRecently.length > 0) && (
                            <section className={styles.livePanel} style={{ marginBottom: "1rem" }}>
                                <div className={styles.livePanelHeader}>
                                    <span className={styles.livePulse}></span>
                                    <div className={styles.livePanelTitle}>
                                        Equipo trabajando ahora
                                        <span className={styles.countBadge}>{inProgressAll.length}</span>
                                    </div>
                                    <span className={styles.liveSubtitle}>
                                        {inProgressAll.length > 0
                                            ? "Actualizado en tiempo real"
                                            : "Sin actividad en curso"}
                                    </span>
                                </div>

                                {inProgressAll.length === 0 ? (
                                    <div
                                        style={{
                                            padding: "1rem 1.1rem",
                                            color: "var(--text-muted)",
                                            fontSize: "0.85rem",
                                        }}
                                    >
                                        Nadie está desarrollando reportes en este momento.
                                    </div>
                                ) : (
                                    <div className={styles.liveBody}>
                                        {inProgressAll.map((t) => {
                                            const pct = progressPct(t, tick);
                                            const overdue = remainingMs(t, tick) < 0;
                                            const fillColor = overdue
                                                ? "#ef4444"
                                                : pct > 75
                                                    ? "#f59e0b"
                                                    : t.assignedColor || "#22c55e";
                                            const isMine = t.reporterId === identity.id;
                                            return (
                                                <div
                                                    key={t.id}
                                                    className={`${styles.liveCard} ${isMine ? styles.liveCardMine : ""}`}
                                                    style={{ borderLeftColor: t.assignedColor || "var(--primary)" }}
                                                    onClick={() => setDetail(t)}
                                                >
                                                    <div className={styles.liveCardTop}>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div className={styles.liveCardTitle}>{t.title}</div>
                                                            <div className={styles.liveCardContext}>
                                                                {t.client}{t.modules ? ` · ${t.modules}` : ""}
                                                            </div>
                                                        </div>
                                                        {t.category === "project" && (
                                                            <span className={styles.projectChip}>PROY</span>
                                                        )}
                                                        {isMine && <span className={styles.mineBadge}>Tu reporte</span>}
                                                    </div>

                                                    <div className={styles.liveCardBottom}>
                                                        <div className={styles.liveCardDev}>
                                                            {t.assignedToName && (
                                                                <>
                                                                    <span
                                                                        className={styles.userInitials}
                                                                        style={{ background: t.assignedColor || "#1E88E5" }}
                                                                    >
                                                                        {initials(t.assignedToName)}
                                                                    </span>
                                                                    <span className={styles.liveCardDevName}>
                                                                        {t.assignedToName}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                        <LiveTimer task={t} compact tick={tick} />
                                                    </div>

                                                    <div className={styles.liveProgressTrack}>
                                                        <div
                                                            className={styles.liveProgressFill}
                                                            style={{
                                                                width: `${Math.min(100, pct)}%`,
                                                                background: fillColor,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {resolvedRecently.length > 0 && (
                                    <div className={styles.liveResolvedStrip}>
                                        <span style={{ fontWeight: 600, color: "var(--text-main)" }}>
                                            ✓ Resueltas hoy:
                                        </span>
                                        {resolvedRecently.map((t) => {
                                            const isMine = t.reporterId === identity.id;
                                            return (
                                                <span
                                                    key={t.id}
                                                    className={styles.liveResolvedItem}
                                                    onClick={() => setDetail(t)}
                                                    title={`${t.client} · ${fmtAgo(t.completedAt)}${
                                                        t.assignedToName ? ` · ${t.assignedToName}` : ""
                                                    }`}
                                                    style={
                                                        isMine
                                                            ? { borderColor: "rgba(34,197,94,0.5)", background: "rgba(34,197,94,0.08)" }
                                                            : undefined
                                                    }
                                                >
                                                    <span style={{ color: "#22c55e" }}>✓</span>
                                                    <span
                                                        style={{
                                                            maxWidth: "180px",
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        {t.title}
                                                    </span>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        )}

                        {/* In-progress mine strip */}
                        {isDev && inProgressMine.length > 0 && (
                            <section
                                className={styles.formCard}
                                style={{ position: "static", borderLeft: "4px solid " + identity.color, marginBottom: "1rem" }}
                            >
                                <div style={{ padding: "1rem 1.25rem" }}>
                                    <div className={styles.label}>Enfocado en</div>
                                    <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}>
                                        {inProgressMine.map((t) => (
                                            <div
                                                key={t.id}
                                                style={{
                                                    background: "var(--bg-main)",
                                                    border: "1px solid var(--border-color)",
                                                    borderRadius: "var(--radius-md)",
                                                    padding: "0.75rem",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "0.75rem",
                                                }}
                                            >
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div
                                                        style={{
                                                            fontWeight: 600,
                                                            color: "var(--text-main)",
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        {t.title}
                                                    </div>
                                                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                                                        {t.client} · {t.modules}
                                                    </div>
                                                </div>
                                                <LiveTimer task={t} compact tick={tick} />
                                                <button
                                                    className={`${styles.smallBtn} ${styles.smallBtnSuccess}`}
                                                    onClick={() => onComplete(t)}
                                                >
                                                    Resolver
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        )}

                        <div
                            className={styles.twoCol}
                            style={isDev ? { gridTemplateColumns: "1fr" } : undefined}
                        >
                            {/* Form (sólo soporte/administración) */}
                            {!isDev && (
                            <section className={styles.formCard}>
                                <button className={styles.formHeader} onClick={() => setFormOpen((v) => !v)}>
                                    <div className={styles.formHeaderInfo}>
                                        <span className={styles.formHeaderTitle}>Nuevo reporte</span>
                                        <span className={styles.formHeaderHint}>Describe el problema con detalle</span>
                                    </div>
                                    <span style={{ color: "var(--text-muted)" }}>{formOpen ? "▴" : "▾"}</span>
                                </button>
                                {formOpen && (
                                    <div className={styles.formBody}>
                                        <div>
                                            <label className={styles.label}>Título breve</label>
                                            <input
                                                className={styles.input}
                                                maxLength={120}
                                                placeholder="Ej: Listado de compras no permite pagar"
                                                value={form.title}
                                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                            />
                                            {touched && form.title.trim().length < 5 && (
                                                <div className={styles.fieldError}>Al menos 5 caracteres.</div>
                                            )}
                                        </div>

                                        <div>
                                            <label className={styles.label}>Descripción</label>
                                            <textarea
                                                className={styles.textarea}
                                                rows={3}
                                                placeholder="Qué ocurre, qué se esperaba, desde cuándo…"
                                                value={form.description}
                                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                            />
                                            {touched && form.description.trim().length < 10 && (
                                                <div className={styles.fieldError}>Cuéntanos un poco más (10+ caracteres).</div>
                                            )}
                                        </div>

                                        <div>
                                            <label className={styles.label}>Pasos para reproducir</label>
                                            <textarea
                                                className={styles.textarea}
                                                rows={3}
                                                placeholder={"1) Ir a…\n2) Clickear…\n3) Ocurre…"}
                                                value={form.steps}
                                                onChange={(e) => setForm({ ...form, steps: e.target.value })}
                                                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.82rem" }}
                                            />
                                        </div>

                                        <div className={styles.row2}>
                                            <div>
                                                <label className={styles.label}>Cliente</label>
                                                <input
                                                    className={styles.input}
                                                    placeholder="Ej: ACME Retail"
                                                    value={form.client}
                                                    onChange={(e) => setForm({ ...form, client: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className={styles.label}>Módulo(s)</label>
                                                <input
                                                    className={styles.input}
                                                    placeholder="Ej: Tesorería · Pagos"
                                                    value={form.modules}
                                                    onChange={(e) => setForm({ ...form, modules: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className={styles.label}>Severidad</label>
                                            <div className={styles.severityRow}>
                                                {(["low", "medium", "high", "critical"] as Severity[]).map((s) => {
                                                    const active = form.severity === s;
                                                    const cls = [
                                                        styles.severityBtn,
                                                        active && s === "low" ? styles.severityActiveLow : "",
                                                        active && s === "medium" ? styles.severityActiveMedium : "",
                                                        active && s === "high" ? styles.severityActiveHigh : "",
                                                        active && s === "critical" ? styles.severityActiveCritical : "",
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" ");
                                                    return (
                                                        <button
                                                            key={s}
                                                            type="button"
                                                            className={cls}
                                                            onClick={() => setForm({ ...form, severity: s })}
                                                        >
                                                            {SEVERITY_LABEL[s]}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Adjuntos */}
                                        <div>
                                            <label className={styles.label}>
                                                Adjuntos (imagen, GIF, PDF, video ≤ {ATTACHMENTS.MAX_VIDEO_SECONDS}s)
                                            </label>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                multiple
                                                accept={ATTACHMENTS.ACCEPTED_MIME.join(",")}
                                                style={{ display: "none" }}
                                                onChange={(e) => {
                                                    if (e.target.files) addFiles(e.target.files);
                                                    e.target.value = "";
                                                }}
                                            />
                                            <div
                                                className={styles.dropzone}
                                                onClick={() => fileInputRef.current?.click()}
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    e.currentTarget.classList.add(styles.dropzoneActive);
                                                }}
                                                onDragLeave={(e) => {
                                                    e.currentTarget.classList.remove(styles.dropzoneActive);
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    e.currentTarget.classList.remove(styles.dropzoneActive);
                                                    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
                                                }}
                                            >
                                                📎 Click o arrastra archivos aquí
                                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                                                    Máx {ATTACHMENTS.MAX_FILES} archivos · {fmtBytes(ATTACHMENTS.MAX_BYTES_PER_FILE)} cada uno
                                                </div>
                                            </div>

                                            {pendingAttachments.length > 0 && (
                                                <div className={styles.attachmentList}>
                                                    {pendingAttachments.map((p) => (
                                                        <div
                                                            key={p.id}
                                                            className={`${styles.attachmentRow} ${p.error ? styles.attachmentError : ""}`}
                                                        >
                                                            <div className={styles.attachmentThumb}>
                                                                {p.kind === "image" && p.previewUrl && (
                                                                    <img src={p.previewUrl} alt={p.file.name} />
                                                                )}
                                                                {p.kind === "video" && p.previewUrl && (
                                                                    <video src={p.previewUrl} muted />
                                                                )}
                                                                {p.kind === "pdf" && <span>📄</span>}
                                                                {p.kind === "other" && <span>📎</span>}
                                                            </div>
                                                            <div className={styles.attachmentMeta}>
                                                                <div className={styles.attachmentName}>{p.file.name}</div>
                                                                <div className={styles.attachmentInfo}>
                                                                    {fmtBytes(p.file.size)}
                                                                    {p.kind === "video" && p.durationSeconds
                                                                        ? ` · ${fmtSeconds(p.durationSeconds)}`
                                                                        : ""}
                                                                    {p.error ? ` · ${p.error}` : ""}
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                className={styles.iconBtn}
                                                                onClick={() => removePending(p.id)}
                                                                title="Quitar"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={submitForm}
                                            disabled={uploadingAttachments}
                                            style={{ marginTop: "0.5rem" }}
                                        >
                                            {uploadingAttachments ? "Subiendo archivos…" : "Enviar a la pila →"}
                                        </button>
                                    </div>
                                )}
                            </section>
                            )}

                            {/* Stacks */}
                            <div className={styles.section}>
                                {/* Daily */}
                                <div>
                                    <h2 className={styles.sectionTitle}>
                                        <span className={styles.dotMarker}></span>
                                        Pila del día a día
                                        <span className={styles.countBadge}>{dailyDisplay.length}</span>
                                        <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 400 }}>
                                            La #1 es la más antigua
                                        </span>
                                    </h2>
                                    <div className={styles.section}>
                                        {dailyDisplay.length === 0 ? (
                                            <div className={styles.emptyBox}>
                                                {filter === "mine"
                                                    ? "No tienes tareas asignadas del día"
                                                    : "Aún no hay reportes del día. Envía el primero ✨"}
                                            </div>
                                        ) : (
                                            dailyDisplay.map((t, i) => (
                                                <TaskCard
                                                    key={t.id}
                                                    task={t}
                                                    priority={i + 1}
                                                    featured={i === 0}
                                                    mode={isDev ? "dev" : "support"}
                                                    tick={tick}
                                                    onOpen={setDetail}
                                                    onAssign={(x) => setAssigning(x)}
                                                    onPause={onPause}
                                                    onResume={onResume}
                                                    onComplete={onComplete}
                                                    onDelete={onDelete}
                                                />
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Project */}
                                <div style={{ marginTop: "1.25rem" }}>
                                    <h2 className={styles.sectionTitle}>
                                        <span className={`${styles.dotMarker} ${styles.dotPurple}`}></span>
                                        Desarrollo (largo plazo)
                                        <span className={styles.countBadge}>{projectDisplay.length}</span>
                                    </h2>
                                    <div className={styles.section}>
                                        {projectDisplay.length === 0 ? (
                                            <div className={styles.emptyBox}>Sin desarrollos largos esta semana.</div>
                                        ) : (
                                            projectDisplay.map((t, i) => (
                                                <TaskCard
                                                    key={t.id}
                                                    task={t}
                                                    priority={i + 1}
                                                    mode={isDev ? "dev" : "support"}
                                                    tick={tick}
                                                    onOpen={setDetail}
                                                    onAssign={(x) => setAssigning(x)}
                                                    onPause={onPause}
                                                    onResume={onResume}
                                                    onComplete={onComplete}
                                                    onDelete={onDelete}
                                                />
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Resueltas */}
                                {doneThisWeek.length > 0 && (
                                    <div style={{ marginTop: "1.25rem" }}>
                                        <h2 className={styles.sectionTitle}>
                                            <span className={`${styles.dotMarker} ${styles.dotGreen}`}></span>
                                            Resueltas esta semana
                                            <span className={styles.countBadge}>{doneThisWeek.length}</span>
                                        </h2>
                                        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 0.5rem 0" }}>
                                            Marca con 🚀 las que deban entrar en la próxima versión oficial.
                                        </p>
                                        <div className={styles.subRowList}>
                                            {doneThisWeek.map((t) => (
                                                <div
                                                    key={t.id}
                                                    className={styles.subRow}
                                                    style={t.includeInRelease ? { background: "rgba(139,92,246,0.05)" } : undefined}
                                                >
                                                    <span style={{ color: "#22c55e" }}>✓</span>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                gap: "0.4rem",
                                                                alignItems: "center",
                                                                flexWrap: "wrap",
                                                            }}
                                                        >
                                                            <strong style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                                                {t.title}
                                                            </strong>
                                                            {t.releaseVersion ? (
                                                                <span
                                                                    className={styles.severityChip}
                                                                    style={{
                                                                        background: "rgba(34,197,94,0.12)",
                                                                        color: "#15803d",
                                                                        borderColor: "rgba(34,197,94,0.3)",
                                                                        fontFamily: "monospace",
                                                                    }}
                                                                >
                                                                    ✓ {t.releaseVersion}
                                                                </span>
                                                            ) : t.includeInRelease ? (
                                                                <span
                                                                    className={styles.severityChip}
                                                                    style={{
                                                                        background: "rgba(139,92,246,0.12)",
                                                                        color: "#6d28d9",
                                                                        borderColor: "rgba(139,92,246,0.3)",
                                                                    }}
                                                                >
                                                                    🚀 En cola
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                        <div
                                                            style={{
                                                                fontSize: "0.75rem",
                                                                color: "var(--text-muted)",
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                whiteSpace: "nowrap",
                                                            }}
                                                        >
                                                            {t.client} · {t.modules}
                                                        </div>
                                                    </div>
                                                    {t.assignedToName && (
                                                        <span
                                                            className={styles.userInitials}
                                                            style={{ background: t.assignedColor || "#1E88E5" }}
                                                            title={t.assignedToName}
                                                        >
                                                            {initials(t.assignedToName)}
                                                        </span>
                                                    )}
                                                    {!t.releaseVersion && (
                                                        <button
                                                            className={`${styles.releaseToggle} ${
                                                                t.includeInRelease ? styles.releaseToggleActive : ""
                                                            }`}
                                                            onClick={() => onToggleRelease(t)}
                                                            title={t.includeInRelease ? "Quitar de la versión" : "Agregar a la próxima versión"}
                                                        >
                                                            🚀
                                                        </button>
                                                    )}
                                                    <button className={styles.iconBtn} onClick={() => setDetail(t)}>
                                                        👁
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* ============ RELEASE VIEW ============ */}
                {view === "release" && (
                    <div className={styles.twoCol}>
                        <div className={styles.section}>
                            <div className={styles.formCard}>
                                <div className={styles.formBody}>
                                    <h2 className={styles.sectionTitle}>
                                        <span className={`${styles.dotMarker} ${styles.dotPurple}`}></span>
                                        Cola para la próxima versión
                                        <span className={styles.countBadge}>{releaseQueue.length}</span>
                                    </h2>
                                    {releaseQueue.length === 0 ? (
                                        <div className={styles.emptyBox}>
                                            Aún no has marcado tareas para la próxima versión.
                                        </div>
                                    ) : (
                                        <div className={styles.section}>
                                            {releaseQueue.map((t) => (
                                                <article key={t.id} className={styles.releaseQueueCard}>
                                                    <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                                                        <div
                                                            style={{
                                                                width: 32,
                                                                height: 32,
                                                                background: "rgba(139,92,246,0.12)",
                                                                color: "#6d28d9",
                                                                borderRadius: "var(--radius-md)",
                                                                display: "grid",
                                                                placeItems: "center",
                                                            }}
                                                        >
                                                            🚀
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div
                                                                style={{
                                                                    display: "flex",
                                                                    gap: "0.4rem",
                                                                    flexWrap: "wrap",
                                                                    alignItems: "center",
                                                                }}
                                                            >
                                                                <span className={styles.projectChip}>
                                                                    {t.category === "project" ? "Proyecto" : "Día a día"}
                                                                </span>
                                                                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                                                    Resuelta {fmtDate(t.completedAt)}
                                                                </span>
                                                            </div>
                                                            <button
                                                                className={styles.taskTitle}
                                                                style={{
                                                                    background: "transparent",
                                                                    border: "none",
                                                                    padding: 0,
                                                                    fontSize: "0.95rem",
                                                                    marginTop: "0.2rem",
                                                                }}
                                                                onClick={() => setDetail(t)}
                                                            >
                                                                {t.title}
                                                            </button>
                                                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                                                                {t.client} · {t.modules} · resuelta por{" "}
                                                                <strong>{t.assignedToName}</strong>
                                                            </div>
                                                        </div>
                                                        {isDev && (
                                                            <button
                                                                className={`${styles.smallBtn} ${styles.smallBtnDanger}`}
                                                                onClick={() => onToggleRelease(t)}
                                                            >
                                                                Quitar
                                                            </button>
                                                        )}
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {isDev && candidates.length > 0 && (
                                <div>
                                    <h2 className={styles.sectionTitle}>
                                        <span className={`${styles.dotMarker} ${styles.dotGreen}`}></span>
                                        Candidatas resueltas
                                        <span className={styles.countBadge}>
                                            {candidates.length - releaseQueue.length} disponibles
                                        </span>
                                    </h2>
                                    <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 0.5rem 0" }}>
                                        Marca con 🚀 las que deban entrar en{" "}
                                        <strong style={{ color: "#6d28d9", fontFamily: "monospace" }}>{nextVersion}</strong>.
                                    </p>
                                    <div className={styles.subRowList}>
                                        {candidates.map((t) => (
                                            <div key={t.id} className={styles.subRow}>
                                                <button
                                                    className={`${styles.releaseToggle} ${
                                                        t.includeInRelease ? styles.releaseToggleActive : ""
                                                    }`}
                                                    onClick={() => onToggleRelease(t)}
                                                >
                                                    🚀
                                                </button>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <button
                                                        className={styles.taskTitle}
                                                        style={{
                                                            background: "transparent",
                                                            border: "none",
                                                            padding: 0,
                                                            fontSize: "0.9rem",
                                                            textAlign: "left",
                                                            width: "100%",
                                                        }}
                                                        onClick={() => setDetail(t)}
                                                    >
                                                        {t.title}
                                                    </button>
                                                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                                        {t.client} · {t.modules || "—"}
                                                        {t.assignedToName ? ` · ${t.assignedToName}` : ""}
                                                    </div>
                                                </div>
                                                <span className={styles.projectChip}>
                                                    {t.category === "project" ? "Proyecto" : "Día a día"}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Published history */}
                            {versions.length > 0 && (
                                <div>
                                    <h2 className={styles.sectionTitle}>
                                        <span className={`${styles.dotMarker} ${styles.dotGreen}`}></span>
                                        Historial de versiones
                                    </h2>
                                    <div className={styles.section}>
                                        {versions.map((v) => (
                                            <article key={v.version} className="card-panel" style={{ overflow: "hidden" }}>
                                                <div
                                                    style={{
                                                        padding: "1rem",
                                                        borderBottom: "1px solid var(--border-color)",
                                                        display: "flex",
                                                        gap: "0.75rem",
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            width: 44,
                                                            height: 44,
                                                            borderRadius: "var(--radius-md)",
                                                            background: "linear-gradient(135deg, #4ade80, #16a34a)",
                                                            color: "white",
                                                            display: "grid",
                                                            placeItems: "center",
                                                            fontSize: "1.2rem",
                                                        }}
                                                    >
                                                        🎉
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "1.05rem" }}>
                                                            {v.version}
                                                        </div>
                                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                                            Publicada {fmtDate(v.releasedAt)} · {v.tasks.length} mejora(s)
                                                        </div>
                                                    </div>
                                                </div>
                                                {v.tasks.map((t) => (
                                                    <button
                                                        key={t.id}
                                                        className={styles.subRow}
                                                        onClick={() => setDetail(t)}
                                                        style={{
                                                            background: "transparent",
                                                            border: "none",
                                                            width: "100%",
                                                            textAlign: "left",
                                                            cursor: "pointer",
                                                            fontFamily: "inherit",
                                                            color: "var(--text-main)",
                                                        }}
                                                    >
                                                        <span style={{ color: "#22c55e" }}>✓</span>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>{t.title}</div>
                                                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                                                {t.client} · {t.modules || "—"}
                                                            </div>
                                                        </div>
                                                        <span className={styles.projectChip}>
                                                            {t.category === "project" ? "Proyecto" : "Día a día"}
                                                        </span>
                                                    </button>
                                                ))}
                                            </article>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Publish panel */}
                        <aside className={styles.section}>
                            <div className={styles.publishCard}>
                                <h3 className={styles.sectionTitle}>
                                    <span className={`${styles.dotMarker} ${styles.dotPurple}`}></span>
                                    Publicar versión
                                </h3>
                                {isDev ? (
                                    <>
                                        <label className={styles.label}>Tag de versión</label>
                                        <input
                                            className={`${styles.input} ${styles.versionInput}`}
                                            value={nextVersion}
                                            onChange={(e) => setNextVersion(e.target.value)}
                                            placeholder="v1.0.0"
                                        />
                                        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                                            Se aplicará a las {releaseQueue.length} tarea(s) de la cola.
                                        </p>
                                        <button
                                            className="btn btn-primary"
                                            disabled={!releaseQueue.length || !nextVersion.trim()}
                                            onClick={() => setConfirmPublish(true)}
                                            style={{ width: "100%", marginTop: "0.75rem" }}
                                        >
                                            🚀 Publicar {nextVersion}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <p style={{ fontSize: "0.85rem" }}>
                                            Solo los desarrolladores pueden publicar versiones.
                                        </p>
                                        <div className={styles.detailField} style={{ marginTop: "0.5rem" }}>
                                            <div className={styles.label}>Próxima versión</div>
                                            <div style={{ fontFamily: "monospace", fontWeight: 700, color: "#6d28d9" }}>
                                                {nextVersion}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="card-panel" style={{ padding: "1rem" }}>
                                <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>💡 Cómo funciona</div>
                                <ul
                                    style={{
                                        fontSize: "0.78rem",
                                        color: "var(--text-secondary)",
                                        lineHeight: 1.5,
                                        paddingLeft: "1.1rem",
                                        margin: 0,
                                    }}
                                >
                                    <li>Resuelve una tarea en tu pila.</li>
                                    <li>Si merece ir al sistema, márcala con 🚀.</li>
                                    <li>Cuando la cola esté lista, publica la versión.</li>
                                </ul>
                            </div>
                        </aside>
                    </div>
                )}

                {/* ============ ARCHIVE VIEW ============ */}
                {view === "archive" && (
                    <div className={styles.section}>
                        <div className="card-panel" style={{ padding: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                            <input
                                className={styles.input}
                                placeholder="Buscar por título, cliente, módulo, reporter…"
                                value={archiveQuery}
                                onChange={(e) => setArchiveQuery(e.target.value)}
                                style={{ flex: 1, minWidth: "260px" }}
                            />
                            <select
                                className={styles.select}
                                value={archiveWeek}
                                onChange={(e) => setArchiveWeek(e.target.value)}
                                style={{ maxWidth: "260px" }}
                            >
                                <option value="all">Todas las semanas</option>
                                {archiveWeeks.map((w) => (
                                    <option key={w} value={w}>
                                        {weekLabel(w)}
                                    </option>
                                ))}
                            </select>
                            <div className={styles.filterGroup}>
                                {(["all", "daily", "project"] as const).map((c) => (
                                    <button
                                        key={c}
                                        className={`${styles.filterBtn} ${archiveCategory === c ? styles.filterBtnActive : ""}`}
                                        onClick={() => setArchiveCategory(c)}
                                    >
                                        {c === "all" ? "Todas" : c === "daily" ? "Día a día" : "Proyecto"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {Object.keys(archiveGrouped).length === 0 ? (
                            <div className={styles.emptyBox}>🗂 Sin resultados.</div>
                        ) : (
                            Object.entries(archiveGrouped).map(([wk, items]) => (
                                <section key={wk}>
                                    <h3 className={styles.sectionTitle}>
                                        <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                                            {weekLabel(wk)}
                                        </span>
                                        <span className={styles.countBadge}>{items.length}</span>
                                        {wk === currentWeek && (
                                            <span
                                                className={styles.severityChip}
                                                style={{
                                                    background: "rgba(30,136,229,0.12)",
                                                    color: "var(--primary)",
                                                    borderColor: "rgba(30,136,229,0.3)",
                                                }}
                                            >
                                                Semana actual
                                            </span>
                                        )}
                                    </h3>
                                    <div className={styles.subRowList}>
                                        {items.map((t) => (
                                            <button
                                                key={t.id}
                                                className={styles.subRow}
                                                onClick={() => setDetail(t)}
                                                style={{
                                                    background: "transparent",
                                                    border: "none",
                                                    borderBottom: "1px solid var(--border-color)",
                                                    width: "100%",
                                                    textAlign: "left",
                                                    cursor: "pointer",
                                                    fontFamily: "inherit",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: 32,
                                                        height: 32,
                                                        borderRadius: "var(--radius-md)",
                                                        background:
                                                            t.category === "project"
                                                                ? "rgba(139,92,246,0.12)"
                                                                : "rgba(30,136,229,0.12)",
                                                        color: t.category === "project" ? "#6d28d9" : "var(--primary)",
                                                        border:
                                                            "1px solid " +
                                                            (t.category === "project"
                                                                ? "rgba(139,92,246,0.3)"
                                                                : "rgba(30,136,229,0.3)"),
                                                        display: "grid",
                                                        placeItems: "center",
                                                        fontWeight: 700,
                                                        fontSize: "0.75rem",
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {t.category === "project" ? "P" : "D"}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                                                        <strong style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                                            {t.title}
                                                        </strong>
                                                        <span
                                                            className={`${styles.statusChip} ${
                                                                t.status === "done"
                                                                    ? styles.statusDone
                                                                    : t.status === "in_progress"
                                                                        ? styles.statusInProgress
                                                                        : styles.statusPending
                                                            }`}
                                                        >
                                                            {STATUS_LABEL[t.status]}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                                                        {t.client} · {t.modules || "—"} · reportado por {t.reporter}
                                                    </div>
                                                </div>
                                                {t.assignedToName && (
                                                    <span
                                                        className={styles.userInitials}
                                                        style={{ background: t.assignedColor || "#1E88E5" }}
                                                        title={t.assignedToName}
                                                    >
                                                        {initials(t.assignedToName)}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            ))
                        )}
                    </div>
                )}
            </div>

            {loading && (
                <div className={styles.emptyBox}>Cargando tareas…</div>
            )}

            <TaskDetailModal
                task={detail}
                onClose={() => setDetail(null)}
                tick={tick}
                isDev={isDev}
                identityName={identity.name}
                onChangeCategory={onChangeCategory}
                onAdjustTime={onAdjustTime}
                onSaveDevNotes={onSaveDevNotes}
                onAddSubtask={onAddSubtask}
                onToggleSubtask={onToggleSubtask}
                onEditSubtask={onEditSubtask}
                onRemoveSubtask={onRemoveSubtask}
            />
            <AssignTimeModal
                task={assigning}
                devUser={identity}
                onClose={() => setAssigning(null)}
                onConfirm={confirmAssign}
            />

            {confirmPublish && (
                <ModalShell open={confirmPublish} onClose={() => setConfirmPublish(false)} size="sm">
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🚀</div>
                        <h3 style={{ margin: "0 0 0.5rem 0" }}>Publicar versión</h3>
                        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                            Vas a estampar{" "}
                            <strong style={{ fontFamily: "monospace", color: "#6d28d9" }}>{nextVersion}</strong> con{" "}
                            <strong>{releaseQueue.length}</strong> mejora(s).
                        </p>
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                            <button className="btn btn-ghost" onClick={() => setConfirmPublish(false)} style={{ flex: 1 }}>
                                Cancelar
                            </button>
                            <button className="btn btn-primary" onClick={onPublishRelease} style={{ flex: 1 }}>
                                Confirmar
                            </button>
                        </div>
                    </div>
                </ModalShell>
            )}
        </div>
    );
}
