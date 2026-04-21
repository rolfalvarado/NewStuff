"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [authorized, setAuthorized] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        // Verificar sesión del lado servidor
        const checkAuth = async () => {
            try {
                const response = await fetch('/api/auth/verify', {
                    method: 'GET',
                    credentials: 'include', // Incluir cookies
                });

                if (response.ok) {
                    setAuthorized(true);
                } else {
                    // Sesión inválida, redirigir a login
                    router.replace("/login");
                }
            } catch (error) {
                console.error("Auth check failed:", error);
                router.replace("/login");
            } finally {
                setChecking(false);
            }
        };

        checkAuth();
    }, [router]);

    // Mientras verifica, mostrar indicador de carga
    if (checking) {
        return (
            <div style={{
                height: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)"
            }}>
                <div style={{ textAlign: "center" }}>
                    <div style={{
                        width: "40px",
                        height: "40px",
                        border: "3px solid var(--border-color)",
                        borderTopColor: "var(--primary)",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                        margin: "0 auto 1rem"
                    }} />
                    Verificando sesión...
                </div>
                <style>{`
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    // Si no está autorizado, no mostrar nada (se está redirigiendo)
    if (!authorized) {
        return null;
    }

    return <>{children}</>;
}
