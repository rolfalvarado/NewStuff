import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import StatusChecker from "@/components/StatusChecker";
import AlarmManager from "@/components/AlarmManager";

export default function MainLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AuthGuard>
            <StatusChecker />
            <AlarmManager />
            <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
                <Sidebar />
                <main style={{
                    flex: 1,
                    marginLeft: "170px", // Sidebar width
                    padding: "2rem",
                    backgroundColor: "var(--bg-main)",
                    overflow: "hidden", // Prevent body scroll, force inner containers to scroll
                    display: "flex",
                    flexDirection: "column"
                }}>
                    {children}
                </main>
            </div>
        </AuthGuard>
    );
}
