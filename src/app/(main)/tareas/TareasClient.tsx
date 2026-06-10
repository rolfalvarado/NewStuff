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
import { getAllSystems, type System } from "@/app/actions/get-systems";

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

type View = "stack" | "review" | "release" | "archive";

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
    const days = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    // Cuando hay días, los mostramos delante para que no veamos "159:58:58"
    if (days > 0) return `${days}d ${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Convierte minutos asignados a un formato legible: "45 min", "1h 30m", "1d 4h", "6d 15h", "2sem 3d 4h". */
function fmtMinutesHuman(totalMin?: number | null): string {
    if (!totalMin || totalMin <= 0) return "0 min";
    const min = Math.round(totalMin);
    if (min < 60) return `${min} min`;
    const weeks = Math.floor(min / 10080);
    const days = Math.floor((min % 10080) / 1440);
    const hours = Math.floor((min % 1440) / 60);
    const mins = min % 60;
    const parts: string[] = [];
    if (weeks > 0) parts.push(`${weeks} sem`);
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    // Solo mostramos los minutos sueltos cuando la duración es corta (sin días/semanas).
    if (mins > 0 && weeks === 0 && days === 0) parts.push(`${mins}m`);
    return parts.join(" ");
}

// =================== Detección de reportes duplicados ===================
// Compara contra tareas ya resueltas (status === "done") para avisar al
// reporter (soporte/administración) si lo que está describiendo ya fue
// solucionado. El cliente debe coincidir (URL normalizada) y los tokens del
// título/descripción/módulos deben superar un umbral de similitud (Jaccard).

const DUPLICATE_STOPWORDS = new Set([
    "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
    "y", "o", "u", "e", "que", "se", "no", "si", "al", "lo", "le", "les",
    "con", "sin", "por", "para", "en", "a", "es", "son", "fue", "ser",
    "pero", "como", "este", "esta", "estos", "estas", "ese", "esa", "eso",
    "muy", "mas", "mucho", "ya", "hay", "the", "and", "for", "with",
]);

function normalizeClientUrl(raw: string): string {
    return (raw || "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/+$/, "");
}

function tokenizeForDuplicate(text: string): Set<string> {
    const tokens = (text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !DUPLICATE_STOPWORDS.has(t));
    return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    a.forEach((t) => { if (b.has(t)) inter++; });
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
}

export interface DuplicateCandidate {
    task: Task;
    score: number;
}

/**
 * Devuelve hasta 3 tareas ya resueltas que se parezcan al borrador.
 * Match obligatorio: cliente normalizado idéntico.
 * Score: Jaccard sobre tokens de title+description+modules.
 */
function findDuplicateCandidates(
    draft: { title: string; description: string; modules: string; client: string },
    tasks: Task[],
    minScore = 0.25,
    limit = 3
): DuplicateCandidate[] {
    const client = normalizeClientUrl(draft.client);
    if (!client) return [];
    const draftTokens = tokenizeForDuplicate(
        `${draft.title} ${draft.description} ${draft.modules}`
    );
    if (draftTokens.size < 2) return [];

    const candidates: DuplicateCandidate[] = [];
    for (const t of tasks) {
        if (t.status !== "done") continue;
        if (normalizeClientUrl(t.client) !== client) continue;
        const tt = tokenizeForDuplicate(`${t.title} ${t.description} ${t.modules}`);
        const score = jaccard(draftTokens, tt);
        if (score >= minScore) candidates.push({ task: t, score });
    }
    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.task.completedAt || 0) - (a.task.completedAt || 0);
    });
    return candidates.slice(0, limit);
}

const DUPLICATE_BLOCK_SCORE = 0.5;

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
                    Transcurrido {fmtMs(elapsed)} / Asignado {fmtMinutesHuman(task.estimateMinutes)}
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
    onSendToReview,
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
    onSendToReview?: (t: Task) => void;
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
                    <span className={styles.metaItem} title={fmtDate(task.createdAt)}>
                        📅 {new Date(task.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
                    </span>
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
                        {mode === "dev" && !isDone && !task.review?.active && (
                            <button
                                className={styles.smallBtn}
                                onClick={() => onSendToReview?.(task)}
                                title="Devolver el reporte a soporte / administración"
                            >
                                ↪ Devolver a soporte
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
    onChangeCategory,
    onAdjustTime,
    onChangeResponsable,
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
    onChangeCategory: (t: Task) => void;
    onAdjustTime: (t: Task, newMinutes: number) => void;
    onChangeResponsable: (t: Task, newName: string) => void;
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
    const [editingResponsable, setEditingResponsable] = useState(false);
    const [responsableDraft, setResponsableDraft] = useState("");

    // Sólo sincronizamos cuando cambia LA TAREA visualizada (no cada vez que llega un update del polling).
    useEffect(() => {
        if (task) {
            setAdjustValue(task.estimateMinutes || 0);
            setNotesDraft(task.devNotes || "");
            setNewSubtask("");
            setEditingSubId(null);
        }
    }, [task?.id]);

    // Cuando el padre actualiza estimateMinutes (al guardar +/-) reflejamos el nuevo valor en el input.
    useEffect(() => {
        if (task?.estimateMinutes != null) setAdjustValue(task.estimateMinutes);
    }, [task?.estimateMinutes]);

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
        const current = task.estimateMinutes || 0;
        const next = Math.max(1, current + deltaMin);
        if (next === current) return;
        onAdjustTime(task, next);
    };

    const saveCustomTime = () => {
        const v = Math.max(1, Math.round(adjustValue || 0));
        if (!v || v === task.estimateMinutes) return;
        onAdjustTime(task, v);
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

            {task.review?.active && (
                <div
                    style={{
                        background: "rgba(255, 107, 53, 0.08)",
                        border: "1px solid rgba(255, 107, 53, 0.35)",
                        borderRadius: "var(--radius-md)",
                        padding: "0.75rem 0.9rem",
                        marginBottom: "1rem",
                        fontSize: "0.85rem",
                    }}
                >
                    <div style={{ fontWeight: 700, color: "#c2410c", marginBottom: "0.35rem" }}>
                        ↩ Devuelto a soporte
                    </div>
                    <div style={{ color: "var(--text-main)" }}>
                        Responsable: <strong>{task.review.responsable || "—"}</strong>
                    </div>
                    <div style={{ color: "var(--text-secondary)", marginTop: "0.25rem", whiteSpace: "pre-wrap" }}>
                        Motivo: {task.review.reason || "—"}
                    </div>
                    <div style={{ color: "var(--text-muted)", marginTop: "0.35rem", fontSize: "0.75rem" }}>
                        Devuelto por {task.review.movedBy || "—"} · {fmtAgo(task.review.movedAt)}
                    </div>
                </div>
            )}

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
                            <> · <strong style={{ color: "var(--text-main)" }}>{fmtMinutesHuman(task.estimateMinutes)}</strong></>
                        )}
                    </div>

                    {/* Quick deltas */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "0.5rem" }}>
                        {[-60, -30, -15, +15, +30, +60, +120].map((d) => {
                            const wouldBe = (task.estimateMinutes || 0) + d;
                            const blocked = d < 0 && wouldBe < 1;
                            return (
                                <button
                                    key={d}
                                    type="button"
                                    className={styles.smallBtn}
                                    onClick={() => adjust(d)}
                                    disabled={blocked}
                                    title={
                                        blocked
                                            ? "No se puede dejar la tarea en menos de 1 minuto"
                                            : d > 0
                                                ? `Sumar ${d} min (queda en ${wouldBe} min)`
                                                : `Restar ${Math.abs(d)} min (queda en ${wouldBe} min)`
                                    }
                                >
                                    {d > 0 ? `+${d}m` : `${d}m`}
                                </button>
                            );
                        })}
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
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    saveCustomTime();
                                }
                            }}
                            className={styles.input}
                            style={{ maxWidth: "120px", fontFamily: "monospace" }}
                        />
                        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>min</span>
                        <button
                            type="button"
                            className={`${styles.smallBtn} ${styles.smallBtnPrimary}`}
                            onClick={saveCustomTime}
                            disabled={!adjustValue || adjustValue === task.estimateMinutes}
                            title={
                                adjustValue === task.estimateMinutes
                                    ? "Ningún cambio respecto al valor actual"
                                    : "Guardar nuevo tiempo"
                            }
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
                    {editingResponsable ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                            <span
                                className={styles.userInitials}
                                style={{ background: task.assignedColor || "#1E88E5" }}
                            >
                                {initials(responsableDraft || task.assignedToName)}
                            </span>
                            <input
                                className={styles.input}
                                value={responsableDraft}
                                autoFocus
                                maxLength={80}
                                onChange={(e) => setResponsableDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        const v = responsableDraft.trim();
                                        if (v.length >= 2 && v !== task.assignedToName) {
                                            onChangeResponsable(task, v);
                                        }
                                        setEditingResponsable(false);
                                    }
                                    if (e.key === "Escape") {
                                        setEditingResponsable(false);
                                    }
                                }}
                                style={{ maxWidth: "240px" }}
                            />
                            <button
                                type="button"
                                className={`${styles.smallBtn} ${styles.smallBtnPrimary}`}
                                onClick={() => {
                                    const v = responsableDraft.trim();
                                    if (v.length >= 2 && v !== task.assignedToName) {
                                        onChangeResponsable(task, v);
                                    }
                                    setEditingResponsable(false);
                                }}
                                disabled={
                                    responsableDraft.trim().length < 2 ||
                                    responsableDraft.trim() === task.assignedToName
                                }
                            >
                                Guardar
                            </button>
                            <button
                                type="button"
                                className={styles.smallBtn}
                                onClick={() => setEditingResponsable(false)}
                            >
                                Cancelar
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span
                                className={styles.userInitials}
                                style={{ background: task.assignedColor || "#1E88E5" }}
                            >
                                {initials(task.assignedToName)}
                            </span>
                            <strong>{task.assignedToName}</strong>
                            {isDev && task.status !== "done" && (
                                <button
                                    type="button"
                                    className={styles.smallBtn}
                                    onClick={() => {
                                        setResponsableDraft(task.assignedToName || "");
                                        setEditingResponsable(true);
                                    }}
                                    title="Cambiar nombre del responsable"
                                    style={{ padding: "0.25rem 0.5rem" }}
                                >
                                    ✎ Editar
                                </button>
                            )}
                            {task.estimateMinutes && (
                                <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
                                    Asignado:{" "}
                                    <strong style={{ color: "var(--text-main)" }}>
                                        {fmtMinutesHuman(task.estimateMinutes)}
                                    </strong>
                                </span>
                            )}
                        </div>
                    )}
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
    onConfirm: (
        minutes: number,
        responsable: string,
        initialSubtasks: string[],
        finalCategory: TaskCategory
    ) => void;
}) {
    const [custom, setCustom] = useState(60);
    const [hours, setHours] = useState(8);
    const [responsable, setResponsable] = useState("");
    const [initialSubtasks, setInitialSubtasks] = useState<string[]>([]);
    const [newStep, setNewStep] = useState("");
    const [asProject, setAsProject] = useState(false);

    useEffect(() => {
        if (task) {
            setCustom(60);
            setHours(8);
            // No pre-llenamos: queremos forzar que el dev escriba SU nombre,
            // no el genérico de la cuenta compartida.
            setResponsable("");
            setInitialSubtasks([]);
            setNewStep("");
            setAsProject(task.category === "project");
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
        onConfirm(
            mins,
            responsable.trim(),
            initialSubtasks,
            asProject ? "project" : "daily"
        );
    };

    const addStep = () => {
        const t = newStep.trim();
        if (!t) return;
        setInitialSubtasks((prev) => [...prev, t.substring(0, 240)]);
        setNewStep("");
    };
    const removeStep = (idx: number) =>
        setInitialSubtasks((prev) => prev.filter((_, i) => i !== idx));
    const updateStep = (idx: number, value: string) =>
        setInitialSubtasks((prev) => prev.map((s, i) => (i === idx ? value : s)));

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
                <div className={styles.label}>Responsable *</div>
                <input
                    type="text"
                    className={styles.input}
                    placeholder="Tu nombre (obligatorio)"
                    value={responsable}
                    onChange={(e) => setResponsable(e.target.value)}
                    maxLength={80}
                    autoFocus
                />
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    Identifica quién está tomando esta tarea (para que el equipo y soporte sepan a quién contactar).
                </div>
                {!canConfirm && (
                    <div className={styles.fieldError}>
                        Indica tu nombre para tomar la tarea (mínimo 2 caracteres).
                    </div>
                )}
            </div>

            {/* Tipo de tarea (Día a día vs Proyecto) */}
            <div className={styles.detailField} style={{ marginTop: "0.6rem" }}>
                <div className={styles.label}>Clasificación</div>
                <div className={styles.categoryRow}>
                    <button
                        type="button"
                        className={`${styles.categoryBtn} ${
                            !asProject ? styles.categoryBtnActiveDaily : ""
                        }`}
                        onClick={() => setAsProject(false)}
                    >
                        <div className={styles.categoryTitle}>⚡ Día a día</div>
                        <div className={styles.categoryHint}>Bug / fix de la semana</div>
                    </button>
                    <button
                        type="button"
                        className={`${styles.categoryBtn} ${
                            asProject ? styles.categoryBtnActiveProject : ""
                        }`}
                        onClick={() => setAsProject(true)}
                    >
                        <div className={styles.categoryTitle}>🛠 Proyecto</div>
                        <div className={styles.categoryHint}>Desarrollo a largo plazo</div>
                    </button>
                </div>
                {asProject !== (task.category === "project") && (
                    <div style={{ fontSize: "0.72rem", color: "var(--primary)", marginTop: "0.4rem" }}>
                        Al confirmar se reclasificará la tarea como{" "}
                        <strong>{asProject ? "Proyecto" : "Día a día"}</strong>.
                    </div>
                )}
            </div>

            {/* Pasos iniciales (opcional) */}
            <div className={styles.detailField} style={{ marginTop: "0.6rem" }}>
                <div className={styles.label}>Pasos iniciales (opcional)</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                    Divide la tarea en pasos antes de empezar. Podrás añadir o ajustar más pasos después.
                </div>

                {initialSubtasks.length > 0 && (
                    <div className={styles.subtaskList} style={{ marginBottom: "0.5rem" }}>
                        {initialSubtasks.map((s, idx) => (
                            <div key={idx} className={styles.subtaskItem}>
                                <span style={{ width: 18, textAlign: "center", color: "var(--text-muted)", fontSize: "0.78rem" }}>
                                    {idx + 1}.
                                </span>
                                <input
                                    className={styles.subtaskTitle}
                                    value={s}
                                    onChange={(e) => updateStep(idx, e.target.value)}
                                    placeholder="Paso…"
                                />
                                <button
                                    type="button"
                                    className={styles.iconBtn}
                                    onClick={() => removeStep(idx)}
                                    title="Quitar paso"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className={styles.subtaskAdd}>
                    <span style={{ color: "var(--text-muted)" }}>＋</span>
                    <input
                        className={styles.subtaskAddInput}
                        placeholder="Añadir paso… (Enter)"
                        value={newStep}
                        onChange={(e) => setNewStep(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                addStep();
                            }
                        }}
                        maxLength={240}
                    />
                    {newStep.trim().length > 0 && (
                        <button
                            type="button"
                            className={`${styles.smallBtn} ${styles.smallBtnPrimary}`}
                            onClick={addStep}
                        >
                            Añadir
                        </button>
                    )}
                </div>
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

// =================== SendToReviewModal ===================
function SendToReviewModal({
    task,
    devUser,
    onClose,
    onConfirm,
}: {
    task: Task | null;
    devUser: TareasIdentity | null;
    onClose: () => void;
    onConfirm: (responsable: string, reason: string) => void;
}) {
    const [responsable, setResponsable] = useState("");
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (task) {
            setResponsable("");
            setReason("");
            setSubmitting(false);
        }
    }, [task?.id]);

    if (!task) return null;

    const canConfirm =
        responsable.trim().length >= 2 && reason.trim().length >= 3 && !submitting;

    const submit = () => {
        if (!canConfirm) return;
        setSubmitting(true);
        onConfirm(responsable.trim(), reason.trim());
    };

    return (
        <ModalShell open={!!task} onClose={onClose} title="Devolver a soporte" size="md">
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                Vas a devolver{" "}
                <strong style={{ color: "var(--text-main)" }}>"{task.title}"</strong> a soporte /
                administración. Saldrá de la pila activa (y se pausará el cronómetro si corre)
                hasta que soporte o administración lo reactive.
            </p>

            <div className={styles.detailField}>
                <div className={styles.label}>Responsable *</div>
                <input
                    type="text"
                    className={styles.input}
                    placeholder="¿Quién de soporte / administración se hace cargo?"
                    value={responsable}
                    onChange={(e) => setResponsable(e.target.value)}
                    maxLength={120}
                    autoFocus
                />
                {responsable.trim().length > 0 && responsable.trim().length < 2 && (
                    <div className={styles.fieldError}>Indica un responsable (mínimo 2 caracteres).</div>
                )}
            </div>

            <div className={styles.detailField} style={{ marginTop: "0.6rem" }}>
                <div className={styles.label}>Motivo *</div>
                <textarea
                    className={styles.textarea}
                    placeholder="¿Por qué lo devuelves? (ej: falta información, hay que validar con el cliente, depende de otra área…)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    maxLength={2000}
                />
                {reason.trim().length > 0 && reason.trim().length < 3 && (
                    <div className={styles.fieldError}>Describe brevemente el motivo.</div>
                )}
            </div>

            {devUser && (
                <div style={{ marginTop: "0.75rem", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                    Lo devuelve{" "}
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

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem" }}>
                <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>
                    Cancelar
                </button>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={submit}
                    disabled={!canConfirm}
                    style={{ flex: 1 }}
                >
                    {submitting ? "Devolviendo…" : "Devolver a soporte"}
                </button>
            </div>
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
    const [reviewing, setReviewing] = useState<Task | null>(null);
    const [filter, setFilter] = useState<"all" | "mine" | "free">("all");
    const [formOpen, setFormOpen] = useState(true);
    const [touched, setTouched] = useState(false);
    const [archiveQuery, setArchiveQuery] = useState("");
    const [archiveCategory, setArchiveCategory] = useState<"all" | "daily" | "project">("all");
    const [archiveWeek, setArchiveWeek] = useState<string>("all");
    // "all" = sin filtro · "none" = tareas sin versión · "<vX.Y.Z>" = una versión concreta
    const [archiveVersion, setArchiveVersion] = useState<string>("all");
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
        reporterName: "",
        category: "daily" as TaskCategory,
        severity: "medium" as Severity,
    });

    // Pre-rellena con el último nombre tipeado (persistido en localStorage).
    // No usamos identity.name porque la cuenta de soporte es compartida y eso
    // hacía que el usuario enviara reportes con "Soporte" sin identificarse.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const saved = window.localStorage.getItem("tareas:reporterName") || "";
        if (saved) setForm((f) => (f.reporterName ? f : { ...f, reporterName: saved }));
    }, []);

    // Permite abrir la vista Archivo pre-filtrada por cliente desde otros módulos
    // (p.ej. desde Sistemas: /tareas?client=https://agenciaespinaca.unabase.com).
    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        const client = params.get("client");
        if (client) {
            setArchiveQuery(client);
            setView("archive");
        }
    }, []);

    // Buscador de clientes (lista de sistemas) para el campo Cliente del formulario.
    // Se carga la primera vez que el usuario hace foco en el input.
    const [clientList, setClientList] = useState<System[]>([]);
    const [clientListLoading, setClientListLoading] = useState(false);
    const [clientListLoaded, setClientListLoaded] = useState(false);
    const [clientSearchOpen, setClientSearchOpen] = useState(false);
    const [clientHighlightIdx, setClientHighlightIdx] = useState(0);
    const clientSearchRef = useRef<HTMLDivElement | null>(null);

    const ensureClientListLoaded = useCallback(async () => {
        if (clientListLoaded || clientListLoading) return;
        setClientListLoading(true);
        try {
            const all = await getAllSystems();
            setClientList(all);
            setClientListLoaded(true);
        } catch (e) {
            console.error("No se pudo cargar la lista de clientes", e);
        } finally {
            setClientListLoading(false);
        }
    }, [clientListLoaded, clientListLoading]);

    // Cargamos la lista al montar para que la validación del campo "Cliente"
    // (debe coincidir con un sistema existente) funcione aunque el usuario
    // no haga foco en el input.
    useEffect(() => {
        if (isDev) return;
        ensureClientListLoaded();
    }, [isDev, ensureClientListLoaded]);

    /** El cliente sólo es válido si coincide (case-insensitive) con la url_sitio
     *  de algún sistema cargado. Mientras la lista se está cargando devolvemos
     *  `false` para evitar enviar datos sueltos. */
    const isClientValid = useMemo(() => {
        const v = form.client.trim().toLowerCase();
        if (!v) return false;
        if (!clientListLoaded) return false;
        return clientList.some((s) => (s.url_sitio || "").toLowerCase() === v);
    }, [clientList, clientListLoaded, form.client]);

    // Cierre por click fuera del combo de clientes.
    useEffect(() => {
        if (!clientSearchOpen) return;
        const handler = (e: MouseEvent) => {
            if (!clientSearchRef.current) return;
            if (!clientSearchRef.current.contains(e.target as Node)) {
                setClientSearchOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [clientSearchOpen]);

    const clientSuggestions = useMemo(() => {
        const q = form.client.trim().toLowerCase();
        const items = clientList.filter((s) => s.url_sitio !== "dynamodb_local_backup");
        if (!q) return items.slice(0, 30);
        return items
            .filter((s) =>
                (s.nombre_empresa && s.nombre_empresa.toLowerCase().includes(q)) ||
                (s.url_sitio && s.url_sitio.toLowerCase().includes(q))
            )
            .slice(0, 30);
    }, [clientList, form.client]);

    // ===== Detección de reportes duplicados =====
    // Borrador debounceado para no recalcular en cada tecla.
    const [draftForDuplicate, setDraftForDuplicate] = useState({
        title: "",
        description: "",
        modules: "",
        client: "",
    });
    const [dismissedDuplicateIds, setDismissedDuplicateIds] = useState<Set<string>>(new Set());
    useEffect(() => {
        const id = setTimeout(() => {
            setDraftForDuplicate({
                title: form.title,
                description: form.description,
                modules: form.modules,
                client: form.client,
            });
        }, 400);
        return () => clearTimeout(id);
    }, [form.title, form.description, form.modules, form.client]);

    const duplicateCandidates = useMemo<DuplicateCandidate[]>(() => {
        if (isDev) return [];
        const list = findDuplicateCandidates(draftForDuplicate, tasks);
        return list.filter((c) => !dismissedDuplicateIds.has(c.task.id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draftForDuplicate, tasks, dismissedDuplicateIds]);

    const hasBlockingDuplicate = useMemo(
        () => duplicateCandidates.some((c) => c.score >= DUPLICATE_BLOCK_SCORE),
        [duplicateCandidates]
    );

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

    // ===== Notificaciones del navegador =====
    // Solicita permiso una sola vez al montar (si no está concedido / denegado).
    useEffect(() => {
        if (typeof window === "undefined" || !("Notification" in window)) return;
        if (Notification.permission === "default") {
            Notification.requestPermission().catch(() => {});
        }
    }, []);

    const notifyBrowser = useCallback(
        (title: string, body: string, tag: string) => {
            try {
                if (
                    typeof window !== "undefined" &&
                    "Notification" in window &&
                    Notification.permission === "granted" &&
                    document.visibilityState !== "visible"
                ) {
                    const n = new Notification(title, {
                        body,
                        icon: "/logo.png",
                        tag,
                    });
                    // Auto-cierre después de 8 s y al click foco la pestaña
                    n.onclick = () => {
                        window.focus();
                        n.close();
                    };
                    setTimeout(() => n.close(), 8000);
                }
            } catch (e) {
                console.warn("Notification error:", e);
            }
        },
        []
    );

    // Mapa con el último estado conocido por id, para detectar cambios entre polls.
    const prevTasksRef = useRef<Map<string, { status: string; reporterId: string }>>(new Map());
    const primedRef = useRef(false);

    useEffect(() => {
        // Esperamos a que la carga inicial termine. Si "primamos" con el array
        // vacío del primer render, cuando llegue la lista real cada tarea se
        // detectaría como nueva y dispararía un toast por cada una al entrar.
        if (loading) return;

        const next = new Map(
            tasks.map((t) => [t.id, { status: t.status, reporterId: t.reporterId }])
        );

        // Primer render con datos reales: solo guardamos snapshot, sin notificar.
        if (!primedRef.current) {
            primedRef.current = true;
            prevTasksRef.current = next;
            return;
        }
        const prev = prevTasksRef.current;

        for (const t of tasks) {
            const before = prev.get(t.id);

            // 1) Tarea nueva (no existía en el snapshot anterior)
            if (!before) {
                if (isDev) {
                    const body = `${t.title}${t.client ? ` · ${t.client}` : ""}`;
                    pushToast({ title: "📩 Nuevo reporte", msg: body, kind: "info" });
                    notifyBrowser("Nuevo reporte", body, `tarea-nueva-${t.id}`);
                }
                continue;
            }

            // 2) Pending → in_progress (alguien la tomó)
            if (before.status === "pending" && t.status === "in_progress") {
                const who = t.assignedToName || "Alguien";
                const desc = t.description?.trim()
                    ? t.description.trim().slice(0, 140)
                    : t.title;
                if (isDev) {
                    pushToast({
                        title: `🛠 ${who} tomó un reporte`,
                        msg: `${t.title} · ${desc}`,
                        kind: "info",
                    });
                    notifyBrowser(
                        `${who} tomó un reporte`,
                        `${t.title}\n${desc}`,
                        `tarea-taken-dev-${t.id}`
                    );
                }
                if (!isDev && t.reporterId === identity.id) {
                    pushToast({
                        title: `🛠 ${who} está trabajando en tu reporte`,
                        msg: `${t.title} · ${desc}`,
                        kind: "info",
                    });
                    notifyBrowser(
                        `${who} está trabajando en tu reporte`,
                        `${t.title}\n${desc}`,
                        `tarea-taken-${t.id}`
                    );
                }
            }

            // 3) Tarea que pasó a 'done'
            if (before.status !== "done" && t.status === "done") {
                // 2a) Soporte/admin: aviso cuando es un reporte propio
                if (!isDev && t.reporterId === identity.id) {
                    const body = `${t.title}${
                        t.assignedToName ? ` · resuelto por ${t.assignedToName}` : ""
                    }`;
                    pushToast({
                        title: "✅ Tu reporte fue resuelto",
                        msg: body,
                        kind: "success",
                    });
                    notifyBrowser("Tu reporte fue resuelto", body, `tarea-done-${t.id}`);
                }
                // 2b) Dev: aviso al equipo cuando alguien cierra un reporte
                if (isDev) {
                    const who = t.assignedToName || "Alguien";
                    const desc = t.description?.trim()
                        ? t.description.trim().slice(0, 140)
                        : t.title;
                    pushToast({
                        title: `✅ ${who} ha terminado un reporte`,
                        msg: `${t.title} · ${desc}`,
                        kind: "success",
                    });
                    notifyBrowser(
                        `${who} ha terminado un reporte`,
                        `${t.title}\n${desc}`,
                        `tarea-done-dev-${t.id}`
                    );
                }
            }
        }

        prevTasksRef.current = next;
    }, [tasks, loading, isDev, identity.id, pushToast, notifyBrowser]);

    // Detección de tareas que cruzan tiempo cero (estimación agotada).
    // Solo dispara cuando una tarea pasa de remaining > 0 a <= 0 mientras
    // está in_progress, así no spamea por tareas que ya estaban vencidas
    // al entrar al módulo.
    const expiredNotifiedRef = useRef<Set<string>>(new Set());
    const prevRemainingRef = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        for (const t of tasks) {
            if (t.status !== "in_progress" || !t.estimateMinutes) {
                expiredNotifiedRef.current.delete(t.id);
                prevRemainingRef.current.delete(t.id);
                continue;
            }
            const remaining = remainingMs(t, tick);
            const prev = prevRemainingRef.current.get(t.id);
            prevRemainingRef.current.set(t.id, remaining);

            const crossedZero =
                prev !== undefined && prev > 0 && remaining <= 0;
            if (!crossedZero || expiredNotifiedRef.current.has(t.id)) continue;
            expiredNotifiedRef.current.add(t.id);

            const who = t.assignedToName || "El responsable";
            const desc = t.description?.trim()
                ? t.description.trim().slice(0, 140)
                : t.title;

            if (isDev) {
                pushToast({
                    title: `⏰ ${who} agotó el tiempo del reporte`,
                    msg: `${t.title} · ${desc}`,
                    kind: "info",
                });
                notifyBrowser(
                    `${who} agotó el tiempo del reporte`,
                    `${t.title}\n${desc}`,
                    `tarea-expired-dev-${t.id}`
                );
            }
            if (!isDev && t.reporterId === identity.id) {
                pushToast({
                    title: `⏰ ${who} terminó el tiempo asignado a tu reporte`,
                    msg: `${t.title} · ${desc}`,
                    kind: "info",
                });
                notifyBrowser(
                    `${who} terminó el tiempo asignado a tu reporte`,
                    `${t.title}\n${desc}`,
                    `tarea-expired-${t.id}`
                );
            }
        }
    }, [tasks, tick, isDev, identity.id, pushToast, notifyBrowser]);

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
    // Las tareas no resueltas se mantienen visibles aunque cambie la semana;
    // sólo las "done" se acotan a la semana actual (para la sección "Resueltas esta semana").
    const activeTasks = useMemo(
        () =>
            tasks.filter(
                (t) => !t.review?.active && (t.status !== "done" || t.weekKey === currentWeek)
            ),
        [tasks, currentWeek]
    );
    const inReviewTasks = useMemo(
        () =>
            tasks
                .filter((t) => t.review?.active)
                .sort((a, b) => (b.review?.movedAt || 0) - (a.review?.movedAt || 0)),
        [tasks]
    );
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

    // ===== Recordatorio al entrar al módulo =====
    // Cuando el desarrollador abre Tareas, le recordamos UNA sola vez las tareas
    // que ya tomó y siguen en curso, para que las cierre cuanto antes. Saludamos
    // por el nombre del responsable (la cuenta dev es compartida, así que el
    // nombre real está en assignedToName, no en identity.name).
    const reminderShownRef = useRef(false);
    useEffect(() => {
        if (loading || reminderShownRef.current) return;
        if (!isDev) return;
        // Marcamos como mostrado en cuanto la carga inicial termina, así no se
        // vuelve a disparar aunque el polling refresque la lista.
        reminderShownRef.current = true;
        if (inProgressMine.length === 0) return;

        const names = inProgressMine
            .map((t) => t.assignedToName?.trim())
            .filter((n): n is string => !!n);
        const greetName = names[0] || "Equipo";

        if (inProgressMine.length === 1) {
            const t = inProgressMine[0];
            const who = t.assignedToName?.trim() || greetName;
            const title = `📌 ${who}, recuerda tu tarea en curso`;
            const msg = `Tienes "${t.title}" asignada. Intenta sacarla de la lista lo antes posible.`;
            pushToast({ title, msg, kind: "info" });
            notifyBrowser(title, msg, `tarea-recordatorio-${t.id}`);
        } else {
            const n = inProgressMine.length;
            const title = `📌 ${greetName}, tienes ${n} tareas en curso`;
            const titles = inProgressMine.map((t) => t.title);
            const shown = titles.slice(0, 4);
            const extra = n > 4 ? ` y ${n - 4} más` : "";
            const msg = `Recuerda cerrarlas pronto: ${shown.join(" · ")}${extra}.`;
            pushToast({ title, msg, kind: "info" });
            notifyBrowser(
                title,
                `Recuerda cerrarlas pronto:\n${shown.map((x) => `• ${x}`).join("\n")}${extra}`,
                "tarea-recordatorio-multi"
            );
        }
    }, [loading, isDev, inProgressMine, pushToast, notifyBrowser]);

    // ===== Acciones =====
    async function submitForm() {
        setTouched(true);
        if (
            form.title.trim().length < 5 ||
            form.description.trim().length < 10 ||
            !isClientValid ||
            form.reporterName.trim().length < 2
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
        // Confirmación si hay un duplicado fuerte (>= 50% similitud) ya resuelto.
        if (hasBlockingDuplicate) {
            const top = duplicateCandidates[0];
            const when = fmtDate(top.task.completedAt);
            const who = top.task.assignedToName ? ` por ${top.task.assignedToName}` : "";
            const ver = top.task.releaseVersion ? ` (publicado en ${top.task.releaseVersion})` : "";
            const msg =
                `Este reporte podría estar resuelto en ${top.task.client}` +
                ` el ${when}${who}${ver}.\n\n` +
                `Título existente: "${top.task.title}"\n` +
                `Similitud: ${Math.round(top.score * 100)}%\n\n` +
                `¿Enviar igual el nuevo reporte?`;
            const ok = typeof window !== "undefined" ? window.confirm(msg) : true;
            if (!ok) return;
        }
        try {
            // El nombre tipeado en el formulario sustituye al de la sesión como
            // "reporter" (queda visible en el reporte). El reporterId se mantiene
            // ligado a la sesión para que filtros como "tus reportes" sigan funcionando.
            const reporterDisplay = form.reporterName.trim();
            if (typeof window !== "undefined") {
                window.localStorage.setItem("tareas:reporterName", reporterDisplay);
            }
            const created = await TareasAPI.create({
                title: form.title.trim(),
                description: form.description.trim(),
                steps: form.steps.trim(),
                client: form.client.trim(),
                modules: form.modules.trim(),
                category: form.category,
                severity: form.severity,
                reporter: reporterDisplay,
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
                reporterName: reporterDisplay,
                category: "daily",
                severity: "medium",
            });
            setTouched(false);
            setDismissedDuplicateIds(new Set());
            clearPending();
            pushToast({ title: "Reporte enviado", msg: "Se está posicionando en la pila.", kind: "success" });
        } catch (e: any) {
            alert("Error al crear la tarea: " + (e.message || e));
        }
    }

    async function confirmAssign(
        minutes: number,
        responsable: string,
        initialSubtasks: string[] = [],
        finalCategory: TaskCategory = "daily"
    ) {
        if (!assigning) return;
        const name = (responsable || identity.name).trim() || identity.name;

        // Una persona no puede tener dos tareas en curso a la vez. Como la cuenta
        // dev es compartida, distinguimos al responsable por su nombre (assignedToName).
        const normalized = name.toLowerCase();
        const alreadyInProgress = tasks.find(
            (t) =>
                t.id !== assigning.id &&
                t.status === "in_progress" &&
                !t.review?.active && // las devueltas a soporte no cuentan como "en curso"
                (t.assignedToName || "").trim().toLowerCase() === normalized
        );
        if (alreadyInProgress) {
            alert(
                `${name} ya tiene una tarea en curso: "${alreadyInProgress.title}".\n\n` +
                    `Termínala (o cámbiala de responsable) antes de tomar una nueva.`
            );
            return;
        }

        try {
            let updated = await TareasAPI.assign(assigning.id, {
                minutes,
                assignedToId: identity.id,
                assignedToName: name,
                assignedColor: identity.color,
            });

            // Reclasificar si el dev cambió la categoría al tomar la tarea
            if (finalCategory && finalCategory !== updated.category) {
                try {
                    updated = await TareasAPI.update(updated.id, { category: finalCategory });
                } catch (e) {
                    console.error("Error reclasificando categoría al asignar:", e);
                }
            }

            // Crear los pasos iniciales (si los hay) en orden
            const validSteps = initialSubtasks.map((s) => s.trim()).filter(Boolean);
            for (const stepTitle of validSteps) {
                try {
                    updated = await TareasAPI.addSubtask(updated.id, stepTitle, name);
                } catch (e) {
                    console.error("Error creando paso inicial:", e);
                }
            }

            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setAssigning(null);
        } catch (e: any) {
            alert("Error al asignar: " + (e.message || e));
        }
    }

    async function onSendToReview(responsable: string, reason: string) {
        if (!reviewing) return;
        try {
            const u = await TareasAPI.sendToReview(reviewing.id, {
                responsable,
                reason,
                movedBy: identity.name,
                movedById: identity.id,
            });
            setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            setDetail((cur) => (cur && cur.id === u.id ? u : cur));
            setReviewing(null);
            pushToast({
                title: "Reporte devuelto a soporte",
                msg: `Responsable: ${responsable}`,
                kind: "info",
            });
        } catch (e: any) {
            alert("Error al devolver a soporte: " + (e.message || e));
            setReviewing(null);
        }
    }
    async function onReturnFromReview(t: Task) {
        if (isDev) return; // sólo soporte/administración reactiva
        if (!confirm(`¿Reactivar "${t.title}" en la pila activa?`)) return;
        try {
            const u = await TareasAPI.returnFromReview(t.id, {
                resolvedBy: identity.name,
                resolvedById: identity.id,
            });
            setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            setDetail((cur) => (cur && cur.id === u.id ? u : cur));
            pushToast({ title: "Reporte reactivado en la pila", msg: t.title, kind: "success" });
        } catch (e: any) {
            alert("Error al reactivar el reporte: " + (e.message || e));
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
    async function onChangeResponsable(t: Task, newName: string) {
        const name = newName.trim();
        if (name.length < 2 || name === t.assignedToName) return;

        // Misma regla que al tomar: nadie puede quedar con dos tareas en curso.
        if (t.status === "in_progress") {
            const normalized = name.toLowerCase();
            const clash = tasks.find(
                (x) =>
                    x.id !== t.id &&
                    x.status === "in_progress" &&
                    !x.review?.active && // las devueltas a soporte no cuentan como "en curso"
                    (x.assignedToName || "").trim().toLowerCase() === normalized
            );
            if (clash) {
                alert(
                    `${name} ya tiene una tarea en curso: "${clash.title}".\n\n` +
                        `No puede quedar a cargo de dos tareas en curso al mismo tiempo.`
                );
                return;
            }
        }

        try {
            const u = await TareasAPI.update(t.id, { assignedToName: name });
            setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
            setDetail((cur) => (cur && cur.id === u.id ? u : cur));
            pushToast({
                title: "Responsable actualizado",
                msg: `Ahora a cargo: ${name}`,
                kind: "success",
            });
        } catch (e: any) {
            alert("Error al cambiar responsable: " + (e.message || e));
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

    // Versiones publicadas presentes en el archivo (orden descendente por SemVer-ish).
    const archiveVersions = useMemo(() => {
        const set = new Set<string>();
        tasks.forEach((t) => {
            if (t.releaseVersion) set.add(t.releaseVersion);
        });
        const arr = Array.from(set);
        const parse = (v: string) =>
            v
                .replace(/^v/i, "")
                .split(".")
                .map((n) => Number(n) || 0);
        arr.sort((a, b) => {
            const pa = parse(a);
            const pb = parse(b);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const da = pa[i] || 0;
                const db = pb[i] || 0;
                if (da !== db) return db - da;
            }
            return 0;
        });
        return arr;
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
                if (archiveVersion === "all") return true;
                if (archiveVersion === "none") return !t.releaseVersion;
                return t.releaseVersion === archiveVersion;
            })
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
    }, [tasks, archiveQuery, archiveWeek, archiveCategory, archiveVersion]);

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

                <div style={{ display: "flex", alignItems: "center", gap: "0", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", backgroundColor: "var(--bg-card)", overflow: "hidden", marginLeft: "auto" }}>
                    {/* En espera */}
                    <div style={{ minWidth: "90px", textAlign: "center", padding: "0.6rem 1.25rem" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>En espera</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--primary)" }}>
                            {dailyStack.filter((t) => t.status === "pending").length}
                        </div>
                    </div>
                    <div style={{ width: "1px", height: "45px", backgroundColor: "var(--border-color)", flexShrink: 0 }} />
                    {/* En curso */}
                    <div style={{ minWidth: "90px", textAlign: "center", padding: "0.6rem 1.25rem" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>En curso</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "#059669" }}>
                            {activeTasks.filter((t) => t.status === "in_progress").length}
                        </div>
                    </div>
                    <div style={{ width: "1px", height: "45px", backgroundColor: "var(--border-color)", flexShrink: 0 }} />
                    {/* Resueltas */}
                    <div style={{ minWidth: "90px", textAlign: "center", padding: "0.6rem 1.25rem" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Resueltas</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--text-main)" }}>
                            {doneThisWeek.length}
                        </div>
                    </div>
                    <div style={{ width: "1px", height: "45px", backgroundColor: "var(--border-color)", flexShrink: 0 }} />
                    {/* Devueltos */}
                    <div style={{ minWidth: "90px", textAlign: "center", padding: "0.6rem 1.25rem" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Devueltos</div>
                        <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "#c2410c" }}>
                            {inReviewTasks.length}
                        </div>
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
                    className={`${styles.tab} ${view === "review" ? styles.tabActive : ""}`}
                    onClick={() => setView("review")}
                >
                    Devueltos
                    {inReviewTasks.length > 0 && (
                        <span className={styles.countBadge} style={{ marginLeft: "0.4rem" }}>
                            {inReviewTasks.length}
                        </span>
                    )}
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
                                            <label className={styles.label}>Reportado por</label>
                                            <input
                                                className={styles.input}
                                                maxLength={80}
                                                placeholder="Tu nombre"
                                                value={form.reporterName}
                                                onChange={(e) =>
                                                    setForm({ ...form, reporterName: e.target.value })
                                                }
                                            />
                                            <div
                                                style={{
                                                    fontSize: "0.7rem",
                                                    color: "var(--text-muted)",
                                                    marginTop: "0.25rem",
                                                }}
                                            >
                                                Identifica quién está creando este reporte (puede haber varias personas usando esta cuenta).
                                            </div>
                                            {touched && form.reporterName.trim().length < 2 && (
                                                <div className={styles.fieldError}>
                                                    Indica tu nombre (al menos 2 caracteres).
                                                </div>
                                            )}
                                        </div>

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
                                                <label className={styles.label}>Cliente *</label>
                                                <div
                                                    ref={clientSearchRef}
                                                    className={styles.clientSearchWrapper}
                                                >
                                                    <input
                                                        className={styles.input}
                                                        placeholder="Busca por empresa o URL (ej: agenciaespinaca)"
                                                        value={form.client}
                                                        onFocus={() => {
                                                            ensureClientListLoaded();
                                                            setClientSearchOpen(true);
                                                            setClientHighlightIdx(0);
                                                        }}
                                                        onChange={(e) => {
                                                            setForm({ ...form, client: e.target.value });
                                                            setClientSearchOpen(true);
                                                            setClientHighlightIdx(0);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (!clientSearchOpen) return;
                                                            if (e.key === "ArrowDown") {
                                                                e.preventDefault();
                                                                setClientHighlightIdx((i) =>
                                                                    Math.min(i + 1, Math.max(0, clientSuggestions.length - 1))
                                                                );
                                                            } else if (e.key === "ArrowUp") {
                                                                e.preventDefault();
                                                                setClientHighlightIdx((i) => Math.max(0, i - 1));
                                                            } else if (e.key === "Enter") {
                                                                const pick = clientSuggestions[clientHighlightIdx];
                                                                if (pick) {
                                                                    e.preventDefault();
                                                                    setForm((f) => ({ ...f, client: pick.url_sitio }));
                                                                    setClientSearchOpen(false);
                                                                }
                                                            } else if (e.key === "Escape") {
                                                                setClientSearchOpen(false);
                                                            }
                                                        }}
                                                        autoComplete="off"
                                                    />
                                                    {clientSearchOpen && (
                                                        <div className={styles.clientSuggestions}>
                                                            {clientListLoading && (
                                                                <div className={styles.clientSuggestionEmpty}>Cargando…</div>
                                                            )}
                                                            {!clientListLoading && clientSuggestions.length === 0 && (
                                                                <div className={styles.clientSuggestionEmpty}>
                                                                    Sin coincidencias. Debes seleccionar un cliente del listado.
                                                                </div>
                                                            )}
                                                            {!clientListLoading && clientSuggestions.map((s, idx) => {
                                                                const url = s.url_sitio || "";
                                                                const display = /^https?:\/\//i.test(url) ? url : `https://${url}`;
                                                                const active = idx === clientHighlightIdx;
                                                                return (
                                                                    <button
                                                                        key={s.url_sitio}
                                                                        type="button"
                                                                        className={`${styles.clientSuggestionItem} ${active ? styles.clientSuggestionActive : ""}`}
                                                                        onMouseEnter={() => setClientHighlightIdx(idx)}
                                                                        onMouseDown={(e) => {
                                                                            // mousedown evita que el input pierda foco antes del click
                                                                            e.preventDefault();
                                                                            setForm((f) => ({ ...f, client: url }));
                                                                            setClientSearchOpen(false);
                                                                        }}
                                                                    >
                                                                        <span className={styles.clientSuggestionName}>
                                                                            {s.nombre_empresa || "(sin nombre)"}
                                                                        </span>
                                                                        <span className={styles.clientSuggestionUrl}>{display}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                                {touched && !isClientValid && (
                                                    <div className={styles.fieldError}>
                                                        {clientListLoading
                                                            ? "Cargando lista de clientes…"
                                                            : "Selecciona un cliente del listado (no se admite texto libre)."}
                                                    </div>
                                                )}
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

                                        {duplicateCandidates.length > 0 && (
                                            <div className={styles.duplicatePanel}>
                                                <div className={styles.duplicateHeader}>
                                                    <span className={styles.duplicateIcon}>⚠️</span>
                                                    <div>
                                                        <div className={styles.duplicateTitle}>
                                                            Posibles reportes ya resueltos
                                                        </div>
                                                        <div className={styles.duplicateHint}>
                                                            Encontramos {duplicateCandidates.length === 1 ? "1 reporte resuelto" : `${duplicateCandidates.length} reportes resueltos`} en este cliente que se parecen a lo que estás describiendo. Revisa antes de enviar para evitar duplicados.
                                                        </div>
                                                    </div>
                                                </div>
                                                <ul className={styles.duplicateList}>
                                                    {duplicateCandidates.map((c) => {
                                                        const t = c.task;
                                                        const pct = Math.round(c.score * 100);
                                                        const sev = SEVERITY_LABEL[t.severity];
                                                        return (
                                                            <li key={t.id} className={styles.duplicateItem}>
                                                                <div className={styles.duplicateItemMain}>
                                                                    <div className={styles.duplicateItemTop}>
                                                                        <span className={styles.duplicateItemTitle}>{t.title}</span>
                                                                        <span className={styles.duplicateItemScore} title="Similitud léxica">
                                                                            {pct}% similar
                                                                        </span>
                                                                    </div>
                                                                    <div className={styles.duplicateItemMeta}>
                                                                        <span>📅 Resuelto {fmtDate(t.completedAt)}</span>
                                                                        {t.assignedToName && <span>· 👤 {t.assignedToName}</span>}
                                                                        {t.modules && <span>· 🧩 {t.modules}</span>}
                                                                        <span>· 🎯 {sev}</span>
                                                                        {t.releaseVersion && (
                                                                            <span>· 🚀 {t.releaseVersion}</span>
                                                                        )}
                                                                    </div>
                                                                    {t.description && (
                                                                        <div className={styles.duplicateItemDesc}>
                                                                            {t.description.length > 180
                                                                                ? t.description.slice(0, 180) + "…"
                                                                                : t.description}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className={styles.duplicateItemActions}>
                                                                    <button
                                                                        type="button"
                                                                        className={styles.duplicateBtn}
                                                                        onClick={() => setDetail(t)}
                                                                    >
                                                                        Ver detalle
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className={styles.duplicateBtnGhost}
                                                                        onClick={() =>
                                                                            setDismissedDuplicateIds((prev) => {
                                                                                const next = new Set(prev);
                                                                                next.add(t.id);
                                                                                return next;
                                                                            })
                                                                        }
                                                                        title="No es el mismo problema"
                                                                    >
                                                                        Descartar
                                                                    </button>
                                                                </div>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        )}

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
                                                    onSendToReview={(x) => setReviewing(x)}
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
                                            <div className={styles.emptyBox}>Sin desarrollos largos pendientes.</div>
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
                                                    onSendToReview={(x) => setReviewing(x)}
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

                {/* ============ REVIEW VIEW ============ */}
                {view === "review" && (
                    <div className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            <span className={styles.dotMarker} style={{ background: "#ff6b35" }}></span>
                            Devueltos a soporte
                            <span className={styles.countBadge}>{inReviewTasks.length}</span>
                            <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 400 }}>
                                {isDev
                                    ? "Soporte / administración deben reactivarlos en la pila"
                                    : "Reportes que desarrollo te devolvió: esperan tu respuesta"}
                            </span>
                        </h2>

                        {inReviewTasks.length === 0 ? (
                            <div className={styles.emptyBox}>
                                ↩ No hay reportes devueltos a soporte.
                            </div>
                        ) : (
                            <div className={styles.section}>
                                {inReviewTasks.map((t) => (
                                    <article
                                        key={t.id}
                                        className={styles.taskCard}
                                        style={{ borderLeft: "4px solid #ff6b35" }}
                                    >
                                        <div className={styles.taskBody}>
                                            <div className={styles.taskRow}>
                                                <h3
                                                    className={styles.taskTitle}
                                                    onClick={() => setDetail(t)}
                                                >
                                                    {t.title}
                                                </h3>
                                                <span
                                                    className={styles.severityChip}
                                                    style={severityChipStyle(t.severity)}
                                                >
                                                    <span className={styles.dot}></span>
                                                    {SEVERITY_LABEL[t.severity]}
                                                </span>
                                            </div>

                                            <div className={styles.metaRow}>
                                                <span className={styles.metaItem}>📍 <strong>{t.client}</strong></span>
                                                {t.modules && <span className={styles.metaItem}>🧩 {t.modules}</span>}
                                                <span className={styles.metaItem}>👤 {t.reporter}</span>
                                                {t.category === "project" && (
                                                    <span className={styles.projectChip}>PROYECTO</span>
                                                )}
                                            </div>

                                            <div
                                                style={{
                                                    background: "rgba(255, 107, 53, 0.08)",
                                                    border: "1px solid rgba(255, 107, 53, 0.3)",
                                                    borderRadius: "var(--radius-md)",
                                                    padding: "0.6rem 0.75rem",
                                                    marginTop: "0.5rem",
                                                    fontSize: "0.82rem",
                                                }}
                                            >
                                                <div style={{ color: "var(--text-main)" }}>
                                                    Responsable: <strong>{t.review?.responsable || "—"}</strong>
                                                </div>
                                                <div style={{ color: "var(--text-secondary)", marginTop: "0.2rem", whiteSpace: "pre-wrap" }}>
                                                    Motivo: {t.review?.reason || "—"}
                                                </div>
                                                <div style={{ color: "var(--text-muted)", marginTop: "0.3rem", fontSize: "0.72rem" }}>
                                                    Devuelto por {t.review?.movedBy || "—"} · {fmtAgo(t.review?.movedAt)}
                                                </div>
                                            </div>

                                            <div className={styles.actionsRow} style={{ marginTop: "0.6rem" }}>
                                                <div style={{ flex: 1 }} />
                                                <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
                                                    {!isDev && (
                                                        <button
                                                            className={`${styles.smallBtn} ${styles.smallBtnSuccess}`}
                                                            onClick={() => onReturnFromReview(t)}
                                                            title="Reactivar el reporte en la pila activa"
                                                        >
                                                            ↩ Reactivar en la pila
                                                        </button>
                                                    )}
                                                    <button
                                                        className={styles.iconBtn}
                                                        onClick={() => setDetail(t)}
                                                        title="Ver detalle"
                                                    >
                                                        👁
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ============ RELEASE VIEW ============ */}
                {view === "release" && (
                    <div className={styles.twoCol}>
                        <div className={styles.section}>
                            <div className={styles.queueCard}>
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
                                        <div className={styles.releaseQueueList}>
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
                            <select
                                className={styles.select}
                                value={archiveVersion}
                                onChange={(e) => setArchiveVersion(e.target.value)}
                                style={{ maxWidth: "220px" }}
                                title="Filtrar por versión publicada"
                            >
                                <option value="all">Todas las versiones</option>
                                <option value="none">Sin versión asignada</option>
                                {archiveVersions.map((v) => (
                                    <option key={v} value={v}>
                                        {v}
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
                                                        {t.releaseVersion && (
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
                                                        )}
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
                onChangeCategory={onChangeCategory}
                onAdjustTime={onAdjustTime}
                onChangeResponsable={onChangeResponsable}
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
            <SendToReviewModal
                task={reviewing}
                devUser={identity}
                onClose={() => setReviewing(null)}
                onConfirm={onSendToReview}
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
