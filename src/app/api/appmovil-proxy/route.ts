import { NextRequest, NextResponse } from "next/server";

const API_ROMA = "https://lisboa.unabase.com/node/app";

// Prefijos permitidos para el módulo de App Móvil.
const ALLOWED_PREFIXES = ["/organizations", "/companies", "/users"];

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { endpoint, method = "GET", payload } = body;

        if (!endpoint || typeof endpoint !== "string") {
            return NextResponse.json(
                { success: false, message: "Falta 'endpoint' en el body" },
                { status: 400 }
            );
        }

        const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        const isAllowed = ALLOWED_PREFIXES.some(
            (p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`)
        );
        if (!isAllowed) {
            return NextResponse.json(
                { success: false, message: "Endpoint no permitido" },
                { status: 400 }
            );
        }

        const url = `${API_ROMA}${path}`;
        console.log(`[AppMovil Proxy] ${method.toUpperCase()} ${url}`);

        const fetchOptions: RequestInit = {
            method: method.toUpperCase(),
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
        };
        if (payload && method.toUpperCase() !== "GET") {
            fetchOptions.body = JSON.stringify(payload);
        }

        let res: Response;
        try {
            res = await fetch(url, fetchOptions);
        } catch (e: any) {
            console.error(`[AppMovil Proxy] No se pudo conectar a ${url}:`, e?.message || e);
            return NextResponse.json(
                {
                    success: false,
                    error: "NO_BACKEND",
                    message:
                        "No se pudo conectar con el backend (lisboa.unabase.com). Verifica que el servidor ROMA esté desplegado y accesible.",
                },
                { status: 503 }
            );
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
            const textBody = await res.text().catch(() => "");
            console.error(
                `[AppMovil Proxy] Respuesta no-JSON (${res.status}):`,
                textBody.substring(0, 200)
            );
            return NextResponse.json(
                {
                    success: false,
                    error: "BAD_RESPONSE",
                    message: `El servidor respondió con status ${res.status}. Endpoint: ${path}`,
                },
                { status: res.status >= 400 ? res.status : 502 }
            );
        }

        const data = await res.json();

        if (res.status === 404) {
            return NextResponse.json(
                {
                    success: false,
                    error: "ROUTES_NOT_DEPLOYED",
                    message:
                        "El endpoint solicitado aún no está desplegado en el backend ROMA (lisboa.unabase.com).",
                    upstream: data,
                },
                { status: 503 }
            );
        }

        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        console.error("[AppMovil Proxy Error]", error);
        return NextResponse.json(
            {
                success: false,
                error: "PROXY_ERROR",
                message: error?.message || "Error de conexión con ROMA",
            },
            { status: 500 }
        );
    }
}
