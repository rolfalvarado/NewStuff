// Cliente del módulo PROYECTOS — usa /api/proyectos-proxy hacia lisboa.unabase.com

export const LISBOA_BASE = "https://lisboa.unabase.com/node";

export type ProjectStatus = "active" | "billing" | "completed" | "archived";
export type StageStatus = "pending" | "in_progress" | "done";
export type AttachmentKind = "image" | "video" | "pdf" | "other";

export interface Attachment {
    id: string;
    name: string;
    url: string;
    mime: string;
    size: number;
    kind: AttachmentKind;
    uploadedAt?: number | null;
    uploadedBy?: string;
}

export interface ChecklistItem {
    id: string;
    title: string;
    done: boolean;
    custom: boolean;
    notes: string;
    order: number;
    createdAt?: number | null;
    completedAt?: number | null;
    completedBy?: string;
}

export interface Stage {
    key: string;
    number: number;
    title: string;
    timing: string;
    objective: string;
    notes: string;
    status: StageStatus;
    completedAt?: number | null;
    items: ChecklistItem[];
    attachments: Attachment[];
}

export interface Project {
    id: string;
    name: string;
    client: string;
    responsible: string;
    ownerId: string;
    ownerName: string;
    description: string;
    status: ProjectStatus;
    color: string;
    startDate?: number | null;
    completedAt?: number | null;
    billingAt?: number | null;
    stages: Stage[];
    createdAt: number;
    updatedAt: number;
}

export const PROYECTO_ATTACHMENTS = {
    MAX_FILES: 10,
    MAX_BYTES_PER_FILE: 50 * 1024 * 1024,
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

export function resolveAttachmentUrl(att: Attachment | string): string {
    const url = typeof att === "string" ? att : att.url;
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    return `${LISBOA_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

async function call<T = any>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    payload?: any
): Promise<T> {
    const res = await fetch("/api/proyectos-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, method, payload }),
        cache: "no-store",
    });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Respuesta no-JSON (${res.status}): ${text.substring(0, 200)}`);
    }
    const data = await res.json();
    if (!res.ok || data?.success === false) {
        throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
    }
    return data as T;
}

export const ProyectosAPI = {
    list: () =>
        call<{ success: boolean; data: Project[] }>("/proyectos").then((r) => r.data),

    listByStatus: (status: ProjectStatus) =>
        call<{ success: boolean; data: Project[] }>(
            `/proyectos?status=${encodeURIComponent(status)}`
        ).then((r) => r.data),

    getOne: (id: string) =>
        call<{ success: boolean; data: Project }>(`/proyectos/${id}`).then((r) => r.data),

    create: (payload: {
        name: string;
        responsible: string;
        client?: string;
        description?: string;
        color?: string;
        ownerId?: string;
        ownerName?: string;
        startDate?: number;
    }) =>
        call<{ success: boolean; data: Project }>("/proyectos", "POST", payload).then(
            (r) => r.data
        ),

    update: (id: string, patch: Partial<Project>) =>
        call<{ success: boolean; data: Project }>(`/proyectos/${id}`, "PUT", patch).then(
            (r) => r.data
        ),

    remove: (id: string) =>
        call<{ success: boolean; data: Project }>(`/proyectos/${id}`, "DELETE").then(
            (r) => r.data
        ),

    setStageNotes: (id: string, stageKey: string, notes: string) =>
        call<{ success: boolean; data: Project }>(
            `/proyectos/${id}/stages/${stageKey}/notes`,
            "PUT",
            { notes }
        ).then((r) => r.data),

    setStageTitle: (id: string, stageKey: string, title: string) =>
        call<{ success: boolean; data: Project }>(
            `/proyectos/${id}/stages/${stageKey}`,
            "PUT",
            { title }
        ).then((r) => r.data),

    addItem: (id: string, stageKey: string, title: string, createdBy?: string) =>
        call<{ success: boolean; data: Project }>(
            `/proyectos/${id}/stages/${stageKey}/items`,
            "POST",
            { title, createdBy: createdBy || "" }
        ).then((r) => r.data),

    updateItem: (
        id: string,
        stageKey: string,
        itemId: string,
        patch: { title?: string; done?: boolean; notes?: string; completedBy?: string }
    ) =>
        call<{ success: boolean; data: Project }>(
            `/proyectos/${id}/stages/${stageKey}/items/${itemId}`,
            "PUT",
            patch
        ).then((r) => r.data),

    removeItem: (id: string, stageKey: string, itemId: string) =>
        call<{ success: boolean; data: Project }>(
            `/proyectos/${id}/stages/${stageKey}/items/${itemId}`,
            "DELETE"
        ).then((r) => r.data),

    uploadAttachments: async (
        id: string,
        stageKey: string,
        files: File[],
        uploadedBy?: string
    ): Promise<Project> => {
        if (!files.length) throw new Error("Sin archivos");
        const fd = new FormData();
        for (const f of files) fd.append("files", f, f.name);
        if (uploadedBy) fd.append("uploadedBy", uploadedBy);
        const res = await fetch("/api/proyectos-upload", {
            method: "POST",
            headers: {
                "x-proyectos-endpoint": `/proyectos/${id}/stages/${stageKey}/attachments`,
            },
            body: fd,
            cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
            throw new Error(data?.message || `Error ${res.status} al subir archivos`);
        }
        return data.data as Project;
    },

    removeAttachment: async (
        id: string,
        stageKey: string,
        attId: string
    ): Promise<Project> => {
        const r = await call<{ success: boolean; data: Project }>(
            `/proyectos/${id}/stages/${stageKey}/attachments/${attId}`,
            "DELETE"
        );
        return r.data;
    },
};

// ---------- Identidad ----------
export interface ProyectosIdentity {
    id: string;
    username: string;
    name: string;
    color: string;
}

export function buildProyectosIdentity(
    email: string,
    name?: string | null
): ProyectosIdentity {
    const displayName = (name && name.trim()) || email;
    return {
        id: email,
        username: email,
        name: displayName,
        color: "#1E88E5",
    };
}

// ---------- Helpers ----------
export function progressOf(p: Project): { done: number; total: number; pct: number } {
    let total = 0;
    let done = 0;
    for (const s of p.stages || []) {
        for (const it of s.items || []) {
            total++;
            if (it.done) done++;
        }
    }
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { done, total, pct };
}

export function currentStageOf(p: Project): Stage | null {
    if (!p.stages || p.stages.length === 0) return null;
    const inProg = p.stages.find((s) => s.status === "in_progress");
    if (inProg) return inProg;
    const pending = p.stages.find((s) => s.status === "pending");
    if (pending) return pending;
    return p.stages[p.stages.length - 1] || null;
}
