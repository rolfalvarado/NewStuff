"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { loginAction } from "@/app/actions/auth";

export default function LoginPage() {
    const router = useRouter();
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);

    useEffect(() => {
        const checkExistingSession = async () => {
            try {
                const response = await fetch('/api/auth/verify', {
                    method: 'GET',
                    credentials: 'include',
                });
                if (response.ok) {
                    window.location.href = '/sistemas';
                    return;
                }
            } catch (error) { }
            setCheckingSession(false);
        };
        checkExistingSession();
    }, [router]);

    const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        const formData = new FormData(e.currentTarget);
        try {
            const result = await loginAction(formData);
            if (result.success) {
                window.location.href = "/sistemas";
            } else {
                setError(result.message || "Error al iniciar sesión");
            }
        } catch (err) {
            setError("Ocurrió un error inesperado");
        } finally {
            setLoading(false);
        }
    };

    if (checkingSession) {
        return (
            <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ color: "var(--text-muted)" }}>Cargando...</div>
            </main>
        );
    }

    // Estilos simulando Tailwind con variables del tema y diseño oscuro
    const styles = {
        container: {
            minHeight: "100vh",
            backgroundColor: "#e5e7eb", // gray-200 (fondo general claro como en la imagen)
            display: "flex",
            flexDirection: "column" as const,
            justifyContent: "center",
            padding: "1.5rem 0",
        },
        wrapper: {
            position: "relative" as const,
            padding: "0.75rem",
            width: "100%",
            maxWidth: "26rem", // Un poco más ancho
            margin: "0 auto",
        },
        // Eliminado el gradientBg rotado ya que el diseño nuevo es plano
        card: {
            position: "relative" as const,
            padding: "3rem 2rem",
            backgroundColor: "#0F172A", // Color del Sidebar
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)", // Sombra fuerte
            borderRadius: "1rem",
            color: "#FFFFFF",
        },
        innerCard: {
            width: "100%",
            margin: "0 auto",
        },
        logoContainer: {
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "3rem",
            gap: "0.5rem",
        },
        label: {
            fontWeight: 500,
            fontSize: "0.875rem",
            color: "#94a3b8", // slate-400 (texto gris claro para fondo oscuro)
            marginBottom: "0.5rem",
            display: "block",
        },
        input: {
            border: "1px solid #334155", // slate-700 (borde oscuro)
            borderRadius: "0.5rem",
            padding: "0.75rem 1rem",
            marginBottom: "1.5rem",
            fontSize: "0.95rem",
            width: "100%",
            outline: "none",
            color: "#FFFFFF", // Texto blanco
            backgroundColor: "#1e293b", // slate-800 (fondo input oscuro)
            transition: "all 0.2s",
        },
        button: {
            padding: "0.75rem 2rem",
            backgroundColor: "var(--primary)", // Azul del sitio
            color: "#ffffff",
            width: "100%",
            textAlign: "center" as const,
            fontSize: "1.1rem",
            fontWeight: 600,
            borderRadius: "0.5rem",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.2)",
            marginTop: "1rem",
            transition: "all 0.2s",
        },
        errorBox: {
            marginBottom: "1rem",
            fontSize: "0.875rem",
            color: "#fca5a5", // red-300
            textAlign: "center" as const,
            backgroundColor: "rgba(239, 68, 68, 0.2)", // red con opacidad
            padding: "0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid rgba(239, 68, 68, 0.3)"
        }
    };

    return (
        <main style={styles.container}>
            <div style={styles.wrapper}>

                {/* Main Card */}
                <div style={styles.card}>
                    <div style={styles.innerCard}>
                        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%" }}>

                            {/* Logo */}
                            <div style={styles.logoContainer}>
                                <div style={{ position: "relative", width: "12rem", height: "6rem" }}>
                                    <Image
                                        src="/logo.png"
                                        alt="MonitorApp Logo"
                                        fill
                                        style={{
                                            objectFit: "contain",
                                            // No invertimos colores porque el fondo es oscuro, logo blanco se ve bien
                                        }}
                                        priority
                                    />
                                </div>
                            </div>

                            {/* Form */}
                            <form onSubmit={handleLogin} style={{ width: "100%", display: "flex", flexDirection: "column" }}>
                                <input type="text" style={{ display: "none" }} />
                                <input type="password" style={{ display: "none" }} />

                                <div>
                                    <label style={styles.label}>Usuario</label>
                                    <input
                                        name="username_app_custom"
                                        placeholder="Username"
                                        style={styles.input}
                                        required
                                        onFocus={(e) => {
                                            e.target.style.borderColor = "var(--primary)";
                                            e.target.style.boxShadow = "0 0 0 2px rgba(30, 136, 229, 0.2)";
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = "#334155";
                                            e.target.style.boxShadow = "none";
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={styles.label}>Contraseña</label>
                                    <input
                                        name="password_app_custom"
                                        placeholder="••••••••"
                                        style={styles.input}
                                        type="password"
                                        required
                                        onFocus={(e) => {
                                            e.target.style.borderColor = "var(--primary)";
                                            e.target.style.boxShadow = "0 0 0 2px rgba(30, 136, 229, 0.2)";
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = "#334155";
                                            e.target.style.boxShadow = "none";
                                        }}
                                    />
                                </div>

                                {error && (
                                    <div style={styles.errorBox}>
                                        {error}
                                    </div>
                                )}

                                <div>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        style={{ ...styles.button, opacity: loading ? 0.7 : 1, cursor: loading ? "wait" : "pointer" }}
                                        onMouseEnter={(e) => {
                                            if (!loading) {
                                                e.currentTarget.style.backgroundColor = "var(--primary-hover)";
                                                e.currentTarget.style.transform = "translateY(-1px)";
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!loading) {
                                                e.currentTarget.style.backgroundColor = "var(--primary)";
                                                e.currentTarget.style.transform = "translateY(0)";
                                            }
                                        }}
                                    >
                                        {loading ? "Verificando..." : "Login"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
