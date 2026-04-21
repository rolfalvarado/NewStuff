
import { getMonitoredUsers } from "@/app/actions/get-monitored-users";
import UsuariosGrid from "./UsuariosGrid";

// Force dynamic rendering to ensure fresh data on navigation
export const dynamic = 'force-dynamic';

export default async function UsuariosPage() {
    const users = await getMonitoredUsers();

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h1 style={{ fontSize: "1.5rem", fontWeight: "700", color: "var(--text-main)" }}>Usuarios</h1>
            </div>

            <div className="card-panel" style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden", // Important for the grid scroll
                padding: 0, // No padding for the grid to go edge-to-edge inside the panel
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-color)"
            }}>
                <UsuariosGrid initialUsers={users} />
            </div>
        </div>
    );
}
