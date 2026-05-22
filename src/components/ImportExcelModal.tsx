"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import * as XLSX from "xlsx";
import { bulkImportSystems, ImportSystemRow } from "@/app/actions/bulk-import-systems";
import { exportSystemsToExcel } from "@/app/actions/export-systems";

interface ImportExcelModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    systems: any[];
}

export default function ImportExcelModal({ isOpen, onClose, onSuccess, systems }: ImportExcelModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    if (!isOpen) return null;

    const handleDownloadTemplate = async () => {
        setIsDownloading(true);
        setMessage(null);
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
                link.download = "plantilla_sistemas.xlsx";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } else {
                setMessage({ type: "error", text: "Error al generar la plantilla." });
            }
        } catch (error) {
            console.error("Error downloading template:", error);
            setMessage({ type: "error", text: "Error al descargar la plantilla." });
        } finally {
            setIsDownloading(false);
        }
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
                const data = XLSX.utils.sheet_to_json<ImportSystemRow>(ws);

                if (data.length === 0) {
                    setMessage({ type: "error", text: "El archivo parece estar vacío." });
                    setIsLoading(false);
                    return;
                }

                // Sanitize data to ensure plain objects (removes prototypes/hidden props from xlsx)
                const plainData = JSON.parse(JSON.stringify(data));

                // Call server action
                const result = await bulkImportSystems(plainData);

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

    const isBusy = isLoading || isDownloading;

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
                        Importar Sistemas vía Excel
                    </h2>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: "0.25rem", opacity: 0.6 }}>
                        <Image src="/Icons/xmark.svg" alt="Cerrar" width={24} height={24} style={{ opacity: 0.6 }} />
                    </button>
                </div>

                {/* Info text */}
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.5rem", lineHeight: 1.5 }}>
                    La plantilla utiliza el mismo formato del Reporte de Sistemas. Si un sistema ya existe (misma URL), se actualizan sus datos. Los nuevos sistemas se crean automáticamente.
                </p>

                {/* Actions */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                    {/* Download Template */}
                    <button
                        onClick={handleDownloadTemplate}
                        disabled={isBusy}
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
                            cursor: isBusy ? "not-allowed" : "pointer",
                            transition: "all 200ms var(--ease-smooth)",
                            color: "var(--text-main)"
                        }}
                        onMouseEnter={e => !isBusy && (e.currentTarget.style.borderColor = "#3b82f6")}
                        onMouseLeave={e => !isBusy && (e.currentTarget.style.borderColor = "var(--border-color)")}
                    >
                        <Image src="/Icons/download-square-solid.svg" alt="Descargar" width={48} height={48} style={{ opacity: 0.8 }} />
                        <span style={{ fontWeight: "500", fontSize: "0.875rem" }}>{isDownloading ? "Generando..." : "Descargar Plantilla"}</span>
                    </button>

                    {/* Upload File */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isBusy}
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
                            cursor: isBusy ? "not-allowed" : "pointer",
                            transition: "all 200ms var(--ease-smooth)",
                            color: "var(--text-main)"
                        }}
                        onMouseEnter={e => !isBusy && (e.currentTarget.style.borderColor = "#059669")}
                        onMouseLeave={e => !isBusy && (e.currentTarget.style.borderColor = "var(--border-color)")}
                    >
                        <Image src="/Icons/upload-square-solid.svg" alt="Subir" width={48} height={48} style={{ opacity: 0.8 }} />
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
