import { NextRequest, NextResponse } from "next/server";
import { getGoogleDriveAuth, drive } from "@/lib/google-drive";
import { validateSession } from "@/lib/session";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ fileId: string }> }
) {
    try {
        const session = await validateSession();
        if (!session) {
            return new NextResponse("No autorizado", { status: 401 });
        }

        const { fileId } = await params;
        // Get file name from query params if possible, or fetch metadata
        const fileName = req.nextUrl.searchParams.get("name") || "archivo";

        const auth = await getGoogleDriveAuth();

        // Fetch the file content from Google Drive
        const response = await drive.files.get(
            {
                auth,
                fileId: fileId,
                alt: "media",
                supportsAllDrives: true,
            },
            { responseType: "stream" }
        );

        // Stream the response back to the client
        return new NextResponse(response.data as any, {
            headers: {
                "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
                "Content-Type": response.headers["content-type"] || "application/octet-stream",
            },
        });
    } catch (error: any) {
        console.error("Error proxied download from Drive:", error);
        return new NextResponse(error.message || "Error al descargar el archivo", {
            status: 500,
        });
    }
}
