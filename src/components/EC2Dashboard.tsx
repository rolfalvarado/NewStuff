"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { getInstances, startInstances, stopInstances, rebootInstances, AWSCredentials } from "@/app/actions/ec2-actions";

// Types matching the AWS SDK return structure somewhat
interface EC2Instance {
    InstanceId: string;
    InstanceType: string;
    State: { Name: string };
    Tags: { Key: string; Value: string }[];
    PrivateIpAddress?: string;
    PublicIpAddress?: string;
}

export default function EC2Dashboard() {
    // Auth State
    const [credentials, setCredentials] = useState<AWSCredentials>({
        accessKeyId: "",
        secretAccessKey: "",
        region: "us-east-1"
    });
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Data State
    const [instances, setInstances] = useState<EC2Instance[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [authHover, setAuthHover] = useState(false);

    // Helper Functions
    const getTagValue = (tags: any[], key: string) => tags?.find((t: any) => t.Key === key)?.Value || 'N/A';

    // Load credentials from Session Storage on mount
    useEffect(() => {
        const storedCreds = sessionStorage.getItem('aws_creds');
        if (storedCreds) {
            try {
                const parsed = JSON.parse(storedCreds);
                setCredentials(parsed);
                // Auto-load if credentials exist
                loadData(parsed);
            } catch (e) {
                // Invalid JSON, ignore
            }
        }
    }, []);

    // Helper functions
    const showMessage = (type: 'success' | 'error', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 5000);
    };

    const loadData = async (creds: AWSCredentials = credentials) => {
        setIsLoading(true);
        const result = await getInstances(creds);
        if (result.success) {
            setInstances(result.instances);
            // Save to session storage on success if not already authenticated
            if (!isAuthenticated) {
                setIsAuthenticated(true);
                sessionStorage.setItem('aws_creds', JSON.stringify(creds));
                showMessage('success', `${result.instances.length} instancias cargadas correctamente`);
            }
        } else {
            showMessage('error', 'Error cargando instancias: ' + result.error);
            // If auto-loading failed (maybe credentials expired/revoked), we might want to clear session
            // But usually we just show error. If it was an auto-load from session and failed auth, maybe we clear it.
        }
        setIsLoading(false);
    };

    const handleConnect = () => {
        if (!credentials.accessKeyId || !credentials.secretAccessKey) {
            showMessage('error', 'Por favor ingresa las credenciales de AWS');
            return;
        }
        loadData();
    };

    // Actions
    const handleAction = async (action: 'start' | 'stop' | 'reboot', instanceIds: string[]) => {
        if (!confirm(`¿Estás seguro de que deseas ${action === 'start' ? 'iniciar' : action === 'stop' ? 'detener' : 'reiniciar'} ${instanceIds.length} instancia(s)?`)) return;

        setIsLoading(true);
        let result;
        if (action === 'start') result = await startInstances(credentials, instanceIds);
        else if (action === 'stop') result = await stopInstances(credentials, instanceIds);
        else result = await rebootInstances(credentials, instanceIds);

        if (result.success) {
            showMessage('success', `Acción iniciada correctamente. Actualizando...`);
            setTimeout(() => loadData(), action === 'reboot' ? 5000 : 3000);
        } else {
            showMessage('error', `Error: ${result.error}`);
            setIsLoading(false);
        }
    };

    // Derived State
    const filteredInstances = instances.filter(i => {
        if (!searchQuery) return true;
        const lowerQuery = searchQuery.toLowerCase();
        const name = getTagValue(i.Tags, 'Name').toLowerCase();
        const id = i.InstanceId.toLowerCase();
        const publicIp = i.PublicIpAddress?.toLowerCase() || "";
        const privateIp = i.PrivateIpAddress?.toLowerCase() || "";

        return name.includes(lowerQuery) || id.includes(lowerQuery) || publicIp.includes(lowerQuery) || privateIp.includes(lowerQuery);
    });

    const runningCount = instances.filter(i => i.State.Name === 'running').length;
    const stoppedCount = instances.filter(i => i.State.Name === 'stopped').length;
    const pendingCount = instances.filter(i => ['pending', 'stopping', 'starting', 'shutting-down'].includes(i.State.Name)).length;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem", height: "100%", width: "100%" }}>

            {/* Login / Configuration Section */}
            {!isAuthenticated ? (
                <div className="card-panel" style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto", width: "100%" }}>
                    <h2 style={{ marginBottom: "1.5rem", textAlign: "center", fontSize: "1.5rem" }}>⚙️ Configuración AWS</h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                        <div>
                            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>Access Key ID</label>
                            <input
                                type="password"
                                value={credentials.accessKeyId}
                                onChange={e => setCredentials({ ...credentials, accessKeyId: e.target.value })}
                                placeholder="AKIA..."
                                style={{
                                    width: "100%",
                                    padding: "0.75rem",
                                    borderRadius: "var(--radius-sm)",
                                    border: "1px solid var(--border-color)",
                                    fontSize: "1rem"
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>Secret Access Key</label>
                            <input
                                type="password"
                                value={credentials.secretAccessKey}
                                onChange={e => setCredentials({ ...credentials, secretAccessKey: e.target.value })}
                                placeholder="Secret key..."
                                style={{
                                    width: "100%",
                                    padding: "0.75rem",
                                    borderRadius: "var(--radius-sm)",
                                    border: "1px solid var(--border-color)",
                                    fontSize: "1rem"
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>Región</label>
                            <select
                                value={credentials.region}
                                onChange={e => setCredentials({ ...credentials, region: e.target.value })}
                                style={{
                                    width: "100%",
                                    padding: "0.75rem",
                                    borderRadius: "var(--radius-sm)",
                                    border: "1px solid var(--border-color)",
                                    fontSize: "1rem",
                                    backgroundColor: "white"
                                }}
                            >
                                <option value="us-east-1">US East (N. Virginia)</option>
                                <option value="us-west-2">US West (Oregon)</option>
                                <option value="eu-west-1">Europe (Ireland)</option>
                                <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                                <option value="sa-east-1">South America (São Paulo)</option>
                            </select>
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={handleConnect}
                            disabled={isLoading}
                            style={{ padding: "1rem", fontSize: "1rem", justifyContent: "center" }}
                        >
                            {isLoading ? "Conectando..." : "🔗 Conectar a AWS"}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {/* Unified Status and Controls Bar */}
                    <div className="card-panel" style={{
                        padding: "1rem 1.5rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "1.5rem",
                        marginBottom: "2rem"
                    }}>
                        {/* Search Bar */}
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            backgroundColor: "var(--bg-main)",
                            borderRadius: "var(--radius-md)",
                            padding: "0.5rem 1rem",
                            width: "300px",
                            border: "1px solid var(--border-color)"
                        }}>
                            <Image
                                src="/Icons/search.svg"
                                alt="Buscar"
                                width={18}
                                height={18}
                                style={{ opacity: 0.5, marginRight: "0.5rem" }}
                            />
                            <input
                                type="text"
                                placeholder="Buscar servidor..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    border: "none",
                                    outline: "none",
                                    fontSize: "0.875rem",
                                    width: "100%",
                                    backgroundColor: "transparent",
                                    color: "var(--text-main)"
                                }}
                            />
                        </div>

                        {/* Divider */}
                        <div style={{ width: "1px", height: "45px", backgroundColor: "var(--bg-main)" }} />

                        {/* Stat: Running */}
                        <div style={{ minWidth: "100px", textAlign: "center" }}>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                                Ejecutándose
                            </div>
                            <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "#10B981" }}>
                                {runningCount}
                            </div>
                        </div>

                        {/* Divider */}
                        <div style={{ width: "1px", height: "45px", backgroundColor: "var(--bg-main)" }} />

                        {/* Stat: Stopped */}
                        <div style={{ minWidth: "100px", textAlign: "center" }}>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                                Detenidos
                            </div>
                            <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "#EF4444" }}>
                                {stoppedCount}
                            </div>
                        </div>

                        {/* Divider */}
                        <div style={{ width: "1px", height: "45px", backgroundColor: "var(--bg-main)" }} />

                        {/* Stat: Pending */}
                        <div style={{ minWidth: "100px", textAlign: "center" }}>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                                En Proceso
                            </div>
                            <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "#F59E0B" }}>
                                {pendingCount}
                            </div>
                        </div>

                        {/* Divider */}
                        <div style={{ width: "1px", height: "45px", backgroundColor: "var(--bg-main)" }} />

                        {/* Stat: Total */}
                        <div style={{ minWidth: "100px", textAlign: "center" }}>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                                Total
                            </div>
                            <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--primary)" }}>
                                {instances.length}
                            </div>
                        </div>

                        {/* Controls (Right aligned - Simplified) */}
                        <div style={{ display: "flex", gap: "0.75rem", marginLeft: "auto", alignItems: "center" }}>
                            <button
                                className="btn btn-primary"
                                onClick={() => loadData()}
                                style={{ fontSize: "0.875rem", padding: "0.5rem 1rem", fontWeight: "400", display: "flex", alignItems: "center", gap: "0.5rem" }}
                            >
                                <Image src="/Icons/refresh-double.svg" alt="Actualizar" width={16} height={16} />
                                Actualizar
                            </button>
                            <button
                                className="btn"
                                style={{
                                    whiteSpace: "nowrap",
                                    backgroundColor: authHover ? "var(--bg-main)" : "#FFFFFF",
                                    color: "var(--text-main)",
                                    border: "1px solid var(--border-color)",
                                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                                    fontSize: "0.875rem",
                                    padding: "0.5rem 1rem",
                                    fontWeight: "400",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    transition: "background-color 150ms var(--ease-smooth)"
                                }}
                                onMouseEnter={() => setAuthHover(true)}
                                onMouseLeave={() => setAuthHover(false)}
                                onClick={() => {
                                    setIsAuthenticated(false);
                                    setInstances([]);
                                    sessionStorage.removeItem('aws_creds');
                                }}
                            >
                                <Image src="/Icons/transition-left-solid.svg" alt="Salir" width={16} height={16} />
                                Salir
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    {message && (
                        <div style={{
                            padding: "1rem",
                            borderRadius: "var(--radius-md)",
                            backgroundColor: message.type === 'success' ? "#D1FAE5" : "#FEE2E2",
                            color: message.type === 'success' ? "#065F46" : "#991B1B",
                            border: `1px solid ${message.type === 'success' ? "#10B981" : "#EF4444"}`,
                            textAlign: "center",
                            marginBottom: "1rem"
                        }}>
                            {message.text}
                        </div>
                    )}

                    {isLoading && (
                        <div style={{ textAlign: "center", color: "var(--primary)", padding: "1rem" }}>
                            🔄 Procesando...
                        </div>
                    )}


                    {/* Grid Container with Scroll */}
                    <div style={{
                        flex: 1,
                        overflowY: "auto",
                        paddingRight: "0.5rem",
                        minHeight: 0 // Crucial for flex nested scrolling
                    }}>
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
                            gap: "1.5rem",
                            paddingBottom: "2rem"
                        }}>
                            {filteredInstances.map(instance => (
                                <div key={instance.InstanceId} className="card-panel" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                                    <div className="flex-between" style={{ paddingBottom: "1rem", borderBottom: "1px solid var(--border-color)" }}>
                                        <div style={{ fontSize: "1rem", fontWeight: "600", color: "var(--text-main)" }}>
                                            {getTagValue(instance.Tags, 'Name')}
                                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "400", marginTop: "0.25rem" }}>{instance.InstanceId}</div>
                                        </div>
                                        <div style={{
                                            padding: "0.15rem 0.5rem",
                                            borderRadius: "4px",
                                            fontSize: "0.7rem",
                                            fontWeight: "600",
                                            textTransform: "uppercase",
                                            backgroundColor: instance.State.Name === 'running' ? "rgba(16, 185, 129, 0.1)" : instance.State.Name === 'stopped' ? "rgba(239, 68, 68, 0.1)" : "rgba(245, 158, 11, 0.1)",
                                            color: instance.State.Name === 'running' ? "#059669" : instance.State.Name === 'stopped' ? "#DC2626" : "#D97706",
                                            border: `1px solid ${instance.State.Name === 'running' ? "#059669" : instance.State.Name === 'stopped' ? "#DC2626" : "#D97706"}`
                                        }}>
                                            {instance.State.Name}
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.8rem" }}>
                                        <div className="flex-between"><span style={{ color: "var(--text-muted)" }}>Tipo:</span> <span style={{ fontFamily: "monospace" }}>{instance.InstanceType}</span></div>
                                        <div className="flex-between"><span style={{ color: "var(--text-muted)" }}>Ambiente:</span> <span>{getTagValue(instance.Tags, 'Environment')}</span></div>
                                        <div className="flex-between"><span style={{ color: "var(--text-muted)" }}>Proyecto:</span> <span>{getTagValue(instance.Tags, 'Project')}</span></div>
                                        <div className="flex-between"><span style={{ color: "var(--text-muted)" }}>IP Privada:</span> <span style={{ fontFamily: "monospace" }}>{instance.PrivateIpAddress || 'N/A'}</span></div>
                                        <div className="flex-between"><span style={{ color: "var(--text-muted)" }}>IP Pública:</span> <span style={{ fontFamily: "monospace" }}>{instance.PublicIpAddress || 'N/A'}</span></div>
                                    </div>
                                    <div style={{ marginTop: "auto", display: "flex", gap: "0.5rem", paddingTop: "0.5rem" }}>
                                        {instance.State.Name === 'running' ? (
                                            <>
                                                <button
                                                    className="btn btn-ghost"
                                                    style={{
                                                        flex: 1,
                                                        fontSize: "0.8rem",
                                                        padding: "0.4rem",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        gap: "0.5rem"
                                                    }}
                                                    onClick={() => handleAction('stop', [instance.InstanceId])}
                                                >
                                                    <Image src="/Icons/system-shut.svg" alt="Detener" width={14} height={14} />
                                                    Detener
                                                </button>
                                                <button
                                                    className="btn btn-ghost"
                                                    style={{
                                                        flex: 1,
                                                        fontSize: "0.8rem",
                                                        padding: "0.4rem",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        gap: "0.5rem"
                                                    }}
                                                    onClick={() => handleAction('reboot', [instance.InstanceId])}
                                                >
                                                    <Image src="/Icons/system-restart.svg" alt="Reiniciar" width={14} height={14} />
                                                    Reiniciar
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                className="btn btn-ghost"
                                                style={{
                                                    flex: 1,
                                                    fontSize: "0.8rem",
                                                    padding: "0.4rem",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    gap: "0.5rem"
                                                }}
                                                onClick={() => handleAction('start', [instance.InstanceId])}
                                            >
                                                ▶️ Iniciar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
