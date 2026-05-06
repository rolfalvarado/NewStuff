
"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import ClientReportsModal from "@/components/ClientReportsModal";
import { getAllSystems, System } from "@/app/actions/get-systems";
import { getServers, ServerPublic } from "@/app/actions/get-servers";
import { updateSystemText, updateSystemFields } from "@/app/actions/update-system";
import { deleteSystem } from "@/app/actions/delete-system";
import { createSystem } from "@/app/actions/create-system";
import { renameHolding, deleteHolding } from "@/app/actions/manage-holdings";

import ImportExcelModal from "@/components/ImportExcelModal";
import { getSystemHistory, HistoryEntry } from "@/app/actions/get-monitoring-logs";
import { toggleLogScheduled } from "@/app/actions/update-log"; // Keeping original import for toggleLogScheduled
import { uploadFileToDrive, listFilesFromDrive } from "@/app/actions/google-drive-actions";

// Update Props Interface
export default function SystemsList({ initialSystems, userRole }: { initialSystems: System[], userRole?: string }) {
    const [systems, setSystems] = useState<System[]>(initialSystems);
    const [itemsToShow, setItemsToShow] = useState(25);

    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const a = String(now.getFullYear()).slice(-2);
    const todayStr = `${d}/${m}/${a}`;
    const [searchQuery, setSearchQuery] = useState("");
    const [excelHover, setExcelHover] = useState(false);
    const [menuOpen, setMenuOpen] = useState<string | null>(null);
    const [optionsHover, setOptionsHover] = useState<string | null>(null);
    const [disabledSystems, setDisabledSystems] = useState<{ [key: string]: boolean }>({});
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);

    // Edit Mode State
    const [editingSystems, setEditingSystems] = useState<{ [key: string]: boolean }>({});
    const [editValues, setEditValues] = useState<{ [key: string]: Partial<System> }>({});

    // Add Mode State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newSystem, setNewSystem] = useState<Partial<System>>({
        modulos_activos: [],
        estado_sitio: "Online",
        usuarios_contratados: 0
    });
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isOfflineListOpen, setIsOfflineListOpen] = useState(false);
    const [isInactiveListOpen, setIsInactiveListOpen] = useState(false);
    const [activeTabs, setActiveTabs] = useState<{ [key: string]: 'bitacora' | 'nexos' }>({});

    // History Modal State
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [historyLogs, setHistoryLogs] = useState<HistoryEntry[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [selectedHistorySystem, setSelectedHistorySystem] = useState<{ url: string, name: string } | null>(null);

    // Hitos Section State
    const [hitosDate, setHitosDate] = useState<{ [key: string]: string }>({});
    const [hitosText, setHitosText] = useState<{ [key: string]: string }>({});

    // Modal de reportes (tareas) por cliente
    const [reportsSystem, setReportsSystem] = useState<System | null>(null);

    // Google Drive State
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isFileListModalOpen, setIsFileListModalOpen] = useState(false);
    const [selectedDriveSystem, setSelectedDriveSystem] = useState<System | null>(null);
    const [driveFiles, setDriveFiles] = useState<any[]>([]);
    const [isLoadingDrive, setIsLoadingDrive] = useState(false);
    const [uploadingFile, setUploadingFile] = useState(false);

    const [servers, setServers] = useState<ServerPublic[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [systemsData, serversData] = await Promise.all([
                    getAllSystems(),
                    getServers()
                ]);
                setSystems(systemsData);
                setServers(serversData.sort((a, b) => a.nombre_servidor.localeCompare(b.nombre_servidor)));
                const initialDisabled: { [key: string]: boolean } = {};
                systemsData.forEach(sys => {
                    initialDisabled[sys.url_sitio] = sys.disabled_state;
                });
                setDisabledSystems(initialDisabled);
            } catch (error) {
                console.error("Error fetching data:", error);
            }
        };
        fetchData();
    }, []);

    const getServerDetails = (serverName?: string) => {
        if (!serverName) return null;
        // Convert both to strings to handle cases where DynamoDB might store numeric names as numbers
        return servers.find(s => String(s.nombre_servidor) === String(serverName));
    };

    const handleRenameHolding = async () => {
        const currentHolding = editingSystem?.holding;
        if (!currentHolding || currentHolding === "NEW_ENTRY" || currentHolding === "") return;
        
        const newName = prompt(`Ingrese el nuevo nombre para editar el holding "${currentHolding}":`, currentHolding);
        if (!newName || newName === currentHolding) return;
        
        const res = await renameHolding(currentHolding, newName);
        if (res.ok) {
            alert(`Holding renombrado exitosamente. Sistemas actualizados: ${res.count}`);
            setEditingSystem((prev: any) => prev ? { ...prev, holding: newName } : null);
            setSystems((prev: any) => prev.map((s: any) => s.holding === currentHolding ? { ...s, holding: newName } : s));
        } else {
            alert("Error al renombrar holding: " + res.error);
        }
    };

    const handleDeleteHolding = async () => {
        const currentHolding = editingSystem?.holding;
        if (!currentHolding || currentHolding === "NEW_ENTRY" || currentHolding === "") return;
        
        if (!confirm(`¿Seguro que deseas eliminar el holding "${currentHolding}" de todos los sistemas?`)) return;
        
        const res = await deleteHolding(currentHolding);
        if (res.ok) {
            alert(`Holding eliminado exitosamente. Sistemas actualizados: ${res.count}`);
            setEditingSystem((prev: any) => prev ? { ...prev, holding: "" } : null);
            setSystems((prev: any) => prev.map((s: any) => s.holding === currentHolding ? { ...s, holding: "" } : s));
        } else {
            alert("Error al eliminar holding: " + res.error);
        }
    };

    const handleViewHistory = async (system: System) => {
        setSelectedHistorySystem({ name: system.nombre_empresa, url: system.url_sitio });
        setHistoryLogs([]); // Clear previous
        setHistoryModalOpen(true);
        setIsLoadingHistory(true);
        try {
            const logs = await getSystemHistory(system.url_sitio);
            setHistoryLogs(logs);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const handleOpenUpload = (system: System) => {
        setSelectedDriveSystem(system);
        setIsUploadModalOpen(true);
    };

    const handleOpenFiles = async (system: System) => {
        setSelectedDriveSystem(system);
        setIsFileListModalOpen(true);
        setIsLoadingDrive(true);
        try {
            const result = await listFilesFromDrive(system.nombre_empresa);
            if (result.success) {
                setDriveFiles(result.files || []);
            } else {
                alert("Error al cargar archivos: " + result.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingDrive(false);
        }
    };

    const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedDriveSystem) return;

        const formData = new FormData(e.currentTarget);
        formData.append("systemName", selectedDriveSystem.nombre_empresa);

        setUploadingFile(true);
        try {
            const result = await uploadFileToDrive(formData);
            if (result.success) {
                alert("Archivo subido con éxito");
                setIsUploadModalOpen(false);
            } else {
                alert("Error al subir archivo: " + result.error);
            }
        } catch (e) {
            console.error(e);
            alert("Error al subir archivo");
        } finally {
            setUploadingFile(false);
        }
    };

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingSystem, setEditingSystem] = useState<System | null>(null);

    // Progressive Rendering State
    const [visibleCount, setVisibleCount] = useState(50);

    useEffect(() => {
        // Increment visible count progressively to unlock UI thread
        if (visibleCount < systems.length) {
            const timer = setTimeout(() => {
                setVisibleCount(prev => prev + 50);
            }, 50); // Very fast updates
            return () => clearTimeout(timer);
        }
    }, [visibleCount, systems.length]);

    const formatDate = (dateStr: string | undefined) => {
        if (!dateStr) return "-";
        // Handle ISO string or YYYY-MM-DD
        const simpleDate = dateStr.split('T')[0];
        if (simpleDate.includes('-')) {
            const parts = simpleDate.split('-');
            if (parts.length === 3) {
                const [year, month, day] = parts;
                return day + "/" + month + "/" + year.slice(-2);
            }
        }
        return dateStr;
    };

    const refreshSystems = () => {
        getAllSystems().then(data => {
            setSystems(data);
            const initialDisabled: { [key: string]: boolean } = {};
            data.forEach(sys => {
                initialDisabled[sys.url_sitio] = sys.disabled_state;
            });
            setDisabledSystems(initialDisabled);
        });
    };

    useEffect(() => {
        console.log("SystemsList: initialSystems prop changed", initialSystems);
        setSystems(initialSystems);
        const initialDisabled: { [key: string]: boolean } = {};
        initialSystems.forEach(sys => {
            initialDisabled[sys.url_sitio] = sys.disabled_state;
        });
        setDisabledSystems(initialDisabled);
    }, [initialSystems]);

    // Cerrar menú al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = () => {
            if (menuOpen !== null) {
                setMenuOpen(null);
            }
        };

        if (menuOpen !== null) {
            document.addEventListener('click', handleClickOutside);
        }

        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [menuOpen]);

    // Listen for status check completion
    // Listen for status check completion
    useEffect(() => {
        const handleStatusUpdate = (event: Event) => {
            const customEvent = event as CustomEvent;
            if (customEvent.detail && Array.isArray(customEvent.detail)) {
                console.log("SystemsList: Actualizando estados localmente...");
                const updates = customEvent.detail;
                const updatesMap = new Map(updates.map((u: any) => [u.url, u]));

                setSystems(prevSystems => {
                    // Verificamos si hay cambios reales para evitar re-renders innecesarios
                    let hasChanges = false;
                    const newSystems = prevSystems.map(sys => {
                        const update = updatesMap.get(sys.url_sitio);
                        if (update && sys.estado_sitio !== update.status) {
                            hasChanges = true;
                            return { ...sys, estado_sitio: update.status };
                        }
                        return sys;
                    });
                    return hasChanges ? newSystems : prevSystems;
                });
            } else {
                // Fallback si no hay detalles (legacy)
                refreshSystems();
            }
        };

        window.addEventListener('status-check-complete', handleStatusUpdate);
        return () => window.removeEventListener('status-check-complete', handleStatusUpdate);
    }, []);

    const handleAddSystem = async () => {
        if (!newSystem.url_sitio || !newSystem.nombre_empresa) {
            alert("URL del sitio y Nombre de la empresa son obligatorios.");
            return;
        }
        try {
            const result = await createSystem(newSystem as System);
            if (result.success) {
                // Refresh list from server to get accurate state (including defaults handled by backend if any)
                const updatedSystems = await getAllSystems();
                setSystems(updatedSystems);
                setNewSystem({
                    modulos_activos: [],
                    estado_sitio: "Online",
                    usuarios_contratados: 0
                });
                setIsAddModalOpen(false);
            } else {
                alert("Error al crear el sistema: " + result.error);
            }
        } catch (error) {
            console.error("Error creating system:", error);
            alert("Error al crear el sistema.");
        }
    };

    const handleEditSystem = async () => {
        if (!editingSystem) return;

        try {
            // Update all fields except url_sitio (which is the ID)
            const result = await updateSystemFields(editingSystem.url_sitio, {
                nombre_empresa: editingSystem.nombre_empresa,
                ip_sitio: editingSystem.ip_sitio,
                nombre_servidor: editingSystem.nombre_servidor,
                version_sistema: editingSystem.version_sistema,
                memoria_sistema: editingSystem.memoria_sistema,
                usuarios_contratados: editingSystem.usuarios_contratados,
                fecha_renovacion: editingSystem.fecha_renovacion,
                modulos_activos: editingSystem.modulos_activos,
                nombre_contacto: editingSystem.nombre_contacto,
                cargo_contacto: editingSystem.cargo_contacto,
                phone_contacto: editingSystem.phone_contacto,
                mail_contacto: editingSystem.mail_contacto,
                giro: editingSystem.giro,
                actividad: editingSystem.actividad,
                holding: editingSystem.holding,
                puerto_web: editingSystem.puerto_web
            });

            if (result.success) {
                // Refresh list from server
                const updatedSystems = await getAllSystems();
                setSystems(updatedSystems);
                setIsEditModalOpen(false);
                setEditingSystem(null);
            } else {
                alert("Error al actualizar el sistema: " + result.error);
            }
        } catch (error) {
            console.error("Error updating system:", error);
            alert("Error al actualizar el sistema.");
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", height: "100%" }}>
            {/* Unified Statistics and Search Panel */}
            <div className="card-panel" style={{
                padding: "1rem 1.5rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem"
            }}>
                {/* Search Box */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    backgroundColor: "var(--bg-main)",
                    borderRadius: "var(--radius-md)",
                    padding: "0.5rem 1rem",
                    width: "270px",
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
                        placeholder="Buscar sistema..."
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
                {/* Stat 1 Removed: Sistemas Monitoreados */}

                {/* Divider */}
                <div style={{ width: "1px", height: "45px", backgroundColor: "var(--border-color)" }} />

                {/* Stat 2 */}
                <div style={{ minWidth: "90px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                        Sitios Online
                    </div>
                    <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "#059669" }}>
                        {systems.filter(s => s.estado_sitio?.toLowerCase().includes("online") || s.estado_sitio?.toLowerCase().includes("on line")).length}
                    </div>
                </div>

                {/* Divider */}
                <div style={{ width: "1px", height: "45px", backgroundColor: "var(--border-color)" }} />

                {/* Stat 3 */}
                <div style={{ minWidth: "90px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                        Sitio Offline
                    </div>
                    <button
                        onClick={() => setIsOfflineListOpen(true)}
                        style={{
                            fontSize: "1.25rem",
                            fontWeight: "700",
                            color: "#e11d48",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0
                        }}
                    >
                        {systems.filter(s => !(s.estado_sitio?.toLowerCase().includes("online") || s.estado_sitio?.toLowerCase().includes("on line"))).length}
                    </button>
                </div>

                {/* Divider */}
                <div style={{ width: "1px", height: "45px", backgroundColor: "var(--border-color)" }} />

                {/* Stat 4 - Inactive */}
                <div style={{ minWidth: "90px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                        Sistemas Inactivos
                    </div>
                    <button
                        onClick={() => setIsInactiveListOpen(true)}
                        style={{
                            fontSize: "1.25rem",
                            fontWeight: "700",
                            color: "var(--text-muted)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0
                        }}
                    >
                        {systems.filter(s => disabledSystems[s.url_sitio]).length}
                    </button>
                </div>

                {/* Divider */}
                <div style={{ width: "1px", height: "45px", backgroundColor: "var(--border-color)" }} />

                {/* Stat 5 - Users (Was 4) */}
                <div style={{ minWidth: "90px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                        Usuarios Totales
                    </div>
                    <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--text-main)" }}>
                        {systems.reduce((acc, sys) => acc + (sys.usuarios_totales || 0), 0)}
                    </div>
                </div>

                {/* Divider */}
                <div style={{ width: "1px", height: "45px", backgroundColor: "var(--border-color)" }} />

                {/* Buttons Container */}
                <div style={{ display: "flex", gap: "0.75rem", marginLeft: "auto", alignItems: "center" }}>
                    {/* Notification Bell */}
                    <div style={{ position: "relative" }}>
                        <button
                            className="button"
                            onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                            title="Notificaciones"
                        >
                            <svg viewBox="0 0 448 512" className="bell"><path d="M224 0c-17.7 0-32 14.3-32 32V49.9C119.5 61.4 64 124.2 64 200v33.4c0 45.4-15.5 89.5-43.8 124.9L5.3 377c-5.8 7.2-6.9 17.1-2.9 25.4S14.8 416 24 416H424c9.2 0 17.6-5.3 21.6-13.6s2.9-18.2-2.9-25.4l-14.9-18.6C399.5 322.9 384 278.8 384 233.4V200c0-75.8-55.5-138.6-128-150.1V32c0-17.7-14.3-32-32-32zm0 96h8c57.4 0 104 46.6 104 104v33.4c0 47.9 13.9 94.6 39.7 134.6H72.3C98.1 328 112 281.3 112 233.4V200c0-57.4 46.6-104 104-104h8zm64 352H224 160c0 17 6.7 33.3 18.7 45.3s28.3 18.7 45.3 18.7s33.3-6.7 45.3-18.7s18.7-28.3 18.7-45.3z"></path></svg>
                            {systems.filter(s => (s.usuarios_totales || 0) > (s.usuarios_contratados || 0)).length > 0 && (
                                <div style={{
                                    position: "absolute",
                                    top: "-5px",
                                    right: "-5px",
                                    backgroundColor: "#ef4444",
                                    color: "white",
                                    borderRadius: "50%",
                                    width: "20px",
                                    height: "20px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "14px",
                                    fontWeight: "bold",
                                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                                }}>
                                    !
                                </div>
                            )}
                        </button>

                        {isNotificationOpen && (
                            <div style={{
                                position: "absolute",
                                top: "calc(100% + 15px)",
                                right: 0,
                                zIndex: 50,
                                display: "flex",
                                flexDirection: "column",
                                gap: "0px",
                                width: "max-content",
                                filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.1))",
                                maxHeight: "650px",
                                overflowY: "auto"
                            }}>
                                {systems.filter(s => (s.usuarios_totales || 0) > (s.usuarios_contratados || 0)).length === 0 ? (
                                    <div className="error" style={{ background: "white", borderColor: "#ddd", width: "250px" }}>
                                        <div className="error__title" style={{ color: "#666" }}>No hay alertas de usuarios</div>
                                    </div>
                                ) : (
                                    systems.filter(s => (s.usuarios_totales || 0) > (s.usuarios_contratados || 0)).map(sys => (
                                        <div key={sys.url_sitio} className="error">
                                            <div className="error__icon">
                                                <svg fill="none" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="m13 13h-2v-6h2zm0 4h-2v-2h2zm-1-15c-1.3132 0-2.61358.25866-3.82683.7612-1.21326.50255-2.31565 1.23915-3.24424 2.16773-1.87536 1.87537-2.92893 4.41891-2.92893 7.07107 0 2.6522 1.05357 5.1957 2.92893 7.0711.92859.9286 2.03098 1.6651 3.24424 2.1677 1.21325.5025 2.51363.7612 3.82683.7612 2.6522 0 5.1957-1.0536 7.0711-2.9289 1.8753-1.8754 2.9289-4.4189 2.9289-7.0711 0-1.3132-.2587-2.61358-.7612-3.82683-.5026-1.21326-1.2391-2.31565-2.1677-3.24424-.9286-.92858-2.031-1.66518-3.2443-2.16773-1.2132-.50254-2.5136-.7612-3.8268-.7612z" fill="#393a37"></path></svg>
                                            </div>
                                            <div className="error__title" style={{ whiteSpace: 'nowrap' }}>{sys.nombre_empresa} ({sys.usuarios_totales}/{sys.usuarios_contratados})</div>
                                            <div className="error__close" onClick={(e) => { e.stopPropagation(); setIsNotificationOpen(false); }}>
                                                <svg height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg"><path d="m15.8333 5.34166-1.175-1.175-4.6583 4.65834-4.65833-4.65834-1.175 1.175 4.65833 4.65834-4.65833 4.6583 1.175 1.175 4.65833-4.6583 4.6583 4.6583 1.175-1.175-4.6583-4.6583z" fill="#71192F"></path></svg>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Add Site Button */}
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
                        Agregar Sitio
                    </button>

                    {/* Import Excel Button */}
                    <button
                        className="btn"
                        style={{
                            whiteSpace: "nowrap",
                            backgroundColor: excelHover ? "var(--bg-hover)" : "var(--bg-card)",
                            color: "var(--text-main)",
                            border: "1px solid var(--border-color)",
                            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                            transition: "background-color 150ms var(--ease-smooth)"
                        }}
                        onMouseEnter={() => setExcelHover(true)}
                        onMouseLeave={() => setExcelHover(false)}
                        onClick={() => setIsImportModalOpen(true)}
                    >
                        Importar Excel
                    </button>
                    <ImportExcelModal
                        isOpen={isImportModalOpen}
                        onClose={() => setIsImportModalOpen(false)}
                        onSuccess={refreshSystems}
                        systems={systems}
                    />
                </div>
            </div>

            {/* Main Content */}
            <div style={{
                padding: "2rem",
                flex: 1,
                backgroundColor: "var(--bg-main)",
                borderRadius: "var(--radius-md)",
                overflow: "auto"
            }}>
                {/* Cards Grid */}
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(700px, 1fr))",
                    gap: "1.5rem",
                    alignItems: "start"
                }}>
                    {systems
                        .filter(system => {
                            if (!searchQuery) return true;
                            const query = searchQuery.toLowerCase();

                            // Feature: Search "disabled" or "inactivo" to show disabled systems
                            // Use disabledSystems state to reflect immediate UI changes, fallback to system.disabled_state
                            const isDisabled = disabledSystems[system.url_sitio] ?? system.disabled_state;
                            if ((query === 'disabled' || query === 'inactivo' || query === 'inactivos') && isDisabled) {
                                return true;
                            }

                            return (
                                (system.nombre_empresa && String(system.nombre_empresa).toLowerCase().includes(query)) ||
                                (system.url_sitio && String(system.url_sitio).toLowerCase().includes(query)) ||
                                (system.nombre_servidor && String(system.nombre_servidor).toLowerCase().includes(query)) ||
                                (system.estado_sitio && String(system.estado_sitio).toLowerCase().includes(query)) ||
                                (system.holding && String(system.holding).toLowerCase().includes(query))
                            );
                        })
                        .sort((a, b) => {
                            if (!searchQuery) return 0;
                            const query = searchQuery.toLowerCase();

                            // Priority function: lower return value means higher priority (top of list)
                            const getPriority = (sys: System) => {
                                const isDisabled = disabledSystems[sys.url_sitio] ?? sys.disabled_state;
                                // Priority 0: Disabled systems when searching "disabled", "inactivo"
                                if ((query === 'disabled' || query === 'inactivo' || query === 'inactivos') && isDisabled) return 0;

                                if (sys.nombre_empresa && String(sys.nombre_empresa).toLowerCase().includes(query)) return 1;
                                if (sys.url_sitio && String(sys.url_sitio).toLowerCase().includes(query)) return 2;
                                if (sys.nombre_servidor && String(sys.nombre_servidor).toLowerCase().includes(query)) return 3;
                                if (sys.estado_sitio && String(sys.estado_sitio).toLowerCase().includes(query)) return 4;
                                if (sys.holding && String(sys.holding).toLowerCase().includes(query)) return 5;
                                return 6;
                            };

                            const priorityA = getPriority(a);
                            const priorityB = getPriority(b);

                            return priorityA - priorityB;
                        })
                        .slice(0, visibleCount)
                        .map((system) => (
                            <div key={system.url_sitio} className="card-panel" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                                {/* Logo and Company Info */}
                                <div style={{ display: "flex", gap: "0.75rem", position: "relative" }}>
                                    <img
                                        src={(function () {
                                            try {
                                                const domain = system.url_sitio.split('//')[1].split('/')[0];
                                                // Replace dots and colons (for ports) with underscores
                                                const slug = domain.replace(/[\.:]/g, '_');
                                                return "/logos/" + slug + ".jpg";
                                            } catch (e) {
                                                return "/logos/baselogo.jpg";
                                            }
                                        })()}
                                        alt="Company Logo"
                                        width={60}
                                        height={60}
                                        style={{ borderRadius: "var(--radius-md)", objectFit: "contain" }}
                                        loading="lazy"
                                        onError={(e) => {
                                            // Fallback to base logo
                                            const img = e.target as HTMLImageElement;
                                            // Prevent infinite loop if baselogo also fails
                                            if (img.src.includes('baselogo.jpg')) return;
                                            img.src = '/logos/baselogo.jpg';
                                        }}
                                    />

                                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            {editingSystems[system.url_sitio] ? (
                                                <input
                                                    type="text"
                                                    value={editValues[system.url_sitio]?.nombre_empresa || ""}
                                                    onChange={(e) => setEditValues({
                                                        ...editValues,
                                                        [system.url_sitio]: { ...editValues[system.url_sitio], nombre_empresa: e.target.value }
                                                    })}
                                                    style={{
                                                        fontSize: "1.1rem",
                                                        fontWeight: "600",
                                                        border: "1px solid var(--border-color)",
                                                        borderRadius: "var(--radius-sm)",
                                                        padding: "0.25rem 0.5rem",
                                                        width: "250px",
                                                        backgroundColor: "var(--bg-main)",
                                                        color: "var(--text-main)"
                                                    }}
                                                />
                                            ) : (
                                                <span style={{ fontSize: "1.1rem", fontWeight: "600", color: "#1F2937" }}>
                                                    {system.nombre_empresa}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                                            {editingSystems[system.url_sitio] ? (
                                                <input
                                                    type="text"
                                                    value={editValues[system.url_sitio]?.url_sitio || ""}
                                                    onChange={(e) => setEditValues({
                                                        ...editValues,
                                                        [system.url_sitio]: { ...editValues[system.url_sitio], url_sitio: e.target.value }
                                                    })}
                                                    style={{
                                                        fontSize: "0.875rem",
                                                        border: "1px solid var(--border-color)",
                                                        borderRadius: "var(--radius-sm)",
                                                        padding: "0.1rem 0.4rem",
                                                        width: "300px",
                                                        backgroundColor: "var(--bg-main)",
                                                        color: "var(--text-main)"
                                                    }}
                                                />
                                            ) : (
                                                <a
                                                    href={system.url_sitio}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{ fontSize: "0.875rem", color: "var(--primary)", textDecoration: "none", fontWeight: "500" }}
                                                >
                                                    {system.url_sitio}
                                                </a>
                                            )}
                                        </div>
                                        {/* User Req 3: Specific Fields below URL */}
                                        {/* User Req 3: Specific Fields below URL */}
                                        {(system.giro || system.holding || (system.actividad && system.actividad.length > 0)) && (
                                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                                                {system.giro && (
                                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem" }}>
                                                        <Image
                                                            src="/Icons/giro.svg"
                                                            alt="Giro"
                                                            width={14}
                                                            height={14}
                                                            style={{ opacity: 0.7 }}
                                                        />
                                                        <span style={{ color: "var(--text-secondary)" }}>{system.giro}</span>
                                                    </div>
                                                )}
                                                {system.actividad && system.actividad.length > 0 && (
                                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem" }}>
                                                        <Image
                                                            src="/Icons/clipboard-check.svg"
                                                            alt="Actividad"
                                                            width={14}
                                                            height={14}
                                                            style={{ opacity: 0.7 }}
                                                        />
                                                        <span style={{ color: "var(--text-secondary)" }}>{system.actividad.join(", ")}</span>
                                                    </div>
                                                )}
                                                {system.holding && (
                                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem" }}>
                                                        <Image
                                                            src="/Icons/holding.svg"
                                                            alt="Holding"
                                                            width={14}
                                                            height={14}
                                                            style={{ opacity: 0.7 }}
                                                        />
                                                        <span style={{ color: "var(--text-secondary)" }}>{system.holding}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "16px", alignSelf: "flex-start" }}>
                                        {/* User Req 7: Improved Toggle UX */}
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            <span style={{
                                                fontSize: "0.75rem",
                                                color: disabledSystems[system.url_sitio] ? "var(--text-muted)" : "#3DDC97",
                                                fontWeight: "600"
                                            }}>
                                                {disabledSystems[system.url_sitio] ? "Inactivo" : "Activo"}
                                            </span>
                                            <button
                                                onClick={async () => {
                                                    const oldState = disabledSystems[system.url_sitio];
                                                    const newState = !oldState;
                                                    setDisabledSystems({ ...disabledSystems, [system.url_sitio]: newState });
                                                    try {
                                                        const result = await updateSystemFields(system.url_sitio, { disabled_state: newState });
                                                        if (!result.success) {
                                                            console.error("Error updating disabled state:", result.error);
                                                            alert("Error al actualizar: " + result.error);
                                                            setDisabledSystems({ ...disabledSystems, [system.url_sitio]: oldState });
                                                        }
                                                    } catch (error) {
                                                        console.error("Error updating disabled state:", error);
                                                        alert("Error al actualizar: " + error);
                                                        setDisabledSystems({ ...disabledSystems, [system.url_sitio]: oldState });
                                                    }
                                                }}
                                                style={{
                                                    width: "36px",
                                                    height: "20px",
                                                    borderRadius: "12px",
                                                    border: "none",
                                                    backgroundColor: disabledSystems[system.url_sitio] ? "#334155" : "#3DDC97", // Gray Blue if Paused (Disabled=True), Green if Active (Disabled=False)
                                                    position: "relative",
                                                    cursor: "pointer",
                                                    padding: 0,
                                                    transition: "all 200ms var(--ease-smooth)",
                                                    display: "flex",
                                                    alignItems: "center"
                                                }}
                                                title={disabledSystems[system.url_sitio] ? "Click para activar monitoreo" : "Click para pausar monitoreo"}
                                            >
                                                <div style={{
                                                    width: "16px",
                                                    height: "16px",
                                                    borderRadius: "50%",
                                                    backgroundColor: "#FFFFFF",
                                                    position: "absolute",
                                                    left: disabledSystems[system.url_sitio] ? "2px" : "18px", // Inverted logic for visual "Active" (Right) vs "Disabled" (Left)
                                                    transition: "left 200ms cubic-bezier(0.4, 0, 0.2, 1)",
                                                    boxShadow: "0 1px 2px rgba(0,0,0,0.2)"
                                                }} />
                                            </button>
                                        </div>

                                        {/* Google Drive Area (Split Button) */}
                                        <div style={{
                                            display: "flex",
                                            borderRadius: "8px",
                                            overflow: "hidden",
                                            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                                            height: "32px"
                                        }}>
                                            <button
                                                onClick={() => handleOpenUpload(system)}
                                                style={{
                                                    backgroundColor: "#F3F4F6",
                                                    border: "none",
                                                    padding: "0 0.6rem",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    cursor: "pointer"
                                                }}
                                                title="Subir archivo"
                                            >
                                                <Image
                                                    src="/Icons/upload-squa.svg"
                                                    alt="Subir"
                                                    width={16}
                                                    height={16}
                                                />
                                            </button>
                                            <button
                                                onClick={() => handleOpenFiles(system)}
                                                style={{
                                                    backgroundColor: "#FFFFFF",
                                                    border: "none",
                                                    padding: "0 0.8rem",
                                                    color: "#4B5563",
                                                    fontSize: "0.75rem",
                                                    fontWeight: "600",
                                                    cursor: "pointer",
                                                    whiteSpace: "nowrap"
                                                }}
                                            >
                                                Archivos
                                            </button>
                                        </div>

                                        {/* Reportes del cliente — abre modal con tareas/reportes filtrados */}
                                        <button
                                            onClick={() => setReportsSystem(system)}
                                            title={`Ver reportes de ${system.nombre_empresa}`}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "0.4rem",
                                                height: "32px",
                                                padding: "0 0.7rem",
                                                backgroundColor: "#FFFFFF",
                                                border: "none",
                                                borderRadius: "8px",
                                                color: "#4B5563",
                                                fontSize: "0.75rem",
                                                fontWeight: "600",
                                                cursor: "pointer",
                                                whiteSpace: "nowrap",
                                                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                                                fontFamily: "inherit"
                                            }}
                                        >
                                            <Image
                                                src="/Icons/stats-report.svg"
                                                alt="Reportes"
                                                width={16}
                                                height={16}
                                                style={{ opacity: 0.7 }}
                                            />
                                            Reportes
                                        </button>

                                        {/* Options Button */}
                                        <div style={{ position: "relative" }}>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setMenuOpen(menuOpen === system.url_sitio ? null : system.url_sitio);
                                                }}
                                                onMouseEnter={() => setOptionsHover(system.url_sitio)}
                                                onMouseLeave={() => setOptionsHover(null)}
                                                style={{
                                                    backgroundColor: optionsHover === system.url_sitio ? "var(--bg-main)" : "#FFFFFF",
                                                    border: "none",
                                                    borderRadius: "var(--radius-md)",
                                                    padding: "0.5rem",
                                                    cursor: "pointer",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    transition: "background-color 150ms var(--ease-smooth)",
                                                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)"
                                                }}
                                            >
                                                <Image
                                                    src="/Icons/mac-option-key.svg"
                                                    alt="Opciones"
                                                    width={20}
                                                    height={20}
                                                />
                                            </button>

                                            {/* Dropdown Menu */}
                                            {menuOpen === system.url_sitio && (
                                                <div
                                                    onClick={(e) => e.stopPropagation()}
                                                    style={{
                                                        position: "absolute",
                                                        top: "100%",
                                                        right: 0,
                                                        backgroundColor: "#FFFFFF",
                                                        border: "1px solid var(--border-color)",
                                                        borderRadius: "var(--radius-md)",
                                                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                                                        minWidth: "150px",
                                                        zIndex: 10,
                                                        overflow: "hidden"
                                                    }}>
                                                    {/* Edit Option */}
                                                    <button
                                                        onClick={() => {
                                                            setMenuOpen(null);
                                                            setEditingSystem({ ...system });
                                                            setIsEditModalOpen(true);
                                                        }}
                                                        style={{
                                                            width: "100%",
                                                            padding: "0.5rem 1rem",
                                                            border: "none",
                                                            backgroundColor: "#FFFFFF",
                                                            cursor: "pointer",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "0.75rem",
                                                            fontSize: "0.875rem",
                                                            fontWeight: "400",
                                                            color: "var(--text-main)",
                                                            transition: "background-color 150ms var(--ease-smooth)"
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-main)"}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#FFFFFF"}
                                                    >
                                                        <Image
                                                            src="/Icons/editb.svg"
                                                            alt="Editar"
                                                            width={16}
                                                            height={16}
                                                            style={{ opacity: 0.7 }}
                                                        />
                                                        <span>Editar</span>
                                                    </button>

                                                    {/* Separator */}
                                                    <div style={{ height: "1px", backgroundColor: "var(--border-color)" }} />

                                                    {/* Delete Option */}
                                                    <button
                                                        onClick={async () => {
                                                            setMenuOpen(null);
                                                            if (window.confirm("¿Está seguro que desea eliminar este sistema? Esta acción no se puede deshacer.")) {
                                                                const result = await deleteSystem(system.url_sitio);
                                                                if (result.success) {
                                                                    setSystems(prev => prev.filter(s => s.url_sitio !== system.url_sitio));
                                                                } else {
                                                                    alert("Error al eliminar el sistema");
                                                                }
                                                            }
                                                        }}
                                                        style={{
                                                            width: "100%",
                                                            padding: "0.5rem 1rem",
                                                            border: "none",
                                                            backgroundColor: "#FFFFFF",
                                                            cursor: "pointer",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "0.75rem",
                                                            fontSize: "0.875rem",
                                                            fontWeight: "400",
                                                            color: "#ef4444", // Red color for delete action
                                                            transition: "background-color 150ms var(--ease-smooth)"
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-main)"}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#FFFFFF"}
                                                    >
                                                        <Image
                                                            src="/Icons/eraseb.svg"
                                                            alt="Eliminar"
                                                            width={16}
                                                            height={16}
                                                            style={{ opacity: 0.7 }}
                                                        />
                                                        <span>Eliminar</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* View Details Button (Icon Version) */}
                                        <button
                                            onClick={() => {
                                                setExpandedCards(prev => {
                                                    const newSet = new Set(prev);
                                                    if (newSet.has(system.url_sitio)) newSet.delete(system.url_sitio);
                                                    else newSet.add(system.url_sitio);
                                                    return newSet;
                                                });
                                            }}
                                            style={{
                                                backgroundColor: "#FFFFFF",
                                                border: "none",
                                                borderRadius: "var(--radius-md)",
                                                padding: "0.5rem",
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                transition: "background-color 150ms var(--ease-smooth)",
                                                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)"
                                            }}
                                            title={expandedCards.has(system.url_sitio) ? "Ocultar Detalles" : "Ver Detalles"}
                                        >
                                            <Image
                                                src={expandedCards.has(system.url_sitio) ? "/Icons/sinojo.svg" : "/Icons/ojo.svg"}
                                                alt={expandedCards.has(system.url_sitio) ? "Ocultar" : "Ver"}
                                                width={20}
                                                height={20}
                                            />
                                        </button>
                                    </div>
                                </div>

                                {/* Row 1: Primera fila de datos */}
                                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", padding: "0.25rem 0" }}>
                                    {/* Estado - estado_sitio */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                        <button
                                            onClick={() => handleViewHistory(system)}
                                            style={{
                                                fontSize: "0.75rem",
                                                fontWeight: "600",
                                                color: system.estado_sitio.toLowerCase().includes("online") ? "#3DDC97" : "#FF6B6B",
                                                backgroundColor: system.estado_sitio.toLowerCase().includes("online") ? "rgba(61,220,151,0.12)" : "rgba(255,107,107,0.15)",
                                                border: "none",
                                                padding: "2px 10px",
                                                borderRadius: "999px",
                                                cursor: "pointer",
                                                transition: "all 0.2s"
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.filter = "brightness(1.2)"}
                                            onMouseLeave={(e) => e.currentTarget.style.filter = "none"}
                                            title="Ver historial de caídas"
                                        >
                                            {system.estado_sitio}
                                        </button>
                                    </div>

                                    {/* Divider Dot */}
                                    <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--border-color)" }} />

                                    {/* IP Address - ip_sitio */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                        <Image
                                            src="/Icons/ip-address-tag.svg"
                                            alt="IP"
                                            width={20}
                                            height={20}
                                            style={{ opacity: 0.7 }}
                                        />
                                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                                            {getServerDetails(
                                                editingSystems[system.url_sitio]
                                                    ? (editValues[system.url_sitio]?.nombre_servidor || system.nombre_servidor)
                                                    : system.nombre_servidor
                                            )?.ip_servidor || '-'}
                                        </span>
                                    </div>

                                    {/* Divider Dot */}
                                    <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--border-color)" }} />

                                    {/* Server Connection - nombre_servidor */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                        <Image
                                            src="/Icons/server-connection.svg"
                                            alt="Server"
                                            width={20}
                                            height={20}
                                            style={{ opacity: 0.7 }}
                                        />
                                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                            {editingSystems[system.url_sitio] ? (
                                                <select
                                                    value={editValues[system.url_sitio]?.nombre_servidor || system.nombre_servidor || ""}
                                                    onChange={(e) => setEditValues({
                                                        ...editValues,
                                                        [system.url_sitio]: { ...editValues[system.url_sitio], nombre_servidor: e.target.value }
                                                    })}
                                                    style={{
                                                        fontSize: "0.75rem",
                                                        border: "1px solid var(--border-color)",
                                                        borderRadius: "var(--radius-sm)",
                                                        padding: "0 0.25rem",
                                                        maxWidth: "100px",
                                                        backgroundColor: "var(--bg-main)",
                                                        color: "var(--text-main)",
                                                        cursor: "pointer"
                                                    }}
                                                >
                                                    <option value="">Seleccionar...</option>
                                                    {servers.map(srv => (
                                                        <option key={srv.nombre_servidor} value={srv.nombre_servidor}>
                                                            {srv.nombre_servidor}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                system.nombre_servidor || '-'
                                            )}
                                        </span>
                                    </div>

                                    {/* Divider Dot */}
                                    <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--border-color)" }} />

                                    {/* Version - version_sistema */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                        <Image
                                            src="/Icons/code.svg"
                                            alt="Version"
                                            width={20}
                                            height={20}
                                            style={{ opacity: 0.7 }}
                                        />
                                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                                            {getServerDetails(
                                                editingSystems[system.url_sitio]
                                                    ? (editValues[system.url_sitio]?.nombre_servidor || system.nombre_servidor)
                                                    : system.nombre_servidor
                                            )?.version_sistema || '-'}
                                        </span>
                                    </div>

                                    {/* Divider Dot */}
                                    <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--border-color)" }} />

                                    {/* Tipo Instancia (replaces Memory) */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                        <Image
                                            src="/Icons/server-solid.svg"
                                            alt="Tipo"
                                            width={20}
                                            height={20}
                                            style={{ opacity: 0.7 }}
                                        />
                                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                            {getServerDetails(
                                                editingSystems[system.url_sitio]
                                                    ? (editValues[system.url_sitio]?.nombre_servidor || system.nombre_servidor)
                                                    : system.nombre_servidor
                                            )?.tipo_instancia || '-'}
                                        </span>
                                    </div>

                                    {/* Divider Dot */}
                                    <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--border-color)" }} />

                                    {/* Memoria Sistema */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                        <Image
                                            src="/Icons/electronics-chip.svg"
                                            alt="Monitor"
                                            width={20}
                                            height={20}
                                            style={{ opacity: 0.7 }}
                                        />
                                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                            {editingSystems[system.url_sitio] ? (
                                                editValues[system.url_sitio]?.memoria_sistema || system.memoria_sistema || '-'
                                            ) : (
                                                system.memoria_sistema || '-'
                                            )}
                                        </span>
                                    </div>
                                    {/* Divider Dot */}
                                    <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--border-color)" }} />

                                    {/* Puerto Web */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                        <Image
                                            src="/Icons/puerto.svg"
                                            alt="Puerto"
                                            width={20}
                                            height={20}
                                            style={{ opacity: 0.7 }}
                                        />
                                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                            {editingSystems[system.url_sitio] ? (
                                                editValues[system.url_sitio]?.puerto_web || system.puerto_web || '-'
                                            ) : (
                                                system.puerto_web || '-'
                                            )}
                                        </span>
                                    </div>


                                </div>

                                {/* Internal Separator */}
                                <div style={{ height: "1px", borderTop: "1px solid var(--border-color)", margin: "0 -1.5rem" }} />

                                {/* Row 2: Segunda fila de datos */}
                                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                                    {/* Usuarios Totales - usuarios_totales */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                        <Image
                                            src="/Icons/group.svg"
                                            alt="Usuarios"
                                            width={20}
                                            height={20}
                                            style={{ opacity: 0.7 }}
                                        />
                                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>
                                            {system.usuarios_totales || 0}
                                        </span>
                                    </div>

                                    {/* Divider Dot */}
                                    <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--border-color)" }} />

                                    {/* Ultima Conexion - ultima_conexion */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                        <Image
                                            src="/Icons/user-square.svg"
                                            alt="Última"
                                            width={20}
                                            height={20}
                                            style={{ opacity: 0.8 }}
                                        />
                                        <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.2" }}>
                                            <span style={{ fontSize: "0.65rem" }}>Última Conexión</span>
                                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "600", fontFamily: "monospace" }}>
                                                {formatDate(system.ultima_conexion)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Divider Dot */}
                                    <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--border-color)" }} />

                                    {/* Contratados - usuarios_contratados */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                        <Image
                                            src="/Icons/group.svg"
                                            alt="Contratados"
                                            width={20}
                                            height={20}
                                            style={{ opacity: 0.8 }}
                                        />
                                        <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.2" }}>
                                            <span style={{ fontSize: "0.65rem" }}>Contratados</span>
                                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "400" }}>
                                                {system.usuarios_contratados || 0}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Divider Dot */}
                                    <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--border-color)" }} />

                                    {/* Renovacion - fecha_renovacion */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                        <Image
                                            src="/Icons/calendar-rotate-solid.svg"
                                            alt="Renovacion"
                                            width={20}
                                            height={20}
                                            style={{ opacity: 0.8 }}
                                        />
                                        <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.2" }}>
                                            <span style={{ fontSize: "0.65rem" }}>Renovación</span>
                                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "400" }}>
                                                {system.fecha_renovacion || '-'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Divider Dot */}
                                    <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "var(--border-color)" }} />

                                    {/* Ultimo Backup */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                        <Image
                                            src="/Icons/database-backup.svg"
                                            alt="Backup"
                                            width={20}
                                            height={20}
                                            style={{ opacity: 0.8 }}
                                        />
                                        <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.2" }}>
                                            <span style={{ fontSize: "0.65rem" }}>Backup</span>
                                            <span style={{
                                                fontSize: "0.75rem",
                                                color: system.ultimo_backup && system.ultimo_backup === todayStr ? "var(--text-secondary)" : "#EF4444",
                                                fontWeight: "600"
                                            }}>
                                                {system.ultimo_backup || 'N/A'}
                                            </span>
                                        </div>
                                    </div>

                                </div>



                                {/* Expanded View with Tabs */}
                                {expandedCards.has(system.url_sitio) && (
                                    <div style={{ marginTop: "1rem" }}>
                                        {/* Tab Switcher */}
                                        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "-1px", position: "relative", zIndex: 2, padding: "0 1rem" }}>
                                            <button
                                                onClick={() => setActiveTabs({ ...activeTabs, [system.url_sitio]: 'bitacora' })}
                                                style={{
                                                    padding: "0.4rem 1.2rem",
                                                    fontSize: "0.8125rem",
                                                    fontWeight: "600",
                                                    backgroundColor: (activeTabs[system.url_sitio] || 'bitacora') === 'bitacora' ? "var(--bg-main)" : "transparent",
                                                    border: "1px solid var(--border-color)",
                                                    borderBottom: (activeTabs[system.url_sitio] || 'bitacora') === 'bitacora' ? "1px solid var(--bg-main)" : "1px solid var(--border-color)",
                                                    borderRadius: "8px 8px 0 0",
                                                    color: (activeTabs[system.url_sitio] || 'bitacora') === 'bitacora' ? "var(--primary)" : "var(--text-secondary)",
                                                    cursor: "pointer"
                                                }}
                                            >
                                                Bitácora
                                            </button>
                                            <button
                                                onClick={() => setActiveTabs({ ...activeTabs, [system.url_sitio]: 'nexos' })}
                                                style={{
                                                    padding: "0.4rem 1.2rem",
                                                    fontSize: "0.8125rem",
                                                    fontWeight: "600",
                                                    backgroundColor: activeTabs[system.url_sitio] === 'nexos' ? "var(--bg-main)" : "transparent",
                                                    border: "1px solid var(--border-color)",
                                                    borderBottom: activeTabs[system.url_sitio] === 'nexos' ? "1px solid var(--bg-main)" : "1px solid var(--border-color)",
                                                    borderRadius: "8px 8px 0 0",
                                                    color: activeTabs[system.url_sitio] === 'nexos' ? "var(--primary)" : "var(--text-secondary)",
                                                    cursor: "pointer"
                                                }}
                                            >
                                                Nexos
                                            </button>
                                        </div>

                                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", position: "relative", zIndex: 1 }}>
                                            {(activeTabs[system.url_sitio] || 'bitacora') === 'bitacora' && (
                                                <div style={{ backgroundColor: "#FFFFFF", padding: "1.25rem", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", border: "1px solid rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", gap: "1rem" }}>
                                                    {/* Bitacora Section */}
                                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                                        <span style={{ fontWeight: "600", fontSize: "0.75rem", color: "#1F2937", textTransform: "uppercase" }}>Bitácora</span>
                                                        {system.texto_libre && (
                                                            <div style={{ fontSize: "12px", color: "#6B7280", backgroundColor: "rgba(0,0,0,0.02)", padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border-color)", maxHeight: "150px", overflowY: "auto", whiteSpace: "pre-wrap", fontFamily: "var(--font-roboto)" }}>
                                                                {system.texto_libre}
                                                            </div>
                                                        )}
                                                        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
                                                            <textarea
                                                                placeholder="Agregar texto libre..."
                                                                value={editValues[system.url_sitio]?.texto_libre ?? ""}
                                                                onChange={(e) => setEditValues({ ...editValues, [system.url_sitio]: { ...editValues[system.url_sitio], texto_libre: e.target.value } })}
                                                                style={{ flex: 1, padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", fontSize: "0.8125rem", resize: "none" }}
                                                                rows={3}
                                                            />
                                                            <button
                                                                onClick={async () => {
                                                                    const val = editValues[system.url_sitio]?.texto_libre;
                                                                    if (val && val.trim() !== "") {
                                                                        const now = new Date();
                                                                        const dArr = String(now.getDate()).padStart(2, '0');
                                                                        const mArr = String(now.getMonth() + 1).padStart(2, '0');
                                                                        const dateHeader = `[${dArr}/${mArr}/${String(now.getFullYear()).slice(-2)}]`;
                                                                        const nextText = system.texto_libre ? `${system.texto_libre}\n${dateHeader} ${val.trim()}` : `${dateHeader} ${val.trim()}`;
                                                                        const result = await updateSystemFields(system.url_sitio, { texto_libre: nextText });
                                                                        if (result.success) {
                                                                            setSystems(prev => prev.map(s => s.url_sitio === system.url_sitio ? { ...s, texto_libre: nextText } : s));
                                                                            const ev = { ...editValues }; if (ev[system.url_sitio]) delete ev[system.url_sitio].texto_libre; setEditValues(ev);
                                                                        }
                                                                    }
                                                                }}
                                                                disabled={!editValues[system.url_sitio]?.texto_libre?.trim()}
                                                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", opacity: editValues[system.url_sitio]?.texto_libre?.trim() ? 1 : 0.3 }}
                                                            >
                                                                <Image src="/Icons/floppy-disk-arrow-in.svg" alt="Save" width={22} height={22} />
                                                            </button>
                                                        </div>
                                                    </div>


                                                    {/* Capacitaciones Section */}
                                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                                        <span style={{ fontWeight: "600", fontSize: "0.75rem", color: "#1F2937", textTransform: "uppercase" }}>Capacitaciones</span>
                                                        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end" }}>
                                                            <div style={{ flex: 1 }}>
                                                                <label style={{ fontSize: "0.65rem", color: "#6B7280", fontWeight: "600" }}>FECHA</label>
                                                                <input type="date" value={editValues[system.url_sitio]?.fecha_capacitacion ?? system.fecha_capacitacion ?? ""} onChange={(e) => setEditValues({ ...editValues, [system.url_sitio]: { ...editValues[system.url_sitio], fecha_capacitacion: e.target.value } })} style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)", fontSize: "0.8125rem" }} />
                                                            </div>
                                                            <div style={{ flex: 2 }}>
                                                                <label style={{ fontSize: "0.65rem", color: "#6B7280", fontWeight: "600" }}>HITO</label>
                                                                <input type="text" placeholder="Hito..." value={editValues[system.url_sitio]?.hito_capacitacion ?? system.hito_capacitacion ?? ""} onChange={(e) => setEditValues({ ...editValues, [system.url_sitio]: { ...editValues[system.url_sitio], hito_capacitacion: e.target.value } })} style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border-color)", fontSize: "0.8125rem" }} />
                                                            </div>
                                                            <button
                                                                onClick={async () => {
                                                                    const updates = { fecha_capacitacion: editValues[system.url_sitio]?.fecha_capacitacion, hito_capacitacion: editValues[system.url_sitio]?.hito_capacitacion };
                                                                    if (updates.fecha_capacitacion && updates.hito_capacitacion) {
                                                                        const result = await updateSystemFields(system.url_sitio, updates);
                                                                        if (result.success) {
                                                                            setSystems(prev => prev.map(s => s.url_sitio === system.url_sitio ? { ...s, ...updates } : s));
                                                                            alert("Capacitación guardada");
                                                                        }
                                                                    }
                                                                }}
                                                                disabled={!editValues[system.url_sitio]?.fecha_capacitacion || !editValues[system.url_sitio]?.hito_capacitacion}
                                                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", opacity: (editValues[system.url_sitio]?.fecha_capacitacion && editValues[system.url_sitio]?.hito_capacitacion) ? 1 : 0.3 }}
                                                            >
                                                                <Image src="/Icons/floppy-disk-arrow-in.svg" alt="Save" width={22} height={22} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {activeTabs[system.url_sitio] === 'nexos' && (
                                                <div style={{ backgroundColor: "#FFFFFF", padding: "1.25rem", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", border: "1px solid rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", gap: "1rem" }}>
                                                    {/* Módulos Section */}
                                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                                        <span style={{ fontWeight: "600", fontSize: "0.75rem", color: "#1F2937", textTransform: "uppercase" }}>Módulos</span>
                                                        <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", padding: "1rem", backgroundColor: "rgba(0,0,0,0.02)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                                                            {['Base', 'Amazon', 'Bandeja', 'Contabilidad', 'Fac.cl', 'API'].map((mod) => (
                                                                <label key={mod} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: (system.modulos_activos || []).includes(mod) ? "#1F2937" : "#6B7280", fontWeight: "500" }}>
                                                                    <input type="checkbox" checked={(system.modulos_activos || []).includes(mod)} disabled style={{ accentColor: "var(--primary)" }} /> {mod}
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>


                                                    {/* Contactos Section */}
                                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                            <span style={{ fontWeight: "600", fontSize: "0.75rem", color: "#1F2937", textTransform: "uppercase" }}>Contactos</span>
                                                            <button onClick={() => {
                                                                const current = editValues[system.url_sitio]?.contactos_adicionales || system.contactos_adicionales || [];
                                                                setEditValues({ ...editValues, [system.url_sitio]: { ...editValues[system.url_sitio], contactos_adicionales: [...current, { nombre: '', cargo: '', phone: '', mail: '' }] } });
                                                            }} style={{ fontSize: "0.75rem", color: "var(--primary)", background: "none", border: "1px solid var(--primary)", borderRadius: "6px", padding: "0.3rem 0.6rem", cursor: "pointer", fontWeight: "500" }}>+ Agregar Contacto</button>
                                                        </div>

                                                        {/* Primary Contact Row */}
                                                        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 130px 2fr 60px", gap: "0.75rem", padding: "0.75rem", backgroundColor: "#FFFFFF", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                                                            <input type="text" placeholder="Nombre" value={editValues[system.url_sitio]?.nombre_contacto ?? system.nombre_contacto ?? ""} onChange={(e) => setEditValues({ ...editValues, [system.url_sitio]: { ...editValues[system.url_sitio], nombre_contacto: e.target.value } })} style={{ border: "none", borderBottom: "1px solid #EEE", fontSize: "0.8125rem", width: "100%", minWidth: 0, backgroundColor: "transparent", outline: "none", color: "#1F2937" }} />
                                                            <input type="text" placeholder="Cargo" value={editValues[system.url_sitio]?.cargo_contacto ?? system.cargo_contacto ?? ""} onChange={(e) => setEditValues({ ...editValues, [system.url_sitio]: { ...editValues[system.url_sitio], cargo_contacto: e.target.value } })} style={{ border: "none", borderBottom: "1px solid #EEE", fontSize: "0.8125rem", width: "100%", minWidth: 0, backgroundColor: "transparent", outline: "none", color: "#1F2937" }} />
                                                            <input type="text" placeholder="Teléfono" value={editValues[system.url_sitio]?.phone_contacto ?? system.phone_contacto ?? ""} onChange={(e) => setEditValues({ ...editValues, [system.url_sitio]: { ...editValues[system.url_sitio], phone_contacto: e.target.value } })} style={{ border: "none", borderBottom: "1px solid #EEE", fontSize: "0.8125rem", width: "100%", minWidth: 0, backgroundColor: "transparent", outline: "none", color: "#1F2937" }} />
                                                            <input type="email" placeholder="Email" value={editValues[system.url_sitio]?.mail_contacto ?? system.mail_contacto ?? ""} onChange={(e) => setEditValues({ ...editValues, [system.url_sitio]: { ...editValues[system.url_sitio], mail_contacto: e.target.value } })} style={{ border: "none", borderBottom: "1px solid #EEE", fontSize: "0.8125rem", width: "100%", minWidth: 0, backgroundColor: "transparent", outline: "none", color: "#1F2937" }} />
                                                            <div style={{ display: "flex", gap: "4px" }}>
                                                                <button
                                                                    disabled={!(editValues[system.url_sitio]?.nombre_contacto ?? system.nombre_contacto)?.trim()}
                                                                    onClick={async () => {
                                                                        const updates = { nombre_contacto: editValues[system.url_sitio]?.nombre_contacto, cargo_contacto: editValues[system.url_sitio]?.cargo_contacto, phone_contacto: editValues[system.url_sitio]?.phone_contacto, mail_contacto: editValues[system.url_sitio]?.mail_contacto };
                                                                        await updateSystemFields(system.url_sitio, updates); alert("Contacto guardado");
                                                                    }}
                                                                    style={{ background: "none", border: "none", cursor: "pointer", opacity: (editValues[system.url_sitio]?.nombre_contacto ?? system.nombre_contacto)?.trim() ? 1 : 0.3 }}
                                                                >
                                                                    <Image src="/Icons/floppy-disk-arrow-in.svg" alt="Save" width={22} height={22} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Additional Contacts */}
                                                        {(editValues[system.url_sitio]?.contactos_adicionales || system.contactos_adicionales || []).map((cont, idx) => (
                                                            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 130px 2fr 60px", gap: "0.75rem", padding: "0.75rem", backgroundColor: "#FFFFFF", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                                                                <input type="text" placeholder="Nombre" value={cont.nombre} onChange={(e) => { const c = [...(editValues[system.url_sitio]?.contactos_adicionales || system.contactos_adicionales || [])]; c[idx].nombre = e.target.value; setEditValues({ ...editValues, [system.url_sitio]: { ...editValues[system.url_sitio], contactos_adicionales: c } }); }} style={{ border: "none", borderBottom: "1px solid #EEE", fontSize: "0.8125rem", width: "100%", minWidth: 0, backgroundColor: "transparent", outline: "none", color: "#1F2937" }} />
                                                                <input type="text" placeholder="Cargo" value={cont.cargo} onChange={(e) => { const c = [...(editValues[system.url_sitio]?.contactos_adicionales || system.contactos_adicionales || [])]; c[idx].cargo = e.target.value; setEditValues({ ...editValues, [system.url_sitio]: { ...editValues[system.url_sitio], contactos_adicionales: c } }); }} style={{ border: "none", borderBottom: "1px solid #EEE", fontSize: "0.8125rem", width: "100%", minWidth: 0, backgroundColor: "transparent", outline: "none", color: "#1F2937" }} />
                                                                <input type="text" placeholder="Teléfono" value={cont.phone} onChange={(e) => { const c = [...(editValues[system.url_sitio]?.contactos_adicionales || system.contactos_adicionales || [])]; c[idx].phone = e.target.value; setEditValues({ ...editValues, [system.url_sitio]: { ...editValues[system.url_sitio], contactos_adicionales: c } }); }} style={{ border: "none", borderBottom: "1px solid #EEE", fontSize: "0.8125rem", width: "100%", minWidth: 0, backgroundColor: "transparent", outline: "none", color: "#1F2937" }} />
                                                                <input type="email" placeholder="Email" value={cont.mail} onChange={(e) => { const c = [...(editValues[system.url_sitio]?.contactos_adicionales || system.contactos_adicionales || [])]; c[idx].mail = e.target.value; setEditValues({ ...editValues, [system.url_sitio]: { ...editValues[system.url_sitio], contactos_adicionales: c } }); }} style={{ border: "none", borderBottom: "1px solid #EEE", fontSize: "0.8125rem", width: "100%", minWidth: 0, backgroundColor: "transparent", outline: "none", color: "#1F2937" }} />
                                                                <div style={{ display: "flex", gap: "4px" }}>
                                                                    <button
                                                                        disabled={!cont.nombre?.trim()}
                                                                        onClick={async () => { const c = editValues[system.url_sitio]?.contactos_adicionales || system.contactos_adicionales || []; await updateSystemFields(system.url_sitio, { contactos_adicionales: c }); alert("Contactos guardados"); }}
                                                                        style={{ background: "none", border: "none", cursor: "pointer", opacity: cont.nombre?.trim() ? 1 : 0.3 }}
                                                                    >
                                                                        <Image src="/Icons/floppy-disk-arrow-in.svg" alt="Save" width={22} height={22} />
                                                                    </button>
                                                                    <button onClick={() => { const c = [...(editValues[system.url_sitio]?.contactos_adicionales || system.contactos_adicionales || [])]; c.splice(idx, 1); setEditValues({ ...editValues, [system.url_sitio]: { ...editValues[system.url_sitio], contactos_adicionales: c } }); }} style={{ background: "none", border: "none", cursor: "pointer" }}><Image src="/Icons/trash.svg" alt="Delete" width={22} height={22} /></button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    }
                </div >
            </div >

            {/* Add System Modal */}
            {
                isAddModalOpen && (
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
                            width: "800px",
                            maxWidth: "95vw",
                            boxShadow: "var(--shadow-md)",
                            display: "flex",
                            flexDirection: "column",
                            overflow: "hidden",
                            border: "1px solid var(--border-color)"
                        }}>
                            {/* Header */}
                            <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--border-color)" }}>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: "600", margin: 0, color: "var(--text-main)" }}>Agregar Nuevo Sitio</h2>
                            </div>

                            {/* Body */}
                            <div style={{ padding: "1.5rem", overflowY: "auto", maxHeight: "70vh", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

                                {/* Row 1 */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Nombre Empresa *</label>
                                        <input
                                            type="text"
                                            value={newSystem.nombre_empresa || ""}
                                            onChange={(e) => setNewSystem({ ...newSystem, nombre_empresa: e.target.value })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>URL Sitio *</label>
                                        <input
                                            type="text"
                                            value={newSystem.url_sitio || ""}
                                            onChange={(e) => setNewSystem({ ...newSystem, url_sitio: e.target.value })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                </div>

                                {/* Row 1.5 - Giro & Holding */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Giro</label>
                                        <select
                                            value={newSystem.giro || ""}
                                            onChange={(e) => setNewSystem({ ...newSystem, giro: e.target.value })}
                                            style={{
                                                padding: "0.625rem",
                                                borderRadius: "6px",
                                                border: "1px solid var(--border-color)",
                                                backgroundColor: "var(--border-color)",
                                                color: "var(--text-main)",
                                                outline: "none",
                                                width: "100%",
                                                cursor: "pointer"
                                            }}
                                        >
                                            <option value="">Seleccionar giro...</option>
                                            <option value="Agencia de Publicidad y BTL">Agencia de Publicidad y BTL</option>
                                            <option value="Films">Films</option>
                                            <option value="Eventos">Eventos</option>
                                            <option value="Post & Audio">Post & Audio</option>
                                            <option value="Const & Arqu">Const & Arqu</option>
                                            <option value="Film Production - Adv">Film Production - Adv</option>
                                            <option value="Agencia PR">Agencia PR</option>
                                            <option value="Diseño">Diseño</option>
                                            <option value="Production Services">Production Services</option>
                                            <option value="Trade Marketing">Trade Marketing</option>
                                            <option value="Digital Mkt">Digital Mkt</option>
                                        </select>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Holding</label>
                                        <div style={{ position: "relative", display: "flex", gap: "0.5rem" }}>
                                            {(newSystem.holding === "" || newSystem.holding === undefined || Array.from(new Set(systems.map(s => s.holding).filter(Boolean))).includes(newSystem.holding)) ? (
                                                <select
                                                    value={newSystem.holding || ""}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === "__NEW__") {
                                                            setNewSystem({ ...newSystem, holding: "NEW_ENTRY" });
                                                        } else {
                                                            setNewSystem({ ...newSystem, holding: val });
                                                        }
                                                    }}
                                                    style={{
                                                        padding: "0.625rem",
                                                        borderRadius: "6px",
                                                        border: "1px solid var(--border-color)",
                                                        backgroundColor: "var(--border-color)",
                                                        color: "var(--text-main)",
                                                        outline: "none",
                                                        width: "100%",
                                                        cursor: "pointer"
                                                    }}
                                                >
                                                    <option value="">Seleccionar holding...</option>
                                                    {Array.from(new Set(systems.map(s => s.holding).filter(Boolean))).sort().map(h => (
                                                        <option key={h} value={h}>{h}</option>
                                                    ))}
                                                    <option value="__NEW__" style={{ fontWeight: "bold", color: "var(--primary)" }}>+ Agregar nuevo...</option>
                                                </select>
                                            ) : (
                                                <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                                                    <input
                                                        type="text"
                                                        value={newSystem.holding === "NEW_ENTRY" ? "" : newSystem.holding}
                                                        onChange={(e) => setNewSystem({ ...newSystem, holding: e.target.value })}
                                                        placeholder="Escriba nombre del holding..."
                                                        autoFocus
                                                        style={{
                                                            padding: "0.625rem",
                                                            borderRadius: "6px",
                                                            border: "1px solid var(--border-color)",
                                                            backgroundColor: "var(--border-color)",
                                                            color: "var(--text-main)",
                                                            outline: "none",
                                                            width: "100%"
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => setNewSystem({ ...newSystem, holding: "" })}
                                                        title="Volver a lista"
                                                        style={{
                                                            padding: "0 0.5rem",
                                                            background: "var(--bg-hover)",
                                                            border: "1px solid var(--border-color)",
                                                            borderRadius: "6px",
                                                            cursor: "pointer"
                                                        }}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Row 1.75 - Actividad */}
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                    <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Actividad</label>
                                    <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)", color: "var(--text-main)" }}>
                                        {['Audiovisual', 'Eventos', 'Post-Produccion', 'Publicidad', 'Diseño', 'Fotografia', 'Audio', 'Rental', 'Construccion', 'Arquitectura', 'Otros servicios creativos'].map((act) => (
                                            <label key={act} style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={newSystem.actividad?.includes(act) || false}
                                                    onChange={(e) => {
                                                        const current = newSystem.actividad || [];
                                                        if (e.target.checked) {
                                                            setNewSystem({ ...newSystem, actividad: [...current, act] });
                                                        } else {
                                                            setNewSystem({ ...newSystem, actividad: current.filter(a => a !== act) });
                                                        }
                                                    }}
                                                    style={{ width: "14px", height: "14px", accentColor: "#3B82F6" }}
                                                />
                                                <span style={{ fontSize: "0.75rem", color: "var(--text-main)" }}>{act}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Row 2 */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Servidor</label>
                                        <select
                                            value={newSystem.nombre_servidor || ""}
                                            onChange={(e) => setNewSystem({ ...newSystem, nombre_servidor: e.target.value })}
                                            style={{
                                                padding: "0.625rem",
                                                borderRadius: "6px",
                                                border: "1px solid var(--border-color)",
                                                backgroundColor: "var(--border-color)",
                                                color: "var(--text-main)",
                                                outline: "none",
                                                width: "100%",
                                                cursor: "pointer"
                                            }}
                                        >
                                            <option value="">Seleccionar servidor...</option>
                                            {servers.map(srv => (
                                                <option key={srv.nombre_servidor} value={srv.nombre_servidor}>
                                                    {srv.nombre_servidor}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Contratados</label>
                                        <input
                                            type="number"
                                            value={newSystem.usuarios_contratados || 0}
                                            onChange={(e) => setNewSystem({ ...newSystem, usuarios_contratados: parseInt(e.target.value) })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Memoria Sistema</label>
                                        <input
                                            type="text"
                                            placeholder="Ej: 4GB"
                                            value={newSystem.memoria_sistema || ""}
                                            onChange={(e) => setNewSystem({ ...newSystem, memoria_sistema: e.target.value })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Puerto Web</label>
                                        <input
                                            type="text"
                                            placeholder="Ej: 8080"
                                            value={newSystem.puerto_web || ""}
                                            onChange={(e) => setNewSystem({ ...newSystem, puerto_web: e.target.value })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                </div>

                                {/* Contact Info Rows */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <input
                                            type="text"
                                            placeholder="Nombre Contacto"
                                            value={newSystem.nombre_contacto || ""}
                                            onChange={(e) => setNewSystem({ ...newSystem, nombre_contacto: e.target.value })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <input
                                            type="text"
                                            placeholder="Cargo Contacto"
                                            value={newSystem.cargo_contacto || ""}
                                            onChange={(e) => setNewSystem({ ...newSystem, cargo_contacto: e.target.value })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <input
                                            type="text"
                                            placeholder="Teléfono"
                                            value={newSystem.phone_contacto || ""}
                                            onChange={(e) => setNewSystem({ ...newSystem, phone_contacto: e.target.value })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <input
                                            type="email"
                                            placeholder="Email"
                                            value={newSystem.mail_contacto || ""}
                                            onChange={(e) => setNewSystem({ ...newSystem, mail_contacto: e.target.value })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                </div>

                                {/* Modules */}
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
                                    <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Módulos</label>
                                    <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
                                        {['Base', 'Amazon', 'Bandeja', 'Contabilidad', 'Fac.cl', 'API'].map((mod) => (
                                            <label key={mod} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={newSystem.modulos_activos?.includes(mod) || false}
                                                    onChange={(e) => {
                                                        const current = newSystem.modulos_activos || [];
                                                        if (e.target.checked) {
                                                            setNewSystem({ ...newSystem, modulos_activos: [...current, mod] });
                                                        } else {
                                                            setNewSystem({ ...newSystem, modulos_activos: current.filter(m => m !== mod) });
                                                        }
                                                    }}
                                                    style={{ width: "16px", height: "16px", accentColor: "#3B82F6" }}
                                                />
                                                <span style={{ fontSize: "0.75rem", color: "var(--text-main)" }}>{mod}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "flex-end", gap: "0.75rem", backgroundColor: "var(--bg-card)" }}>
                                <button onClick={() => setIsAddModalOpen(false)} style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid var(--border-color)", cursor: "pointer" }}>Cancelar</button>
                                <button onClick={handleAddSystem} className="btn btn-primary" style={{ padding: "0.5rem 1rem", borderRadius: "6px", cursor: "pointer" }}>Inscribir Equipo</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Edit System Modal */}
            {
                isEditModalOpen && editingSystem && (
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
                            width: "800px",
                            maxWidth: "95vw",
                            boxShadow: "var(--shadow-md)",
                            display: "flex",
                            flexDirection: "column",
                            overflow: "hidden",
                            border: "1px solid var(--border-color)"
                        }}>
                            {/* Header */}
                            <div style={{ padding: "1.5rem", borderBottom: "1px solid var(--border-color)" }}>
                                <h2 style={{ fontSize: "1.25rem", fontWeight: "600", margin: 0, color: "var(--text-main)" }}>Editar Sitio</h2>
                            </div>

                            {/* Body */}
                            <div style={{ padding: "1.5rem", overflowY: "auto", maxHeight: "70vh", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

                                {/* Row 1 */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Nombre Empresa *</label>
                                        <input
                                            type="text"
                                            value={editingSystem.nombre_empresa || ""}
                                            onChange={(e) => setEditingSystem({ ...editingSystem, nombre_empresa: e.target.value })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>URL Sitio (ID - No editable)</label>
                                        <input
                                            type="text"
                                            value={editingSystem.url_sitio || ""}
                                            disabled
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid #E5E7EB", backgroundColor: "#E5E7EB", outline: "none", width: "100%", cursor: "not-allowed", color: "#6B7280" }}
                                        />
                                    </div>
                                </div>

                                {/* Row 1.5 - Giro & Holding */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Giro</label>
                                        <select
                                            value={editingSystem.giro || ""}
                                            onChange={(e) => setEditingSystem({ ...editingSystem, giro: e.target.value })}
                                            style={{
                                                padding: "0.625rem",
                                                borderRadius: "6px",
                                                border: "1px solid var(--border-color)",
                                                backgroundColor: "var(--border-color)",
                                                color: "var(--text-main)",
                                                outline: "none",
                                                width: "100%",
                                                cursor: "pointer"
                                            }}
                                        >
                                            <option value="">Seleccionar giro...</option>
                                            <option value="Agencia de Publicidad y BTL">Agencia de Publicidad y BTL</option>
                                            <option value="Films">Films</option>
                                            <option value="Eventos">Eventos</option>
                                            <option value="Post & Audio">Post & Audio</option>
                                            <option value="Const & Arqu">Const & Arqu</option>
                                            <option value="Film Production - Adv">Film Production - Adv</option>
                                            <option value="Agencia PR">Agencia PR</option>
                                            <option value="Diseño">Diseño</option>
                                            <option value="Production Services">Production Services</option>
                                            <option value="Trade Marketing">Trade Marketing</option>
                                            <option value="Digital Mkt">Digital Mkt</option>
                                        </select>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Holding</label>
                                        <div style={{ position: "relative", display: "flex", gap: "0.5rem" }}>
                                            {(editingSystem.holding === "" || editingSystem.holding === undefined || Array.from(new Set(systems.map(s => s.holding).filter(Boolean))).includes(editingSystem.holding)) ? (
                                                <div style={{ display: "flex", gap: "0.25rem", width: "100%" }}>
                                                    <select
                                                        value={editingSystem.holding || ""}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            if (val === "__NEW__") {
                                                                setEditingSystem({ ...editingSystem, holding: "NEW_ENTRY" });
                                                            } else {
                                                                setEditingSystem({ ...editingSystem, holding: val });
                                                            }
                                                        }}
                                                        style={{
                                                            padding: "0.625rem",
                                                            borderRadius: "6px",
                                                            border: "1px solid var(--border-color)",
                                                            backgroundColor: "var(--border-color)",
                                                            color: "var(--text-main)",
                                                            outline: "none",
                                                            width: "100%",
                                                            cursor: "pointer"
                                                        }}
                                                    >
                                                        <option value="">Seleccionar holding...</option>
                                                        {Array.from(new Set(systems.map(s => s.holding).filter(Boolean))).sort().map(h => (
                                                            <option key={h} value={h}>{h}</option>
                                                        ))}
                                                        <option value="__NEW__" style={{ fontWeight: "bold", color: "var(--primary)" }}>+ Agregar nuevo...</option>
                                                    </select>
                                                    {editingSystem.holding && editingSystem.holding !== "" && editingSystem.holding !== "NEW_ENTRY" && (
                                                        <div style={{ display: "flex", gap: "0.25rem" }}>
                                                            <button
                                                                type="button"
                                                                title="Renombrar este holding"
                                                                onClick={handleRenameHolding}
                                                                style={{ padding: "0.25rem", background: "var(--bg-hover)", border: "1px solid var(--border-color)", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", minWidth: "40px" }}
                                                            >
                                                                <Image src="/Icons/editb.svg" alt="Editar" width={16} height={16} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                title="Eliminar este holding"
                                                                onClick={handleDeleteHolding}
                                                                style={{ padding: "0.25rem", background: "var(--bg-hover)", border: "1px solid var(--border-color)", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", minWidth: "40px" }}
                                                            >
                                                                <Image src="/Icons/eraseb.svg" alt="Eliminar" width={16} height={16} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                                                    <input
                                                        type="text"
                                                        value={editingSystem.holding === "NEW_ENTRY" ? "" : editingSystem.holding}
                                                        onChange={(e) => setEditingSystem({ ...editingSystem, holding: e.target.value })}
                                                        placeholder="Escriba nombre del holding..."
                                                        autoFocus
                                                        style={{
                                                            padding: "0.625rem",
                                                            borderRadius: "6px",
                                                            border: "1px solid var(--border-color)",
                                                            backgroundColor: "var(--border-color)",
                                                            color: "var(--text-main)",
                                                            outline: "none",
                                                            width: "100%"
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => setEditingSystem({ ...editingSystem, holding: "" })}
                                                        title="Volver a lista"
                                                        style={{
                                                            padding: "0 0.5rem",
                                                            background: "var(--bg-hover)",
                                                            border: "1px solid var(--border-color)",
                                                            borderRadius: "6px",
                                                            cursor: "pointer"
                                                        }}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Row 1.75 - Actividad */}
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                    <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Actividad</label>
                                    <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-main)", color: "var(--text-main)" }}>
                                        {['Audiovisual', 'Eventos', 'Post-Produccion', 'Publicidad', 'Diseño', 'Fotografia', 'Audio', 'Rental', 'Construccion', 'Arquitectura', 'Otros servicios creativos'].map((act) => (
                                            <label key={act} style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={editingSystem.actividad?.includes(act) || false}
                                                    onChange={(e) => {
                                                        const current = editingSystem.actividad || [];
                                                        if (e.target.checked) {
                                                            setEditingSystem({ ...editingSystem, actividad: [...current, act] });
                                                        } else {
                                                            setEditingSystem({ ...editingSystem, actividad: current.filter(a => a !== act) });
                                                        }
                                                    }}
                                                    style={{ width: "14px", height: "14px", accentColor: "#3B82F6" }}
                                                />
                                                <span style={{ fontSize: "0.75rem", color: "var(--text-main)" }}>{act}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Row 2 */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Servidor</label>
                                        <select
                                            value={editingSystem.nombre_servidor || ""}
                                            onChange={(e) => setEditingSystem({ ...editingSystem, nombre_servidor: e.target.value })}
                                            style={{
                                                padding: "0.625rem",
                                                borderRadius: "6px",
                                                border: "1px solid var(--border-color)",
                                                backgroundColor: "var(--border-color)",
                                                color: "var(--text-main)",
                                                outline: "none",
                                                width: "100%",
                                                cursor: "pointer"
                                            }}
                                        >
                                            <option value="">Seleccionar servidor...</option>
                                            {servers.map(srv => (
                                                <option key={srv.nombre_servidor} value={srv.nombre_servidor}>
                                                    {srv.nombre_servidor}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Contratados</label>
                                        <input
                                            type="number"
                                            value={editingSystem.usuarios_contratados || 0}
                                            onChange={(e) => setEditingSystem({ ...editingSystem, usuarios_contratados: parseInt(e.target.value) })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                </div>

                                {/* Row 3 */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Renovación</label>
                                        <input
                                            type="text"
                                            placeholder="dd/mm/aaaa"
                                            value={editingSystem.fecha_renovacion || ""}
                                            onChange={(e) => setEditingSystem({ ...editingSystem, fecha_renovacion: e.target.value })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                            <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Memoria Sistema</label>
                                            <input
                                                type="text"
                                                placeholder="Ej: 4GB"
                                                value={editingSystem.memoria_sistema || ""}
                                                onChange={(e) => setEditingSystem({ ...editingSystem, memoria_sistema: e.target.value })}
                                                style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                            />
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                            <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Puerto Web</label>
                                            <input
                                                type="text"
                                                placeholder="Ej: 8080"
                                                value={editingSystem.puerto_web || ""}
                                                onChange={(e) => setEditingSystem({ ...editingSystem, puerto_web: e.target.value })}
                                                style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Modules */}
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                    <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Módulos</label>
                                    <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
                                        {['Base', 'Amazon', 'Bandeja', 'Contabilidad', 'Fac.cl', 'API'].map((mod) => (
                                            <label key={mod} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                                                <input
                                                    type="checkbox"
                                                    checked={editingSystem.modulos_activos?.includes(mod) || false}
                                                    onChange={(e) => {
                                                        const current = editingSystem.modulos_activos || [];
                                                        if (e.target.checked) {
                                                            setEditingSystem({ ...editingSystem, modulos_activos: [...current, mod] });
                                                        } else {
                                                            setEditingSystem({ ...editingSystem, modulos_activos: current.filter(m => m !== mod) });
                                                        }
                                                    }}
                                                    style={{ width: "16px", height: "16px", accentColor: "#3B82F6" }}
                                                />
                                                <span style={{ fontSize: "0.75rem", color: "var(--text-main)" }}>{mod}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Contact Info Rows */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <input
                                            type="text"
                                            placeholder="Nombre Contacto"
                                            value={editingSystem.nombre_contacto || ""}
                                            onChange={(e) => setEditingSystem({ ...editingSystem, nombre_contacto: e.target.value })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <input
                                            type="text"
                                            placeholder="Cargo Contacto"
                                            value={editingSystem.cargo_contacto || ""}
                                            onChange={(e) => setEditingSystem({ ...editingSystem, cargo_contacto: e.target.value })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <input
                                            type="text"
                                            placeholder="Teléfono"
                                            value={editingSystem.phone_contacto || ""}
                                            onChange={(e) => setEditingSystem({ ...editingSystem, phone_contacto: e.target.value })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        <input
                                            type="email"
                                            placeholder="Email"
                                            value={editingSystem.mail_contacto || ""}
                                            onChange={(e) => setEditingSystem({ ...editingSystem, mail_contacto: e.target.value })}
                                            style={{ padding: "0.625rem", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--border-color)", color: "var(--text-main)", outline: "none", width: "100%" }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "flex-end", gap: "0.75rem", backgroundColor: "var(--bg-card)" }}>
                                <button
                                    onClick={() => {
                                        setIsEditModalOpen(false);
                                        setEditingSystem(null);
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
                                    onClick={handleEditSystem}
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
                )
            }
            {/* Offline Systems List Modal */}
            {
                isOfflineListOpen && (
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
                    }}
                        onClick={() => setIsOfflineListOpen(false)}
                    >
                        <div style={{
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
                                <h2 style={{ fontSize: "1.25rem", fontWeight: "600", margin: 0, color: "var(--text-main)" }}>Sitios Offline</h2>
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
                                        No hay sitios offline en este momento.
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
                )
            }
            {/* Inactive Systems List Modal */}
            {
                isInactiveListOpen && (
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
                    }}
                        onClick={() => setIsInactiveListOpen(false)}
                    >
                        <div style={{
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
                                <h2 style={{ fontSize: "1.25rem", fontWeight: "600", margin: 0, color: "var(--text-main)" }}>Sistemas Inactivos</h2>
                                <button
                                    onClick={() => setIsInactiveListOpen(false)}
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
                                {systems.filter(s => disabledSystems[s.url_sitio]).length === 0 ? (
                                    <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
                                        No hay sistemas inactivos en este momento.
                                    </div>
                                ) : (
                                    systems
                                        .filter(s => disabledSystems[s.url_sitio])
                                        .map((system, idx) => (
                                            <div key={idx} style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                padding: "1rem",
                                                backgroundColor: "var(--bg-main)",
                                                border: "1px solid var(--border-color)",
                                                borderRadius: "8px"
                                            }}>
                                                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                                    <span style={{ fontWeight: "600", color: "var(--text-main)", fontSize: "0.875rem" }}>
                                                        {system.nombre_empresa}
                                                    </span>
                                                    <a
                                                        href={system.url_sitio}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textDecoration: "none" }}
                                                        onMouseEnter={(e) => e.currentTarget.style.textDecoration = "underline"}
                                                        onMouseLeave={(e) => e.currentTarget.style.textDecoration = "none"}
                                                    >
                                                        {system.url_sitio}
                                                    </a>
                                                </div>
                                                <div style={{
                                                    fontSize: "0.75rem",
                                                    padding: "0.25rem 0.625rem",
                                                    backgroundColor: "var(--bg-hover)",
                                                    color: "var(--text-muted)",
                                                    borderRadius: "4px",
                                                    fontWeight: "600",
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.025em"
                                                }}>
                                                    Inactivo
                                                </div>
                                            </div>
                                        ))
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* History Modal */}
            {
                historyModalOpen && selectedHistorySystem && (
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
                    }}
                        onClick={() => setHistoryModalOpen(false)}
                    >
                        <div style={{
                            backgroundColor: "var(--bg-card)",
                            borderRadius: "12px",
                            width: "800px",
                            maxWidth: "95vw",
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
                                <div>
                                    <h2 style={{ fontSize: "1.25rem", fontWeight: "600", margin: 0, color: "var(--text-main)" }}>
                                        Historial de Monitoreo
                                    </h2>
                                    <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                                        {selectedHistorySystem.name}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setHistoryModalOpen(false)}
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
                                {isLoadingHistory ? (
                                    <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>Cargando historial...</div>
                                ) : historyLogs.length === 0 ? (
                                    <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No hay registros de caídas para este sitio.</div>
                                ) : (
                                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                                        <thead>
                                            <tr style={{ backgroundColor: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border-color)" }}>
                                                <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Fecha Caída</th>
                                                <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Fecha Recuperación</th>
                                                <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Estado</th>
                                                <th style={{ textAlign: "left", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Duración</th>
                                                <th style={{ textAlign: "center", padding: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>Programado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {historyLogs.map((log, index) => (
                                                <tr key={index} style={{ borderBottom: "1px solid var(--bg-main)" }}>
                                                    <td style={{ padding: "0.75rem", color: "var(--text-main)" }}>{log.fecha_caida}</td>
                                                    <td style={{ padding: "0.75rem", color: "var(--text-main)" }}>{log.fecha_recuperacion}</td>
                                                    <td style={{ padding: "0.75rem" }}>
                                                        <span style={{
                                                            padding: "0.125rem 0.5rem",
                                                            borderRadius: "4px",
                                                            fontSize: "0.75rem",
                                                            fontWeight: "600",
                                                            backgroundColor: log.estado === "Resuelto" ? "rgba(74, 222, 128, 0.1)" : "rgba(248, 113, 113, 0.1)",
                                                            color: log.estado === "Resuelto" ? "#4ade80" : "#f87171"
                                                        }}>
                                                            {log.estado}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{log.duracion}</td>
                                                    <td style={{ padding: "0.75rem", textAlign: "center" }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={log.is_scheduled}
                                                            onChange={async (e) => {
                                                                const newStatus = e.target.checked;
                                                                // Optimistic update
                                                                setHistoryLogs(prev => prev.map((l, i) => i === index ? { ...l, is_scheduled: newStatus } : l));

                                                                if (selectedHistorySystem) {
                                                                    const result = await toggleLogScheduled(selectedHistorySystem.url, log.original_timestamp, newStatus);
                                                                    if (!result.success) {
                                                                        // Revert on error
                                                                        alert("Error al actualizar estado");
                                                                        setHistoryLogs(prev => prev.map((l, i) => i === index ? { ...l, is_scheduled: !newStatus } : l));
                                                                    }
                                                                }
                                                            }}
                                                            style={{
                                                                width: "16px",
                                                                height: "16px",
                                                                cursor: "pointer",
                                                                accentColor: "var(--primary)"
                                                            }}
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Upload Modal */}
            {
                isUploadModalOpen && (
                    <div style={{
                        position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
                        backgroundColor: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center",
                        justifyContent: "center", zIndex: 1100, backdropFilter: "blur(4px)"
                    }}>
                        <div className="card-panel" style={{ width: "400px", padding: "1.5rem" }}>
                            <h3 style={{ marginBottom: "1rem" }}>Subir archivo para {selectedDriveSystem?.nombre_empresa}</h3>
                            <form onSubmit={handleUpload} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                                <input type="file" name="file" required style={{ color: "var(--text-main)" }} />
                                <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                                    <button type="button" onClick={() => setIsUploadModalOpen(false)} className="btn">Cancelar</button>
                                    <button type="submit" className="btn btn-primary" disabled={uploadingFile}>
                                        {uploadingFile ? "Subiendo..." : "Subir"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* File List Modal */}
            {
                isFileListModalOpen && (
                    <div style={{
                        position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
                        backgroundColor: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center",
                        justifyContent: "center", zIndex: 1100, backdropFilter: "blur(4px)"
                    }}>
                        <div className="card-panel" style={{ width: "600px", maxHeight: "80vh", padding: "1.5rem", overflowY: "auto" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                                <h3 style={{ margin: 0 }}>Archivos de {selectedDriveSystem?.nombre_empresa}</h3>
                                <button onClick={() => setIsFileListModalOpen(false)} className="btn" style={{ minWidth: "auto", padding: "0.5rem" }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>

                            {isLoadingDrive ? (
                                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>Cargando archivos de Drive...</div>
                            ) : driveFiles.length === 0 ? (
                                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>No hay archivos asociados.</div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                    {driveFiles.map((file) => (
                                        <div key={file.id} style={{
                                            display: "flex", justifyContent: "space-between", alignItems: "center",
                                            padding: "0.75rem", backgroundColor: "var(--bg-main)", borderRadius: "var(--radius-md)",
                                            border: "1px solid var(--border-color)"
                                        }}>
                                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                                <button
                                                    onClick={() => {
                                                        const downloadUrl = `/api/drive/download/${file.id}?name=${encodeURIComponent(file.name)}`;
                                                        window.open(downloadUrl, '_blank');
                                                    }}
                                                    style={{
                                                        background: "none", border: "none", padding: 0, cursor: "pointer",
                                                        textAlign: "left", color: "var(--primary)", fontWeight: "600",
                                                        fontSize: "0.875rem", textDecoration: "underline"
                                                    }}
                                                >
                                                    {file.name}
                                                </button>
                                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                                    {new Date(file.createdTime).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {reportsSystem && (
                <ClientReportsModal
                    system={reportsSystem}
                    onClose={() => setReportsSystem(null)}
                />
            )}
        </div >
    );
}
