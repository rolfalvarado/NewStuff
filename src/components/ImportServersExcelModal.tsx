"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import * as XLSX from "xlsx";
import { bulkImportServers, ImportServerRow } from "@/app/actions/bulk-import-servers";

interface ImportServersExcelModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function ImportServersExcelModal({ isOpen, onClose, onSuccess }: ImportServersExcelModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    if (!isOpen) return null;

    const handleDownloadTemplate = () => {
        const headers = [
            "nombre_servidor",
            "ip_servidor",
            "user_servidor",
            "tipo_instancia",
            "version_sistema",
            "pass_servidor"
        ];

        // Create a worksheet
        const ws = XLSX.utils.json_to_sheet([
            {
                nombre_servidor: "Servidor Principal",
                ip_servidor: "192.168.1.100",
                user_servidor: "admin",
                tipo_instancia: "t3.medium",
                version_sistema: "v1.0.0",
                pass_servidor: ""
            }
        ], { header: headers });

        // Create a workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Servidores");

        // Save file
        XLSX.writeFile(wb, "plantilla_servidores.xlsx");
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        setMessage(null);

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: "binary" });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json<ImportServerRow>(ws);

                if (data.length === 0) {
                    setMessage({ type: "error", text: "El archivo parece estar vacío." });
                    setIsLoading(false);
                    return;
                }

                // Sanitize data
                const plainData = JSON.parse(JSON.stringify(data));

                // Call server action
                const result = await bulkImportServers(plainData);

                if (result.success) {
                    setMessage({
                        type: "success",
                        text: `Importación exitosa: ${result.created} creados, ${result.updated} actualizados.`
                    });
                    setTimeout(() => {
                        onSuccess();
                        onClose();
                        setMessage(null); // Reset for next time
                    }, 2000);
                } else {
                    setMessage({ type: "error", text: result.error || "Error al importar." });
                }

            } catch (error) {
                console.error("Error parsing excel:", error);
                setMessage({ type: "error", text: "Error al procesar el archivo Excel." });
            } finally {
                setIsLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
            }
        };
        reader.readAsBinaryString(file);
    };

    return (
        <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(4px)"
        }} onClick={onClose}>
            <div style={{
                backgroundColor: "var(--bg-card)",
                borderRadius: "12px",
                width: "500px",
                maxWidth: "90%",
                padding: "2rem",
                boxShadow: "var(--shadow-md)",
                position: "relative",
                border: "1px solid var(--border-color)"
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
                    <h2 style={{ fontSize: "1.25rem", fontWeight: "600", color: "var(--text-main)", margin: 0 }}>
                        Importar Servidores vía Excel
                    </h2>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "0.25rem", opacity: 0.6 }}>
                        <Image src="/Icons/xmark.svg" alt="Cerrar" width={24} height={24} style={{ filter: "var(--icon-filter)" }} />
                    </button>
                </div>

                {/* Actions */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                    {/* Download Template */}
                    <button
                        onClick={handleDownloadTemplate}
                        disabled={isLoading}
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "1rem",
                            padding: "2rem 1rem",
                            border: "1px solid var(--border-color)",
                            borderRadius: "var(--radius-md)",
                            backgroundColor: "var(--bg-main)",
                            cursor: isLoading ? "not-allowed" : "pointer",
                            transition: "all 200ms var(--ease-smooth)",
                            color: "var(--text-main)"
                        }}
                        onMouseEnter={e => !isLoading && (e.currentTarget.style.borderColor = "#3b82f6")}
                        onMouseLeave={e => !isLoading && (e.currentTarget.style.borderColor = "var(--border-color)")}
                    >
                        <Image src="/Icons/download-square-solid.svg" alt="Descargar" width={48} height={48} style={{ filter: "var(--icon-filter)", opacity: 0.8 }} />
                        <span style={{ fontWeight: "500", fontSize: "0.875rem" }}>Descargar Plantilla</span>
                    </button>

                    {/* Upload File */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading}
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "1rem",
                            padding: "2rem 1rem",
                            border: "1px solid var(--border-color)",
                            borderRadius: "var(--radius-md)",
                            backgroundColor: "var(--bg-main)",
                            cursor: isLoading ? "not-allowed" : "pointer",
                            transition: "all 200ms var(--ease-smooth)",
                            color: "var(--text-main)"
                        }}
                        onMouseEnter={e => !isLoading && (e.currentTarget.style.borderColor = "#059669")}
                        onMouseLeave={e => !isLoading && (e.currentTarget.style.borderColor = "var(--border-color)")}
                    >
                        <Image src="/Icons/upload-square-solid.svg" alt="Subir" width={48} height={48} style={{ filter: "var(--icon-filter)", opacity: 0.8 }} />
                        <span style={{ fontWeight: "500", fontSize: "0.875rem" }}>{isLoading ? "Procesando..." : "Subir Excel"}</span>
                    </button>
                </div>

                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    accept=".xlsx, .xls"
                    onChange={handleFileUpload}
                />

                {/* Message */}
                {message && (
                    <div style={{
                        marginTop: "1.5rem",
                        padding: "0.75rem",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: message.type === "success" ? "rgba(22, 101, 52, 0.1)" : "rgba(185, 28, 28, 0.1)",
                        color: message.type === "success" ? "#4ade80" : "#f87171",
                        fontSize: "0.875rem",
                        textAlign: "center",
                        border: `1px solid ${message.type === "success" ? "rgba(74, 222, 128, 0.2)" : "rgba(248, 113, 113, 0.2)"}`
                    }}>
                        {message.text}
                    </div>
                )}
            </div>
        </div>
    );
}
