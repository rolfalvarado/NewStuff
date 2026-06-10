import { validateSession } from "@/lib/session";
import { redirect } from "next/navigation";
import AppMovilClient from "./AppMovilClient";

export const dynamic = "force-dynamic";

export default async function AppMovilPage() {
    const session = await validateSession();
    if (!session) redirect("/login");

    return <AppMovilClient />;
}
