import StuffOverview from "@/components/StuffOverview";

export const metadata = {
    title: "Stuff - Vista General",
    description: "Dashboard de servidores y sistemas agrupados",
};

export default function StuffPage() {
    return (
        <div className="page-container">
            <StuffOverview />
        </div>
    );
}
