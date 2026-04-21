"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/app/actions/auth";

export default function HerramientasPage() {
    const router = useRouter();
    const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState<string | null>(null);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [showSystemsModal, setShowSystemsModal] = useState(false);

    // Systems List State
    const [systemsList, setSystemsList] = useState<{ nombre: string, url: string }[]>([]);
    const [newSystem, setNewSystem] = useState({ nombre: "", url: "" });

    // Form State for Duplicate
    const [duplicateParams, setDuplicateParams] = useState({
        motherUrl: "",
        motherAdmin: "",
        motherPass: "",
        motherTarget: "",
        childUrl: "",
        childAdmin: "",
        childPass: "",
        childTarget: ""
    });



    useEffect(() => {
        getCurrentUser().then(user => {
            if (user?.email === 'administracion') {
                router.push('/sistemas');
            }
        });
    }, [router]);

    // Fetch Systems List on Open
    useEffect(() => {
        if (showSystemsModal) {
            fetch('/api/tools/systems-list')
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setSystemsList(data);
                    }
                })
                .catch(err => console.error("Error fetching systems list:", err));
        }
    }, [showSystemsModal]);

    const saveSystemsList = async (newList: any[]) => {
        try {
            await fetch('/api/tools/systems-list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newList)
            });
            setSystemsList(newList);
        } catch (error) {
            alert("Error al guardar la lista");
        }
    };

    const handleAddSystem = () => {
        if (!newSystem.nombre || !newSystem.url) return;
        const updatedList = [...systemsList, newSystem];
        saveSystemsList(updatedList);
        setNewSystem({ nombre: "", url: "" });
    };

    const handleRemoveSystem = (index: number) => {
        const updatedList = systemsList.filter((_, i) => i !== index);
        saveSystemsList(updatedList);
    };

    // Poll for job status until complete
    const pollJobStatus = async (jobId: string) => {
        let fromLine = 0;
        let isComplete = false;

        while (!isComplete) {
            try {
                const response = await fetch(`/api/tools/job-status?jobId=${jobId}&fromLine=${fromLine}`);
                const data = await response.json();

                if (data.status === 'not_found') {
                    setConsoleOutput(prev => [...prev, '[ERROR] Job not found']);
                    break;
                }

                if (data.output && data.output.length > 0) {
                    setConsoleOutput(prev => [...prev, ...data.output].slice(-1000));
                    fromLine = data.totalLines;
                }

                if (data.status === 'completed' || data.status === 'error') {
                    isComplete = true;
                } else {
                    // Poll every 500ms
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                setConsoleOutput(prev => [...prev, `[ERROR] Polling failed: ${error}`]);
                break;
            }
        }
    };

    const handleDuplicatePermissions = async () => {
        setShowDuplicateModal(false);
        setIsRunning("Duplicacion de permisos");
        setConsoleOutput(["> Iniciando sincronización de permisos..."]);

        try {
            const config = {
                madre: {
                    url: duplicateParams.motherUrl,
                    admin: duplicateParams.motherAdmin,
                    pass: duplicateParams.motherPass,
                    target: duplicateParams.motherTarget
                },
                hija: {
                    url: duplicateParams.childUrl,
                    admin: duplicateParams.childAdmin,
                    pass: duplicateParams.childPass,
                    target: duplicateParams.childTarget
                }
            };

            const response = await fetch('/api/tools/duplicate-permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            const { jobId } = await response.json();
            await pollJobStatus(jobId);

        } catch (error) {
            setConsoleOutput(prev => [...prev, `Error: ${error}`]);
        } finally {
            setIsRunning(null);
        }
    };



    const handleAction = async (action: string) => {
        if (action === "Duplicacion de permisos") {
            setShowDuplicateModal(true);
            return;
        }



        if (action === "Actualizacion Bandejas") {
            setIsRunning("Actualizacion Bandejas");
            setConsoleOutput(["> Iniciando actualización masiva de bandejas..."]);

            try {
                const response = await fetch('/api/tools/update-trays', {
                    method: 'POST'
                });
                const { jobId } = await response.json();
                await pollJobStatus(jobId);
            } catch (error) {
                setConsoleOutput(prev => [...prev, `Error: ${error}`]);
            } finally {
                setIsRunning(null);
            }
            return;
        }

        setIsRunning(action);
        setConsoleOutput(prev => [...prev, `> Iniciando proceso: ${action}...`]);
        setTimeout(() => setIsRunning(null), 1000);
    };

    return (
        <div className="container" style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            paddingTop: "2rem",
            paddingBottom: "1rem",
            overflow: "hidden"
        }}>
            <div className="card-panel" style={{
                flex: 1,
                padding: "2rem",
                display: "flex",
                gap: "2rem",
                overflow: "hidden"
            }}>
                {/* Left Side: Buttons */}
                <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.5rem",
                    width: "350px",
                    flexShrink: 0,
                    overflowY: "auto"
                }}>
                    <ToolCard
                        title="Duplicación de permisos"
                        description="Permite duplicar permisos de un usuario a otro de difetentes sistema"
                        onClick={() => handleAction("Duplicacion de permisos")}
                        disabled={!!isRunning}
                    />

                    <ToolCard
                        title="Actualización Bandejas"
                        description="Actualiza las bandejas dtc y de conciliación"
                        onClick={() => handleAction("Actualizacion Bandejas")}
                        disabled={!!isRunning}
                        headerAction={
                            <button
                                className="btn btn-primary"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowSystemsModal(true);
                                }}
                                style={{
                                    padding: "0.2rem 0.6rem",
                                    fontSize: "0.75rem",
                                    fontWeight: "500",
                                    borderRadius: "6px",
                                    marginLeft: "auto"
                                }}
                            >
                                Listas
                            </button>
                        }
                    />
                </div>

                {/* Right Side: Console */}
                <div style={{
                    flex: 1,
                    backgroundColor: "#0c0c0c", // Windows Terminal Background
                    borderRadius: "6px",
                    padding: "0", // Padding handled inside for scroll
                    fontFamily: "'Cascadia Code', 'Consolas', 'Lucida Console', monospace", // Windows Fonts
                    color: "#cccccc", // Windows Light Gray Text
                    overflow: "hidden", // Hide outer scroll
                    display: "flex",
                    flexDirection: "column",
                    border: "1px solid #333", // Subtle dark border
                    boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
                }}>
                    {/* Fake Window Bar */}
                    <div style={{
                        backgroundColor: "#1f1f1f",
                        padding: "0.5rem 1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderBottom: "1px solid #333"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect width="16" height="16" fill="transparent" />
                                <path d="M2 3L6 8L2 13" stroke="#cccccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "#ffffff" }}>Windows PowerShell</span>
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                                onClick={() => setConsoleOutput([])}
                                style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "#cccccc",
                                    cursor: "pointer",
                                    fontSize: "0.75rem"
                                }}
                                title="Limpiar Terminal"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                            </button>
                        </div>
                    </div>

                    <div style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: "1rem",
                        fontSize: "0.9rem",
                        lineHeight: "1.2"
                    }}>
                        <div style={{ marginBottom: "1rem", color: "#a5a5a5" }}>
                            Windows PowerShell<br />
                            Copyright (C) Microsoft Corporation. All rights reserved.
                        </div>
                        {consoleOutput.length === 0 ? (
                            <span style={{ color: "#475569", fontStyle: "italic" }}>Esperando ejecución de comandos...</span>
                        ) : (
                            consoleOutput.map((line, i) => (
                                <div key={i} style={{ marginBottom: "0.25rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{line}</div>
                            ))
                        )}
                        {isRunning && (
                            <div style={{ marginTop: "0.5rem" }}>_</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal de Duplicación */}
            {showDuplicateModal && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: "rgba(0,0,0,0.5)", zIndex: 100,
                    display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                    <div className="card-panel" style={{ width: "600px", padding: "2rem", maxHeight: "90vh", overflowY: "auto" }}>
                        <h2 style={{ marginBottom: "1.5rem" }}>Configuración de Duplicación</h2>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                            {/* Madre */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                                <h4 style={{ color: "var(--text-secondary)", borderBottom: "1px solid #eee", paddingBottom: "0.5rem" }}>Origen (Madre)</h4>
                                <InputGroup label="URL" value={duplicateParams.motherUrl} onChange={(v) => setDuplicateParams(p => ({ ...p, motherUrl: v }))} />
                                <InputGroup label="Admin" value={duplicateParams.motherAdmin} onChange={(v) => setDuplicateParams(p => ({ ...p, motherAdmin: v }))} />
                                <InputGroup label="Password" type="password" value={duplicateParams.motherPass} onChange={(v) => setDuplicateParams(p => ({ ...p, motherPass: v }))} />
                                <InputGroup label="Usuario a Copiar" value={duplicateParams.motherTarget} onChange={(v) => setDuplicateParams(p => ({ ...p, motherTarget: v }))} />
                            </div>
                            {/* Hija */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                                <h4 style={{ color: "var(--text-secondary)", borderBottom: "1px solid #eee", paddingBottom: "0.5rem" }}>Destino (Hija)</h4>
                                <InputGroup label="URL" value={duplicateParams.childUrl} onChange={(v) => setDuplicateParams(p => ({ ...p, childUrl: v }))} />
                                <InputGroup label="Admin" value={duplicateParams.childAdmin} onChange={(v) => setDuplicateParams(p => ({ ...p, childAdmin: v }))} />
                                <InputGroup label="Password" type="password" value={duplicateParams.childPass} onChange={(v) => setDuplicateParams(p => ({ ...p, childPass: v }))} />
                                <InputGroup label="Usuario Destino" value={duplicateParams.childTarget} onChange={(v) => setDuplicateParams(p => ({ ...p, childTarget: v }))} />
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "2rem" }}>
                            <button className="btn btn-ghost" onClick={() => setShowDuplicateModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleDuplicatePermissions}>Iniciar Proceso</button>
                        </div>
                    </div>
                </div>
            )}



            {/* Modal de Listas de Sistemas */}
            {showSystemsModal && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: "rgba(0,0,0,0.5)", zIndex: 100,
                    display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                    <div className="card-panel" style={{ width: "650px", padding: "1.5rem", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Lista de Sistemas para Bandejas</h2>
                            <button className="btn btn-ghost" onClick={() => setShowSystemsModal(false)} style={{ padding: "0.25rem 0.5rem" }}>✕</button>
                        </div>

                        {/* Add New */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.5rem", marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border-color)" }}>
                            <input
                                placeholder="Nombre"
                                value={newSystem.nombre}
                                onChange={e => setNewSystem({ ...newSystem, nombre: e.target.value })}
                                style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}
                            />
                            <input
                                placeholder="URL (ej: https://...)"
                                value={newSystem.url}
                                onChange={e => setNewSystem({ ...newSystem, url: e.target.value })}
                                style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}
                            />
                            <button className="btn btn-primary" onClick={handleAddSystem}>Agregar</button>
                        </div>

                        {/* List */}
                        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {systemsList.length === 0 ? (
                                <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "1rem" }}>No hay sistemas en la lista</p>
                            ) : (
                                systemsList.map((sys, idx) => (
                                    <div key={idx} style={{
                                        display: "flex", alignItems: "center", gap: "1rem",
                                        padding: "0.75rem", backgroundColor: "var(--bg-main)", borderRadius: "var(--radius-sm)",
                                        border: "1px solid var(--border-color)"
                                    }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{sys.nombre}</div>
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{sys.url}</div>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveSystem(idx)}
                                            style={{
                                                background: "none", border: "none", color: "#ef4444", cursor: "pointer",
                                                padding: "0.25rem", borderRadius: "4px"
                                            }}
                                            title="Eliminar"
                                        >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
                            <button className="btn btn-primary" onClick={() => setShowSystemsModal(false)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function InputGroup({ label, value, onChange, type = "text" }: { label: string, value: string, onChange: (v: string) => void, type?: string }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>{label}</label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={{
                    padding: "0.5rem",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                    width: "100%"
                }}
            />
        </div>
    );
}

function ToolCard({ title, description, onClick, disabled, headerAction }: { title: string, description: string, onClick: () => void, disabled: boolean, headerAction?: React.ReactNode }) {
    return (
        <div style={{
            padding: "1.5rem",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--bg-main)",
            transition: "all 0.2s var(--ease-smooth)",
            opacity: disabled ? 0.7 : 1
        }}
            onMouseEnter={(e) => {
                if (!disabled) {
                    e.currentTarget.style.boxShadow = "var(--shadow-md)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                }
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "translateY(0)";
            }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                <h3 style={{
                    fontSize: "1.125rem",
                    margin: 0,
                    color: "var(--text-main)"
                }}>
                    {title}
                </h3>
                {headerAction}
            </div>
            <p style={{
                color: "var(--text-muted)",
                fontSize: "0.875rem",
                marginBottom: "1rem"
            }}>
                {description}
            </p>
            <button
                className="btn btn-primary"
                style={{ width: "100%" }}
                onClick={onClick}
                disabled={disabled}
            >
                Ejecutar
            </button>
        </div>
    );
}
