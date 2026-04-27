import { validateSession } from "@/lib/session";
import { redirect } from "next/navigation";
import TareasClient from "./TareasClient";
import { buildTareasIdentity } from "@/lib/tareas-api";

export const dynamic = "force-dynamic";

export default async function TareasPage() {
    const session = await validateSession();
    if (!session) redirect("/login");

    const identity = buildTareasIdentity(session.email, session.name, session.role);

    return <TareasClient identity={identity} />;
}
