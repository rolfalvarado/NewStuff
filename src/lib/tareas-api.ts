// Cliente del módulo TAREAS — usa /api/tareas-proxy que llega a lisboa.unabase.com

export type TaskCategory = "daily" | "project";
export type TaskStatus = "pending" | "in_progress" | "done";
export type Severity = "low" | "medium" | "high" | "critical";

/** Base donde están los archivos estáticos servidos por ROMA (lisboa). */
export const LISBOA_BASE = "https://lisboa.unabase.com/node";

export type AttachmentKind = "image" | "video" | "pdf" | "other";

export interface Attachment {
    id: string;
    name: string;
    /** Ruta relativa (ej: /uploads/tareas/<id>/<file>) — usar resolveAttachmentUrl para mostrar */
    url: string;
    mime: string;
    size: number;
    kind: AttachmentKind;
    durationSeconds?: number | null;
    uploadedAt?: number | null;
}

export function resolveAttachmentUrl(att: Attachment | string): string {
    const url = typeof att === "string" ? att : att.url;
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return `${LISBOA_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

// --- Límites del cliente (deben mantenerse alineados con ROMA) ---
export const ATTACHMENTS = {
    MAX_FILES: 10,
    MAX_BYTES_PER_FILE: 50 * 1024 * 1024, // 50 MB
    MAX_VIDEO_SECONDS: 60, // 1 minuto por video
    ACCEPTED_MIME: [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
        "application/pdf",
        "video/mp4",
        "video/quicktime",
        "video/webm",
        "video/x-msvideo",
        "video/avi",
    ],
} as const;

export interface Task {
    id: string;
    title: string;
    description: string;
    steps: string;
    client: string;
    modules: string;
    reporter: string;
    reporterId: string;
    category: TaskCategory;
    severity: Severity;
    status: TaskStatus;
    assignedToId?: string | null;
    assignedToName?: string | null;
    assignedColor?: string | null;
    estimateMinutes?: number | null;
    startedAt?: number | null;
    pausedAt?: number | null;
    accumulatedMs?: number;
    completedAt?: number | null;
    weekKey: string;
    includeInRelease?: boolean;
    releaseVersion?: string | null;
    releasedAt?: number | null;
    attachments?: Attachment[];
    devNotes?: string;
    subtasks?: Subtask[];
    createdAt: number;
}

export interface Subtask {
    id: string;
    title: string;
    done: boolean;
    order: number;
    createdAt?: number | null;
    completedAt?: number | null;
    createdBy?: string;
    completedBy?: string;
}

export interface PublishedVersion {
    version: string;
    releasedAt: number;
    tasks: Task[];
}

async function call<T = any>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    payload?: any
): Promise<T> {
    const res = await fetch("/api/tareas-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, method, payload }),
        cache: "no-store",
    });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const text = await res.text();
        throw new Error(
            `Respuesta no-JSON (${res.status}): ${text.substring(0, 200)}`
        );
    }
    const data = await res.json();
    if (!res.ok || data?.success === false) {
        throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
    }
    return data as T;
}

export const TareasAPI = {
    listAll: () => call<{ success: boolean; data: Task[] }>("/tareas").then((r) => r.data),

    listByWeek: (weekKey: string) =>
        call<{ success: boolean; data: Task[] }>(`/tareas/week/${encodeURIComponent(weekKey)}`).then(
            (r) => r.data
        ),

    currentWeek: () =>
        call<{ success: boolean; weekKey: string }>("/tareas/week/current").then(
            (r) => r.weekKey
        ),

    create: (payload: {
        title: string;
        description: string;
        steps: string;
        client: string;
        modules: string;
        category: TaskCategory;
        severity: Severity;
        reporter: string;
        reporterId: string;
        weekKey?: string;
    }) =>
        call<{ success: boolean; data: Task }>("/tareas", "POST", payload).then(
            (r) => r.data
        ),

    update: (id: string, patch: Partial<Task>) =>
        call<{ success: boolean; data: Task }>(`/tareas/${id}`, "PUT", patch).then(
            (r) => r.data
        ),

    remove: (id: string) =>
        call<{ success: boolean; data: Task }>(`/tareas/${id}`, "DELETE").then(
            (r) => r.data
        ),

    assign: (
        id: string,
        body: { minutes: number; assignedToId: string; assignedToName: string; assignedColor: string }
    ) =>
        call<{ success: boolean; data: Task }>(`/tareas/${id}/assign`, "POST", body).then(
            (r) => r.data
        ),

    pause: (id: string) =>
        call<{ success: boolean; data: Task }>(`/tareas/${id}/pause`, "POST").then(
            (r) => r.data
        ),

    resume: (id: string) =>
        call<{ success: boolean; data: Task }>(`/tareas/${id}/resume`, "POST").then(
            (r) => r.data
        ),

    complete: (id: string) =>
        call<{ success: boolean; data: Task }>(`/tareas/${id}/complete`, "POST").then(
            (r) => r.data
        ),

    reopen: (id: string) =>
        call<{ success: boolean; data: Task }>(`/tareas/${id}/reopen`, "POST").then(
            (r) => r.data
        ),

    toggleRelease: (id: string) =>
        call<{ success: boolean; data: Task }>(
            `/tareas/${id}/release-toggle`,
            "POST"
        ).then((r) => r.data),

    publishRelease: (version: string) =>
        call<{ success: boolean; version: string; count: number; data: Task[] }>(
            "/tareas/release/publish",
            "POST",
            { version }
        ),

    publishedVersions: () =>
        call<{ success: boolean; data: PublishedVersion[] }>(
            "/tareas/release/versions"
        ).then((r) => r.data),

    /** Sube uno o varios archivos a la tarea. `durations` map opcional `{ [originalName]: seconds }` para videos. */
    uploadAttachments: async (
        id: string,
        files: File[],
        durations?: Record<string, number>
    ): Promise<Task> => {
        if (!files.length) throw new Error("Sin archivos");
        const fd = new FormData();
        for (const f of files) fd.append("files", f, f.name);
        if (durations && Object.keys(durations).length > 0) {
            fd.append("durations", JSON.stringify(durations));
        }
        const res = await fetch("/api/tareas-upload", {
            method: "POST",
            headers: { "x-tareas-endpoint": `/tareas/${id}/attachments` },
            body: fd,
            cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
            throw new Error(data?.message || `Error ${res.status} al subir archivos`);
        }
        return data.data as Task;
    },

    removeAttachment: async (id: string, attId: string): Promise<Task> => {
        const r = await call<{ success: boolean; data: Task }>(
            `/tareas/${id}/attachments/${attId}`,
            "DELETE"
        );
        return r.data;
    },

    // ---------- Subtareas ----------
    addSubtask: (id: string, title: string, createdBy?: string) =>
        call<{ success: boolean; data: Task }>(`/tareas/${id}/subtasks`, "POST", {
            title,
            createdBy: createdBy || "",
        }).then((r) => r.data),

    updateSubtask: (
        id: string,
        subId: string,
        patch: { title?: string; done?: boolean; completedBy?: string }
    ) =>
        call<{ success: boolean; data: Task }>(
            `/tareas/${id}/subtasks/${subId}`,
            "PUT",
            patch
        ).then((r) => r.data),

    removeSubtask: (id: string, subId: string) =>
        call<{ success: boolean; data: Task }>(
            `/tareas/${id}/subtasks/${subId}`,
            "DELETE"
        ).then((r) => r.data),

    reorderSubtasks: (id: string, ids: string[]) =>
        call<{ success: boolean; data: Task }>(
            `/tareas/${id}/subtasks/reorder`,
            "PUT",
            { ids }
        ).then((r) => r.data),
};

// ---------- Helpers de semana (mismo cálculo que el backend) ----------
export function getWeekKey(d: Date = new Date()): string {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(
        ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
    );
    return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function weekBounds(weekKey: string): { start: Date; end: Date } {
    const [yStr, wStr] = weekKey.split("-W");
    const year = Number(yStr);
    const week = Number(wStr);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const mondayW1 = new Date(jan4);
    mondayW1.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
    const start = new Date(mondayW1);
    start.setUTCDate(mondayW1.getUTCDate() + (week - 1) * 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);
    return { start, end };
}

export function elapsedMs(t: Task, now: number = Date.now()): number {
    let acc = t.accumulatedMs || 0;
    if (t.startedAt && t.status === "in_progress") acc += now - t.startedAt;
    return acc;
}

export function remainingMs(t: Task, now: number = Date.now()): number {
    if (!t.estimateMinutes) return 0;
    return t.estimateMinutes * 60_000 - elapsedMs(t, now);
}

export function progressPct(t: Task, now: number = Date.now()): number {
    if (!t.estimateMinutes) return 0;
    const pct = (elapsedMs(t, now) / (t.estimateMinutes * 60_000)) * 100;
    return Math.min(100, Math.max(0, pct));
}

// ---------- Identidad derivada de la sesión NewStuff ----------
// Los usuarios reales del sistema son `soporte`, `desarrollo`, `administracion`.
// El rol del módulo TAREAS se decide por el email/usuario:
//   desarrollo               -> "dev"  (puede tomar tareas, publicar versiones)
//   soporte | administracion -> "support" (sólo reporta y consulta)

export type TareasRole = "support" | "dev";

export interface TareasIdentity {
    /** id estable usado en backend (mismo email/username) */
    id: string;
    /** email/username de la sesión */
    username: string;
    /** nombre visible (con sufijo de rol) */
    name: string;
    /** rol funcional dentro del módulo */
    role: TareasRole;
    /** color hex deterministico para chips/timers/avatares */
    color: string;
}

const ROLE_COLORS: Record<TareasRole, string> = {
    dev: "#1E88E5",      // azul primario NewStuff
    support: "#ff6b35",  // naranja para diferenciar
};

/** Determina el rol funcional a partir de email/role de la sesión. */
export function deriveTareasRole(
    email: string | null | undefined,
    sessionRole?: string | null
): TareasRole {
    const e = (email || "").toLowerCase();
    const r = (sessionRole || "").toLowerCase();
    if (e === "desarrollo" || r === "desarrollo" || r === "dev" || r === "developer") {
        return "dev";
    }
    return "support";
}

/** Construye la identidad del módulo a partir de los datos de la sesión NewStuff. */
export function buildTareasIdentity(
    email: string,
    name?: string | null,
    sessionRole?: string | null
): TareasIdentity {
    const role = deriveTareasRole(email, sessionRole);
    const displayName = (name && name.trim()) || email;
    const suffix = role === "dev" ? "Desarrollo" : email.toLowerCase() === "administracion" ? "Administración" : "Soporte";
    return {
        id: email,
        username: email,
        name: `${displayName} (${suffix})`,
        role,
        color: ROLE_COLORS[role],
    };
}
