"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { ServerPublic } from "@/app/actions/get-servers";
import { getAllSystems, System } from "@/app/actions/get-systems";

interface ServerOverviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    servers: ServerPublic[];
}

export default function ServerOverviewModal({ isOpen, onClose, servers }: ServerOverviewModalProps) {
    const [systems, setSystems] = useState<System[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            getAllSystems()
                .then(data => {
                    setSystems(data);
                })
                .catch(err => console.error("Error fetching systems:", err))
                .finally(() => setLoading(false));
        }
    }, [isOpen]);

    // Group systems by server
    const { serverGroups, unassignedSystems } = useMemo<{ serverGroups: Record<string, System[]>, unassignedSystems: System[] }>(() => {
        const groups: Record<string, System[]> = {};
        const unassigned: System[] = [];

        // Initialize with empty arrays for all known servers
        servers.forEach(s => {
            if (s.nombre_servidor) {
                const key = s.nombre_servidor.trim().toLowerCase();
                groups[key] = [];
            }
        });

        // Fill with systems
        systems.forEach(sys => {
            const rawName = sys.nombre_servidor || "";
            const serverName = rawName.trim().toLowerCase();

            // If the server fits a known group, add it
            if (groups[serverName]) {
                groups[serverName].push(sys);
            } else {
                // If it doesn't match any known server, it's unassigned/orphan
                unassigned.push(sys);
            }
        });

        return { serverGroups: groups, unassignedSystems: unassigned };
    }, [servers, systems]);

    // Filter based on search
    const filteredServers = servers.filter(s =>
        s.nombre_servidor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.ip_servidor?.includes(searchTerm)
    );

    if (!isOpen) return null;

    return (
        <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(4px)"
        }}>
            <div style={{
                backgroundColor: "var(--bg-card)",
                borderRadius: "12px",
                width: "900px",
                maxWidth: "95vw",
                height: "90vh",
                boxShadow: "var(--shadow-md)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                border: "1px solid var(--border-color)"
            }}>
                {/* Header */}
                <div style={{
                    padding: "1.5rem",
                    borderBottom: "1px solid var(--border-color)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backgroundColor: "var(--bg-main)"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <h2 style={{ fontSize: "1.25rem", fontWeight: "600", margin: 0, color: "var(--text-main)" }}>
                            Vista General
                        </h2>
                        {/* System Count Indicator */}
                        <div style={{
                            fontSize: "0.85rem",
                            color: "var(--text-muted)",
                            backgroundColor: "var(--bg-main)",
                            border: "1px solid var(--border-color)",
                            padding: "0.2rem 0.6rem",
                            borderRadius: "12px"
                        }}>
                            {loading ? "Cargando..." : (
                                <span>
                                    <b>{systems.length}</b> sistemas | <b>{unassignedSystems.length}</b> sin coincidencia
                                </span>
                            )}
                        </div>

                        {/* Search in modal */}
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            backgroundColor: "var(--bg-card)",
                            borderRadius: "var(--radius-md)",
                            padding: "0.4rem 0.8rem",
                            border: "1px solid var(--border-color)",
                            width: "250px"
                        }}>
                            <Image
                                src="/Icons/search.svg"
                                alt="Buscar"
                                width={16}
                                height={16}
                                style={{ opacity: 0.5, marginRight: "0.5rem" }}
                            />
                            <input
                                type="text"
                                placeholder="Filtrar servidores..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    border: "none",
                                    outline: "none",
                                    fontSize: "0.875rem",
                                    width: "100%",
                                    backgroundColor: "transparent",
                                    color: "var(--text-main)"
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Content - Vertical Scroll */}
                <div style={{
                    padding: "1.5rem",
                    overflowY: "auto",
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.5rem",
                    backgroundColor: "#f3f4f6" // Explicit light gray bg
                }}>
                    {loading ? (
                        <div style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
                            Cargando datos...
                        </div>
                    ) : filteredServers.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
                            No se encontraron servidores.
                        </div>
                    ) : (
                        <>
                            {filteredServers.map((server) => {
                                const key = (server.nombre_servidor || "").trim().toLowerCase();
                                const serverSystems = serverGroups[key] || [];
                                const hasSystems = serverSystems.length > 0;

                                // If server has no systems, show a compact version
                                if (!hasSystems) {
                                    return (
                                        <div key={server.nombre_servidor} style={{
                                            backgroundColor: "#ffffff",
                                            borderRadius: "8px",
                                            border: "1px solid #e5e7eb",
                                            padding: "0.75rem 1.5rem",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            opacity: 0.7
                                        }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                                                <span style={{ fontWeight: "600", color: "#374151" }}>{server.nombre_servidor}</span>
                                                <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Sin sistemas asignados</span>
                                            </div>
                                            <div style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#9ca3af" }}>
                                                {server.ip_servidor || "-"}
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={server.nombre_servidor} style={{
                                        backgroundColor: "#ffffff",
                                        borderRadius: "8px",
                                        border: "1px solid #d1d5db",
                                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                                        overflow: "hidden"
                                    }}>
                                        {/* Server Card Header */}
                                        <div style={{
                                            padding: "1rem 1.5rem",
                                            borderBottom: "1px solid #e5e7eb",
                                            backgroundColor: "#f9fafb",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "2rem",
                                            flexWrap: "wrap"
                                        }}>
                                            <div style={{ display: "flex", flexDirection: "column" }}>
                                                <span style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Servidor</span>
                                                <span style={{ fontSize: "1rem", fontWeight: "700", color: "#111827" }}>
                                                    {server.nombre_servidor} <span style={{ fontSize: "0.8rem", fontWeight: "400", color: "#059669" }}>({serverSystems.length} sistemas)</span>
                                                </span>
                                            </div>

                                            <div style={{ display: "flex", flexDirection: "column" }}>
                                                <span style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>IP</span>
                                                <span style={{ fontSize: "0.875rem", color: "#1f2937", fontFamily: "monospace" }}>{server.ip_servidor || "-"}</span>
                                            </div>

                                            <div style={{ display: "flex", flexDirection: "column" }}>
                                                <span style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Instancia</span>
                                                <span style={{ fontSize: "0.875rem", color: "#1f2937" }}>{server.tipo_instancia || "-"}</span>
                                            </div>

                                            <div style={{ display: "flex", flexDirection: "column" }}>
                                                <span style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Versión</span>
                                                <span style={{ fontSize: "0.875rem", color: "#1f2937" }}>{server.version_sistema || "-"}</span>
                                            </div>
                                        </div>

                                        {/* Systems List */}
                                        <div style={{ padding: "0" }}>
                                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                                                <thead>
                                                    <tr style={{ borderBottom: "1px solid #e5e7eb", backgroundColor: "#ffffff" }}>
                                                        <th style={{ textAlign: "left", padding: "0.75rem 1.5rem", color: "#4b5563", fontWeight: "600", width: "40%" }}>Empresa</th>
                                                        <th style={{ textAlign: "left", padding: "0.75rem 1.5rem", color: "#4b5563", fontWeight: "600", width: "20%" }}>Memoria</th>
                                                        <th style={{ textAlign: "left", padding: "0.75rem 1.5rem", color: "#4b5563", fontWeight: "600", width: "40%" }}>URL Sitio</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {serverSystems.map((sys, idx) => (
                                                        <tr key={idx} style={{ borderBottom: idx < serverSystems.length - 1 ? "1px solid #e5e7eb" : "none" }}>
                                                            <td style={{ padding: "0.75rem 1.5rem", color: "#111827" }}>{sys.nombre_empresa}</td>
                                                            <td style={{ padding: "0.75rem 1.5rem", color: "#6b7280" }}>{sys.memoria_sistema || "-"}</td>
                                                            <td style={{ padding: "0.75rem 1.5rem", color: "#2563eb" }}>
                                                                <a href={sys.url_sitio} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
                                                                    {sys.url_sitio}
                                                                </a>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Unassigned Systems Section */}
                            {unassignedSystems.length > 0 && (
                                <div style={{
                                    backgroundColor: "#ffffff",
                                    borderRadius: "8px",
                                    border: "1px dashed #fca5a5",
                                    marginTop: "2rem",
                                    padding: "1rem"
                                }}>
                                    <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "1rem", color: "#e11d48" }}>
                                        ⚠️ Sistemas sin servidor asignado / coincidente ({unassignedSystems.length})
                                    </h3>
                                    <p style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "1rem" }}>
                                        Estos sistemas tienen un nombre de servidor que no coincide con ninguno de los servidores registrados arriba. Verifique ortografía y espacios.
                                    </p>
                                    <div style={{ overflowX: "auto" }}>
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                                            <thead>
                                                <tr style={{ borderBottom: "1px solid #fecaca", backgroundColor: "#fff1f2" }}>
                                                    <th style={{ textAlign: "left", padding: "0.5rem", color: "#991b1b" }}>Empresa</th>
                                                    <th style={{ textAlign: "left", padding: "0.5rem", color: "#991b1b" }}>Info Servidor ("nombre_servidor")</th>
                                                    <th style={{ textAlign: "left", padding: "0.5rem", color: "#991b1b" }}>URL</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {unassignedSystems.map((sys, idx) => (
                                                    <tr key={idx} style={{ borderBottom: "1px solid #e5e7eb" }}>
                                                        <td style={{ padding: "0.5rem", color: "#374151" }}>{sys.nombre_empresa}</td>
                                                        <td style={{ padding: "0.5rem", fontFamily: "monospace", color: "#e11d48" }}>
                                                            "{sys.nombre_servidor}"
                                                        </td>
                                                        <td style={{ padding: "0.5rem", color: "#374151" }}>{sys.url_sitio}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: "1rem 1.5rem",
                    borderTop: "1px solid var(--border-color)",
                    display: "flex",
                    justifyContent: "flex-end",
                    backgroundColor: "var(--bg-card)"
                }}>
                    <button
                        onClick={onClose}
                        className="btn"
                        style={{
                            padding: "0.5rem 1.5rem",
                            border: "1px solid var(--border-color)",
                            backgroundColor: "var(--bg-main)",
                            color: "var(--text-main)",
                            borderRadius: "var(--radius-md)",
                            cursor: "pointer",
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
