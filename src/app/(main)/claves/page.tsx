import ClavesList from "@/components/ClavesList";
import { validateSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function ClavesPage() {
    const session = await validateSession();
    if (session?.email === "administracion") {
        redirect("/reportes");
    }

    return <ClavesList />;
}
