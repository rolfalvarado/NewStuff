"use client";

import { useState, useEffect } from "react";
import { exportSystemsToExcel } from "@/app/actions/export-systems";
import { exportServersToExcel } from "@/app/actions/export-servers";
import { exportHoldingsToExcel } from "@/app/actions/export-holdings";
import { exportMonitoringToExcel } from "@/app/actions/export-monitoring";
import { exportUsersToExcel } from "@/app/actions/export-users";
import { exportBackupReportToExcel } from "@/app/actions/export-backup-report";
import { getAllSystems } from "@/app/actions/get-systems";
import { getGlobalBackupDateAction } from "@/app/actions/update-ftp-backups";
import GrowthReportModal from "@/components/GrowthReportModal";

export default function ReportesPage() {
    const [showGrowthModal, setShowGrowthModal] = useState(false);
    const [globalBackupDate, setGlobalBackupDate] = useState<string>("-");

    useEffect(() => {
        getGlobalBackupDateAction().then((date) => setGlobalBackupDate(date));
    }, []);

    const [loadingStates, setLoadingStates] = useState({
        systems: false,
        servers: false,
        monitoring: false,
        users: false,
        holdings: false,
        backup: false,
        demo: false
    });

    const handleDownloadSystems = async () => {
        setLoadingStates(prev => ({ ...prev, systems: true }));
        try {
            const result = await exportSystemsToExcel();

            if (result.success && result.data) {
                // Convertir base64 a blob
                const byteCharacters = atob(result.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], {
                    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                });

                // Crear enlace de descarga
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = result.filename || 'sistemas.xlsx';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } else {
                alert("Error al generar el reporte: " + (result.error || "Error desconocido"));
            }
        } catch (error) {
            console.error("Error downloading systems report:", error);
            alert("Error al descargar el reporte");
        } finally {
            setLoadingStates(prev => ({ ...prev, systems: false }));
        }
    };

    const handleDownloadServers = async () => {
        setLoadingStates(prev => ({ ...prev, servers: true }));
        try {
            const result = await exportServersToExcel();

            if (result.success && result.data) {
                // Convertir base64 a blob
                const byteCharacters = atob(result.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], {
                    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                });

                // Crear enlace de descarga
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = result.filename || 'servidores.xlsx';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } else {
                alert("Error al generar el reporte: " + (result.error || "Error desconocido"));
            }
        } catch (error) {
            console.error("Error downloading servers report:", error);
            alert("Error al descargar el reporte");
        } finally {
            setLoadingStates(prev => ({ ...prev, servers: false }));
        }
    };

    const handleDownloadMonitoring = async () => {
        setLoadingStates(prev => ({ ...prev, monitoring: true }));
        try {
            const result = await exportMonitoringToExcel();

            if (result.success && result.data) {
                const byteCharacters = atob(result.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], {
                    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                });

                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = result.filename || 'historial_monitoreo.xlsx';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } else {
                alert("Error al generar el reporte: " + (result.error || "Error desconocido"));
            }
        } catch (error) {
            console.error("Error downloading monitoring report:", error);
            alert("Error al descargar el reporte");
        } finally {
            setLoadingStates(prev => ({ ...prev, monitoring: false }));
        }
    };

    const handleDownloadUsers = async () => {
        setLoadingStates(prev => ({ ...prev, users: true }));
        try {
            const result = await exportUsersToExcel();

            if (result.success && result.data) {
                const byteCharacters = atob(result.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], {
                    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                });

                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = result.filename || 'usuarios.xlsx';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } else {
                alert("Error al generar el reporte: " + (result.error || "Error desconocido"));
            }
        } catch (error) {
            console.error("Error downloading users report:", error);
            alert("Error al descargar el reporte");
        } finally {
            setLoadingStates(prev => ({ ...prev, users: false }));
        }
    };

    const handleDownloadHoldings = async () => {
        setLoadingStates(prev => ({ ...prev, holdings: true }));
        try {
            const result = await exportHoldingsToExcel();

            if (result.success && result.data) {
                const byteCharacters = atob(result.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], {
                    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                });

                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = result.filename || 'holdings.xlsx';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } else {
                alert("Error al generar el reporte: " + (result.error || "Error desconocido"));
            }
        } catch (error) {
            console.error("Error downloading holdings report:", error);
            alert("Error al descargar el reporte");
        } finally {
            setLoadingStates(prev => ({ ...prev, holdings: false }));
        }
    };

    const handleDownloadBackup = async () => {
        setLoadingStates(prev => ({ ...prev, backup: true }));
        try {
            const result = await exportBackupReportToExcel();

            if (result.success && result.data) {
                const byteCharacters = atob(result.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], {
                    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                });

                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = result.filename || 'reporte_backup.xlsx';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } else {
                alert("Error al generar el reporte: " + (result.error || "Error desconocido"));
            }
        } catch (error) {
            console.error("Error downloading backup report:", error);
            alert("Error al descargar el reporte");
        } finally {
            setLoadingStates(prev => ({ ...prev, backup: false }));
        }
    };

    const handleDemoAlarm = async () => {
        setLoadingStates(prev => ({ ...prev, demo: true }));
        try {
            const systems = await getAllSystems();
            if (systems.length > 0) {
                const randomSystem = systems[Math.floor(Math.random() * systems.length)];
                window.dispatchEvent(new CustomEvent('demo-alarm', { detail: randomSystem }));
            } else {
                // Fallback if no systems exist in DB
                window.dispatchEvent(new CustomEvent('demo-alarm', {
                    detail: {
                        nombre_empresa: "Empresa de Prueba",
                        url_sitio: "https://demo-error.com",
                        nombre_servidor: "Servidor de Prueba"
                    }
                }));
            }
        } catch (error) {
            console.error("Error triggering demo alarm:", error);
            alert("Error al activar demo de alarma");
        } finally {
            setLoadingStates(prev => ({ ...prev, demo: false }));
        }
    };

    const reports = [
        {
            name: "Reporte de Sistemas",
            description: "Descarga un reporte completo de todos los sistemas registrados",
            action: handleDownloadSystems,
            loading: loadingStates.systems,
            btnText: "Exportar a Excel"
        },
        {
            name: "Reporte de Servidores",
            description: "Descarga un reporte completo de servidores con el formato compatible para importación",
            action: handleDownloadServers,
            loading: loadingStates.servers,
            btnText: "Exportar a Excel"
        },
        {
            name: "Reporte de Monitoreo",
            description: "Descarga el historial de estados de monitoreo, tanto caidas como el restablecimiento.",
            action: handleDownloadMonitoring,
            loading: loadingStates.monitoring,
            btnText: "Exportar a Excel"
        },
        {
            name: "Reporte de Usuarios",
            description: "Descarga un reporte completo de todos los usuarios monitoreados de cada sistema.",
            action: handleDownloadUsers,
            loading: loadingStates.users,
            btnText: "Exportar a Excel"
        },
        {
            name: "Reporte de Holding",
            description: "Información sobre sistemas y usuarios por holding",
            action: handleDownloadHoldings,
            loading: loadingStates.holdings,
            btnText: "Exportar a Excel"
        },
        {
            name: "Reporte de Crecimiento",
            description: "Visualiza el crecimiento de sistemas y usuarios con estadisticas mensuales y anuales.",
            action: () => setShowGrowthModal(true),
            loading: false,
            btnText: "Ver Reporte"
        },
        {
            name: "Reporte Backup",
            description: "Información sobre respaldos de los sistemas: nombre, URL, servidor y fecha de último backup.",
            action: handleDownloadBackup,
            loading: loadingStates.backup,
            btnText: "Exportar a Excel"
        },
        {
            name: "Demo Alarma",
            description: "Simula una caída de sistema aleatoria para probar la ventana de alerta.",
            action: handleDemoAlarm,
            loading: loadingStates.demo,
            btnText: "Ejecutar Demo"
        }
    ];

    return (
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
                <div style={{
                    padding: "1.5rem 2rem",
                    borderBottom: "1px solid var(--border-color)",
                    backgroundColor: "rgba(255, 255, 255, 0.02)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                }}>
                    <h2 style={{ fontSize: "1.25rem", color: "var(--text-main)", margin: 0 }}>
                        Módulo de Reportes
                    </h2>
                    
                    {/* Global Backup Info Moved from Sidebar */}
                    <div style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: "rgba(255,255,255,0.05)",
                        borderRadius: "0.5rem",
                        border: "1px solid rgba(255,255,255,0.1)",
                        fontSize: "0.75rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                    }}>
                        <span style={{ fontWeight: "600", color: "rgba(255, 255, 255, 0.7)" }}>Último Backup:</span>
                        <span style={{ color: "#22C55E", fontWeight: "600" }}>{globalBackupDate}</span>
                    </div>
                </div>

                <div style={{ flex: 1, overflow: "auto", padding: "0 1rem" }}>
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0" }}>
                        <thead>
                            <tr style={{ backgroundColor: "rgba(255, 255, 255, 0.02)" }}>
                                <th style={{ textAlign: "left", padding: "1rem", color: "var(--text-secondary)", fontWeight: "600", borderBottom: "1px solid var(--border-color)", fontSize: "13px" }}>Nombre del Reporte</th>
                                <th style={{ textAlign: "left", padding: "1rem", color: "var(--text-secondary)", fontWeight: "600", borderBottom: "1px solid var(--border-color)", fontSize: "13px" }}>Descripción</th>
                                <th style={{ textAlign: "right", padding: "1rem", color: "var(--text-secondary)", fontWeight: "600", borderBottom: "1px solid var(--border-color)", fontSize: "13px" }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reports.map((report, index) => (
                                <tr key={index} style={{ transition: "background-color 0.2s" }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.02)"}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}>
                                    <td style={{ padding: "1.25rem 1rem", color: "var(--text-main)", fontWeight: "500", borderBottom: "1px solid var(--border-color)", fontSize: "13px" }}>
                                        {report.name}
                                    </td>
                                    <td style={{ padding: "1.25rem 1rem", color: "var(--text-muted)", fontSize: "13px", borderBottom: "1px solid var(--border-color)" }}>
                                        {report.description}
                                    </td>
                                    <td style={{ padding: "1.25rem 1rem", textAlign: "right", borderBottom: "1px solid var(--border-color)" }}>
                                        <button
                                            className="btn btn-primary"
                                            onClick={report.action}
                                            disabled={report.loading}
                                            style={{
                                                padding: "0.5rem 1.25rem",
                                                fontSize: "13px",
                                                minWidth: "120px"
                                            }}
                                        >
                                            {report.loading ? "Generando..." : report.btnText}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <GrowthReportModal isOpen={showGrowthModal} onClose={() => setShowGrowthModal(false)} />
        </div>
    );
}
