"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
    AppMovilAPI,
    Organization,
    AppUser,
} from "@/lib/appmovil-api";

type TabKey = "active" | "all";

export default function AppMovilClient() {
    const [orgs, setOrgs] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<TabKey>("active");
    const [search, setSearch] = useState("");
    const [togglingId, setTogglingId] = useState<string | null>(null);

    // Panel de usuarios de una organización
    const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);

    const loadOrgs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await AppMovilAPI.listOrganizations();
            setOrgs(data);
        } catch (e: any) {
            setError(e?.message || "Error al cargar organizaciones");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadOrgs();
    }, [loadOrgs]);

    const activeCount = useMemo(() => orgs.filter((o) => o.activeAPP).length, [orgs]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        let list = tab === "active" ? orgs.filter((o) => o.activeAPP) : orgs;
        if (q) {
            list = list.filter(
                (o) =>
                    o.hostname.toLowerCase().includes(q) ||
                    o.nombre_empresa.toLowerCase().includes(q) ||
                    (o.razonSocial || "").toLowerCase().includes(q) ||
                    (o.rut || "").toLowerCase().includes(q) ||
                    (o.grupo_empresa || "").toLowerCase().includes(q)
            );
        }
        return [...list].sort((a, b) => {
            // activas primero, luego alfabético por nombre/hostname
            if (a.activeAPP !== b.activeAPP) return a.activeAPP ? -1 : 1;
            const an = (a.nombre_empresa || a.hostname).toLowerCase();
            const bn = (b.nombre_empresa || b.hostname).toLowerCase();
            return an.localeCompare(bn);
        });
    }, [orgs, tab, search]);

    const handleToggle = async (org: Organization) => {
        const next = !org.activeAPP;
        if (
            !next &&
            !confirm(
                `¿Desactivar la app móvil para "${org.nombre_empresa || org.hostname}"?`
            )
        ) {
            return;
        }
        setTogglingId(org.id);
        try {
            const updated = await AppMovilAPI.setOrgActive(org.id, next);
            setOrgs((prev) =>
                prev.map((o) =>
                    o.id === org.id ? { ...o, activeAPP: updated.activeAPP } : o
                )
            );
            if (selectedOrg?.id === org.id) {
                setSelectedOrg({ ...selectedOrg, activeAPP: updated.activeAPP });
            }
        } catch (e: any) {
            alert(e?.message || "No se pudo actualizar el estado");
        } finally {
            setTogglingId(null);
        }
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                fontFamily: "var(--font-syne), sans-serif",
                color: "var(--text-main)",
            }}
        >
            {/* Header */}
            <div style={{ marginBottom: "1.25rem" }}>
                <h1
                    style={{
                        fontSize: "1.9rem",
                        fontWeight: 700,
                        color: "var(--primary)",
                        margin: 0,
                    }}
                >
                    App Móvil
                </h1>
                <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 0" }}>
                    Controla qué clientes tienen activa la aplicación móvil y
                    administra las claves de sus usuarios.
                </p>
            </div>

            {/* Métricas + tabs + buscador */}
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "1rem",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "1rem",
                }}
            >
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <TabButton
                        active={tab === "active"}
                        onClick={() => setTab("active")}
                        label="Con app activa"
                        count={activeCount}
                    />
                    <TabButton
                        active={tab === "all"}
                        onClick={() => setTab("all")}
                        label="Todas"
                        count={orgs.length}
                    />
                </div>

                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar empresa, hostname, RUT…"
                        style={{
                            padding: "0.6rem 0.9rem",
                            border: "1px solid var(--border-color)",
                            borderRadius: "var(--radius-md)",
                            minWidth: "280px",
                            fontSize: "0.9rem",
                            background: "var(--bg-card)",
                            color: "var(--text-main)",
                            outline: "none",
                        }}
                    />
                    <button
                        onClick={loadOrgs}
                        title="Recargar"
                        style={secondaryBtn}
                    >
                        ↻
                    </button>
                </div>
            </div>

            {/* Contenido */}
            <div
                style={{
                    flex: 1,
                    overflow: "auto",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-lg)",
                    background: "var(--bg-card)",
                }}
            >
                {loading ? (
                    <Centered>Cargando organizaciones…</Centered>
                ) : error ? (
                    <Centered>
                        <div style={{ textAlign: "center" }}>
                            <p style={{ color: "#dc2626", marginBottom: "0.75rem" }}>
                                {error}
                            </p>
                            <button onClick={loadOrgs} style={primaryBtn}>
                                Reintentar
                            </button>
                        </div>
                    </Centered>
                ) : filtered.length === 0 ? (
                    <Centered>No hay organizaciones que coincidan.</Centered>
                ) : (
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: "0.9rem",
                        }}
                    >
                        <thead
                            style={{
                                position: "sticky",
                                top: 0,
                                background: "var(--bg-main)",
                                zIndex: 1,
                            }}
                        >
                            <tr>
                                <Th>Empresa</Th>
                                <Th>Hostname</Th>
                                <Th>RUT</Th>
                                <Th center>App móvil</Th>
                                <Th center>Usuarios</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((org) => (
                                <tr
                                    key={org.id}
                                    style={{
                                        borderTop: "1px solid var(--border-color)",
                                    }}
                                >
                                    <Td>
                                        <div style={{ fontWeight: 600 }}>
                                            {org.nombre_empresa ||
                                                org.razonSocial ||
                                                "(sin nombre)"}
                                        </div>
                                        {org.grupo_empresa && (
                                            <div
                                                style={{
                                                    fontSize: "0.75rem",
                                                    color: "var(--text-muted)",
                                                }}
                                            >
                                                {org.grupo_empresa}
                                            </div>
                                        )}
                                    </Td>
                                    <Td>
                                        <span
                                            style={{
                                                fontFamily: "monospace",
                                                fontSize: "0.8rem",
                                                color: "var(--text-secondary)",
                                            }}
                                        >
                                            {org.hostname}
                                        </span>
                                    </Td>
                                    <Td>{org.rut || "—"}</Td>
                                    <Td center>
                                        <button
                                            onClick={() => handleToggle(org)}
                                            disabled={togglingId === org.id}
                                            title={
                                                org.activeAPP
                                                    ? "Desactivar app"
                                                    : "Activar app"
                                            }
                                            style={{
                                                ...togglePill,
                                                background: org.activeAPP
                                                    ? "#16a34a"
                                                    : "#e5e7eb",
                                                color: org.activeAPP
                                                    ? "#fff"
                                                    : "#6b7280",
                                                opacity:
                                                    togglingId === org.id ? 0.6 : 1,
                                            }}
                                        >
                                            {togglingId === org.id
                                                ? "…"
                                                : org.activeAPP
                                                ? "Activa"
                                                : "Inactiva"}
                                        </button>
                                    </Td>
                                    <Td center>
                                        <button
                                            onClick={() => setSelectedOrg(org)}
                                            style={secondaryBtn}
                                        >
                                            Ver usuarios
                                        </button>
                                    </Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {selectedOrg && (
                <UsersPanel
                    org={selectedOrg}
                    onClose={() => setSelectedOrg(null)}
                    onToggleApp={() => handleToggle(selectedOrg)}
                    toggling={togglingId === selectedOrg.id}
                />
            )}
        </div>
    );
}

/* ---------------- Panel de usuarios ---------------- */

function UsersPanel({
    org,
    onClose,
    onToggleApp,
    toggling,
}: {
    org: Organization;
    onClose: () => void;
    onToggleApp: () => void;
    toggling: boolean;
}) {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [pwModal, setPwModal] = useState<AppUser | null>(null);
    const [emailModal, setEmailModal] = useState<AppUser | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await AppMovilAPI.listUsers(org.hostname);
            setUsers(data);
        } catch (e: any) {
            setError(e?.message || "Error al cargar usuarios");
        } finally {
            setLoading(false);
        }
    }, [org.hostname]);

    useEffect(() => {
        load();
    }, [load]);

    const handleReset = async (u: AppUser) => {
        if (
            !confirm(
                `¿Reiniciar la clave de "${u.nombres} ${u.ape_paterno}" (${u.login})?\n\nLa clave quedará vacía y el usuario podrá crearla desde la app.`
            )
        )
            return;
        setBusyId(u._id);
        try {
            await AppMovilAPI.resetUserPassword(u._id);
            setUsers((prev) =>
                prev.map((x) => (x._id === u._id ? { ...x, password: "" } : x))
            );
        } catch (e: any) {
            alert(e?.message || "No se pudo reiniciar la clave");
        } finally {
            setBusyId(null);
        }
    };

    const handleSetEmail = async (u: AppUser, email: string) => {
        setBusyId(u._id);
        try {
            const r = await AppMovilAPI.setUserEmail(u._id, email);
            setUsers((prev) =>
                prev.map((x) =>
                    x._id === u._id ? { ...x, email: r.email || email } : x
                )
            );
            setEmailModal(null);
        } catch (e: any) {
            alert(e?.message || "No se pudo actualizar el correo");
        } finally {
            setBusyId(null);
        }
    };

    const handleSetPassword = async (u: AppUser, password: string) => {
        setBusyId(u._id);
        try {
            await AppMovilAPI.setUserPassword(u._id, password);
            setUsers((prev) =>
                prev.map((x) =>
                    x._id === u._id ? { ...x, password: "set" } : x
                )
            );
            setPwModal(null);
        } catch (e: any) {
            alert(e?.message || "No se pudo actualizar la clave");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                justifyContent: "flex-end",
                zIndex: 1000,
                backdropFilter: "blur(2px)",
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "min(640px, 100%)",
                    height: "100%",
                    background: "var(--bg-main)",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "-10px 0 30px rgba(0,0,0,0.25)",
                }}
            >
                {/* Header del panel */}
                <div
                    style={{
                        padding: "1.25rem 1.5rem",
                        borderBottom: "1px solid var(--border-color)",
                        background: "var(--bg-card)",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: "1rem",
                        }}
                    >
                        <div>
                            <h2
                                style={{
                                    margin: 0,
                                    fontSize: "1.3rem",
                                    fontWeight: 700,
                                    color: "var(--primary)",
                                }}
                            >
                                {org.nombre_empresa ||
                                    org.razonSocial ||
                                    org.hostname}
                            </h2>
                            <div
                                style={{
                                    fontFamily: "monospace",
                                    fontSize: "0.8rem",
                                    color: "var(--text-secondary)",
                                    marginTop: "0.25rem",
                                }}
                            >
                                {org.hostname}
                            </div>
                        </div>
                        <button onClick={onClose} style={secondaryBtn}>
                            ✕ Cerrar
                        </button>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            marginTop: "1rem",
                        }}
                    >
                        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                            App móvil:
                        </span>
                        <button
                            onClick={onToggleApp}
                            disabled={toggling}
                            style={{
                                ...togglePill,
                                background: org.activeAPP ? "#16a34a" : "#e5e7eb",
                                color: org.activeAPP ? "#fff" : "#6b7280",
                                opacity: toggling ? 0.6 : 1,
                            }}
                        >
                            {toggling
                                ? "…"
                                : org.activeAPP
                                ? "Activa — clic para desactivar"
                                : "Inactiva — clic para activar"}
                        </button>
                    </div>
                </div>

                {/* Lista de usuarios */}
                <div style={{ flex: 1, overflow: "auto", padding: "1rem 1.5rem" }}>
                    {loading ? (
                        <Centered>Cargando usuarios…</Centered>
                    ) : error ? (
                        <Centered>
                            <div style={{ textAlign: "center" }}>
                                <p style={{ color: "#dc2626" }}>{error}</p>
                                <button onClick={load} style={primaryBtn}>
                                    Reintentar
                                </button>
                            </div>
                        </Centered>
                    ) : users.length === 0 ? (
                        <Centered>Esta organización no tiene usuarios.</Centered>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                            {users.map((u) => {
                                const hasPw = !!(u.password && u.password.length > 0);
                                return (
                                    <div
                                        key={u._id}
                                        style={{
                                            border: "1px solid var(--border-color)",
                                            borderRadius: "var(--radius-md)",
                                            padding: "0.85rem 1rem",
                                            background: "var(--bg-card)",
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            gap: "1rem",
                                        }}
                                    >
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 600 }}>
                                                {u.nombres} {u.ape_paterno}
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: "0.8rem",
                                                    color: "var(--text-secondary)",
                                                }}
                                            >
                                                {u.login}
                                                {u.email ? ` · ${u.email}` : ""}
                                            </div>
                                            <span
                                                style={{
                                                    display: "inline-block",
                                                    marginTop: "0.35rem",
                                                    fontSize: "0.7rem",
                                                    padding: "0.1rem 0.5rem",
                                                    borderRadius: "999px",
                                                    background: hasPw
                                                        ? "#dcfce7"
                                                        : "#fef3c7",
                                                    color: hasPw
                                                        ? "#166534"
                                                        : "#92400e",
                                                }}
                                            >
                                                {hasPw
                                                    ? "Clave configurada"
                                                    : "Sin clave (la crea en la app)"}
                                            </span>
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                gap: "0.4rem",
                                                flexShrink: 0,
                                            }}
                                        >
                                            <button
                                                onClick={() => setEmailModal(u)}
                                                disabled={busyId === u._id}
                                                style={secondaryBtn}
                                            >
                                                Editar correo
                                            </button>
                                            <button
                                                onClick={() => setPwModal(u)}
                                                disabled={busyId === u._id}
                                                style={secondaryBtn}
                                            >
                                                Cambiar clave
                                            </button>
                                            <button
                                                onClick={() => handleReset(u)}
                                                disabled={busyId === u._id}
                                                style={dangerBtn}
                                            >
                                                {busyId === u._id ? "…" : "Reiniciar"}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {pwModal && (
                <PasswordModal
                    user={pwModal}
                    busy={busyId === pwModal._id}
                    onCancel={() => setPwModal(null)}
                    onSubmit={(pw) => handleSetPassword(pwModal, pw)}
                />
            )}

            {emailModal && (
                <EmailModal
                    user={emailModal}
                    busy={busyId === emailModal._id}
                    onCancel={() => setEmailModal(null)}
                    onSubmit={(email) => handleSetEmail(emailModal, email)}
                />
            )}
        </div>
    );
}

/* ---------------- Modal editar correo ---------------- */

function EmailModal({
    user,
    busy,
    onCancel,
    onSubmit,
}: {
    user: AppUser;
    busy: boolean;
    onCancel: () => void;
    onSubmit: (email: string) => void;
}) {
    const [email, setEmail] = useState(user.email || "");
    const trimmed = email.trim().toLowerCase();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed !== (user.email || "").toLowerCase();

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1100,
            }}
            onClick={onCancel}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "min(440px, 92%)",
                    background: "var(--bg-card)",
                    borderRadius: "var(--radius-lg)",
                    padding: "1.5rem",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
                }}
            >
                <h3 style={{ margin: "0 0 0.25rem", color: "var(--primary)" }}>
                    Editar correo
                </h3>
                <p
                    style={{
                        margin: "0 0 1rem",
                        fontSize: "0.85rem",
                        color: "var(--text-secondary)",
                    }}
                >
                    {user.nombres} {user.ape_paterno} ({user.login})
                </p>

                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    style={modalInput}
                    autoFocus
                />
                {trimmed.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && (
                    <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: "0.4rem" }}>
                        Correo inválido.
                    </div>
                )}

                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "0.5rem",
                        marginTop: "1.25rem",
                    }}
                >
                    <button onClick={onCancel} style={secondaryBtn}>
                        Cancelar
                    </button>
                    <button
                        onClick={() => onSubmit(trimmed)}
                        disabled={!valid || busy}
                        style={{
                            ...primaryBtn,
                            opacity: !valid || busy ? 0.5 : 1,
                            cursor: !valid || busy ? "not-allowed" : "pointer",
                        }}
                    >
                        {busy ? "Guardando…" : "Guardar correo"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ---------------- Modal cambiar clave ---------------- */

function PasswordModal({
    user,
    busy,
    onCancel,
    onSubmit,
}: {
    user: AppUser;
    busy: boolean;
    onCancel: () => void;
    onSubmit: (password: string) => void;
}) {
    const [pw, setPw] = useState("");
    const [pw2, setPw2] = useState("");
    const valid = pw.length >= 4 && pw === pw2;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1100,
            }}
            onClick={onCancel}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "min(420px, 92%)",
                    background: "var(--bg-card)",
                    borderRadius: "var(--radius-lg)",
                    padding: "1.5rem",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
                }}
            >
                <h3 style={{ margin: "0 0 0.25rem", color: "var(--primary)" }}>
                    Cambiar clave
                </h3>
                <p
                    style={{
                        margin: "0 0 1rem",
                        fontSize: "0.85rem",
                        color: "var(--text-secondary)",
                    }}
                >
                    {user.nombres} {user.ape_paterno} ({user.login})
                </p>

                <input
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="Nueva clave (mín. 4)"
                    style={modalInput}
                    autoFocus
                />
                <input
                    type="password"
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    placeholder="Repetir clave"
                    style={{ ...modalInput, marginTop: "0.6rem" }}
                />
                {pw2.length > 0 && pw !== pw2 && (
                    <div style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: "0.4rem" }}>
                        Las claves no coinciden.
                    </div>
                )}

                <div
                    style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "0.5rem",
                        marginTop: "1.25rem",
                    }}
                >
                    <button onClick={onCancel} style={secondaryBtn}>
                        Cancelar
                    </button>
                    <button
                        onClick={() => onSubmit(pw)}
                        disabled={!valid || busy}
                        style={{
                            ...primaryBtn,
                            opacity: !valid || busy ? 0.5 : 1,
                            cursor: !valid || busy ? "not-allowed" : "pointer",
                        }}
                    >
                        {busy ? "Guardando…" : "Guardar clave"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ---------------- helpers de UI ---------------- */

function TabButton({
    active,
    onClick,
    label,
    count,
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    count: number;
}) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: "0.55rem 1rem",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
                background: active ? "var(--primary)" : "var(--bg-card)",
                color: active ? "var(--text-on-primary)" : "var(--text-main)",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
            }}
        >
            {label}
            <span
                style={{
                    fontSize: "0.72rem",
                    padding: "0.05rem 0.45rem",
                    borderRadius: "999px",
                    background: active
                        ? "rgba(255,255,255,0.25)"
                        : "var(--bg-main)",
                }}
            >
                {count}
            </span>
        </button>
    );
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
    return (
        <th
            style={{
                textAlign: center ? "center" : "left",
                padding: "0.75rem 1rem",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                color: "var(--text-secondary)",
                fontWeight: 600,
            }}
        >
            {children}
        </th>
    );
}

function Td({ children, center }: { children: React.ReactNode; center?: boolean }) {
    return (
        <td
            style={{
                padding: "0.75rem 1rem",
                textAlign: center ? "center" : "left",
                verticalAlign: "middle",
            }}
        >
            {children}
        </td>
    );
}

function Centered({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                minHeight: "200px",
                padding: "2rem",
                color: "var(--text-secondary)",
            }}
        >
            {children}
        </div>
    );
}

const primaryBtn: React.CSSProperties = {
    padding: "0.55rem 1rem",
    border: "none",
    borderRadius: "var(--radius-md)",
    background: "var(--primary)",
    color: "var(--text-on-primary)",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
    padding: "0.5rem 0.85rem",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-md)",
    background: "var(--bg-card)",
    color: "var(--text-main)",
    fontWeight: 500,
    fontSize: "0.82rem",
    cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
    padding: "0.5rem 0.85rem",
    border: "1px solid #fca5a5",
    borderRadius: "var(--radius-md)",
    background: "#fef2f2",
    color: "#b91c1c",
    fontWeight: 600,
    fontSize: "0.82rem",
    cursor: "pointer",
};

const togglePill: React.CSSProperties = {
    border: "none",
    borderRadius: "999px",
    padding: "0.4rem 0.9rem",
    fontSize: "0.78rem",
    fontWeight: 600,
    cursor: "pointer",
};

const modalInput: React.CSSProperties = {
    width: "100%",
    padding: "0.65rem 0.9rem",
    border: "1px solid var(--border-color)",
    borderRadius: "var(--radius-md)",
    fontSize: "0.9rem",
    background: "var(--bg-main)",
    color: "var(--text-main)",
    outline: "none",
    boxSizing: "border-box",
};
