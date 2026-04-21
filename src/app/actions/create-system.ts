"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { revalidatePath } from "next/cache";
import { validateSession } from "@/lib/session";
import { System } from "./get-systems";
import { logNewSystem } from "./log-growth";

export async function createSystem(system: System) {
    const session = await validateSession();
    if (!session) {
        return { success: false, error: "No autorizado. Inicie sesión." };
    }

    try {
        // Strip trailing slash from url_sitio to avoid monitoring issues
        system.url_sitio = system.url_sitio.trim().replace(/\/+$/, "");

        // Basic validation
        if (!system.url_sitio || !system.nombre_empresa) {
            return { success: false, error: "URL y Nombre de Empresa son requeridos" };
        }

        await db.send(new PutCommand({
            TableName: TABLE_NAMES.SYSTEMS,
            Item: system
        }));

        // Log the new system in growth tracking
        await logNewSystem(system.nombre_empresa, system.url_sitio);

        revalidatePath("/sistemas");
        return { success: true };
    } catch (error) {
        console.error(`[Security] Failed creation attempt by ${session?.email}:`, error);
        return { success: false, error: "Error al crear el sistema" };
    }
}
