"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRef } from "react";
import { getServers, getServerPassword, ServerPublic } from "@/app/actions/get-servers";
import { getAllSystems, System } from "@/app/actions/get-systems";
import { createServer } from "@/app/actions/create-server";
import { deleteServer } from "@/app/actions/delete-server";
import { updateServer } from "@/app/actions/update-server";
import ImportServersExcelModal from "@/components/ImportServersExcelModal";

import ServerOverviewModal from "@/components/ServerOverviewModal";

export default function ClavesList() {
    const [searchQuery, setSearchQuery] = useState("");
    const [servers, setServers] = useState<ServerPublic[]>([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isOverviewModalOpen, setIsOverviewModalOpen] = useState(false);
    const [systems, setSystems] = useState<System[]>([]);

    // Estado para nuevo servidor
    const [newServer, setNewServer] = useState<{
        nombre_servidor?: string;
        ip_servidor?: string;
        user_servidor?: string;
        pass_servidor?: string;
        tipo_instancia?: string;
        version_sistema?: string;
    }>({});

    // Estado para editar servidor
    const [editingServer, setEditingServer] = useState<{
        nombre_servidor: string;
        ip_servidor?: string;
        user_servidor?: string;
        tipo_instancia?: string;
        version_sistema?: string;
        newPassword?: string; // Campo temporal para la nueva contraseña
    } | null>(null);

    const [currentPage, setCurrentPage] = useState(1);

    // Mapa para guardar contraseñas visibles temporalmente: nombre_servidor -> contraseña
    const [visiblePasswords, setVisiblePasswords] = useState<Map<string, string>>(new Map());

    const [loadingPassword, setLoadingPassword] = useState<string | null>(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [excelHover, setExcelHover] = useState(false);
    const itemsPerPage = 10;

    useEffect(() => {
        loadServers();
    }, []);

    const loadServers = async () => {
        try {
            const [serversData, systemsData] = await Promise.all([
                getServers(),
                getAllSystems()
            ]);
            setServers(serversData);
            setSystems(systemsData);
        } catch (error) {
            console.error("Error loading data:", error);
            // Podríamos redirigir a login si falla por auth, 
            // pero el AuthGuard o middleware ya deberían manejarlo
        }
    };

    const handleAddServer = async () => {
        if (!newServer.nombre_servidor) {
            alert("El nombre del servidor es obligatorio.");
            return;
        }
        try {
            const result = await createServer({
                nombre_servidor: newServer.nombre_servidor,
                ip_servidor: newServer.ip_servidor,
                user_servidor: newServer.user_servidor,
                pass_servidor: newServer.pass_servidor,
                tipo_instancia: newServer.tipo_instancia,
                version_sistema: newServer.version_sistema,
                is_inactive: false
            });

            if (result.success) {
                await loadServers();
                setNewServer({});
                setIsAddModalOpen(false);
            } else {
                alert("Error al crear el servidor: " + result.error);
            }
        } catch (error) {
            console.error("Error creating server:", error);
            alert("Error al crear el servidor.");
        }
    };

    const handleEditServer = async () => {
        if (!editingServer) return;
        try {
            const result = await updateServer(editingServer.nombre_servidor, {
                ip_servidor: editingServer.ip_servidor,
                user_servidor: editingServer.user_servidor,
                tipo_instancia: editingServer.tipo_instancia,
                version_sistema: editingServer.version_sistema,
                pass_servidor: editingServer.newPassword, // Enviar solo si se cambió
            });

            if (result.success) {
                await loadServers();

                // Si se cambió la password, limpiar la visible antigua si existía
                if (editingServer.newPassword) {
                    setVisiblePasswords(prev => {
                        const newMap = new Map(prev);
                        newMap.delete(editingServer.nombre_servidor);
                        return newMap;
                    });
                }

                setEditingServer(null);
                setIsEditModalOpen(false);
            } else {
                alert("Error al actualizar el servidor: " + result.error);
            }
        } catch (error) {
            console.error("Error updating server:", error);
            alert("Error al actualizar el servidor.");
        }
    };

    const handleDeleteServer = async (nombre_servidor: string) => {
        if (window.confirm("¿Está seguro que desea eliminar este servidor?")) {
            const result = await deleteServer(nombre_servidor);
            if (result.success) {
                await loadServers();
                // Limpiar contraseña visible si existía
                setVisiblePasswords(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(nombre_servidor);
                    return newMap;
                });
            } else {
                alert("Error al eliminar el servidor");
            }
        }
    };

    const togglePasswordVisibility = async (nombre_servidor: string) => {
        // Si ya está visible, ocultarla
        if (visiblePasswords.has(nombre_servidor)) {
            setVisiblePasswords(prev => {
                const newMap = new Map(prev);
                newMap.delete(nombre_servidor);
                return newMap;
            });
            return;
        }

        // Si no está visible, solicitarla al servidor
        setLoadingPassword(nombre_servidor);
        try {
            const result = await getServerPassword(nombre_servidor);
            if (result.success && result.password) {
                setVisiblePasswords(prev => {
                    const newMap = new Map(prev);
                    newMap.set(nombre_servidor, result.password!);
                    return newMap;
                });
            } else {
                alert(result.error || "Error al obtener contraseña");
            }
        } catch (error) {
            console.error("Error fetching password:", error);
            alert("Error al obtener contraseña");
        } finally {
            setLoadingPassword(null);
        }
    };

    // Custom order for specific servers
    const SERVER_ORDER = [
        "Pe 1", "Pe 2", "Am 1", "Am 8", "Nts New", "Grupo Sud", "SRV-SUD-02",
        "Am 60", "Am 71", "Am 73", "Am 76", "Am 77", "Am 78", "Am 79", "Am 80",
        "SUD INTERNACIONAL", "Am 81", "FE NEW", "Am 82", "Am 83", "Am 84", "Am 85",
        "Am 86", "Am 87", "Am 88", "Am 89", "Am 90", "Am 91", "Am 92", "Am 93",
        "Am 94", "Am 95", "Am 96", "AM 97 - Fabula Chile", "200", "201", "202",
        "203", "204", "205", "206", "207", "208", "209", "210", "211", "212",
        "213", "214", "215", "216", "217", "218", "219", "220", "FabulaProyectos",
        "221", "222", "SRV-4D-223", "SRV-4D-224", "SRV-4D-225", "SRV-4D-226",
        "SRV-4D-227", "SRV-4D-228"
    ];

    const getOrderIndex = (name: string) => {
        const index = SERVER_ORDER.indexOf(name);
        return index !== -1 ? index : Infinity;
    };

    const getLastNumber = (name: string) => {
        const matches = name.match(/(\d+)/g);
        if (matches && matches.length > 0) {
            return parseInt(matches[matches.length - 1], 10);
        }
        return Infinity;
    };

    // Filter and sort servers
    const filteredServers = servers.filter(server => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();

        const matchesServer = (
            server.nombre_servidor?.toLowerCase().includes(query) ||
            server.ip_servidor?.toLowerCase().includes(query) ||
            server.user_servidor?.toLowerCase().includes(query) ||
            server.tipo_instancia?.toLowerCase().includes(query) ||
            server.version_sistema?.toLowerCase().includes(query)
        );

        if (matchesServer) return true;

        // Also search in hosted systems
        const serverSystems = systems.filter(sys =>
            String(sys.nombre_servidor).toLowerCase() === String(server.nombre_servidor).toLowerCase()
        );

        return serverSystems.some(sys =>
            sys.nombre_empresa?.toLowerCase().includes(query)
        );
    }).sort((a, b) => {
        const nameA = a.nombre_servidor || "";
        const nameB = b.nombre_servidor || "";

        const indexA = getOrderIndex(nameA);
        const indexB = getOrderIndex(nameB);

        // Priority 1: Existence in the predefined list
        if (indexA !== Infinity && indexB !== Infinity) {
            return indexA - indexB;
        }
        if (indexA !== Infinity) return -1;
        if (indexB !== Infinity) return 1;

        // Priority 2: Sort by extracted number for items not in the list
        const numA = getLastNumber(nameA);
        const numB = getLastNumber(nameB);

        if (numA !== numB) {
            return numA - numB;
        }

        // Priority 3: Alphabetical fallback
        return nameA.localeCompare(nameB);
    });

    // Calculate active/inactive servers based on is_inactive status
    const activeServers = filteredServers.filter(s => !s.is_inactive).length;
    const inactiveServers = filteredServers.filter(s => s.is_inactive).length;

    // Pagination
    const totalPages = Math.ceil(filteredServers.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentServers = filteredServers.slice(startIndex, endIndex);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", height: "100%" }}>
            {/* Unified Statistics and Search Panel */}
            <div className="card-panel" style={{
                padding: "1rem 1.5rem",
                display: "flex",
                alignItems: "center",
                gap: "1.5rem"
            }}>
                {/* Search Box */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    backgroundColor: "var(--bg-main)",
                    borderRadius: "var(--radius-md)",
                    padding: "0.5rem 1rem",
                    width: "300px",
                    border: "1px solid var(--border-color)"
                }}>
                    <Image
                        src="/Icons/search.svg"
                        alt="Buscar"
                        width={18}
                        height={18}
                        style={{ opacity: 0.5, marginRight: "0.5rem" }}
                    />
                    <input
                        type="text"
                        placeholder="Buscar servidor..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
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

                {/* Divider */}
                <div style={{ width: "1px", height: "45px", backgroundColor: "var(--bg-main)" }} />
                {/* Stat 1 */}
                <div style={{ minWidth: "140px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                        Servidores Totales
                    </div>
                    <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--text-main)" }}>
                        {filteredServers.length}
                    </div>
                </div>

                {/* Divider */}
                <div style={{ width: "1px", height: "45px", backgroundColor: "var(--bg-main)" }} />

                {/* Stat 2 */}
                <div style={{ minWidth: "120px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                        Servidores Activos
                    </div>
                    <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "#059669" }}>
                        {activeServers}
                    </div>
                </div>

                {/* Divider */}
                <div style={{ width: "1px", height: "45px", backgroundColor: "var(--bg-main)" }} />

                {/* Stat 3 */}
                <div style={{ minWidth: "120px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                        Servidores Inactivos
                    </div>
                    <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "#e11d48" }}>
                        {inactiveServers}
                    </div>
                </div>

                {/* Divider */}
                <div style={{ width: "1px", height: "45px", backgroundColor: "var(--bg-main)" }} />

                {/* Buttons Container */}
                <div style={{ display: "flex", gap: "0.75rem", marginLeft: "auto" }}>
                    {/* Add Server Button */}
                    <button
                        className="btn btn-primary"
                        onClick={() => setIsAddModalOpen(true)}
                        style={{
                            whiteSpace: "nowrap",
                            padding: "0.5rem 1rem",
                            fontSize: "0.875rem",
                            fontWeight: "400"
                        }}
                    >
                        Agregar Servidor
                    </button>

                    {/* Import Excel Button */}
                    <button
                        className="btn"
                        style={{
                            whiteSpace: "nowrap",
                            backgroundColor: excelHover ? "#f3f4f6" : "transparent",
                            color: "var(--text-main)",
                            border: "1px solid var(--border-color)",
                            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                            transition: "background-color 150ms var(--ease-smooth)",
                            fontSize: "0.875rem",
                            padding: "0.5rem 1rem"
                        }}
                        onMouseEnter={() => setExcelHover(true)}
                        onMouseLeave={() => setExcelHover(false)}
                        onClick={() => setIsImportModalOpen(true)}
                    >
                        Importar Excel
                    </button>
                    <ImportServersExcelModal
                        isOpen={isImportModalOpen}
                        onClose={() => setIsImportModalOpen(false)}
                        onSuccess={loadServers}
                    />
                </div>
            </div>

            {/* Servers Table */}
            <div style={{
                flex: 1,
                backgroundColor: "var(--bg-main)",
                borderRadius: "var(--radius-md)",
                padding: "2rem",
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
                alignItems: "center"
            }}>
                <div className="card-panel" style={{
                    padding: "0",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    maxWidth: "1066px" // 800 * 1.33
                }}>
                    {/* Table Header */}
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr 160px",
                        padding: "1rem 1.5rem",
                        backgroundColor: "#F9FAFB",
                        borderBottom: "1px solid #d1d5db",
                        fontWeight: "600",
                        fontSize: "0.75rem",
                        color: "var(--text-muted)"
                    }}>
                        <div>Servidor</div>
                        <div>IP</div>
                        <div>User</div>
                        <div>Tipo</div>
                        <div>Versión</div>
                        <div>Pass</div>
                        <div style={{ textAlign: "center" }}>Acciones</div>
                    </div>

                    {/* Table Body */}
                    <div style={{ flex: 1, overflow: "auto" }}>
                        {currentServers.length === 0 ? (
                            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
                                No hay servidores registrados
                            </div>
                        ) : (
                            currentServers.map((server) => (
                                <div
                                    key={server.nombre_servidor}
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr 160px",
                                        padding: "1rem 1.5rem",
                                        borderBottom: "1px solid var(--border-color)",
                                        alignItems: "center",
                                        fontSize: "0.875rem",
                                        transition: "background-color 0.2s"
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#F9FAFB"}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                                >
                                    <div style={{ fontWeight: "600", color: server.is_inactive ? "#ef4444" : "var(--text-main)" }}>
                                        {server.nombre_servidor}
                                    </div>
                                    <div style={{ color: server.is_inactive ? "#ef4444" : "var(--text-muted)", fontFamily: "monospace" }}>
                                        {server.ip_servidor || "-"}
                                    </div>
                                    <div style={{ color: server.is_inactive ? "#ef4444" : "var(--text-muted)" }}>
                                        {server.user_servidor || "-"}
                                    </div>
                                    <div style={{ color: server.is_inactive ? "#ef4444" : "var(--text-muted)" }}>
                                        {server.tipo_instancia || "-"}
                                    </div>
                                    <div style={{ color: server.is_inactive ? "#ef4444" : "var(--text-muted)" }}>
                                        {server.version_sistema || "-"}
                                    </div>
                                    <div style={{ color: server.is_inactive ? "#ef4444" : "var(--text-muted)", fontFamily: "monospace" }}>
                                        {visiblePasswords.has(server.nombre_servidor)
                                            ? visiblePasswords.get(server.nombre_servidor)
                                            : (server.has_password ? "••••••••" : "-")
                                        }
                                        {loadingPassword === server.nombre_servidor && (
                                            <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--primary)" }}>Cargando...</span>
                                        )}
                                    </div>
                                    <div style={{ textAlign: "center", display: "flex", gap: "0.25rem", justifyContent: "center" }}>
                                        {/* View Password Button */}
                                        <button
                                            onClick={() => togglePasswordVisibility(server.nombre_servidor)}
                                            style={{
                                                padding: "0.5rem",
                                                backgroundColor: "transparent",
                                                border: "none",
                                                cursor: "pointer",
                                                borderRadius: "var(--radius-md)",
                                                transition: "background-color 0.15s var(--ease-smooth)",
                                                opacity: server.has_password ? 1 : 0.3
                                            }}
                                            disabled={!server.has_password}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-main)"}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                                            title={server.has_password ? "Ver/Ocultar contraseña" : "No hay contraseña guardada"}
                                        >
                                            <Image
                                                src="/Icons/eye-solid.svg"
                                                alt={visiblePasswords.has(server.nombre_servidor) ? "Ocultar" : "Ver"}
                                                width={16}
                                                height={16}
                                                style={{ filter: "none", opacity: 0.7 }}
                                            />
                                        </button>

                                        {/* Edit Button */}
                                        <button
                                            onClick={() => {
                                                setEditingServer({
                                                    nombre_servidor: server.nombre_servidor,
                                                    ip_servidor: server.ip_servidor,
                                                    user_servidor: server.user_servidor,
                                                    tipo_instancia: server.tipo_instancia,
                                                    version_sistema: server.version_sistema,
                                                    newPassword: "" // Empezar vacío al editar
                                                });
                                                setIsEditModalOpen(true);
                                            }}
                                            style={{
                                                padding: "0.5rem",
                                                backgroundColor: "transparent",
                                                border: "none",
                                                cursor: "pointer",
                                                borderRadius: "var(--radius-md)",
                                                transition: "background-color 0.15s var(--ease-smooth)"
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f3f4f6"}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                                        >
                                            <Image
                                                src="/Icons/editb.svg"
                                                alt="Editar"
                                                style={{ filter: "none", opacity: 0.7 }}
                                            />
                                        </button>

                                        {/* Status Switch */}
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 0.25rem" }}>
                                            <button
                                                onClick={async () => {
                                                    const newState = !server.is_inactive;
                                                    try {
                                                        const result = await updateServer(server.nombre_servidor, { is_inactive: newState });
                                                        if (result.success) {
                                                            await loadServers();
                                                        }
                                                    } catch (error) {
                                                        console.error("Error toggling server status:", error);
                                                    }
                                                }}
                                                style={{
                                                    width: "35px",
                                                    height: "18px",
                                                    borderRadius: "11px",
                                                    border: "1.5px solid #000000",
                                                    backgroundColor: server.is_inactive ? "#FBBF24" : "#F3F4F6",
                                                    position: "relative",
                                                    cursor: "pointer",
                                                    padding: 0,
                                                    transition: "all 200ms var(--ease-smooth)",
                                                    display: "flex",
                                                    alignItems: "center"
                                                }}
                                            >
                                                <div style={{
                                                    width: "14px",
                                                    height: "14px",
                                                    borderRadius: "50%",
                                                    backgroundColor: "#FFFFFF",
                                                    border: "1.5px solid #000000",
                                                    position: "absolute",
                                                    left: server.is_inactive ? "21px" : "2px",
                                                    transition: "left 200ms cubic-bezier(0.4, 0, 0.2, 1)"
                                                }} />
                                            </button>
                                        </div>

                                        {/* Delete Button */}
                                        <button
                                            onClick={() => handleDeleteServer(server.nombre_servidor)}
                                            style={{
                                                padding: "0.5rem",
                                                backgroundColor: "transparent",
                                                border: "none",
                                                cursor: "pointer",
                                                borderRadius: "var(--radius-md)",
                                                transition: "background-color 0.15s var(--ease-smooth)"
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f3f4f6"}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                                        >
                                            <Image
                                                src="/Icons/eraseb.svg"
                                                alt="Eliminar"
                                                width={16}
                                                height={16}
                                                style={{ filter: "none", opacity: 0.7 }}
                                            />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{
                            padding: "1rem 1.5rem",
                            borderTop: "1px solid var(--border-color)",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: "0.5rem"
                        }}>
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                style={{
                                    padding: "0.5rem 1rem",
                                    backgroundColor: currentPage === 1 ? "#F3F4F6" : "#FFFFFF",
                                    border: "1px solid var(--border-color)",
                                    borderRadius: "var(--radius-sm)",
                                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                                    fontSize: "0.875rem",
                                    color: currentPage === 1 ? "var(--text-muted)" : "var(--text-main)"
                                }}
                            >
                                Anterior
                            </button>
                            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                                Página {currentPage} de {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                style={{
                                    padding: "0.5rem 1rem",
                                    backgroundColor: currentPage === totalPages ? "#F3F4F6" : "#FFFFFF",
                                    border: "1px solid var(--border-color)",
                                    borderRadius: "var(--radius-sm)",
                                    cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                                    fontSize: "0.875rem",
                                    color: currentPage === totalPages ? "var(--text-muted)" : "var(--text-main)"
                                }}
                            >
                                Siguiente
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Server Modal */}
            {isAddModalOpen && (
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
                        width: "600px",
                        maxWidth: "95vw",
                        boxShadow: "var(--shadow-md)",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                        border: "1px solid var(--border-color)"
                    }}>
                        {/* Header */}
                        <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--border-color)" }}>
                            <h2 style={{ fontSize: "1.25rem", fontWeight: "600", margin: 0, color: "var(--text-main)" }}>Agregar Servidor</h2>
                        </div>

                        {/* Body */}
                        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                            {/* Nombre Servidor */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Nombre Servidor *</label>
                                <input
                                    type="text"
                                    value={newServer.nombre_servidor || ""}
                                    onChange={(e) => setNewServer({ ...newServer, nombre_servidor: e.target.value })}
                                    style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                />
                            </div>

                            {/* IP Servidor */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>IP</label>
                                <input
                                    type="text"
                                    value={newServer.ip_servidor || ""}
                                    onChange={(e) => setNewServer({ ...newServer, ip_servidor: e.target.value })}
                                    style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>User</label>
                                <input
                                    type="text"
                                    value={newServer.user_servidor || ""}
                                    onChange={(e) => setNewServer({ ...newServer, user_servidor: e.target.value })}
                                    style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                />
                            </div>

                            {/* Tipo Instancia */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Tipo Instancia</label>
                                <input
                                    type="text"
                                    value={newServer.tipo_instancia || ""}
                                    onChange={(e) => setNewServer({ ...newServer, tipo_instancia: e.target.value })}
                                    style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                />
                            </div>

                            {/* Versión Sistema */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Versión Sistema</label>
                                <input
                                    type="text"
                                    value={newServer.version_sistema || ""}
                                    onChange={(e) => setNewServer({ ...newServer, version_sistema: e.target.value })}
                                    style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                />
                            </div>


                            {/* Pass Servidor */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Pass</label>
                                <input
                                    type="password"
                                    value={newServer.pass_servidor || ""}
                                    onChange={(e) => setNewServer({ ...newServer, pass_servidor: e.target.value })}
                                    style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "flex-end", gap: "0.75rem", backgroundColor: "var(--bg-card)" }}>
                            <button
                                onClick={() => {
                                    setIsAddModalOpen(false);
                                    setNewServer({});
                                }}
                                style={{
                                    width: "40px",
                                    height: "40px",
                                    borderRadius: "8px",
                                    border: "1px solid var(--border-color)",
                                    backgroundColor: "var(--bg-hover)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    transition: "all 0.2s"
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f3f4f6"}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = "var(--bg-hover)"}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                            <button
                                onClick={handleAddServer}
                                className="btn btn-primary"
                                style={{
                                    width: "40px",
                                    height: "40px",
                                    borderRadius: "8px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center"
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                    <polyline points="7 3 7 8 15 8"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Edit Server Modal */}
            {isEditModalOpen && editingServer && (
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
                        width: "600px",
                        maxWidth: "95vw",
                        boxShadow: "var(--shadow-md)",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                        border: "1px solid var(--border-color)"
                    }}>
                        {/* Header */}
                        <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--border-color)" }}>
                            <h2 style={{ fontSize: "1.25rem", fontWeight: "600", margin: 0, color: "var(--text-main)" }}>Editar Servidor</h2>
                        </div>

                        {/* Body */}
                        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                            {/* Nombre Servidor (Disabled) */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Nombre Servidor (No editable)</label>
                                <input
                                    type="text"
                                    value={editingServer.nombre_servidor}
                                    disabled
                                    style={{
                                        padding: "0.625rem",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border-color)",
                                        backgroundColor: "#E5E7EB",
                                        outline: "none",
                                        width: "100%",
                                        cursor: "not-allowed",
                                        color: "#6B7280"
                                    }}
                                />
                            </div>

                            {/* IP Servidor */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>IP</label>
                                <input
                                    type="text"
                                    value={editingServer.ip_servidor || ""}
                                    onChange={(e) => setEditingServer({ ...editingServer, ip_servidor: e.target.value })}
                                    style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>User</label>
                                <input
                                    type="text"
                                    value={editingServer.user_servidor || ""}
                                    onChange={(e) => setEditingServer({ ...editingServer, user_servidor: e.target.value })}
                                    style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                />
                            </div>

                            {/* Tipo Instancia */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Tipo Instancia</label>
                                <input
                                    type="text"
                                    value={editingServer.tipo_instancia || ""}
                                    onChange={(e) => setEditingServer({ ...editingServer, tipo_instancia: e.target.value })}
                                    style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                />
                            </div>

                            {/* Versión Sistema */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Versión Sistema</label>
                                <input
                                    type="text"
                                    value={editingServer.version_sistema || ""}
                                    onChange={(e) => setEditingServer({ ...editingServer, version_sistema: e.target.value })}
                                    style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                />
                            </div>


                            {/* Pass Servidor */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Pass</label>
                                <input
                                    type="password"
                                    placeholder="Dejar vacío para mantener actual"
                                    value={editingServer.newPassword || ""}
                                    onChange={(e) => setEditingServer({ ...editingServer, newPassword: e.target.value })}
                                    style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "flex-end", gap: "0.75rem", backgroundColor: "var(--bg-card)" }}>
                            <button
                                onClick={() => {
                                    setIsEditModalOpen(false);
                                    setEditingServer(null);
                                }}
                                style={{
                                    width: "40px",
                                    height: "40px",
                                    borderRadius: "8px",
                                    border: "1px solid var(--border-color)",
                                    backgroundColor: "var(--bg-hover)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    transition: "all 0.2s"
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = "var(--bg-hover)"}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                            <button
                                onClick={handleEditServer}
                                className="btn btn-primary"
                                style={{
                                    width: "40px",
                                    height: "40px",
                                    borderRadius: "8px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center"
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                    <polyline points="7 3 7 8 15 8"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Overview Modal */}
            <ServerOverviewModal
                isOpen={isOverviewModalOpen}
                onClose={() => setIsOverviewModalOpen(false)}
                servers={servers}
            />
        </div>
    );
}
