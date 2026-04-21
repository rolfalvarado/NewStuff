"use server";

import { getMonitoredUsers } from "./get-monitored-users";
import { validateSession } from "@/lib/session";
import * as XLSX from 'xlsx';

export async function exportUsersToExcel() {
    try {
        const session = await validateSession();
        if (!session) {
            return { success: false, error: "No autorizado" };
        }

        // Fetch all monitored users
        const users = await getMonitoredUsers();

        if (!users || users.length === 0) {
            return { success: false, error: "No hay usuarios para exportar" };
        }

        // Prepare data for Excel
        const excelData = users.map((user, index) => ({
            '#': index + 1,
            'Nombres': user.nombres || '',
            'Apellido Paterno': user.ape_paterno || '',
            'Login': user.login || '',
            'Email': user.email || '',
            'Hostname': user.hostname || '',
            'Tipo Ultima Conex': user.tipo_ultima_conex || ''
        }));

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Set column widths
        ws['!cols'] = [
            { wch: 5 },  // #
            { wch: 20 }, // Nombres
            { wch: 20 }, // Apellido Paterno
            { wch: 15 }, // Login
            { wch: 30 }, // Email
            { wch: 40 }, // Hostname
            { wch: 25 }  // Tipo Ultima Conex
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Usuarios");

        // Generate buffer
        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // Convert to base64
        const base64 = Buffer.from(excelBuffer).toString('base64');

        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `usuarios_${timestamp}.xlsx`;

        return {
            success: true,
            data: base64,
            filename
        };
    } catch (error) {
        console.error("Error exporting users to Excel:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Error desconocido"
        };
    }
}
