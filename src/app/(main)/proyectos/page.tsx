import { validateSession } from "@/lib/session";
import { redirect } from "next/navigation";
import ProyectosClient from "./ProyectosClient";
import { buildProyectosIdentity } from "@/lib/proyectos-api";

export const dynamic = "force-dynamic";

export default async function ProyectosPage() {
    const session = await validateSession();
    if (!session) redirect("/login");

    const identity = buildProyectosIdentity(session.email, session.name);

    return <ProyectosClient identity={identity} />;
}
