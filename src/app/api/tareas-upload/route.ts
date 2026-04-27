import { NextRequest, NextResponse } from "next/server";

// Proxy especializado para multipart/form-data hacia ROMA.
// El cliente debe enviar la petición como FormData con un header
// `x-tareas-endpoint` que indique la ruta destino (p.ej. "/tareas/<id>/attachments").
// Mantiene el patrón sii-proxy / tareas-proxy: la URL base sigue siendo lisboa.

const API_ROMA = "https://lisboa.unabase.com/node/app";

export const runtime = "nodejs";
// Garantiza que el body crudo sea reenviado tal cual (Next dejaría streamear).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const endpoint = req.headers.get("x-tareas-endpoint") || "";
        if (!endpoint || !endpoint.startsWith("/tareas")) {
            return NextResponse.json(
                { success: false, message: "Endpoint no permitido" },
                { status: 400 }
            );
        }

        const url = `${API_ROMA}${endpoint}`;
        const contentType = req.headers.get("content-type") || "";
        if (!contentType.includes("multipart/form-data")) {
            return NextResponse.json(
                { success: false, message: "Se esperaba multipart/form-data" },
                { status: 400 }
            );
        }

        // Re-emitimos el body intacto a ROMA. Reusamos el FormData parseado por Next.
        const incoming = await req.formData();
        const outgoing = new FormData();
        for (const [key, value] of incoming.entries()) {
            // value puede ser File | string
            outgoing.append(key, value as Blob | string);
        }

        let res: Response;
        try {
            res = await fetch(url, {
                method: "POST",
                body: outgoing as any,
                cache: "no-store",
            });
        } catch (e: any) {
            console.error(`[Tareas Upload] No se pudo conectar a ${url}:`, e?.message || e);
            return NextResponse.json(
                {
                    success: false,
                    error: "NO_BACKEND",
                    message:
                        "No se pudo conectar con el backend de TAREAS para subir el archivo.",
                },
                { status: 503 }
            );
        }

        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
            const text = await res.text().catch(() => "");
            console.error(
                `[Tareas Upload] Respuesta no-JSON (${res.status}):`,
                text.substring(0, 200)
            );
            return NextResponse.json(
                {
                    success: false,
                    error: "BAD_RESPONSE",
                    message: `El servidor respondió con status ${res.status}.`,
                },
                { status: res.status >= 400 ? res.status : 502 }
            );
        }

        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        console.error("[Tareas Upload Error]", error);
        return NextResponse.json(
            {
                success: false,
                error: "PROXY_ERROR",
                message: error?.message || "Error subiendo archivos",
            },
            { status: 500 }
        );
    }
}
