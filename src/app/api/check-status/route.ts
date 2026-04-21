
import { NextResponse } from 'next/server';
import { db, TABLE_NAMES } from '@/lib/db';
import { ScanCommand, UpdateCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { revalidatePath } from 'next/cache';

// Force dynamic to ensure it runs every request
export const dynamic = 'force-dynamic';

async function updateStatus(url_sitio: string, status: 'Online' | 'Offline') {
    try {
        await db.send(new UpdateCommand({
            TableName: TABLE_NAMES.SYSTEMS,
            Key: { url_sitio },
            UpdateExpression: "set estado_sitio = :s",
            ExpressionAttributeValues: {
                ":s": status,
            },
        }));
    } catch (e) {
        console.error(`Failed to update ${url_sitio}`, e);
    }
}

export async function GET() {
    try {
        // Now we just fetch the latest status from DB, populated by the background service
        const result = await db.send(new ScanCommand({
            TableName: TABLE_NAMES.SYSTEMS,
            ProjectionExpression: "url_sitio, consecutive_failures, estado_sitio, nombre_empresa, disabled_state, nombre_servidor, last_check_timestamp, last_http_code"
        }));

        const systems = result.Items || [];

        // Map to expected frontend format, excluding dynamodb_local_backup
        const details = systems
            .filter((sys: any) => sys.url_sitio !== "dynamodb_local_backup")
            .map((sys: any) => ({
                url: sys.url_sitio,
                status: sys.estado_sitio || 'Online',
                failures: sys.consecutive_failures || 0,
                code: sys.last_http_code || 0,
                isDisabled: sys.disabled_state || false,
                name: sys.nombre_empresa,
                serverName: sys.nombre_servidor
            }));

        return NextResponse.json(
            { success: true, processed: details.length, details },
            {
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            }
        );
    } catch (error) {
        console.error("Status fetch error:", error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
