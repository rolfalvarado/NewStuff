import { getAllSystems } from "@/app/actions/get-systems";
import SystemsList from "./SystemsList";
import { validateSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function SistemasPage() {
    const session = await validateSession();
    const userRole = session?.role || 'invitado';
    const systems = await getAllSystems();
    return <SystemsList initialSystems={systems} userRole={userRole} />;
}
