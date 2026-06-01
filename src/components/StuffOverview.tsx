"use client";

import { useState, useEffect, Fragment } from "react";
import Image from "next/image";
import { getServers, ServerPublic } from "@/app/actions/get-servers";
import { getAllSystems, System } from "@/app/actions/get-systems";

export default function StuffOverview() {
    const [servers, setServers] = useState<ServerPublic[]>([]);
    const [systems, setSystems] = useState<System[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [isOfflineListOpen, setIsOfflineListOpen] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [serversData, systemsData] = await Promise.all([
                    getServers(),
                    getAllSystems()
                ]);
                setServers(serversData);
                setSystems(systemsData);
            } catch (error) {
                console.error("Error loading data:", error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    // Orden específico de servidores (basado en la tabla de referencia)
    // Los servidores que no estén en esta lista se asignarán al final en orden alfabético.
    const SERVER_ORDER_MAP: Record<string, number> = {
        "Pe 1": 1,
        "Pe 2": 2,
        "AM 1": 3,
        "AM 8": 4,
        "AM NTS": 5,
        "AM SUD": 6,
        "SUD 2": 7,
        "AM 60": 8,
        "AM 71": 9,
        "AM 73": 10,
        "AM 75": 11,
        "AM 76": 12,
        "AM 77": 13,
        "AM 78": 14,
        "AM 79": 15,
        "AM 80": 16,
        "AM SUD INTE": 17,
        "FE NEW": 18,
        "AM 81": 19,
        "AM 82": 20,
        "AM 83": 21,
        "AM 84": 22,
        "AM 85": 23,
        "AM 86": 24,
        "AM 87": 25,
        "AM 88": 26,
        "AM 89": 27,
        "AM 90": 28,
        "AM 91": 29,
        "AM 92": 30,
        "AM 93": 31,
        "AM 94": 32,
        "AM 95": 33,
        "AM 96": 34,
        "AM 97": 35,
        "AM 200": 36,
        "AM 201": 37,
        "AM 202": 38,
        "AM 203": 39,
        "AM 204": 40,
        "AM 205": 41,
        "AM 206": 42,
        "AM 207": 43,
        "AM 208": 44,
        "AM 209": 45,
        "AM 210": 46,
        "AM 211": 47,
        "AM 212": 48,
        "AM 213": 49,
        "AM 214": 50,
        "AM 215": 51,
        "AM 216": 52,
        "AM 217": 53,
        "AM 218": 54,
        "AM 219": 55,
        "AM 220": 56,
        "FabulaProye": 57,
        "AM 221": 58,
        "AM 222": 59,
        "AM 223": 60,
        "AM 224": 61,
        "AM 225": 62,
        "AM 226": 63,
        "AM 227": 64,
        "AM 228": 65,
    };

    // Buscar el orden de un servidor, soportando coincidencia parcial (case-insensitive)
    const getServerOrder = (name: string): number => {
        // Búsqueda exacta primero
        if (SERVER_ORDER_MAP[name] !== undefined) return SERVER_ORDER_MAP[name];
        // Búsqueda case-insensitive
        const nameLower = name.toLowerCase();
        for (const [key, val] of Object.entries(SERVER_ORDER_MAP)) {
            if (key.toLowerCase() === nameLower) return val;
        }
        // Búsqueda por coincidencia parcial (e.g. "AM 97 - Fabula Chile" contiene "AM 97")
        for (const [key, val] of Object.entries(SERVER_ORDER_MAP)) {
            if (nameLower.includes(key.toLowerCase()) || key.toLowerCase().includes(nameLower)) return val;
        }
        // Si no se encuentra, asignar el siguiente número disponible (va al final)
        const maxOrder = Math.max(...Object.values(SERVER_ORDER_MAP));
        return maxOrder + 1000; // Margen amplio para que queden al final
    };

    const filteredServers = servers.filter(server => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            (server.nombre_servidor && String(server.nombre_servidor).toLowerCase().includes(query)) ||
            (server.ip_servidor && String(server.ip_servidor).toLowerCase().includes(query)) ||
            systems.some(sys =>
                String(sys.nombre_servidor).toLowerCase() === String(server.nombre_servidor).toLowerCase() &&
                ((sys.nombre_empresa && String(sys.nombre_empresa).toLowerCase().includes(query)) ||
                    (sys.puerto_web && String(sys.puerto_web).toLowerCase().includes(query)) ||
                    (sys.url_sitio && String(sys.url_sitio).toLowerCase().includes(query)))
            )
        );
    }).sort((a, b) => {
        const orderA = getServerOrder(a.nombre_servidor || "");
        const orderB = getServerOrder(b.nombre_servidor || "");
        if (orderA !== orderB) return orderA - orderB;
        // Si ambos no están en la lista, ordenar alfabéticamente
        return (a.nombre_servidor || "").localeCompare(b.nombre_servidor || "");
    });


    if (loading) return <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>Cargando información...</div>;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", height: "100%" }}>
            {/* Header / Search */}
            <div className="card-panel" style={{
                padding: "1rem 1.5rem",
                display: "flex",
                alignItems: "center",
                gap: "1.5rem"
            }}>
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    backgroundColor: "var(--bg-main)",
                    borderRadius: "var(--radius-md)",
                    padding: "0.5rem 1rem",
                    width: "300px",
                    border: "1px solid var(--border-color)"
                }}>
                    <Image src="/Icons/search.svg" alt="Buscar" width={18} height={18} style={{ opacity: 0.5, marginRight: "0.5rem" }} />
                    <input
                        type="text"
                        placeholder="Filtrar Stuff..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ border: "none", outline: "none", fontSize: "0.875rem", width: "100%", backgroundColor: "transparent", color: "var(--text-main)" }}
                    />
                </div>

                {/* Offline badge */}
                <button
                    onClick={() => setIsOfflineListOpen(true)}
                    style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "0.25rem 0.5rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.375rem"
                    }}
                    title="Ver sistemas offline"
                >
                    <span style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: "#e11d48",
                        display: "inline-block",
                        flexShrink: 0
                    }} />
                    <span style={{
                        fontSize: "0.875rem",
                        fontWeight: "700",
                        color: "#e11d48"
                    }}>Offline</span>
                    <span style={{
                        fontSize: "0.875rem",
                        fontWeight: "700",
                        color: "#e11d48"
                    }}>({systems.filter(s => !(s.estado_sitio?.toLowerCase().includes("online") || s.estado_sitio?.toLowerCase().includes("on line"))).length})</span>
                </button>

                <h2 style={{ fontSize: "1.25rem", fontWeight: "600", margin: 0, color: "var(--text-main)", marginLeft: "auto" }}>Stuff - Vista General</h2>
            </div>

            {/* Overview Table */}
            <div style={{
                flex: 1,
                backgroundColor: "var(--bg-card)",
                borderRadius: "var(--radius-md)",
                padding: "1.5rem",
                overflowY: "auto",
                maxHeight: "calc(100vh - 180px)",
                border: "1px solid var(--border-color)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center"
            }}>
                <table style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "13px",
                    backgroundColor: "white",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    borderRadius: "8px",
                    overflow: "hidden"
                }}>
                    <thead>
                        <tr style={{ backgroundColor: "#f9f9f9", borderBottom: "2px solid #06ccb4" }}>
                            <th style={{ padding: "10px", textAlign: "left", color: "#374151", border: "1px solid #C5E0B4" }}>Servidor</th>
                            <th style={{ padding: "10px", textAlign: "left", color: "#374151", border: "1px solid #C5E0B4" }}>Instancia</th>
                            <th style={{ padding: "10px", textAlign: "left", color: "#374151", border: "1px solid #C5E0B4" }}>Version</th>
                            <th style={{ padding: "10px", textAlign: "left", color: "#374151", border: "1px solid #C5E0B4" }}>Sistema</th>
                            <th style={{ padding: "10px", textAlign: "left", color: "#374151", border: "1px solid #C5E0B4" }}>ip</th>
                            <th style={{ padding: "10px", textAlign: "left", color: "#374151", border: "1px solid #C5E0B4" }}>Puerto Web</th>
                            <th style={{ padding: "10px", textAlign: "left", color: "#374151", border: "1px solid #C5E0B4" }}>Memoria</th>
                            <th style={{ padding: "10px", textAlign: "left", color: "#374151", border: "1px solid #C5E0B4" }}>Url</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredServers
                            .filter(server => systems.some(sys => String(sys.nombre_servidor).toLowerCase() === String(server.nombre_servidor).toLowerCase()))
                            .map((server) => {
                                const query = searchQuery.toLowerCase();
                                const hostedSystems = systems.filter(sys =>
                                    String(sys.nombre_servidor).toLowerCase() === String(server.nombre_servidor).toLowerCase() &&
                                    // Si hay búsqueda activa, filtrar también por los campos del sistema
                                    (!searchQuery || (
                                        (sys.nombre_empresa && String(sys.nombre_empresa).toLowerCase().includes(query)) ||
                                        (sys.puerto_web && String(sys.puerto_web).toLowerCase().includes(query)) ||
                                        (sys.url_sitio && String(sys.url_sitio).toLowerCase().includes(query)) ||
                                        // También mostrar si el query coincide con servidor o IP (para no perder contexto)
                                        (server.nombre_servidor && String(server.nombre_servidor).toLowerCase().includes(query)) ||
                                        (server.ip_servidor && String(server.ip_servidor).toLowerCase().includes(query))
                                    ))
                                ).sort((a, b) => {
                                    const portA = Number(a.puerto_web) || 0;
                                    const portB = Number(b.puerto_web) || 0;
                                    return portA - portB;
                                });

                                return (
                                    <Fragment key={server.nombre_servidor}>
                                        <tr style={{ backgroundColor: "#DAE3F3", height: "8px" }}>
                                            <td colSpan={8} style={{ border: "1px solid #B4C7E7" }}></td>
                                        </tr>
                                        {hostedSystems.map((sys, idx) => {
                                            const isInactive = sys.disabled_state === true;
                                            const inactiveStyle = isInactive ? { color: "#9CA3AF", fontStyle: "italic" as const } : {};

                                            return (
                                                <tr key={`${server.nombre_servidor}-${idx}`} style={{ borderBottom: "1px solid #E5E7EB" }}>
                                                    <td style={{ padding: "8px 10px", fontWeight: "600", border: "1px solid #E5E7EB", backgroundColor: idx === 0 ? "#E2F0D9" : "transparent", ...inactiveStyle }}>
                                                        {idx === 0 ? (
                                                            <span
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    window.location.assign(`rdp://${server.ip_servidor}`);
                                                                }}
                                                                style={{ color: "inherit", cursor: "pointer" }}
                                                                title="Conectar a Escritorio Remoto"
                                                            >
                                                                {server.nombre_servidor}
                                                            </span>
                                                        ) : ""}
                                                    </td>
                                                    <td style={{ padding: "8px 10px", border: "1px solid #E5E7EB", ...inactiveStyle }}>
                                                        {idx === 0 ? server.tipo_instancia : ""}
                                                    </td>
                                                    <td style={{ padding: "8px 10px", border: "1px solid #E5E7EB", ...inactiveStyle }}>
                                                        {idx === 0 ? server.version_sistema : ""}
                                                    </td>
                                                    <td style={{ padding: "8px 10px", border: "1px solid #E5E7EB", backgroundColor: "#E2F0D9", fontWeight: "500", ...inactiveStyle }}>
                                                        {sys.nombre_empresa}
                                                    </td>
                                                    <td style={{ padding: "8px 10px", border: "1px solid #E5E7EB", fontFamily: "monospace", ...inactiveStyle }}>
                                                        {idx === 0 ? server.ip_servidor : ""}
                                                    </td>
                                                    <td style={{ padding: "8px 10px", border: "1px solid #E5E7EB", backgroundColor: "#E2F0D9", textAlign: "center", ...inactiveStyle }}>
                                                        {sys.puerto_web || "-"}
                                                    </td>
                                                    <td style={{ padding: "8px 10px", border: "1px solid #E5E7EB", backgroundColor: "#E2F0D9", ...inactiveStyle }}>
                                                        {sys.memoria_sistema || "-"}
                                                    </td>
                                                    <td style={{ padding: "8px 10px", border: "1px solid #E5E7EB", backgroundColor: "#E2F0D9", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...inactiveStyle }}>
                                                        <a href={sys.url_sitio} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: isInactive ? "#9CA3AF" : "#2563EB" }}>
                                                            {sys.url_sitio}
                                                        </a>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </Fragment>
                                );
                            })}
                    </tbody>
                </table>
            </div>

            {/* Offline Systems Modal */}
            {isOfflineListOpen && (
                <div
                    style={{
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
                    }}
                    onClick={() => setIsOfflineListOpen(false)}
                >
                    <div
                        style={{
                            backgroundColor: "var(--bg-card)",
                            borderRadius: "12px",
                            width: "500px",
                            maxWidth: "90%",
                            maxHeight: "80vh",
                            boxShadow: "var(--shadow-md)",
                            display: "flex",
                            flexDirection: "column",
                            overflow: "hidden",
                            border: "1px solid var(--border-color)"
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h2 style={{ fontSize: "1.25rem", fontWeight: "600", margin: 0, color: "var(--text-main)" }}>Sistemas Offline</h2>
                            <button
                                onClick={() => setIsOfflineListOpen(false)}
                                style={{
                                    width: "32px",
                                    height: "32px",
                                    borderRadius: "6px",
                                    border: "none",
                                    backgroundColor: "transparent",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    transition: "background-color 0.2s"
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: "1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
                            {systems.filter(s => !(s.estado_sitio?.toLowerCase().includes("online") || s.estado_sitio?.toLowerCase().includes("on line"))).length === 0 ? (
                                <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
                                    No hay sistemas offline en este momento.
                                </div>
                            ) : (
                                systems
                                    .filter(s => !(s.estado_sitio?.toLowerCase().includes("online") || s.estado_sitio?.toLowerCase().includes("on line")))
                                    .map((system, idx) => (
                                        <div key={idx} style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            padding: "1rem",
                                            backgroundColor: "rgba(239, 68, 68, 0.05)",
                                            border: "1px solid rgba(239, 68, 68, 0.1)",
                                            borderRadius: "8px"
                                        }}>
                                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                                <span style={{ fontWeight: "600", color: "#f87171", fontSize: "0.875rem" }}>
                                                    {system.nombre_empresa}
                                                </span>
                                                <span style={{ fontSize: "0.75rem", color: "rgba(248, 113, 113, 0.7)" }}>
                                                    {system.nombre_servidor}
                                                </span>
                                                <a
                                                    href={system.url_sitio}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{ fontSize: "0.75rem", color: "rgba(248, 113, 113, 0.6)", textDecoration: "none" }}
                                                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = "underline"}
                                                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = "none"}
                                                >
                                                    {system.url_sitio}
                                                </a>
                                            </div>
                                            <div style={{
                                                fontSize: "0.75rem",
                                                padding: "0.25rem 0.625rem",
                                                backgroundColor: "rgba(239, 68, 68, 0.1)",
                                                color: "#f87171",
                                                borderRadius: "4px",
                                                fontWeight: "600",
                                                textTransform: "uppercase",
                                                letterSpacing: "0.025em"
                                            }}>
                                                Offline
                                            </div>
                                        </div>
                                    ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
