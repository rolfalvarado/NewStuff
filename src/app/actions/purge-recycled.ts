"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { validateSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function purgeRecycledItem(id: string): Promise<{ success: boolean; error?: string }> {
    const session = await validateSession();
    if (!session) return { success: false, error: "No autorizado" };

    try {
        await db.send(new DeleteCommand({
            TableName: TABLE_NAMES.RECYCLEBIN,
            Key: { id },
        }));

        revalidatePath("/reciclaje");
        return { success: true };
    } catch (error) {
        console.error("Error purging recycled item:", error);
        return { success: false, error: `Error al eliminar: ${(error as Error).message}` };
    }
}
