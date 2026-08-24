"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { generateGuacamoleToken } from "@/app/actions/guacamole-token";
import styles from "./RdpModal.module.css";

interface RdpModalProps {
    serverName: string;
    serverIp: string;
    onClose: () => void;
}

type ConnectionState = "idle" | "generating-token" | "connecting" | "connected" | "error" | "disconnected";

export default function RdpModal({ serverName, serverIp, onClose }: RdpModalProps) {
    const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
    const [errorMessage, setErrorMessage] = useState("");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const displayRef = useRef<HTMLDivElement>(null);
    const clientRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const tunnelRef = useRef<any>(null);

    // Determine WebSocket URL based on current page location
    const getWsUrl = useCallback(() => {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = window.location.hostname;
        const port = process.env.NEXT_PUBLIC_GUAC_WS_PORT || "8081";
        return `${protocol}//${host}:${port}`;
    }, []);

    // Connect to Guacamole
    const connect = useCallback(async () => {
        setConnectionState("generating-token");
        setErrorMessage("");

        try {
            // Generate token via server action
            const result = await generateGuacamoleToken(serverName);

            if (!result.success || !result.token) {
                setConnectionState("error");
                setErrorMessage(result.error || "Error al generar token de conexión");
                return;
            }

            setConnectionState("connecting");

            // Dynamically import guacamole-common-js (client-side only)
            const guacModule = await import("guacamole-common-js");
            const Guacamole = guacModule.default || guacModule;

            // Create WebSocket tunnel
            const wsUrl = getWsUrl();
            const tunnel = new Guacamole.WebSocketTunnel(`${wsUrl}/?token=${encodeURIComponent(result.token)}`);
            tunnelRef.current = tunnel;

            // Create Guacamole client
            const client = new Guacamole.Client(tunnel);
            clientRef.current = client;

            // Set up the display
            const display = client.getDisplay();
            const displayElement = display.getElement();

            if (displayRef.current) {
                // Clear any previous display
                displayRef.current.innerHTML = "";
                displayRef.current.appendChild(displayElement);
            }

            // Handle state changes
            client.onstatechange = (state: number) => {
                switch (state) {
                    case 0: // IDLE
                        setConnectionState("idle");
                        break;
                    case 1: // CONNECTING
                        setConnectionState("connecting");
                        break;
                    case 2: // WAITING
                        setConnectionState("connecting");
                        break;
                    case 3: // CONNECTED
                        setConnectionState("connected");
                        break;
                    case 4: // DISCONNECTING
                        setConnectionState("disconnected");
                        break;
                    case 5: // DISCONNECTED
                        setConnectionState("disconnected");
                        break;
                }
            };

            // Handle errors
            client.onerror = (error: any) => {
                console.error("Guacamole client error:", error);
                setConnectionState("error");
                setErrorMessage(
                    error?.message || `Error de conexión (código: ${error?.code || "desconocido"})`
                );
            };

            // Handle tunnel errors
            tunnel.onerror = (status: any) => {
                console.error("Tunnel error:", status);
                setConnectionState("error");
                setErrorMessage(
                    `Error de túnel: ${status?.message || "No se pudo establecer la conexión WebSocket"}`
                );
            };

            // Auto-scale display to fit the container
            const resizeDisplay = () => {
                if (!displayRef.current || !client) return;
                const container = displayRef.current;
                const containerWidth = container.clientWidth;
                const containerHeight = container.clientHeight;
                
                const displayWidth = display.getWidth();
                const displayHeight = display.getHeight();

                if (displayWidth && displayHeight) {
                    const scale = Math.min(
                        containerWidth / displayWidth,
                        containerHeight / displayHeight
                    );
                    display.scale(scale);
                }
            };

            // Watch for display size changes
            display.onresize = resizeDisplay;

            // Also resize on window resize
            const handleWindowResize = () => {
                setTimeout(resizeDisplay, 100);
            };
            window.addEventListener("resize", handleWindowResize);

            // Connect with display size parameters
            const containerWidth = displayRef.current?.clientWidth || 1920;
            const containerHeight = displayRef.current?.clientHeight || 1080;
            
            client.connect(`width=${containerWidth}&height=${containerHeight}&dpi=96`);

            // Set up keyboard input
            const keyboard = new Guacamole.Keyboard(document);
            keyboard.onkeydown = (keysym: number) => {
                client.sendKeyEvent(1, keysym);
            };
            keyboard.onkeyup = (keysym: number) => {
                client.sendKeyEvent(0, keysym);
            };

            // Set up mouse input
            const mouse = new Guacamole.Mouse(displayElement);
            mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = (mouseState: any) => {
                client.sendMouseState(mouseState);
            };

            // Store cleanup reference
            return () => {
                window.removeEventListener("resize", handleWindowResize);
                keyboard.onkeydown = null;
                keyboard.onkeyup = null;
                mouse.onmousedown = null;
                mouse.onmouseup = null;
                mouse.onmousemove = null;
            };

        } catch (error) {
            console.error("Connection error:", error);
            setConnectionState("error");
            setErrorMessage("Error inesperado al conectar. Verifique que el servicio Guacamole esté activo.");
        }
    }, [serverName, getWsUrl]);

    // Connect on mount
    useEffect(() => {
        const cleanupPromise = connect();

        return () => {
            // Disconnect on unmount
            cleanupPromise.then(cleanup => cleanup?.());
            if (clientRef.current) {
                try {
                    clientRef.current.disconnect();
                } catch {
                    // Ignore disconnect errors
                }
            }
        };
    }, [connect]);

    // Handle fullscreen toggle
    const toggleFullscreen = useCallback(() => {
        if (!containerRef.current) return;

        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().then(() => {
                setIsFullscreen(true);
            }).catch(() => {
                // Fallback: just maximize the modal
                setIsFullscreen(true);
            });
        } else {
            document.exitFullscreen().then(() => {
                setIsFullscreen(false);
            });
        }
    }, []);

    // Send Ctrl+Alt+Del
    const sendCtrlAltDel = useCallback(() => {
        if (!clientRef.current) return;
        const client = clientRef.current;
        // Key codes for Ctrl, Alt, Delete
        client.sendKeyEvent(1, 0xFFE3); // Ctrl down
        client.sendKeyEvent(1, 0xFFE9); // Alt down
        client.sendKeyEvent(1, 0xFFFF); // Delete down
        client.sendKeyEvent(0, 0xFFFF); // Delete up
        client.sendKeyEvent(0, 0xFFE9); // Alt up
        client.sendKeyEvent(0, 0xFFE3); // Ctrl up
    }, []);

    // Handle disconnect
    const handleDisconnect = useCallback(() => {
        if (clientRef.current) {
            try {
                clientRef.current.disconnect();
            } catch {
                // Ignore
            }
        }
        onClose();
    }, [onClose]);

    // Listen for fullscreen changes
    useEffect(() => {
        const handler = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", handler);
        return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    // Prevent keyboard events from propagating to the parent page
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Allow Escape to close the modal
            if (e.key === "Escape" && !document.fullscreenElement) {
                handleDisconnect();
                return;
            }
            // Prevent default browser shortcuts from interfering
            if (connectionState === "connected") {
                e.stopPropagation();
            }
        };
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [connectionState, handleDisconnect]);

    const getStatusBadge = () => {
        switch (connectionState) {
            case "generating-token":
                return { text: "Generando credenciales...", color: "#f59e0b", pulse: true };
            case "connecting":
                return { text: "Conectando...", color: "#3b82f6", pulse: true };
            case "connected":
                return { text: "Conectado", color: "#10b981", pulse: false };
            case "error":
                return { text: "Error", color: "#ef4444", pulse: false };
            case "disconnected":
                return { text: "Desconectado", color: "#6b7280", pulse: false };
            default:
                return { text: "Iniciando...", color: "#6b7280", pulse: true };
        }
    };

    const status = getStatusBadge();

    return (
        <div className={styles.overlay} ref={containerRef}>
            {/* Toolbar */}
            <div className={styles.toolbar}>
                <div className={styles.toolbarLeft}>
                    <div className={styles.serverInfo}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                            <line x1="6" y1="6" x2="6.01" y2="6" />
                            <line x1="6" y1="18" x2="6.01" y2="18" />
                        </svg>
                        <span className={styles.serverName}>{serverName}</span>
                        <span className={styles.serverIp}>{serverIp}</span>
                    </div>
                    <div className={styles.statusBadge} style={{ backgroundColor: `${status.color}20`, color: status.color, borderColor: `${status.color}40` }}>
                        <span className={`${styles.statusDot} ${status.pulse ? styles.pulse : ""}`} style={{ backgroundColor: status.color }} />
                        {status.text}
                    </div>
                </div>

                <div className={styles.toolbarRight}>
                    {connectionState === "connected" && (
                        <>
                            <button
                                className={styles.toolbarBtn}
                                onClick={sendCtrlAltDel}
                                title="Enviar Ctrl+Alt+Del"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="m7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                Ctrl+Alt+Del
                            </button>
                            <button
                                className={styles.toolbarBtn}
                                onClick={toggleFullscreen}
                                title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                            >
                                {isFullscreen ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                                    </svg>
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                                    </svg>
                                )}
                            </button>
                        </>
                    )}
                    {connectionState === "error" && (
                        <button
                            className={`${styles.toolbarBtn} ${styles.retryBtn}`}
                            onClick={() => connect()}
                            title="Reintentar conexión"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="23 4 23 10 17 10" />
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                            </svg>
                            Reintentar
                        </button>
                    )}
                    <button
                        className={`${styles.toolbarBtn} ${styles.closeBtn}`}
                        onClick={handleDisconnect}
                        title="Desconectar y cerrar"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Display area */}
            <div className={styles.displayContainer}>
                {(connectionState === "generating-token" || connectionState === "connecting" || connectionState === "idle") && (
                    <div className={styles.connectingOverlay}>
                        <div className={styles.spinner} />
                        <p className={styles.connectingText}>
                            {connectionState === "generating-token" 
                                ? "Generando credenciales seguras..." 
                                : "Conectando al escritorio remoto..."}
                        </p>
                        <p className={styles.connectingSubtext}>{serverName} — {serverIp}</p>
                    </div>
                )}

                {connectionState === "error" && (
                    <div className={styles.errorOverlay}>
                        <div className={styles.errorIcon}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                        </div>
                        <p className={styles.errorTitle}>Error de conexión</p>
                        <p className={styles.errorMsg}>{errorMessage}</p>
                        <div className={styles.errorActions}>
                            <button className={styles.retryBtnLarge} onClick={() => connect()}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="23 4 23 10 17 10" />
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                </svg>
                                Reintentar conexión
                            </button>
                            <button className={styles.fallbackBtn} onClick={() => {
                                window.location.assign(`rdp://${serverIp}`);
                                onClose();
                            }}>
                                Abrir con mstsc (escritorio externo)
                            </button>
                        </div>
                    </div>
                )}

                {connectionState === "disconnected" && (
                    <div className={styles.errorOverlay}>
                        <div className={styles.errorIcon}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5">
                                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                                <line x1="6" y1="6" x2="6.01" y2="6" />
                                <line x1="6" y1="18" x2="6.01" y2="18" />
                            </svg>
                        </div>
                        <p className={styles.errorTitle}>Sesión desconectada</p>
                        <p className={styles.errorMsg}>La conexión con {serverName} se ha cerrado.</p>
                        <div className={styles.errorActions}>
                            <button className={styles.retryBtnLarge} onClick={() => connect()}>
                                Reconectar
                            </button>
                            <button className={styles.fallbackBtn} onClick={onClose}>
                                Cerrar
                            </button>
                        </div>
                    </div>
                )}

                {/* The Guacamole display canvas is rendered here */}
                <div
                    ref={displayRef}
                    className={styles.display}
                    style={{
                        opacity: connectionState === "connected" ? 1 : 0,
                        pointerEvents: connectionState === "connected" ? "auto" : "none",
                    }}
                />
            </div>
        </div>
    );
}
