"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import {
    getTopics, createTopic, updateTopicStatus,
    getMessages, sendMessage, sendFileMessage,
    ChatTopic, ChatMessage,
} from "@/app/actions/chat";

const CHAT_NAME_KEY = "chat_display_name";

// ---------- Tipos locales (UI) ----------
interface TopicUI extends ChatTopic {
    messages: ChatMessage[];
}

// ---------- Helpers ----------
const HighlightText = ({ text, highlight }: { text: string; highlight: string }) => {
    if (!highlight.trim()) return <>{text}</>;
    const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return (
        <>
            {parts.map((part, i) =>
                regex.test(part) ? (
                    <mark key={i} style={{ backgroundColor: "#FDE047", color: "#000", padding: "0 2px", borderRadius: "2px" }}>
                        {part}
                    </mark>
                ) : (
                    part
                )
            )}
        </>
    );
};

function timeAgo(ts: number): string {
    const diffMs = Date.now() - ts;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return "ahora";
    if (diffMin < 60) return `hace ${diffMin} min`;
    if (diffHrs < 24) return `hace ${diffHrs} h`;
    return `hace ${diffDays} día${diffDays > 1 ? "s" : ""}`;
}

function formatHour(ts: number): string {
    return new Date(ts).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------- Componente Principal ----------
export default function ChatPage() {
    const [displayName, setDisplayName] = useState<string | null>(null);
    const [inputName, setInputName] = useState("");
    const [isLoaded, setIsLoaded] = useState(false);

    const [topics, setTopics] = useState<TopicUI[]>([]);
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    const [globalSearch, setGlobalSearch] = useState("");
    const [localSearch, setLocalSearch] = useState("");
    const [messageInput, setMessageInput] = useState("");
    const [showNewTopicModal, setShowNewTopicModal] = useState(false);
    const [newTopicTitle, setNewTopicTitle] = useState("");
    const [isLoadingTopics, setIsLoadingTopics] = useState(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [isSending, setIsSending] = useState(false);

    const [showArchived, setShowArchived] = useState(false);
    const [archivedHover, setArchivedHover] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messageInputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Cargar nombre y limpiar notificación al entrar al chat
    useEffect(() => {
        const saved = localStorage.getItem(CHAT_NAME_KEY);
        if (saved) setDisplayName(saved);
        setIsLoaded(true);
        // Al entrar al chat, limpiar notificación y guardar timestamp de última visita
        localStorage.setItem("chat_has_new_messages", "false");
        localStorage.setItem("chat_last_seen", String(Date.now()));
    }, []);

    // Cargar tópicos desde DynamoDB
    const loadTopics = useCallback(async () => {
        setIsLoadingTopics(true);
        try {
            const result = await getTopics();
            if (result.success) {
                setTopics(prev => {
                    // Mantener mensajes ya cargados
                    const msgMap = new Map(prev.map(t => [t.id, t.messages]));
                    return result.topics.map(t => ({
                        ...t,
                        messages: msgMap.get(t.id) || [],
                    }));
                });
            }
        } catch (e) {
            console.error("Error loading topics:", e);
        }
        setIsLoadingTopics(false);
    }, []);

    useEffect(() => {
        if (displayName) {
            loadTopics();
        }
    }, [displayName, loadTopics]);

    // Cargar mensajes iniciales cuando se selecciona un tópico
    const loadMessages = useCallback(async (topicId: string) => {
        setIsLoadingMessages(true);
        try {
            const result = await getMessages(topicId);
            if (result.success) {
                setTopics(prev => prev.map(t =>
                    t.id === topicId ? { ...t, messages: result.messages } : t
                ));
            }
        } catch (e) {
            console.error("Error loading messages:", e);
        }
        setIsLoadingMessages(false);
    }, []);

    useEffect(() => {
        if (selectedTopicId) {
            loadMessages(selectedTopicId);
        }
    }, [selectedTopicId, loadMessages]);

    // --- Polling: mensajes del tópico seleccionado cada 4s ---
    useEffect(() => {
        if (!selectedTopicId || !displayName) return;
        const interval = setInterval(async () => {
            try {
                const result = await getMessages(selectedTopicId);
                if (result.success) {
                    setTopics(prev => prev.map(t =>
                        t.id === selectedTopicId
                            ? { ...t, messages: result.messages }
                            : t
                    ));
                }
            } catch (e) {
                console.error("[Poll] Error fetching messages:", e);
            }
        }, 4000);
        return () => clearInterval(interval);
    }, [selectedTopicId, displayName]);

    // --- Polling: lista de tópicos cada 10s (solo refresco de UI) ---
    useEffect(() => {
        if (!displayName) return;
        const interval = setInterval(() => { loadTopics(); }, 10000);
        return () => clearInterval(interval);
    }, [displayName, loadTopics]);


    // Scroll al último mensaje
    useEffect(() => {
        if (!localSearch && !globalSearch) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [selectedTopicId, topics, localSearch, globalSearch]);

    // Efecto para centrar y resaltar búsqueda
    useEffect(() => {
        const query = localSearch.trim() || globalSearch.trim();
        if (!query || !selectedTopicId) return;

        const selectedTopic = topics.find(t => t.id === selectedTopicId);
        const lowerQuery = query.toLowerCase();
        const msgIndex = selectedTopic?.messages.findIndex(m => m.text.toLowerCase().includes(lowerQuery) || m.fileName?.toLowerCase().includes(lowerQuery));

        if (msgIndex !== undefined && msgIndex !== -1) {
            const el = document.getElementById(`msg-${selectedTopic?.messages[msgIndex].id}`);
            if (el) {
                const rect = el.getBoundingClientRect();
                const containerRect = scrollContainerRef.current?.getBoundingClientRect();
                if (containerRect) {
                    const isInView = rect.top >= containerRect.top && rect.bottom <= containerRect.bottom;
                    if (!isInView) {
                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                }
            }
        }
    }, [localSearch, globalSearch, selectedTopicId, topics]);

    if (!isLoaded) return null;

    // ---------- Modal de nombre ----------
    if (!displayName) {
        return (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
                <div style={{
                    backgroundColor: "#ffffff", border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-lg)", padding: "2.5rem 3rem",
                    boxShadow: "var(--shadow-md)", width: "100%", maxWidth: "420px",
                    display: "flex", flexDirection: "column", gap: "1.5rem"
                }}>
                    <div style={{ textAlign: "center" }}>
                        <div style={{
                            width: "60px", height: "60px", borderRadius: "50%",
                            backgroundColor: "#EFF6FF", display: "flex", alignItems: "center",
                            justifyContent: "center", margin: "0 auto 1rem"
                        }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1E88E5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 14C21 14.5523 20.5523 15 20 15H13L9 19V15H4C3.44772 15 3 14.5523 3 14V5C3 4.44772 3.44772 4 4 4H20C20.5523 4 21 4.44772 21 5V14Z" />
                            </svg>
                        </div>
                        <h2 style={{ fontSize: "1.5rem", fontWeight: "700", color: "var(--text-main)", marginBottom: "0.4rem" }}>
                            Bienvenido al Chat
                        </h2>
                        <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: "1.5" }}>
                            Ingresa tu nombre para identificarte. Solo deberás hacerlo una vez.
                        </p>
                    </div>
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const t = inputName.trim();
                        if (!t) return;
                        localStorage.setItem(CHAT_NAME_KEY, t);
                        setDisplayName(t);
                    }} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
                                Tu nombre
                            </label>
                            <input
                                type="text" value={inputName} onChange={e => setInputName(e.target.value)}
                                placeholder="Ej: Juan, María, Carlos..." autoFocus maxLength={30} required
                                style={{
                                    width: "100%", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)",
                                    border: "1.5px solid var(--border-color)", fontSize: "1rem",
                                    color: "var(--text-main)", backgroundColor: "var(--bg-main)", outline: "none"
                                }}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: "100%", padding: "0.85rem" }}>
                            Entrar al Chat
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // ---------- Lógica de mensajes ----------
    const selectedTopic = topics.find(t => t.id === selectedTopicId) ?? null;
    const filteredMessages = selectedTopic ? selectedTopic.messages : [];

    const handleSendMessage = async () => {
        const text = messageInput.trim();
        if (!text || !selectedTopicId || !selectedTopic || isSending) return;
        setIsSending(true);

        try {
            const result = await sendMessage(selectedTopicId, selectedTopic.createdAt, displayName!, text);
            if (result.success && result.message) {
                setTopics(prev => prev.map(t =>
                    t.id === selectedTopicId
                        ? { ...t, messages: [...t.messages, result.message!] }
                        : t
                ));
                setMessageInput("");
                messageInputRef.current?.focus();
            }
        } catch (e) {
            console.error("Error sending message:", e);
        }
        setIsSending(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedTopicId || !selectedTopic || isSending) return;

        // Limitar a 5MB
        if (file.size > 5 * 1024 * 1024) {
            alert("El archivo no puede superar los 5 MB.");
            return;
        }

        setIsSending(true);
        try {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = (reader.result as string).split(",")[1]; // quitar prefijo data:...
                const result = await sendFileMessage(
                    selectedTopicId!, selectedTopic!.createdAt, displayName!,
                    file.name, base64, file.type
                );
                if (result.success && result.message) {
                    setTopics(prev => prev.map(t =>
                        t.id === selectedTopicId
                            ? { ...t, messages: [...t.messages, result.message!] }
                            : t
                    ));
                }
                setIsSending(false);
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error("Error uploading file:", err);
            setIsSending(false);
        }

        // Reset input para poder subir el mismo archivo otra vez
        e.target.value = "";
    };

    const handleToggleStatus = async (topicId: string) => {
        const topic = topics.find(t => t.id === topicId);
        if (!topic) return;
        const newStatus = topic.status === "activo" ? "resuelto" as const : "activo" as const;
        // Optimistic update
        setTopics(prev => prev.map(t => t.id === topicId ? { ...t, status: newStatus } : t));
        await updateTopicStatus(topicId, topic.createdAt, { status: newStatus });
    };

    const handleToggleArchive = async (topicId: string) => {
        const topic = topics.find(t => t.id === topicId);
        if (!topic) return;
        const newArchived = !topic.archived;
        // Optimistic update
        setTopics(prev => prev.map(t => t.id === topicId ? { ...t, archived: newArchived } : t));
        await updateTopicStatus(topicId, topic.createdAt, { archived: newArchived });
    };

    const handleCreateTopic = async (e: React.FormEvent) => {
        e.preventDefault();
        const title = newTopicTitle.trim();
        if (!title) return;

        const result = await createTopic(title);
        if (result.success && result.topic) {
            const newTopicUI: TopicUI = { ...result.topic, messages: [] };
            setTopics(prev => [newTopicUI, ...prev]);
            setSelectedTopicId(newTopicUI.id);
            setNewTopicTitle("");
            setShowNewTopicModal(false);
            setTimeout(() => messageInputRef.current?.focus(), 100);
        }
    };

    const downloadFile = (msg: ChatMessage) => {
        if (!msg.fileData || !msg.fileName) return;
        const byteChars = atob(msg.fileData);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
            byteNumbers[i] = byteChars.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: msg.fileType || "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = msg.fileName;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ---------- UI principal ----------
    return (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 4rem)", gap: "0" }}>

            {/* ---- Barra superior ---- */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: "1rem"
            }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                        Chat Interno
                    </h1>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                        Conectado como <strong style={{ color: "var(--primary)" }}>{displayName}</strong>
                        <button
                            onClick={() => { localStorage.removeItem(CHAT_NAME_KEY); setDisplayName(null); setInputName(""); }}
                            style={{ marginLeft: "0.75rem", fontSize: "0.75rem", color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline" }}
                        >
                            cambiar
                        </button>
                    </p>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowNewTopicModal(true)}
                        style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 1.25rem" }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Nuevo Tópico
                    </button>
                    <button
                        className="btn"
                        onMouseEnter={() => setArchivedHover(true)}
                        onMouseLeave={() => setArchivedHover(false)}
                        onClick={() => setShowArchived(!showArchived)}
                        style={{
                            whiteSpace: "nowrap",
                            backgroundColor: archivedHover ? "var(--bg-main)" : "#FFFFFF",
                            color: "var(--text-main)",
                            border: "1px solid var(--border-color)",
                            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                            transition: "background-color 150ms var(--ease-smooth)",
                            padding: "0.6rem 1.25rem"
                        }}
                    >
                        {showArchived ? "Activos / Resueltos" : "Archivados"}
                    </button>
                </div>
            </div>

            {/* ---- Contenedor principal de 2 columnas ---- */}
            <div style={{ display: "flex", flex: 1, gap: "1rem", overflow: "hidden", minHeight: 0 }}>

                {/* ======== PANEL IZQUIERDO: Tópicos ======== */}
                <div style={{
                    width: "300px", flexShrink: 0, display: "flex", flexDirection: "column",
                    backgroundColor: "transparent", border: "none",
                    overflow: "hidden"
                }}>
                    {/* Buscador Global de Tópicos */}
                    <div style={{ padding: "0 0.75rem 0.75rem" }}>
                        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                style={{ position: "absolute", left: "0.75rem", pointerEvents: "none" }}>
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text" value={globalSearch} onChange={e => setGlobalSearch(e.target.value)}
                                placeholder="Buscar en tópicos..."
                                style={{
                                    width: "100%", paddingLeft: "2.25rem", paddingRight: "0.75rem", paddingTop: "0.6rem", paddingBottom: "0.6rem",
                                    borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)",
                                    fontSize: "0.85rem", backgroundColor: "#ffffff",
                                    color: "var(--text-main)", outline: "none", boxShadow: "var(--shadow-sm)"
                                }}
                            />
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                        {isLoadingTopics && topics.length === 0 ? (
                            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                                Cargando tópicos...
                            </div>
                        ) : topics.filter(t => t.archived === showArchived).filter(t => {
                            if (!globalSearch.trim()) return true;
                            const q = globalSearch.toLowerCase();
                            return t.title.toLowerCase().includes(q)
                                || t.messages.some(m => m.text.toLowerCase().includes(q) || m.fileName?.toLowerCase().includes(q))
                                || (t.lastMessageText || "").toLowerCase().includes(q);
                        }).length === 0 ? (
                            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto 0.75rem" }}>
                                    <path d="M21 14C21 14.5523 20.5523 15 20 15H13L9 19V15H4C3.44772 15 3 14.5523 3 14V5C3 4.44772 3.44772 4 4 4H20C20.5523 4 21 4.44772 21 5V14Z" />
                                </svg>
                                <p>{showArchived ? "No hay tópicos archivados." : "Aún no hay tópicos."}</p>
                                {!showArchived && <p style={{ marginTop: "0.25rem" }}>Crea el primero con el botón de arriba.</p>}
                            </div>
                        ) : (
                            [...topics]
                                .filter(t => t.archived === showArchived)
                                .filter(t => {
                                    if (!globalSearch.trim()) return true;
                                    const q = globalSearch.toLowerCase();
                                    return t.title.toLowerCase().includes(q)
                                        || t.messages.some(m => m.text.toLowerCase().includes(q) || m.fileName?.toLowerCase().includes(q))
                                        || (t.lastMessageText || "").toLowerCase().includes(q);
                                })
                                .sort((a, b) => {
                                    if (a.status !== b.status) return a.status === "activo" ? -1 : 1;
                                    const aTime = a.lastMessageAt || a.createdAt;
                                    const bTime = b.lastMessageAt || b.createdAt;
                                    return bTime - aTime;
                                })
                                .map(topic => {
                                    const lastMsg = topic.messages[topic.messages.length - 1];
                                    const isSelected = topic.id === selectedTopicId;
                                    const isActive = topic.status === "activo";
                                    const previewText = lastMsg?.text || topic.lastMessageText || "";
                                    const previewAuthor = lastMsg?.author || topic.lastMessageAuthor || "";
                                    const previewTime = lastMsg?.timestamp || topic.lastMessageAt || topic.createdAt;
                                    return (
                                        <div
                                            key={topic.id}
                                            onClick={() => setSelectedTopicId(topic.id)}
                                            style={{
                                                backgroundColor: "#ffffff",
                                                borderRadius: "var(--radius-md)",
                                                border: "1px solid var(--border-color)",
                                                borderLeft: isSelected ? "3px solid var(--primary)" : "1px solid var(--border-color)",
                                                boxShadow: isSelected ? "0 2px 8px rgba(30,136,229,0.1)" : "var(--shadow-sm)",
                                                padding: "0.85rem 1rem",
                                                cursor: "pointer",
                                                transition: "all 0.15s",
                                                flexShrink: 0
                                            }}
                                        >
                                            {/* Fila 1: Título + Toggle */}
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                                                <p style={{
                                                    fontSize: "0.875rem", fontWeight: "700",
                                                    color: "var(--text-main)", margin: 0,
                                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1
                                                }}>
                                                    <HighlightText text={topic.title} highlight={globalSearch} />
                                                </p>
                                                {/* Toggle igual al de Sistemas */}
                                                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}
                                                    onClick={e => e.stopPropagation()}>
                                                    <span style={{
                                                        fontSize: "0.7rem", fontWeight: "600",
                                                        color: isActive ? "#3DDC97" : "var(--text-muted)"
                                                    }}>
                                                        {isActive ? "Activo" : "Resuelto"}
                                                    </span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleToggleStatus(topic.id); }}
                                                        title={isActive ? "Marcar como resuelto" : "Marcar como activo"}
                                                        style={{
                                                            width: "36px", height: "20px",
                                                            borderRadius: "12px", border: "none",
                                                            backgroundColor: isActive ? "#3DDC97" : "#334155",
                                                            position: "relative", cursor: "pointer",
                                                            padding: 0, transition: "all 200ms var(--ease-smooth)",
                                                            display: "flex", alignItems: "center", flexShrink: 0
                                                        }}
                                                    >
                                                        <div style={{
                                                            width: "16px", height: "16px",
                                                            borderRadius: "50%", backgroundColor: "#FFFFFF",
                                                            position: "absolute",
                                                            left: isActive ? "18px" : "2px",
                                                            transition: "left 200ms cubic-bezier(0.4,0,0.2,1)",
                                                            boxShadow: "0 1px 2px rgba(0,0,0,0.2)"
                                                        }} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Fila Archivar (Checkbox) */}
                                            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
                                                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.7rem", color: "var(--text-muted)" }} onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={topic.archived}
                                                        onChange={() => handleToggleArchive(topic.id)}
                                                        style={{ cursor: "pointer", width: "13px", height: "13px" }}
                                                    />
                                                    Archivar
                                                </label>
                                            </div>

                                            {/* Fila 2: Último mensaje */}
                                            {previewText ? (
                                                <p style={{
                                                    fontSize: "0.78rem", color: "var(--text-secondary)",
                                                    margin: "0 0 0.35rem",
                                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                                                }}>
                                                    <span style={{ fontWeight: "600" }}>{previewAuthor}:</span>{" "}
                                                    <HighlightText text={previewText} highlight={globalSearch} />
                                                </p>
                                            ) : (
                                                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 0.35rem", fontStyle: "italic" }}>
                                                    Sin mensajes aún
                                                </p>
                                            )}

                                            {/* Fila 3: Tiempo transcurrido */}
                                            <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", margin: 0, textAlign: "right" }}>
                                                {timeAgo(previewTime)}
                                            </p>
                                        </div>
                                    );
                                })
                        )}
                    </div>
                </div>

                {/* ======== PANEL DERECHO: Chat ======== */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
                    {selectedTopic ? (
                        <>
                            {/* Header del chat derecho */}
                            <div style={{
                                backgroundColor: "#ffffff", border: "1px solid var(--border-color)",
                                borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
                                padding: "0.85rem 1.25rem",
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                borderBottom: "none"
                            }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                                    <span style={{
                                        display: "inline-block", width: "8px", height: "8px", borderRadius: "50%",
                                        backgroundColor: selectedTopic.status === "activo" ? "#22C55E" : "#94A3B8",
                                        flexShrink: 0
                                    }} />
                                    <h2 style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                                        {selectedTopic.title}
                                    </h2>
                                </div>

                                {/* Buscador Local */}
                                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                        style={{ position: "absolute", left: "0.6rem", pointerEvents: "none" }}>
                                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                    <input
                                        type="text" value={localSearch} onChange={e => setLocalSearch(e.target.value)}
                                        placeholder="Buscar en el chat..."
                                        style={{
                                            paddingLeft: "2rem", paddingRight: "0.75rem", paddingTop: "0.4rem", paddingBottom: "0.4rem",
                                            borderRadius: "var(--radius-md)", border: "1.5px solid var(--border-color)",
                                            fontSize: "0.82rem", backgroundColor: "var(--bg-main)",
                                            color: "var(--text-main)", outline: "none", width: "200px"
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Área de mensajes */}
                            <div
                                ref={scrollContainerRef}
                                style={{
                                    flex: 1, overflowY: "auto",
                                    backgroundColor: "var(--bg-main)",
                                    border: "1px solid var(--border-color)",
                                    borderTop: "none", borderBottom: "none",
                                    padding: "1.25rem",
                                    display: "flex", flexDirection: "column", gap: "1rem"
                                }}>
                                {isLoadingMessages && filteredMessages.length === 0 ? (
                                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                                        Cargando mensajes...
                                    </div>
                                ) : filteredMessages.length === 0 ? (
                                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center" }}>
                                        Sé el primero en escribir en este tópico.
                                    </div>
                                ) : (
                                    filteredMessages.map(msg => {
                                        const isOwn = msg.author === displayName;
                                        const isFileMsg = !!msg.fileName;
                                        return (
                                            <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isOwn ? "flex-end" : "flex-start" }}>
                                                {/* Nombre + hora */}
                                                <div style={{
                                                    display: "flex", alignItems: "baseline", gap: "0.4rem",
                                                    marginBottom: "0.25rem",
                                                    flexDirection: isOwn ? "row-reverse" : "row"
                                                }}>
                                                    <span style={{ fontSize: "0.78rem", fontWeight: "700", color: isOwn ? "var(--primary)" : "var(--text-secondary)" }}>
                                                        {msg.author}
                                                    </span>
                                                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                                        {formatHour(msg.timestamp)}
                                                    </span>
                                                </div>
                                                {/* Burbuja */}
                                                <div
                                                    id={`msg-${msg.id}`}
                                                    style={{
                                                        backgroundColor: "#ffffff",
                                                        border: "1px solid var(--border-color)",
                                                        borderRadius: isOwn ? "12px 2px 12px 12px" : "2px 12px 12px 12px",
                                                        padding: "0.6rem 0.9rem",
                                                        maxWidth: "70%",
                                                        fontSize: "0.875rem",
                                                        color: "var(--text-main)",
                                                        boxShadow: "var(--shadow-sm)",
                                                        lineHeight: "1.5"
                                                    }}>
                                                    {isFileMsg ? (
                                                        <div
                                                            onClick={() => downloadFile(msg)}
                                                            style={{
                                                                display: "flex", alignItems: "center", gap: "0.5rem",
                                                                cursor: "pointer", color: "var(--primary)",
                                                                fontWeight: "600", fontSize: "0.82rem"
                                                            }}
                                                            title="Descargar archivo"
                                                        >
                                                            <Image src="/Icons/attachmentblack.svg" alt="Archivo" width={18} height={18} style={{ opacity: 0.7 }} />
                                                            <span style={{ textDecoration: "underline" }}><HighlightText text={msg.fileName!} highlight={localSearch || globalSearch} /></span>
                                                        </div>
                                                    ) : (
                                                        <HighlightText text={msg.text} highlight={localSearch || globalSearch} />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input de mensaje + adjunto */}
                            <div style={{
                                backgroundColor: "#ffffff", border: "1px solid var(--border-color)",
                                borderRadius: "0 0 var(--radius-lg) var(--radius-lg)",
                                padding: "0.85rem 1.25rem",
                                display: "flex", gap: "0.75rem", alignItems: "center"
                            }}>
                                {/* Botón Adjuntar */}
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isSending}
                                    title="Adjuntar archivo"
                                    style={{
                                        width: "36px", height: "36px", borderRadius: "50%", border: "none",
                                        backgroundColor: "transparent", cursor: isSending ? "wait" : "pointer",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        flexShrink: 0, transition: "background-color 0.15s"
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--bg-main)")}
                                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                                >
                                    <Image src="/Icons/attachmentblack.svg" alt="Adjuntar" width={20} height={20} style={{ opacity: 0.6 }} />
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    style={{ display: "none" }}
                                    onChange={handleFileUpload}
                                />

                                <input
                                    ref={messageInputRef}
                                    type="text" value={messageInput}
                                    onChange={e => setMessageInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Escribe un mensaje..."
                                    disabled={isSending}
                                    style={{
                                        flex: 1, padding: "0.7rem 1rem",
                                        borderRadius: "var(--radius-md)",
                                        border: "1.5px solid var(--border-color)",
                                        fontSize: "0.9rem", color: "var(--text-main)",
                                        backgroundColor: "var(--bg-main)", outline: "none"
                                    }}
                                />
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!messageInput.trim() || isSending}
                                    title="Enviar mensaje"
                                    style={{
                                        width: "40px", height: "40px", borderRadius: "50%", border: "none",
                                        backgroundColor: messageInput.trim() && !isSending ? "var(--primary)" : "#CBD5E1",
                                        cursor: messageInput.trim() && !isSending ? "pointer" : "not-allowed",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        transition: "background-color 0.2s", flexShrink: 0
                                    }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="22" y1="2" x2="11" y2="13" />
                                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                    </svg>
                                </button>
                            </div>
                        </>
                    ) : (
                        // Estado vacío (ningún tópico seleccionado)
                        <div style={{
                            flex: 1, backgroundColor: "#ffffff",
                            border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexDirection: "column", gap: "0.75rem", color: "var(--text-muted)"
                        }}>
                            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 14C21 14.5523 20.5523 15 20 15H13L9 19V15H4C3.44772 15 3 14.5523 3 14V5C3 4.44772 3.44772 4 4 4H20C20.5523 4 21 4.44772 21 5V14Z" />
                            </svg>
                            <p style={{ fontSize: "0.9rem" }}>Selecciona un tópico para ver la conversación</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ======== Modal Nuevo Tópico ======== */}
            {showNewTopicModal && (
                <div style={{
                    position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)",
                    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
                    backdropFilter: "blur(3px)"
                }}
                    onClick={e => { if (e.target === e.currentTarget) setShowNewTopicModal(false); }}
                >
                    <div style={{
                        backgroundColor: "#ffffff", borderRadius: "var(--radius-lg)",
                        padding: "2rem", width: "100%", maxWidth: "420px",
                        boxShadow: "0 20px 40px rgba(0,0,0,0.15)", border: "1px solid var(--border-color)"
                    }}>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "1.25rem", color: "var(--text-main)" }}>
                            Nuevo Tópico
                        </h3>
                        <form onSubmit={handleCreateTopic} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <div>
                                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
                                    Nombre del tópico
                                </label>
                                <input
                                    type="text" value={newTopicTitle} onChange={e => setNewTopicTitle(e.target.value)}
                                    placeholder="Ej: Bug en facturación, Reunión semanal..."
                                    autoFocus maxLength={80} required
                                    style={{
                                        width: "100%", padding: "0.75rem 1rem",
                                        borderRadius: "var(--radius-md)", border: "1.5px solid var(--border-color)",
                                        fontSize: "0.95rem", color: "var(--text-main)",
                                        backgroundColor: "var(--bg-main)", outline: "none"
                                    }}
                                />
                            </div>
                            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                                <button type="button" className="btn btn-ghost"
                                    onClick={() => { setShowNewTopicModal(false); setNewTopicTitle(""); }}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Crear Tópico
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
