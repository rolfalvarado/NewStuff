import { NextRequest, NextResponse } from "next/server";

const API_ROMA = "https://lisboa.unabase.com/node/app";
const API_FRANK = "https://frank.unabase.com/node";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { endpoint, method = "GET", payload } = body;

        // Determine which API to use based on endpoint prefix
        let baseUrl: string;
        let path: string;

        if (endpoint.startsWith("frank:")) {
            baseUrl = API_FRANK;
            path = endpoint.replace("frank:", "");
        } else {
            baseUrl = API_ROMA;
            path = endpoint.replace("roma:", "");
        }

        const url = `${baseUrl}${path}`;
        console.log(`[SII Proxy] ${method.toUpperCase()} ${url}`);

        const fetchOptions: RequestInit = {
            method: method.toUpperCase(),
            headers: { "Content-Type": "application/json" },
        };

        if (payload && method.toUpperCase() !== "GET") {
            fetchOptions.body = JSON.stringify(payload);
        }

        const res = await fetch(url, fetchOptions);

        // Check if the response is JSON before parsing
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
            const textBody = await res.text();
            console.error(`[SII Proxy] Respuesta no-JSON desde ${url} (status ${res.status}):`, textBody.substring(0, 200));
            return NextResponse.json(
                {
                    success: false,
                    ok: false,
                    error: `El servidor respondió con status ${res.status} y contenido no-JSON. Verifique que el endpoint ${path} exista.`,
                    message: `El servidor respondió con status ${res.status}. Endpoint: ${path}`,
                },
                { status: res.status >= 400 ? res.status : 502 }
            );
        }

        const data = await res.json();

        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        console.error("[SII Proxy Error]", error);
        return NextResponse.json(
            { success: false, ok: false, error: error?.message || "Error de conexión con el servidor SII" },
            { status: 500 }
        );
    }
}
