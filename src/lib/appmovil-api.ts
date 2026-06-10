// Cliente del módulo APP MÓVIL — usa /api/appmovil-proxy que llega a lisboa.unabase.com (ROMA)
// Permite ver/activar qué organizaciones tienen la app móvil (activeAPP) y
// gestionar las claves de sus usuarios.

export interface Organization {
    id: string;
    _id?: string;
    hostname: string;
    nombre_empresa: string;
    grupo_empresa: string;
    razonSocial?: string;
    rut?: string;
    activeAPP: boolean;
}

export interface AppUser {
    _id: string;
    nombres: string;
    ape_paterno: string;
    login: string;
    email: string;
    hostname: string;
    /** "" cuando el usuario aún no ha creado su clave en la app */
    password?: string;
    tipo_ultima_conex?: string;
    organization_id?: string | null;
    avatar_url?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

async function call<T = any>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
    payload?: any
): Promise<T> {
    const res = await fetch("/api/appmovil-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, method, payload }),
        cache: "no-store",
    });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Respuesta no-JSON (${res.status}): ${text.substring(0, 200)}`);
    }
    const data = await res.json();
    if (!res.ok || data?.success === false) {
        throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
    }
    return data as T;
}

function normalizeOrg(o: any): Organization {
    return {
        id: (o.id || o._id || "").toString(),
        _id: (o._id || o.id || "").toString(),
        hostname: o.hostname || o.url || "",
        nombre_empresa: o.nombre_empresa || o.empresa || o.name || "",
        grupo_empresa: o.grupo_empresa || "",
        razonSocial: o.razonSocial || o.razon_social || "",
        rut: o.rut || o.idNumber || "",
        activeAPP: Boolean(o.activeAPP),
    };
}

export const AppMovilAPI = {
    /** Lista todas las organizaciones (hasta `limit`). */
    listOrganizations: (limit = 2000) =>
        call<{ success: boolean; data: any[] }>(
            `/organizations/list?page=1&limit=${limit}`
        ).then((r) => (r.data || []).map(normalizeOrg)),

    /** Activa / desactiva la app móvil para una organización. */
    setOrgActive: (id: string, activeAPP: boolean) =>
        call<{ success: boolean; data: any }>(
            `/organizations/${id}/status`,
            "PUT",
            { activeAPP }
        ).then((r) => normalizeOrg(r.data)),

    /** Lista los usuarios de una organización por hostname. */
    listUsers: (hostname: string, limit = 1000) =>
        call<{ success: boolean; users: AppUser[]; total: number }>(
            `/users?hostname=${encodeURIComponent(hostname)}&page=1&limit=${limit}`
        ).then((r) => r.users || []),

    /** Reinicia la clave del usuario (la deja vacía para que la cree en la app). */
    resetUserPassword: (userId: string) =>
        call<{ success: boolean; message: string }>(
            `/users/${userId}/reset-password`,
            "POST"
        ),

    /** Establece una clave concreta para el usuario (se guarda hasheada en ROMA). */
    setUserPassword: (userId: string, password: string) =>
        call<{ success: boolean; message: string }>(
            `/users/${userId}/set-password`,
            "POST",
            { password }
        ),

    /** Actualiza el correo del usuario. */
    setUserEmail: (userId: string, email: string) =>
        call<{ success: boolean; message: string; email: string }>(
            `/users/${userId}/set-email`,
            "POST",
            { email }
        ),
};
