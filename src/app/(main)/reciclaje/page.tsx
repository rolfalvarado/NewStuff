"use client";

import { useState, useEffect, useCallback } from "react";
import { getRecycledItems, RecycledItem } from "@/app/actions/get-recycled";
import { restoreRecycledItem } from "@/app/actions/restore-recycled";
import { purgeRecycledItem } from "@/app/actions/purge-recycled";

export default function ReciclajePage() {
    const [items, setItems] = useState<RecycledItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<{ [id: string]: "restore" | "purge" | null }>({});
    const [confirmPurge, setConfirmPurge] = useState<string | null>(null);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getRecycledItems();
            setItems(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const handleRestore = async (id: string) => {
        setActionLoading(prev => ({ ...prev, [id]: "restore" }));
        try {
            const result = await restoreRecycledItem(id);
            if (result.success) {
                setItems(prev => prev.filter(i => i.id !== id));
            } else {
                alert("Error al restaurar: " + result.error);
            }
        } finally {
            setActionLoading(prev => ({ ...prev, [id]: null }));
        }
    };

    const handlePurgeConfirm = (id: string) => {
        setConfirmPurge(id);
    };

    const handlePurge = async (id: string) => {
        setConfirmPurge(null);
        setActionLoading(prev => ({ ...prev, [id]: "purge" }));
        try {
            const result = await purgeRecycledItem(id);
            if (result.success) {
                setItems(prev => prev.filter(i => i.id !== id));
            } else {
                alert("Error al eliminar: " + result.error);
            }
        } finally {
            setActionLoading(prev => ({ ...prev, [id]: null }));
        }
    };

    const formatDate = (iso: string) => {
        try {
            return new Date(iso).toLocaleString("es-CL", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit"
            });
        } catch { return iso; }
    };

    return (
        <>
            {/* Confirm Purge Modal */}
            {confirmPurge && (
                <div style={{
                    position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 1000, backdropFilter: "blur(4px)"
                }}>
                    <div style={{
                        backgroundColor: "#1E293B", padding: "2rem", borderRadius: "0.75rem",
                        width: "90%", maxWidth: "420px", border: "1px solid rgba(255,255,255,0.1)",
                        boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)"
                    }}>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: "600", color: "#F8FAFC", marginBottom: "0.75rem" }}>
                            ¿Eliminar definitivamente?
                        </h3>
                        <p style={{ color: "#94A3B8", fontSize: "14px", marginBottom: "1.5rem" }}>
                            Esta acción no se puede deshacer. El elemento se eliminará de forma permanente.
                        </p>
                        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                            <button
                                onClick={() => setConfirmPurge(null)}
                                style={{
                                    padding: "0.5rem 1.25rem", borderRadius: "0.5rem", fontSize: "13px",
                                    backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)",
                                    color: "#E2E8F0", cursor: "pointer"
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handlePurge(confirmPurge)}
                                style={{
                                    padding: "0.5rem 1.25rem", borderRadius: "0.5rem", fontSize: "13px",
                                    backgroundColor: "#DC2626", border: "none",
                                    color: "white", cursor: "pointer", fontWeight: "600"
                                }}
                            >
                                Eliminar Definitivo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="container" style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                paddingTop: "2rem",
                paddingBottom: "1rem"
            }}>
                <div className="card-panel" style={{
                    flex: 1,
                    padding: "0",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden"
                }}>
                    {/* Header */}
                    <div style={{
                        padding: "1.5rem 2rem",
                        borderBottom: "1px solid var(--border-color)",
                        backgroundColor: "rgba(255, 255, 255, 0.02)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between"
                    }}>
                        <div>
                            <h2 style={{ fontSize: "1.25rem", color: "var(--text-main)", margin: 0 }}>
                                Papelera de Reciclaje
                            </h2>
                            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "0.25rem", marginBottom: 0 }}>
                                Los elementos eliminados se guardan aquí antes de ser borrados permanentemente
                            </p>
                        </div>
                        <span style={{
                            fontSize: "12px", color: "var(--text-muted)",
                            backgroundColor: "rgba(255,255,255,0.05)",
                            padding: "0.25rem 0.75rem", borderRadius: "999px",
                            border: "1px solid var(--border-color)"
                        }}>
                            {items.length} elemento{items.length !== 1 ? "s" : ""}
                        </span>
                    </div>

                    {/* Table */}
                    <div style={{ flex: 1, overflow: "auto", padding: "0 1rem" }}>
                        {loading ? (
                            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
                                Cargando...
                            </div>
                        ) : (
                            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0" }}>
                                <thead>
                                    <tr style={{ backgroundColor: "rgba(255, 255, 255, 0.02)" }}>
                                        <th style={{ textAlign: "left", padding: "1rem", color: "var(--text-secondary)", fontWeight: "600", borderBottom: "1px solid var(--border-color)", fontSize: "13px" }}>
                                            Tipo
                                        </th>
                                        <th style={{ textAlign: "left", padding: "1rem", color: "var(--text-secondary)", fontWeight: "600", borderBottom: "1px solid var(--border-color)", fontSize: "13px" }}>
                                            Nombre
                                        </th>
                                        <th style={{ textAlign: "left", padding: "1rem", color: "var(--text-secondary)", fontWeight: "600", borderBottom: "1px solid var(--border-color)", fontSize: "13px" }}>
                                            URL / IP
                                        </th>
                                        <th style={{ textAlign: "left", padding: "1rem", color: "var(--text-secondary)", fontWeight: "600", borderBottom: "1px solid var(--border-color)", fontSize: "13px" }}>
                                            Servidor
                                        </th>
                                        <th style={{ textAlign: "left", padding: "1rem", color: "var(--text-secondary)", fontWeight: "600", borderBottom: "1px solid var(--border-color)", fontSize: "13px" }}>
                                            Eliminado
                                        </th>
                                        <th style={{ textAlign: "right", padding: "1rem", color: "var(--text-secondary)", fontWeight: "600", borderBottom: "1px solid var(--border-color)", fontSize: "13px" }}>
                                            Acciones
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.length > 0 ? (
                                        items.map((item) => {
                                            const isSystem = item.type === "system";
                                            const isRestoring = actionLoading[item.id] === "restore";
                                            const isPurging = actionLoading[item.id] === "purge";
                                            const isActing = isRestoring || isPurging;

                                            return (
                                                <tr key={item.id}
                                                    style={{ transition: "background-color 0.2s" }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.02)"}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                                                >
                                                    {/* Tipo */}
                                                    <td style={{ padding: "1.25rem 1rem", borderBottom: "1px solid var(--border-color)" }}>
                                                        <span style={{
                                                            display: "inline-block",
                                                            padding: "0.2rem 0.6rem",
                                                            borderRadius: "999px",
                                                            fontSize: "11px",
                                                            fontWeight: "600",
                                                            backgroundColor: isSystem ? "rgba(34,197,94,0.12)" : "rgba(59,130,246,0.12)",
                                                            color: isSystem ? "#22C55E" : "#60A5FA",
                                                            border: `1px solid ${isSystem ? "rgba(34,197,94,0.3)" : "rgba(59,130,246,0.3)"}`
                                                        }}>
                                                            {isSystem ? "Sistema" : "Servidor"}
                                                        </span>
                                                    </td>
                                                    {/* Nombre */}
                                                    <td style={{ padding: "1.25rem 1rem", color: "var(--text-main)", fontWeight: "500", borderBottom: "1px solid var(--border-color)", fontSize: "13px" }}>
                                                        {isSystem ? item.nombre_empresa : item.nombre_servidor}
                                                    </td>
                                                    {/* URL / IP */}
                                                    <td style={{ padding: "1.25rem 1rem", color: "var(--text-muted)", fontSize: "12px", borderBottom: "1px solid var(--border-color)", fontFamily: "monospace" }}>
                                                        {isSystem ? item.url_sitio : item.ip_servidor}
                                                    </td>
                                                    {/* Servidor alojado (solo sistemas) */}
                                                    <td style={{ padding: "1.25rem 1rem", borderBottom: "1px solid var(--border-color)" }}>
                                                        {isSystem && item.nombre_servidor ? (
                                                            <span style={{ fontSize: "12px", color: "#94A3B8", fontFamily: "monospace" }}>
                                                                {item.nombre_servidor}
                                                            </span>
                                                        ) : (
                                                            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)" }}>—</span>
                                                        )}
                                                    </td>
                                                    {/* Fecha eliminación */}
                                                    <td style={{ padding: "1.25rem 1rem", color: "var(--text-muted)", fontSize: "12px", borderBottom: "1px solid var(--border-color)" }}>
                                                        <div>{formatDate(item.deleted_at)}</div>
                                                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: "2px" }}>
                                                            por {item.deleted_by}
                                                        </div>
                                                    </td>
                                                    {/* Acciones */}
                                                    <td style={{ padding: "1.25rem 1rem", textAlign: "right", borderBottom: "1px solid var(--border-color)" }}>
                                                        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                                                            <button
                                                                className="btn btn-primary"
                                                                onClick={() => handleRestore(item.id)}
                                                                disabled={isActing}
                                                                style={{ padding: "0.4rem 1rem", fontSize: "12px", minWidth: "90px" }}
                                                            >
                                                                {isRestoring ? "Restaurando..." : "Restaurar"}
                                                            </button>
                                                            <button
                                                                onClick={() => handlePurgeConfirm(item.id)}
                                                                disabled={isActing}
                                                                style={{
                                                                    padding: "0.4rem 1rem", fontSize: "12px", minWidth: "130px",
                                                                    backgroundColor: "rgba(220,38,38,0.12)",
                                                                    border: "1px solid rgba(220,38,38,0.3)",
                                                                    color: "#F87171", borderRadius: "0.375rem",
                                                                    cursor: isActing ? "wait" : "pointer",
                                                                    fontFamily: "inherit"
                                                                }}
                                                            >
                                                                {isPurging ? "Eliminando..." : "Eliminar Definitivo"}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
                                                La papelera está vacía.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
