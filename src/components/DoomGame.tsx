"use client";

import { useEffect, useRef, useState } from "react";

interface DoomGameProps {
    onClose: () => void;
}

export default function DoomGame({ onClose }: DoomGameProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let dosInstance: any = null;

        // 1. Load CSS
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = '/js-dos/js-dos.css';
        document.head.appendChild(cssLink);

        // 2. Load JS
        const script = document.createElement('script');
        script.src = '/js-dos/js-dos.js';
        script.async = true;

        script.onload = async () => {
            // Check for V7 API
            if (canvasRef.current && (window as any).Dos) {
                try {
                    const Dos = (window as any).Dos;
                    const emulators = (window as any).emulators;

                    // Configure V7 pathPrefix to find wdosbox.wasm
                    if (emulators) {
                        emulators.pathPrefix = "/js-dos/";
                    }

                    console.log("Initializing Dos V7...");
                    dosInstance = Dos(canvasRef.current, {
                        style: "none",
                    });

                    console.log("Running bundle...");
                    // .run returns a Promise that resolves to a CommandInterface (ci)
                    // We need to make sure we catch any promise rejection
                    try {
                        await dosInstance.run('/doom/doom.zip');
                        console.log("Bundle running");
                        setLoading(false);
                    } catch (runErr: any) {
                        console.error("Run error:", runErr);
                        setError("Fallo al ejecutar juego: " + (runErr?.message || "Error desconocido"));
                        setLoading(false);
                    }

                } catch (err: any) {
                    console.error("Js-Dos Error:", err);
                    // Extract meaningful error
                    const msg = err?.message || JSON.stringify(err);
                    setError("Error: " + msg);
                    setLoading(false);
                }
            } else {
                setError("Librería Dos no cargada correctamente.");
                setLoading(false);
            }
        };

        script.onerror = (e) => {
            console.error("Script load error:", e);
            setError("Error al cargar script js-dos.js");
            setLoading(false);
        };

        document.body.appendChild(script);

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);

        return () => {
            if (dosInstance && dosInstance.stop) {
                try {
                    dosInstance.stop();
                } catch (e) { console.error("Error stopping", e); }
            }
            if (script.parentNode) document.body.removeChild(script);
            if (cssLink.parentNode) document.head.removeChild(cssLink);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    return (
        <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.9)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(5px)"
        }} onClick={onClose}>
            <div style={{
                width: "800px",
                height: "600px",
                backgroundColor: "#000",
                position: "relative",
                border: "2px solid #334155",
                borderRadius: "8px",
                boxShadow: "0 0 50px rgba(0,0,0,0.5), 0 0 20px rgba(220, 38, 38, 0.5)",
                overflow: "hidden"
            }} onClick={(e) => e.stopPropagation()}>
                <div style={{
                    position: "absolute",
                    top: "10px",
                    right: "10px",
                    color: "#ef4444",
                    cursor: "pointer",
                    padding: "8px",
                    fontWeight: "bold",
                    fontFamily: "'Courier New', monospace",
                    fontSize: "14px",
                    textShadow: "0 0 10px rgba(220, 38, 38, 0.8)",
                    zIndex: 100
                }} onClick={onClose}>
                    [ ESC - CERRAR ]
                </div>

                {loading && (
                    <div style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        color: "#ef4444",
                        fontFamily: "'Courier New', monospace",
                        fontSize: "16px",
                        textAlign: "center",
                        zIndex: 50
                    }}>
                        LOADING DOOM...<br />
                        <span style={{ fontSize: "12px", opacity: 0.7 }}>Iniciando emulador V7...</span>
                    </div>
                )}

                {error && (
                    <div style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        color: "#ef4444",
                        fontFamily: "'Courier New', monospace",
                        fontSize: "14px",
                        textAlign: "center",
                        padding: "20px",
                        zIndex: 50
                    }}>
                        {error}
                    </div>
                )}

                <canvas
                    ref={canvasRef}
                    style={{
                        width: "100%",
                        height: "100%",
                        display: loading ? "none" : "block"
                    }}
                />
            </div>
        </div>
    );
}
