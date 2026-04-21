"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { getAllSystems, System } from "@/app/actions/get-systems";
import { updateLogosBatch } from "@/app/actions/update-logos";
import { updateUserCountsBatch } from "@/app/actions/update-user-counts";
import { updateFTPBackupsAction, getGlobalBackupDateAction } from "@/app/actions/update-ftp-backups";
import { getTopics } from "@/app/actions/chat";
import TetrisGame from "@/components/TetrisGame";


const MENU_ITEMS = [
    { name: "Sistemas", href: "/sistemas", icon: "/Icons/view-grid.svg" },
    { name: "Usuarios", href: "/usuarios", icon: "/Icons/group.svg" },
    { name: "Servidores", href: "/claves", icon: "/Icons/key.svg" },
    { name: "Datos", href: "/datos", icon: "/Icons/sort.svg" },
    { name: "Stuff", href: "/stuff", icon: "/Icons/cell2x2.svg" },
    { name: "Bandeja DTC", href: "/bandeja-dtc", icon: "/Icons/bandeja.svg" },
    { name: "AWS", href: "/dashboard", icon: "/Icons/clipboard-check.svg" },
    { name: "Reportes", href: "/reportes", icon: "/Icons/stats-report.svg" },
    { name: "Herramientas", href: "/herramientas", icon: "/Icons/codewi.svg" },
    { name: "Reciclaje", href: "/reciclaje", icon: "/Icons/reciclaje.svg" },
];

import { getCurrentUser, logoutAction } from "@/app/actions/auth";

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [isUpdating, setIsUpdating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [user, setUser] = useState<{ email: string } | null>(null);
    const [showTetris, setShowTetris] = useState(false);
    const [showMatchModal, setShowMatchModal] = useState(false);
    const [backupMatches, setBackupMatches] = useState<{ systemName: string; fileName: string; backupDate: string }[]>([]);
    const [globalBackupDate, setGlobalBackupDate] = useState<string>("-");

    useEffect(() => {
        getCurrentUser().then((u) => setUser(u));
        getGlobalBackupDateAction().then((date) => setGlobalBackupDate(date));
    }, []);

    const filteredItems = MENU_ITEMS.filter(item => {
        // Restricciones de administración
        if (user?.email === 'administracion') {
            if (['/claves', '/dashboard', '/herramientas', '/bandeja-dtc'].includes(item.href)) return false;
        }

        return true;
    });

    const handleUpdate = async () => {
        if (isUpdating) return;
        setIsUpdating(true);
        setProgress(0);

        try {
            console.log("Iniciando actualización...");
            const systems = await getAllSystems();
            const total = systems.length;
            if (total === 0) {
                setIsUpdating(false);
                return;
            }

            const BATCH_SIZE = 10;
            let processedLogos = 0;

            // --- PHASE 1: LOGOS (0% to 50%) ---
            for (let i = 0; i < total; i += BATCH_SIZE) {
                const batch = systems.slice(i, i + BATCH_SIZE);
                const batchForInfo = batch.map((s: System) => ({ url_sitio: s.url_sitio }));

                await updateLogosBatch(batchForInfo);

                processedLogos += batch.length;
                // Map 0-100% of logos to 0-50% of total
                const percentage = Math.round((processedLogos / total) * 50);
                setProgress(percentage);
                console.log(`Progreso Logos: ${percentage}%`);
            }

            // --- PHASE 2: USERS (50% to 100%) ---
            let processedUsers = 0;
            for (let i = 0; i < total; i += BATCH_SIZE) {
                const batch = systems.slice(i, i + BATCH_SIZE);
                const batchForInfo = batch.map((s: System) => ({ url_sitio: s.url_sitio }));

                await updateUserCountsBatch(batchForInfo);

                processedUsers += batch.length;
                // Map 0-100% of users to 50-100% of total
                const percentage = 50 + Math.round((processedUsers / total) * 50);
                setProgress(Math.min(90, percentage)); // Cap at 90 before FTP phase
                console.log(`Progreso Usuarios: ${percentage}%`);
            }

            // --- PHASE 3: FTP BACKUPS (90% to 100%) ---
            console.log("Actualizando backups de FTP...");
            const ftpResult = await updateFTPBackupsAction();
            if (ftpResult.success && ftpResult.matches) {
                setBackupMatches(ftpResult.matches);
                if ((ftpResult as any).globalBackupDate) {
                    setGlobalBackupDate((ftpResult as any).globalBackupDate);
                }
            }
            setProgress(100);

            // Short delay to show 100% before resetting
            setTimeout(() => {
                setIsUpdating(false);
                setProgress(0);
                if (ftpResult.success && ftpResult.matches && ftpResult.matches.length > 0) {
                    setShowMatchModal(true);
                } else {
                    router.refresh();
                    window.location.reload();
                }
            }, 500);

        } catch (error) {
            console.error("Error en actualización:", error);
            setIsUpdating(false);
        }
    };

    return (
        <>
            <aside style={{
                width: "170px",
                backgroundColor: "#0F172A", // Negro azulado
                display: "flex",
                flexDirection: "column",
                height: "100vh",
                position: "fixed",
                left: 0,
                top: 0,
                color: "#FFFFFF",
                borderRight: "1px solid var(--border-color)",
                zIndex: 50
            }}>
                <div style={{ padding: "0.75rem 0.5rem", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div
                        style={{ position: "relative", width: "100%", height: "40px", cursor: "pointer" }}
                        onClick={() => setShowTetris(true)}
                        title="???"
                    >
                        <Image
                            src="/logo.png"
                            alt="MonitorApp Logo"
                            fill
                            style={{ objectFit: "contain" }}
                            priority
                        />
                    </div>
                </div>

                <nav style={{ flex: 1, padding: "1.5rem 0", display: "flex", flexDirection: "column" }}>
                    {/* ... menu items ... */}
                    {filteredItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.75rem",
                                    padding: "0.75rem 0.75rem",
                                    borderTop: "1px solid rgba(240, 242, 245, 0.1)",
                                    borderBottom: "1px solid rgba(240, 242, 245, 0.1)",
                                    backgroundColor: isActive ? "#1E293B" : "transparent",
                                    color: "#FFFFFF",
                                    fontWeight: "400",
                                    fontSize: "13px",
                                    transition: "all 0.2s var(--ease-smooth)",
                                    textDecoration: "none"
                                }}
                                onMouseEnter={(e) => {
                                    if (!isActive) e.currentTarget.style.backgroundColor = "#1E293B";
                                }}
                                onMouseLeave={(e) => {
                                    if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
                                }}
                            >
                                <Image
                                    src={item.icon}
                                    alt={item.name}
                                    width={20}
                                    height={20}
                                    style={{ filter: "brightness(0) invert(1)" }}
                                />
                                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <span>{item.name}</span>
                                </div>
                            </Link>
                        );
                    })}

                    {/* Actualizar Button with Progress */}
                    <button
                        onClick={handleUpdate}
                        disabled={isUpdating}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "1rem 1rem",
                            borderTop: "none",
                            borderBottom: "1px solid rgba(240, 242, 245, 0.1)",
                            // Dynamic background for progress
                            // Gray background (#6b7280) filling from left to right on top of transparent/black
                            background: isUpdating
                                ? `linear-gradient(to right, #1E293B ${progress}%, #6b7280 ${progress}%)`
                                : "transparent",
                            color: "#FFFFFF",
                            fontWeight: "400",
                            fontSize: "13px",
                            transition: "all 0.2s var(--ease-smooth)",
                            textDecoration: "none",
                            width: "100%",
                            textAlign: "left",
                            cursor: isUpdating ? "wait" : "pointer",
                            borderLeft: "none",
                            borderRight: "none",
                            fontFamily: "inherit",
                            position: "relative"
                        }}
                        onMouseEnter={(e) => {
                            if (!isUpdating) e.currentTarget.style.backgroundColor = "#1E293B";
                        }}
                        onMouseLeave={(e) => {
                            if (!isUpdating) e.currentTarget.style.backgroundColor = "transparent";
                        }}
                    >
                        {/* Progress Background */}
                        {isUpdating && (
                            <div style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: `${progress}%`,
                                backgroundColor: "rgba(30, 136, 229, 0.2)",
                                transition: "width 0.3s ease-out",
                                zIndex: 0
                            }} />
                        )}

                        <Image
                            src="/Icons/refresh.svg"
                            alt="Actualizar"
                            width={20}
                            height={20}
                            style={{
                                filter: "brightness(0) invert(1)",
                                transform: isUpdating ? "rotate(360deg)" : "none",
                                transition: isUpdating ? "transform 1s linear infinite" : "none"
                            }}
                        />
                        <span style={{ zIndex: 1 }}>
                            {isUpdating ? `Actualizando ${progress}%` : "Actualizar"}
                        </span>
                    </button>
                </nav>


                {/* Logout Button */}
                <div style={{ paddingBottom: "2rem" }}>
                    <button
                        type="button"
                        onClick={async (e) => {
                            e.preventDefault();
                            console.log("Iniciando logout...");
                            try {
                                await logoutAction();
                                console.log("Sesión destruida, redirigiendo...");
                                window.location.href = "/login";
                            } catch (error) {
                                console.error("Error en logout:", error);
                                window.location.href = "/login";
                            }
                        }}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "1rem 1rem",
                            borderTop: "1px solid rgba(240, 242, 245, 0.1)",
                            borderBottom: "1px solid rgba(240, 242, 245, 0.1)",
                            color: "#FFFFFF",
                            fontWeight: "400",
                            fontSize: "13px",
                            transition: "all 0.2s",
                            textDecoration: "none",
                            cursor: "pointer",
                            background: "transparent",
                            borderLeft: "none",
                            borderRight: "none",
                            width: "100%",
                            textAlign: "left"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                    >
                        <Image
                            src="/Icons/transition-left.svg"
                            alt="Cerrar Sesión"
                            width={20}
                            height={20}
                            style={{ filter: "brightness(0) invert(1)" }}
                        />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </aside>

            {showTetris && <TetrisGame onClose={() => setShowTetris(false)} />}

            {/* Matching Results Modal */}
            {showMatchModal && (
                <div style={{
                    position: "fixed",
                    inset: 0,
                    backgroundColor: "rgba(0,0,0,0.7)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1000,
                    backdropFilter: "blur(4px)"
                }}>
                    <div style={{
                        backgroundColor: "#1E293B",
                        padding: "2rem",
                        borderRadius: "1rem",
                        width: "90%",
                        maxWidth: "800px",
                        maxHeight: "80vh",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        border: "1px solid rgba(255,255,255,0.1)",
                        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)"
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                            <h2 style={{ fontSize: "1.5rem", fontWeight: "600", color: "#F8FAFC" }}>Log de Matching de Backups</h2>
                            <button
                                onClick={() => {
                                    setShowMatchModal(false);
                                    window.location.reload();
                                }}
                                style={{
                                    background: "rgba(255,255,255,0.1)",
                                    border: "none",
                                    color: "white",
                                    padding: "0.5rem 1rem",
                                    borderRadius: "0.5rem",
                                    cursor: "pointer"
                                }}
                            >
                                Cerrar y Recargar
                            </button>
                        </div>

                        <div style={{ overflow: "auto", flex: 1, border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.5rem" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                                <thead style={{ backgroundColor: "#0F172A", position: "sticky", top: 0 }}>
                                    <tr>
                                        <th style={{ textAlign: "left", padding: "1rem", color: "#94A3B8" }}>Sistema</th>
                                        <th style={{ textAlign: "left", padding: "1rem", color: "#94A3B8" }}>Archivo FTP</th>
                                        <th style={{ textAlign: "left", padding: "1rem", color: "#94A3B8" }}>Fecha</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {backupMatches.map((match, idx) => (
                                        <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                            <td style={{ padding: "1rem", color: "#F1F5F9" }}>{match.systemName}</td>
                                            <td style={{ padding: "1rem", color: "#E2E8F0", fontFamily: "monospace", fontSize: "0.75rem" }}>{match.fileName}</td>
                                            <td style={{ padding: "1rem", color: "#22C55E", fontWeight: "600" }}>{match.backupDate}</td>
                                        </tr>
                                    ))}
                                    {backupMatches.length === 0 && (
                                        <tr>
                                            <td colSpan={3} style={{ padding: "2rem", textAlign: "center", color: "#94A3B8" }}>
                                                No se encontraron coincidencias hoy.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
