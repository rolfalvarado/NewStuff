import EC2Dashboard from "@/components/EC2Dashboard";
import { validateSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    const session = await validateSession();
    if (session?.email === "administracion") {
        redirect("/reportes");
    }

    return (
        <div className="container" style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            paddingTop: "2rem",
            paddingBottom: "1rem",
            overflow: "hidden"
        }}>
            <EC2Dashboard />
        </div>
    );
}
