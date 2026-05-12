"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import styles from "./proyectos.module.css";
import {
    ProyectosAPI,
    progressOf,
    currentStageOf,
    resolveAttachmentUrl,
    PROYECTO_ATTACHMENTS,
    type Project,
    type Stage,
    type ChecklistItem,
    type Attachment,
    type ProyectosIdentity,
    type ProjectStatus,
} from "@/lib/proyectos-api";

interface Props {
    identity: ProyectosIdentity;
}

const COLOR_PALETTE = [
    "#1E88E5", // azul (primary)
    "#22C55E", // verde
    "#8B5CF6", // violeta
    "#F59E0B", // ámbar
    "#EF4444", // rojo
    "#EC4899", // rosa
    "#0EA5E9", // celeste
    "#14B8A6", // teal
];

type View = "list" | "detail";
type Tab = "active" | "billing" | "completed" | "archived";

function fmtDate(ts?: number | null): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function fmtBytes(b: number): string {
    if (!b && b !== 0) return "";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / (1024 * 1024)).toFixed(1) + " MB";
}

function fileIcon(kind: Attachment["kind"]): string {
    if (kind === "image") return "🖼️";
    if (kind === "video") return "🎬";
    if (kind === "pdf") return "📄";
    return "📎";
}

// =================================================================
// COMPONENTE PRINCIPAL
// =================================================================
export default function ProyectosClient({ identity }: Props) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<View>("list");
    const [tab, setTab] = useState<Tab>("active");
    const [search, setSearch] = useState("");
    const [responsibleFilter, setResponsibleFilter] = useState<string>("__all__");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [editProject, setEditProject] = useState<Project | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
    const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

    const showToast = useCallback((msg: string, error?: boolean) => {
        setToast({ msg, error });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const loadAll = useCallback(async () => {
        try {
            setLoading(true);
            const data = await ProyectosAPI.list();
            setProjects(data);
        } catch (e: any) {
            showToast(e?.message || "Error cargando proyectos", true);
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const selected = useMemo(
        () => projects.find((p) => p.id === selectedId) || null,
        [projects, selectedId]
    );

    // ---- Counters por status ----
    const counts = useMemo(() => {
        const active = projects.filter((p) => p.status === "active").length;
        const billing = projects.filter((p) => p.status === "billing").length;
        const completed = projects.filter((p) => p.status === "completed").length;
        const archived = projects.filter((p) => p.status === "archived").length;
        return { active, billing, completed, archived };
    }, [projects]);

    // ---- Lista única de responsables (para el filtro) ----
    const responsibles = useMemo(() => {
        const set = new Set<string>();
        for (const p of projects) {
            const r = (p.responsible || "").trim();
            if (r) set.add(r);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
    }, [projects]);

    // ---- Filtros (tab + search + responsable) ----
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return projects
            .filter((p) => p.status === tab)
            .filter((p) =>
                responsibleFilter === "__all__"
                    ? true
                    : (p.responsible || "").trim() === responsibleFilter
            )
            .filter((p) =>
                !q
                    ? true
                    : [p.name, p.client, p.responsible, p.description].some((f) =>
                          (f || "").toLowerCase().includes(q)
                      )
            );
    }, [projects, tab, search, responsibleFilter]);

    // ---- Métricas resumen ----
    const metrics = useMemo(() => {
        const inProgress = projects.filter((p) => p.status === "active").length;
        const totalItems = projects.reduce((acc, p) => {
            for (const s of p.stages) acc += s.items.length;
            return acc;
        }, 0);
        const completedItems = projects.reduce((acc, p) => {
            for (const s of p.stages)
                acc += s.items.filter((i) => i.done).length;
            return acc;
        }, 0);
        return {
            total: projects.length,
            inProgress,
            billing: counts.billing,
            completed: counts.completed,
            checks: `${completedItems}/${totalItems}`,
        };
    }, [projects, counts.completed, counts.billing]);

    // ---- Handler centralizado para refresh ----
    const refreshOne = useCallback((updated: Project) => {
        setProjects((curr) => {
            const idx = curr.findIndex((p) => p.id === updated.id);
            if (idx === -1) return [updated, ...curr];
            const next = [...curr];
            next[idx] = updated;
            return next;
        });
    }, []);

    // ---- Vista detalle abre por click en card ----
    const openProject = (id: string) => {
        setSelectedId(id);
        setView("detail");
    };

    const goBack = () => {
        setView("list");
        setSelectedId(null);
    };

    // ====== Render ======
    return (
        <div className={styles.wrapper}>
            {view === "list" && (
                <ListView
                    metrics={metrics}
                    counts={counts}
                    tab={tab}
                    setTab={setTab}
                    search={search}
                    setSearch={setSearch}
                    responsibles={responsibles}
                    responsibleFilter={responsibleFilter}
                    setResponsibleFilter={setResponsibleFilter}
                    onCreate={() => setCreateOpen(true)}
                    onOpen={openProject}
                    projects={filtered}
                    loading={loading}
                />
            )}

            {view === "detail" && selected && (
                <DetailView
                    project={selected}
                    identity={identity}
                    onBack={goBack}
                    onRefreshOne={refreshOne}
                    onEdit={() => setEditProject(selected)}
                    onDelete={() => setConfirmDelete(selected)}
                    showToast={showToast}
                />
            )}

            {createOpen && (
                <CreateProjectModal
                    identity={identity}
                    onClose={() => setCreateOpen(false)}
                    onCreated={(p) => {
                        setCreateOpen(false);
                        setProjects((curr) => [p, ...curr]);
                        showToast(`Proyecto "${p.name}" creado`);
                        openProject(p.id);
                    }}
                    showToast={showToast}
                />
            )}

            {editProject && (
                <EditProjectModal
                    project={editProject}
                    onClose={() => setEditProject(null)}
                    onUpdated={(p) => {
                        setEditProject(null);
                        refreshOne(p);
                        showToast("Proyecto actualizado");
                    }}
                    showToast={showToast}
                />
            )}

            {confirmDelete && (
                <ConfirmDeleteModal
                    project={confirmDelete}
                    onCancel={() => setConfirmDelete(null)}
                    onConfirmed={() => {
                        const id = confirmDelete.id;
                        setProjects((curr) => curr.filter((p) => p.id !== id));
                        if (selectedId === id) goBack();
                        setConfirmDelete(null);
                        showToast("Proyecto eliminado");
                    }}
                    showToast={showToast}
                />
            )}

            {toast && (
                <div
                    className={`${styles.toast} ${toast.error ? styles.toastError : ""}`}
                >
                    {toast.msg}
                </div>
            )}
        </div>
    );
}

// =================================================================
// LIST VIEW
// =================================================================
function ListView({
    metrics,
    counts,
    tab,
    setTab,
    search,
    setSearch,
    responsibles,
    responsibleFilter,
    setResponsibleFilter,
    onCreate,
    onOpen,
    projects,
    loading,
}: {
    metrics: { total: number; inProgress: number; billing: number; completed: number; checks: string };
    counts: { active: number; billing: number; completed: number; archived: number };
    tab: Tab;
    setTab: (t: Tab) => void;
    search: string;
    setSearch: (s: string) => void;
    responsibles: string[];
    responsibleFilter: string;
    setResponsibleFilter: (v: string) => void;
    onCreate: () => void;
    onOpen: (id: string) => void;
    projects: Project[];
    loading: boolean;
}) {
    return (
        <>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Proyectos</h1>
                    <p className={styles.subtitle}>
                        Gestión de onboarding y seguimiento de clientes
                    </p>
                </div>
                <div className={styles.metricGrid}>
                    <div className={styles.metricCard}>
                        <div className={styles.metricLabel}>Total</div>
                        <div className={styles.metricValue}>{metrics.total}</div>
                    </div>
                    <div className={styles.metricCard}>
                        <div className={styles.metricLabel}>En curso</div>
                        <div
                            className={`${styles.metricValue} ${styles.metricValueAccent}`}
                        >
                            {metrics.inProgress}
                        </div>
                    </div>
                    <div className={styles.metricCard}>
                        <div className={styles.metricLabel}>En facturación</div>
                        <div
                            className={`${styles.metricValue} ${styles.metricValueWarn}`}
                        >
                            {metrics.billing}
                        </div>
                    </div>
                    <div className={styles.metricCard}>
                        <div className={styles.metricLabel}>Completados</div>
                        <div className={`${styles.metricValue} ${styles.metricValueOk}`}>
                            {metrics.completed}
                        </div>
                    </div>
                    <div className={styles.metricCard}>
                        <div className={styles.metricLabel}>Checks totales</div>
                        <div
                            className={`${styles.metricValue} ${styles.metricValuePurple}`}
                        >
                            {metrics.checks}
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.toolbar}>
                <div className={styles.tabs}>
                    {(
                        [
                            { key: "active", label: "En curso", n: counts.active },
                            { key: "billing", label: "En facturación", n: counts.billing },
                            { key: "completed", label: "Completados", n: counts.completed },
                            { key: "archived", label: "Archivados", n: counts.archived },
                        ] as { key: Tab; label: string; n: number }[]
                    ).map((t) => (
                        <button
                            key={t.key}
                            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
                            onClick={() => setTab(t.key)}
                        >
                            {t.label}
                            <span className={styles.tabBadge}>{t.n}</span>
                        </button>
                    ))}
                </div>

                <input
                    className={styles.searchInput}
                    placeholder="Buscar por nombre, cliente o responsable…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />

                <select
                    className={styles.responsibleSelect}
                    value={responsibleFilter}
                    onChange={(e) => setResponsibleFilter(e.target.value)}
                    title="Filtrar por responsable"
                >
                    <option value="__all__">
                        👤 Todos los responsables
                    </option>
                    {responsibles.map((r) => (
                        <option key={r} value={r}>
                            {r}
                        </option>
                    ))}
                </select>

                <button className={styles.btnPrimary} onClick={onCreate}>
                    <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>+</span>
                    Nuevo proyecto
                </button>
            </div>

            <div className={styles.contentWrap}>
                {loading ? (
                    <div className={styles.loading}>
                        <span className={styles.spinner} /> Cargando proyectos…
                    </div>
                ) : projects.length === 0 ? (
                    <div className={styles.emptyBox}>
                        <div className={styles.emptyIcon}>📁</div>
                        <div className={styles.emptyTitle}>
                            {tab === "active"
                                ? "No hay proyectos en curso"
                                : tab === "completed"
                                ? "Sin proyectos completados todavía"
                                : "Sin proyectos archivados"}
                        </div>
                        <div>
                            {tab === "active" && "Comienza creando un proyecto nuevo"}
                        </div>
                        {tab === "active" && (
                            <button
                                className={styles.btnPrimary}
                                style={{ marginLeft: 0 }}
                                onClick={onCreate}
                            >
                                + Crear el primero
                            </button>
                        )}
                    </div>
                ) : (
                    <div className={styles.grid}>
                        {projects.map((p) => (
                            <ProjectCard key={p.id} project={p} onOpen={() => onOpen(p.id)} />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

// =================================================================
// PROJECT CARD
// =================================================================
function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
    const { pct, done, total } = progressOf(project);
    const current = currentStageOf(project);
    const completed = project.status === "completed";

    return (
        <div
            className={`${styles.projectCard} ${completed ? styles.projectCardCompleted : ""}`}
            onClick={onOpen}
        >
            <div
                className={styles.projectAccent}
                style={{ background: project.color || "#1E88E5" }}
            />
            <div className={styles.projectHead}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.5rem",
                    }}
                >
                    <span
                        className={`${styles.statusPill} ${
                            project.status === "active"
                                ? styles.statusActive
                                : project.status === "billing"
                                ? styles.statusBilling
                                : project.status === "completed"
                                ? styles.statusCompleted
                                : styles.statusArchived
                        }`}
                    >
                        <span
                            className="dotMarker"
                            style={{
                                width: 6,
                                height: 6,
                                background: "currentColor",
                                borderRadius: 999,
                            }}
                        />
                        {project.status === "active"
                            ? "En curso"
                            : project.status === "billing"
                            ? "En facturación"
                            : project.status === "completed"
                            ? "Completado"
                            : "Archivado"}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        {fmtDate(project.startDate || project.createdAt)}
                    </span>
                </div>
                <div className={styles.projectName}>{project.name}</div>
                {project.client && (
                    <div className={styles.projectClient}>
                        <span>🏢</span> {project.client}
                    </div>
                )}
            </div>

            <div className={styles.projectMeta}>
                <span className={styles.metaPill}>
                    👤 <strong>{project.responsible}</strong>
                </span>
                {current && (
                    <span className={styles.metaPill}>
                        📍 Etapa {current.number}
                    </span>
                )}
            </div>

            <div className={styles.projectStages}>
                {project.stages.map((s) => {
                    const isCurrent = current && s.key === current.key && s.status !== "done";
                    const cls =
                        s.status === "done"
                            ? styles.stageDotDone
                            : isCurrent
                            ? styles.stageDotCurrent
                            : s.status === "in_progress"
                            ? styles.stageDotActive
                            : "";
                    return (
                        <div
                            key={s.key}
                            className={`${styles.stageDot} ${cls}`}
                            title={`${s.number}. ${s.title}`}
                        />
                    );
                })}
            </div>

            <div className={styles.projectFooter}>
                <div className={styles.progressWrap}>
                    <div className={styles.progressLabel}>
                        <span>Progreso</span>
                        <span>
                            {done}/{total} · {pct}%
                        </span>
                    </div>
                    <div className={styles.progressBar}>
                        <div
                            className={styles.progressFill}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

// =================================================================
// CREATE PROJECT MODAL
// =================================================================
function CreateProjectModal({
    identity,
    onClose,
    onCreated,
    showToast,
}: {
    identity: ProyectosIdentity;
    onClose: () => void;
    onCreated: (p: Project) => void;
    showToast: (msg: string, err?: boolean) => void;
}) {
    const [name, setName] = useState("");
    const [responsible, setResponsible] = useState("");
    const [client, setClient] = useState("");
    const [description, setDescription] = useState("");
    const [color, setColor] = useState(COLOR_PALETTE[0]);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<{ name?: string; responsible?: string }>({});

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errs: typeof errors = {};
        if (name.trim().length < 2) errs.name = "Mínimo 2 caracteres";
        if (responsible.trim().length < 2) errs.responsible = "Responsable es obligatorio";
        setErrors(errs);
        if (Object.keys(errs).length > 0) return;

        try {
            setSaving(true);
            const created = await ProyectosAPI.create({
                name: name.trim(),
                responsible: responsible.trim(),
                client: client.trim(),
                description: description.trim(),
                color,
                ownerId: identity.id,
                ownerName: identity.name,
                startDate: Date.now(),
            });
            onCreated(created);
        } catch (e: any) {
            showToast(e?.message || "Error al crear", true);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.modalBackdrop} onClick={onClose}>
            <div
                className={`${styles.modal} ${styles.modalSmall}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.modalAccent} style={{ background: color }} />
                <div className={styles.modalHeader}>
                    <div>
                        <h2 className={styles.modalTitle}>Nuevo proyecto</h2>
                        <div className={styles.modalSubtitle}>
                            Se creará con las 5 etapas de onboarding precargadas
                        </div>
                    </div>
                    <button className={styles.modalClose} onClick={onClose}>
                        ✕
                    </button>
                </div>
                <form onSubmit={submit}>
                    <div className={styles.modalBody}>
                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>
                                    Nombre del proyecto <span className={styles.required}>*</span>
                                </label>
                                <input
                                    autoFocus
                                    className={styles.input}
                                    placeholder="Ej: Implementación Cliente XYZ"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                                {errors.name && (
                                    <div className={styles.fieldError}>{errors.name}</div>
                                )}
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>
                                    Responsable <span className={styles.required}>*</span>
                                </label>
                                <input
                                    className={styles.input}
                                    placeholder="Nombre de la persona a cargo"
                                    value={responsible}
                                    onChange={(e) => setResponsible(e.target.value)}
                                />
                                {errors.responsible && (
                                    <div className={styles.fieldError}>{errors.responsible}</div>
                                )}
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Cliente / empresa</label>
                                <input
                                    className={styles.input}
                                    placeholder="Empresa cliente (opcional)"
                                    value={client}
                                    onChange={(e) => setClient(e.target.value)}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Descripción</label>
                                <textarea
                                    className={styles.textarea}
                                    placeholder="Notas iniciales, objetivos generales… (opcional)"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Color identificador</label>
                                <div className={styles.colorPicker}>
                                    {COLOR_PALETTE.map((c) => (
                                        <button
                                            type="button"
                                            key={c}
                                            className={`${styles.colorSwatch} ${
                                                color === c ? styles.colorSwatchActive : ""
                                            }`}
                                            style={{ background: c }}
                                            onClick={() => setColor(c)}
                                            aria-label={c}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className={styles.modalFooter}>
                        <button
                            type="button"
                            className={styles.btn}
                            onClick={onClose}
                            disabled={saving}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className={`${styles.btn} ${styles.btnSubmit}`}
                            disabled={saving}
                        >
                            {saving ? "Creando…" : "Crear proyecto"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// =================================================================
// EDIT PROJECT MODAL
// =================================================================
function EditProjectModal({
    project,
    onClose,
    onUpdated,
    showToast,
}: {
    project: Project;
    onClose: () => void;
    onUpdated: (p: Project) => void;
    showToast: (msg: string, err?: boolean) => void;
}) {
    const [name, setName] = useState(project.name);
    const [responsible, setResponsible] = useState(project.responsible);
    const [client, setClient] = useState(project.client);
    const [description, setDescription] = useState(project.description);
    const [color, setColor] = useState(project.color || COLOR_PALETTE[0]);
    const [status, setStatus] = useState<ProjectStatus>(project.status);
    const [saving, setSaving] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim().length < 2) {
            showToast("Nombre inválido", true);
            return;
        }
        if (responsible.trim().length < 2) {
            showToast("Responsable obligatorio", true);
            return;
        }
        try {
            setSaving(true);
            const updated = await ProyectosAPI.update(project.id, {
                name: name.trim(),
                responsible: responsible.trim(),
                client: client.trim(),
                description: description.trim(),
                color,
                status,
            });
            onUpdated(updated);
        } catch (e: any) {
            showToast(e?.message || "Error al actualizar", true);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.modalBackdrop} onClick={onClose}>
            <div
                className={`${styles.modal} ${styles.modalSmall}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.modalAccent} style={{ background: color }} />
                <div className={styles.modalHeader}>
                    <div>
                        <h2 className={styles.modalTitle}>Editar proyecto</h2>
                        <div className={styles.modalSubtitle}>
                            Cambia los datos básicos del proyecto
                        </div>
                    </div>
                    <button className={styles.modalClose} onClick={onClose}>
                        ✕
                    </button>
                </div>
                <form onSubmit={submit}>
                    <div className={styles.modalBody}>
                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>
                                    Nombre <span className={styles.required}>*</span>
                                </label>
                                <input
                                    className={styles.input}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>
                                    Responsable <span className={styles.required}>*</span>
                                </label>
                                <input
                                    className={styles.input}
                                    value={responsible}
                                    onChange={(e) => setResponsible(e.target.value)}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Cliente</label>
                                <input
                                    className={styles.input}
                                    value={client}
                                    onChange={(e) => setClient(e.target.value)}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Descripción</label>
                                <textarea
                                    className={styles.textarea}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                            <div className={styles.row2}>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Estado</label>
                                    <select
                                        className={styles.select}
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                                    >
                                        <option value="active">En curso</option>
                                        <option value="billing">En facturación</option>
                                        <option value="completed">Completado</option>
                                        <option value="archived">Archivado</option>
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Color</label>
                                    <div className={styles.colorPicker}>
                                        {COLOR_PALETTE.map((c) => (
                                            <button
                                                type="button"
                                                key={c}
                                                className={`${styles.colorSwatch} ${
                                                    color === c ? styles.colorSwatchActive : ""
                                                }`}
                                                style={{ background: c }}
                                                onClick={() => setColor(c)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className={styles.modalFooter}>
                        <button
                            type="button"
                            className={styles.btn}
                            onClick={onClose}
                            disabled={saving}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className={`${styles.btn} ${styles.btnSubmit}`}
                            disabled={saving}
                        >
                            {saving ? "Guardando…" : "Guardar cambios"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// =================================================================
// CONFIRM DELETE
// =================================================================
function ConfirmDeleteModal({
    project,
    onCancel,
    onConfirmed,
    showToast,
}: {
    project: Project;
    onCancel: () => void;
    onConfirmed: () => void;
    showToast: (msg: string, err?: boolean) => void;
}) {
    const [working, setWorking] = useState(false);
    const submit = async () => {
        try {
            setWorking(true);
            await ProyectosAPI.remove(project.id);
            onConfirmed();
        } catch (e: any) {
            showToast(e?.message || "Error eliminando", true);
        } finally {
            setWorking(false);
        }
    };
    return (
        <div className={styles.modalBackdrop} onClick={onCancel}>
            <div
                className={`${styles.modal} ${styles.modalSmall}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.modalHeader}>
                    <h2 className={styles.modalTitle}>Eliminar proyecto</h2>
                    <button className={styles.modalClose} onClick={onCancel}>
                        ✕
                    </button>
                </div>
                <div className={styles.modalBody}>
                    <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                        ¿Seguro que quieres eliminar el proyecto{" "}
                        <strong style={{ color: "var(--text-main)" }}>{project.name}</strong>?
                        Esta acción es irreversible y se borrarán todas las etapas, ítems y
                        adjuntos asociados.
                    </p>
                </div>
                <div className={styles.modalFooter}>
                    <button className={styles.btn} onClick={onCancel} disabled={working}>
                        Cancelar
                    </button>
                    <button
                        className={`${styles.btn} ${styles.btnDanger}`}
                        onClick={submit}
                        disabled={working}
                    >
                        {working ? "Eliminando…" : "Eliminar"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// =================================================================
// DETAIL VIEW
// =================================================================
function DetailView({
    project,
    identity,
    onBack,
    onRefreshOne,
    onEdit,
    onDelete,
    showToast,
}: {
    project: Project;
    identity: ProyectosIdentity;
    onBack: () => void;
    onRefreshOne: (p: Project) => void;
    onEdit: () => void;
    onDelete: () => void;
    showToast: (msg: string, err?: boolean) => void;
}) {
    const [activeStageKey, setActiveStageKey] = useState<string>(() => {
        const c = currentStageOf(project);
        return c?.key || project.stages[0]?.key || "";
    });

    const stage = project.stages.find((s) => s.key === activeStageKey) || project.stages[0];
    const { pct, done, total } = progressOf(project);
    const [changingStatus, setChangingStatus] = useState(false);

    const setStatus = useCallback(
        async (next: ProjectStatus, successMsg: string) => {
            try {
                setChangingStatus(true);
                const updated = await ProyectosAPI.update(project.id, { status: next });
                onRefreshOne(updated);
                showToast(successMsg);
            } catch (e: any) {
                showToast(e?.message || "Error cambiando estado", true);
            } finally {
                setChangingStatus(false);
            }
        },
        [project.id, onRefreshOne, showToast]
    );

    return (
        <>
            <div className={styles.detailHeader}>
                <button className={styles.backBtn} onClick={onBack}>
                    ← Volver
                </button>
                <div
                    className={styles.detailHeading}
                    style={{ borderLeft: `4px solid ${project.color}`, paddingLeft: "0.85rem" }}
                >
                    <h1 className={styles.detailName}>{project.name}</h1>
                    <div className={styles.detailSub}>
                        {project.client && <span>🏢 {project.client}</span>}
                        <span>👤 {project.responsible}</span>
                        <span>·</span>
                        <span>
                            Progreso global: <strong>{pct}%</strong> ({done}/{total})
                        </span>
                        {project.status === "billing" && (
                            <span
                                className={`${styles.statusPill} ${styles.statusBilling}`}
                            >
                                💰 En facturación
                                {project.billingAt ? ` · ${fmtDate(project.billingAt)}` : ""}
                            </span>
                        )}
                    </div>
                </div>
                <div className={styles.detailActions}>
                    {project.status === "active" && (
                        <button
                            className={`${styles.btn} ${styles.btnBilling}`}
                            onClick={() =>
                                setStatus(
                                    "billing",
                                    "Implementación finalizada · enviado a facturación"
                                )
                            }
                            disabled={changingStatus}
                            title="Marca la implementación como terminada para que pase a facturación"
                        >
                            💰 Pasar a facturación
                        </button>
                    )}
                    {project.status === "billing" && (
                        <button
                            className={styles.btn}
                            onClick={() =>
                                setStatus("active", "Proyecto reactivado en curso")
                            }
                            disabled={changingStatus}
                        >
                            ↩ Volver a en curso
                        </button>
                    )}
                    <button className={styles.btn} onClick={onEdit}>
                        ✎ Editar
                    </button>
                    <button
                        className={`${styles.btn} ${styles.btnDanger}`}
                        onClick={onDelete}
                    >
                        🗑 Eliminar
                    </button>
                </div>
            </div>

            <div className={styles.contentWrap}>
                <div className={styles.detailLayout}>
                    {/* Rail con etapas */}
                    <div className={styles.stageRail}>
                        {project.stages.map((s) => {
                            const sd = progressOfStage(s);
                            const isActive = s.key === activeStageKey;
                            return (
                                <button
                                    key={s.key}
                                    className={`${styles.stageRailItem} ${
                                        isActive ? styles.stageRailItemActive : ""
                                    }`}
                                    onClick={() => setActiveStageKey(s.key)}
                                >
                                    <div
                                        className={`${styles.stageRailNum} ${
                                            s.status === "done"
                                                ? styles.stageRailNumDone
                                                : s.status === "in_progress"
                                                ? styles.stageRailNumProgress
                                                : ""
                                        }`}
                                    >
                                        {s.status === "done" ? "✓" : s.number}
                                    </div>
                                    <div className={styles.stageRailInfo}>
                                        <div className={styles.stageRailTitle}>{s.title}</div>
                                        <div className={styles.stageRailCount}>
                                            <span>📋</span>
                                            {sd.done}/{sd.total} ítems
                                            {s.attachments.length > 0 && (
                                                <>
                                                    <span>·</span>
                                                    <span>📎 {s.attachments.length}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Panel principal de la etapa activa */}
                    {stage && (
                        <StagePanel
                            project={project}
                            stage={stage}
                            identity={identity}
                            onRefreshOne={onRefreshOne}
                            showToast={showToast}
                        />
                    )}
                </div>
            </div>
        </>
    );
}

function progressOfStage(s: Stage): { done: number; total: number; pct: number } {
    const total = s.items.length;
    const done = s.items.filter((i) => i.done).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { done, total, pct };
}

// =================================================================
// STAGE PANEL (etapa activa)
// =================================================================
function StagePanel({
    project,
    stage,
    identity,
    onRefreshOne,
    showToast,
}: {
    project: Project;
    stage: Stage;
    identity: ProyectosIdentity;
    onRefreshOne: (p: Project) => void;
    showToast: (msg: string, err?: boolean) => void;
}) {
    const sd = progressOfStage(stage);
    const [newItemTitle, setNewItemTitle] = useState("");
    const [savingNotes, setSavingNotes] = useState(false);
    const [notesDraft, setNotesDraft] = useState(stage.notes || "");
    const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState(stage.title);

    // Sync cuando cambia de etapa
    useEffect(() => {
        setNotesDraft(stage.notes || "");
    }, [stage.key, stage.notes]);
    useEffect(() => {
        setTitleDraft(stage.title);
        setEditingTitle(false);
    }, [stage.key, stage.title]);

    // ---- Rename stage ----
    const commitStageTitle = useCallback(async () => {
        const t = titleDraft.trim();
        setEditingTitle(false);
        if (!t || t === stage.title) {
            setTitleDraft(stage.title);
            return;
        }
        try {
            const updated = await ProyectosAPI.setStageTitle(project.id, stage.key, t);
            onRefreshOne(updated);
            showToast("Nombre de la etapa actualizado");
        } catch (e: any) {
            showToast(e?.message || "Error al renombrar la etapa", true);
            setTitleDraft(stage.title);
        }
    }, [titleDraft, project.id, stage.key, stage.title, onRefreshOne, showToast]);

    // ---- Toggle item done ----
    const toggleItem = useCallback(
        async (item: ChecklistItem) => {
            try {
                const updated = await ProyectosAPI.updateItem(
                    project.id,
                    stage.key,
                    item.id,
                    {
                        done: !item.done,
                        completedBy: identity.name,
                    }
                );
                onRefreshOne(updated);
            } catch (e: any) {
                showToast(e?.message || "Error", true);
            }
        },
        [project.id, stage.key, identity.name, onRefreshOne, showToast]
    );

    // ---- Update item title ----
    const renameItem = useCallback(
        async (item: ChecklistItem, title: string) => {
            if (!title.trim() || title.trim() === item.title) return;
            try {
                const updated = await ProyectosAPI.updateItem(project.id, stage.key, item.id, {
                    title: title.trim(),
                });
                onRefreshOne(updated);
            } catch (e: any) {
                showToast(e?.message || "Error", true);
            }
        },
        [project.id, stage.key, onRefreshOne, showToast]
    );

    // ---- Update item notes ----
    const setItemNotes = useCallback(
        async (item: ChecklistItem, notes: string) => {
            try {
                const updated = await ProyectosAPI.updateItem(project.id, stage.key, item.id, {
                    notes,
                });
                onRefreshOne(updated);
            } catch (e: any) {
                showToast(e?.message || "Error", true);
            }
        },
        [project.id, stage.key, onRefreshOne, showToast]
    );

    const removeItem = useCallback(
        async (item: ChecklistItem) => {
            if (!confirm(`Eliminar "${item.title}"?`)) return;
            try {
                const updated = await ProyectosAPI.removeItem(project.id, stage.key, item.id);
                onRefreshOne(updated);
            } catch (e: any) {
                showToast(e?.message || "Error", true);
            }
        },
        [project.id, stage.key, onRefreshOne, showToast]
    );

    const addItem = useCallback(async () => {
        const t = newItemTitle.trim();
        if (!t) return;
        try {
            const updated = await ProyectosAPI.addItem(project.id, stage.key, t, identity.name);
            onRefreshOne(updated);
            setNewItemTitle("");
        } catch (e: any) {
            showToast(e?.message || "Error", true);
        }
    }, [newItemTitle, project.id, stage.key, identity.name, onRefreshOne, showToast]);

    // ---- Auto-save notes (debounced) ----
    const onChangeNotes = (val: string) => {
        setNotesDraft(val);
        if (notesTimer.current) clearTimeout(notesTimer.current);
        notesTimer.current = setTimeout(async () => {
            try {
                setSavingNotes(true);
                const updated = await ProyectosAPI.setStageNotes(project.id, stage.key, val);
                onRefreshOne(updated);
            } catch (e: any) {
                showToast(e?.message || "Error guardando notas", true);
            } finally {
                setSavingNotes(false);
            }
        }, 800);
    };

    return (
        <div className={styles.stagePanel}>
            {/* Hero etapa */}
            <div className={styles.stageHero}>
                <div className={styles.stageHeroRow}>
                    <span className={styles.stageHeroBadge}>Etapa {stage.number}</span>
                    {stage.status === "done" && (
                        <span className={`${styles.statusPill} ${styles.statusCompleted}`}>
                            ✓ Etapa completada
                        </span>
                    )}
                </div>
                {editingTitle ? (
                    <input
                        autoFocus
                        className={styles.stageHeroTitle}
                        style={{
                            width: "100%",
                            border: "1px solid var(--border-color)",
                            borderRadius: "var(--radius-sm)",
                            padding: "0.2rem 0.4rem",
                            background: "var(--bg-main)",
                            fontFamily: "inherit",
                        }}
                        value={titleDraft}
                        maxLength={160}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onBlur={commitStageTitle}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                commitStageTitle();
                            }
                            if (e.key === "Escape") {
                                setTitleDraft(stage.title);
                                setEditingTitle(false);
                            }
                        }}
                    />
                ) : (
                    <h2
                        className={styles.stageHeroTitle}
                        style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                    >
                        <span onDoubleClick={() => setEditingTitle(true)}>{stage.title}</span>
                        <button
                            className={styles.iconBtn}
                            title="Editar nombre de la etapa"
                            onClick={() => {
                                setTitleDraft(stage.title);
                                setEditingTitle(true);
                            }}
                            style={{ fontSize: "0.8rem", flexShrink: 0 }}
                        >
                            ✎
                        </button>
                    </h2>
                )}
                {stage.objective && (
                    <p className={styles.stageHeroObjective}>{stage.objective}</p>
                )}
                <div className={styles.stageHeroProgress}>
                    <div className={styles.stageHeroProgressBar}>
                        <div
                            className={styles.stageHeroProgressFill}
                            style={{ width: `${sd.pct}%` }}
                        />
                    </div>
                    <div className={styles.stageHeroProgressLabel}>
                        <span>
                            {sd.done} de {sd.total} ítems completados
                        </span>
                        <strong>{sd.pct}%</strong>
                    </div>
                </div>
            </div>

            {/* Checklist */}
            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>📋 Checklist de la etapa</h3>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        {sd.done}/{sd.total}
                    </span>
                </div>
                <div className={`${styles.sectionBody} ${styles.sectionBodyTight}`}>
                    {stage.items.length === 0 ? (
                        <div style={{ padding: "1.25rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                            Esta etapa no tiene ítems. Agrega uno abajo.
                        </div>
                    ) : (
                        <div className={styles.checkList}>
                            {stage.items.map((it) => (
                                <CheckRow
                                    key={it.id}
                                    item={it}
                                    onToggle={() => toggleItem(it)}
                                    onRename={(title) => renameItem(it, title)}
                                    onSaveNotes={(notes) => setItemNotes(it, notes)}
                                    onDelete={() => removeItem(it)}
                                />
                            ))}
                        </div>
                    )}
                    <div className={styles.addItemRow}>
                        <input
                            className={styles.addItemInput}
                            placeholder="Agregar nuevo punto a esta etapa…"
                            value={newItemTitle}
                            onChange={(e) => setNewItemTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    addItem();
                                }
                            }}
                        />
                        <button
                            className={`${styles.smallBtn} ${styles.smallBtnPrimary}`}
                            onClick={addItem}
                            disabled={!newItemTitle.trim()}
                        >
                            + Agregar
                        </button>
                    </div>
                </div>
            </div>

            {/* Notas etapa */}
            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>📝 Notas / observaciones</h3>
                    {savingNotes && (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            Guardando…
                        </span>
                    )}
                </div>
                <div className={styles.sectionBody}>
                    <textarea
                        className={styles.notesArea}
                        placeholder="Apuntes, comentarios y observaciones generales de esta etapa…"
                        value={notesDraft}
                        onChange={(e) => onChangeNotes(e.target.value)}
                    />
                    <div className={styles.notesHint}>
                        Las notas se guardan automáticamente mientras escribes.
                    </div>
                </div>
            </div>

            {/* Adjuntos */}
            <AttachmentsBlock
                project={project}
                stage={stage}
                identity={identity}
                onRefreshOne={onRefreshOne}
                showToast={showToast}
            />
        </div>
    );
}

// =================================================================
// CHECK ROW (fila de checklist con notas)
// =================================================================
function CheckRow({
    item,
    onToggle,
    onRename,
    onSaveNotes,
    onDelete,
}: {
    item: ChecklistItem;
    onToggle: () => void;
    onRename: (title: string) => void;
    onSaveNotes: (notes: string) => void;
    onDelete: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draftTitle, setDraftTitle] = useState(item.title);
    const [showNotes, setShowNotes] = useState(!!item.notes);
    const [draftNotes, setDraftNotes] = useState(item.notes || "");
    const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setDraftNotes(item.notes || "");
    }, [item.id, item.notes]);

    const commitTitle = () => {
        setEditing(false);
        if (draftTitle.trim() && draftTitle.trim() !== item.title) {
            onRename(draftTitle.trim());
        } else {
            setDraftTitle(item.title);
        }
    };

    const onChangeNotes = (val: string) => {
        setDraftNotes(val);
        if (notesTimer.current) clearTimeout(notesTimer.current);
        notesTimer.current = setTimeout(() => onSaveNotes(val), 800);
    };

    return (
        <div className={`${styles.checkItem} ${item.done ? styles.checkItemDone : ""}`}>
            <button
                className={`${styles.checkBox} ${item.done ? styles.checkBoxDone : ""}`}
                onClick={onToggle}
                title={item.done ? "Marcar pendiente" : "Marcar completado"}
            >
                {item.done && <span style={{ fontSize: "0.8rem" }}>✓</span>}
            </button>

            <div className={styles.checkContent}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                    }}
                >
                    {editing ? (
                        <input
                            autoFocus
                            className={styles.checkTextEdit}
                            value={draftTitle}
                            onChange={(e) => setDraftTitle(e.target.value)}
                            onBlur={commitTitle}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") commitTitle();
                                if (e.key === "Escape") {
                                    setDraftTitle(item.title);
                                    setEditing(false);
                                }
                            }}
                        />
                    ) : (
                        <span
                            className={styles.checkText}
                            onDoubleClick={() => setEditing(true)}
                        >
                            {item.title}
                        </span>
                    )}
                    {item.custom && <span className={styles.customChip}>añadido</span>}
                </div>
                {(item.completedBy || item.completedAt) && item.done && (
                    <div className={styles.checkSubMeta}>
                        ✓ por <strong>{item.completedBy || "—"}</strong>
                        {item.completedAt && <span>· {fmtDate(item.completedAt)}</span>}
                    </div>
                )}

                {showNotes && (
                    <textarea
                        className={styles.checkNotes}
                        placeholder="Anota algo sobre este punto…"
                        value={draftNotes}
                        onChange={(e) => onChangeNotes(e.target.value)}
                    />
                )}
            </div>

            <div className={styles.checkActions}>
                <button
                    className={styles.iconBtn}
                    title={showNotes ? "Ocultar nota" : "Anotar"}
                    onClick={() => setShowNotes((v) => !v)}
                >
                    📝
                </button>
                <button
                    className={styles.iconBtn}
                    title="Editar texto"
                    onClick={() => setEditing(true)}
                >
                    ✎
                </button>
                <button
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    title="Eliminar punto"
                    onClick={onDelete}
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

// =================================================================
// ATTACHMENTS BLOCK (con drag & drop)
// =================================================================
function AttachmentsBlock({
    project,
    stage,
    identity,
    onRefreshOne,
    showToast,
}: {
    project: Project;
    stage: Stage;
    identity: ProyectosIdentity;
    onRefreshOne: (p: Project) => void;
    showToast: (msg: string, err?: boolean) => void;
}) {
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const validate = (files: File[]): { ok: File[]; reject: string[] } => {
        const ok: File[] = [];
        const reject: string[] = [];
        for (const f of files) {
            if (!PROYECTO_ATTACHMENTS.ACCEPTED_MIME.includes(f.type as any)) {
                reject.push(`${f.name}: formato no permitido`);
                continue;
            }
            if (f.size > PROYECTO_ATTACHMENTS.MAX_BYTES_PER_FILE) {
                reject.push(`${f.name}: supera 50MB`);
                continue;
            }
            ok.push(f);
        }
        if (ok.length > PROYECTO_ATTACHMENTS.MAX_FILES) {
            reject.push(`Sólo se subirán los primeros ${PROYECTO_ATTACHMENTS.MAX_FILES}`);
        }
        return { ok: ok.slice(0, PROYECTO_ATTACHMENTS.MAX_FILES), reject };
    };

    const upload = async (files: File[]) => {
        const { ok, reject } = validate(files);
        if (reject.length) showToast(reject.join(" / "), true);
        if (!ok.length) return;
        try {
            setUploading(true);
            const updated = await ProyectosAPI.uploadAttachments(
                project.id,
                stage.key,
                ok,
                identity.name
            );
            onRefreshOne(updated);
            showToast(`${ok.length} archivo(s) subidos`);
        } catch (e: any) {
            showToast(e?.message || "Error subiendo archivos", true);
        } finally {
            setUploading(false);
        }
    };

    const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length) upload(files);
        e.target.value = "";
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length) upload(files);
    };

    const removeAtt = async (att: Attachment) => {
        if (!confirm(`Eliminar "${att.name}"?`)) return;
        try {
            const updated = await ProyectosAPI.removeAttachment(project.id, stage.key, att.id);
            onRefreshOne(updated);
            showToast("Adjunto eliminado");
        } catch (e: any) {
            showToast(e?.message || "Error", true);
        }
    };

    return (
        <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                    📎 Adjuntos de la etapa
                    <span
                        style={{
                            background: "var(--bg-main)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-secondary)",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            borderRadius: 999,
                            padding: "0.1rem 0.5rem",
                        }}
                    >
                        {stage.attachments.length}
                    </span>
                </h3>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    Opcional · imágenes, PDF y video (máx 50 MB c/u)
                </span>
            </div>
            <div className={styles.sectionBody}>
                <div
                    className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ""}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                >
                    <div className={styles.dropZoneIcon}>{uploading ? "⏳" : "⬆"}</div>
                    <div className={styles.dropZoneTitle}>
                        {uploading
                            ? "Subiendo…"
                            : "Arrastra archivos aquí o haz click para seleccionar"}
                    </div>
                    <div className={styles.dropZoneHint}>
                        JPG, PNG, GIF, WebP · PDF · MP4, MOV, WebM
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={PROYECTO_ATTACHMENTS.ACCEPTED_MIME.join(",")}
                        style={{ display: "none" }}
                        onChange={onSelect}
                    />
                </div>

                {stage.attachments.length > 0 && (
                    <div className={styles.attGrid} style={{ marginTop: "0.85rem" }}>
                        {stage.attachments.map((a) => (
                            <AttachmentCard
                                key={a.id}
                                attachment={a}
                                onRemove={() => removeAtt(a)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function AttachmentCard({
    attachment,
    onRemove,
}: {
    attachment: Attachment;
    onRemove: () => void;
}) {
    const url = resolveAttachmentUrl(attachment);
    return (
        <div className={styles.attCard}>
            <div className={styles.attPreview}>
                {attachment.kind === "image" ? (
                    <img src={url} alt={attachment.name} />
                ) : attachment.kind === "video" ? (
                    <video src={url} muted />
                ) : (
                    <span style={{ fontSize: "1.8rem" }}>{fileIcon(attachment.kind)}</span>
                )}
            </div>
            <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className={styles.attName}
                title={attachment.name}
            >
                {attachment.name}
            </a>
            <div className={styles.attMeta}>
                <span>{fmtBytes(attachment.size)}</span>
                <button
                    className={styles.attRemove}
                    onClick={onRemove}
                    title="Eliminar"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}
