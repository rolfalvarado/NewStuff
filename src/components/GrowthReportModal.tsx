"use client";

import { useEffect, useState } from "react";
import { getGrowthLogs } from "@/app/actions/get-growth-logs";
import { GrowthLog } from "@/app/actions/log-growth";

interface GrowthReportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function GrowthReportModal({ isOpen, onClose }: GrowthReportModalProps) {
    const [logs, setLogs] = useState<GrowthLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({
        newSystemsMonth: 0,
        newSystemsYear: 0,
        userGrowthMonth: 0,
        userGrowthYear: 0
    });

    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen]);

    const loadData = async () => {
        setLoading(true);
        const result = await getGrowthLogs();
        if (result.success && result.data) {
            setLogs(result.data);
            calculateStats(result.data);
        }
        setLoading(false);
    };

    const calculateStats = (data: GrowthLog[]) => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let sysMonth = 0;
        let sysYear = 0;
        let userMonth = 0;
        let userYear = 0;

        data.forEach(log => {
            const logDate = new Date(log.timestamp);
            const isMonth = logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear;
            const isYear = logDate.getFullYear() === currentYear;

            if (log.type === "new_system") {
                if (isMonth) sysMonth++;
                if (isYear) sysYear++;
            } else if (log.type === "user_increase") {
                const increase = (log.nuevo_valor || 0) - (log.valor_anterior || 0);
                if (increase > 0) {
                    if (isMonth) userMonth += increase;
                    if (isYear) userYear += increase;
                }
            }
        });

        setStats({
            newSystemsMonth: sysMonth,
            newSystemsYear: sysYear,
            userGrowthMonth: userMonth,
            userGrowthYear: userYear
        });
    };

    if (!isOpen) return null;

    const newSystemsLogs = logs.filter(l => l.type === "new_system");
    const userGrowthLogs = logs.filter(l => l.type === "user_increase");

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: 'var(--bg-main)',
                borderRadius: '8px',
                padding: '20px',
                width: '90%',
                maxWidth: '1200px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                border: '1px solid var(--border-color)',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Reporte de Crecimiento</h2>
                    <button onClick={onClose} style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        color: 'var(--text-muted)'
                    }}>&times;</button>
                </div>

                {/* Stats Header */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '15px',
                    padding: '15px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)'
                }}>
                    <StatCard title="Sistemas Nuevos (Mes)" value={stats.newSystemsMonth} />
                    <StatCard title="Sistemas Nuevos (Año)" value={stats.newSystemsYear} />
                    <StatCard title="Usuarios Nuevos (Mes)" value={stats.userGrowthMonth} />
                    <StatCard title="Usuarios Nuevos (Año)" value={stats.userGrowthYear} />
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '20px',
                    overflow: 'hidden',
                    flex: 1
                }}>
                    {/* Nuevos Sistemas Table */}
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <h3 style={{ marginBottom: '10px', fontWeight: '600' }}>Nuevos Sistemas</h3>
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)'
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                <thead style={{
                                    backgroundColor: 'var(--bg-secondary)',
                                    position: 'sticky',
                                    top: 0
                                }}>
                                    <tr>
                                        <th style={thStyle}>Empresa</th>
                                        <th style={thStyle}>Url</th>
                                        <th style={thStyle}>Fecha</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {newSystemsLogs.length === 0 ? (
                                        <tr><td colSpan={3} style={tdStyle}>Sin registros recientes</td></tr>
                                    ) : (
                                        newSystemsLogs.map(log => (
                                            <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={tdStyle}>{log.empresa}</td>
                                                <td style={tdStyle}>{log.url}</td>
                                                <td style={tdStyle}>{log.date}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Crecimiento Usuarios Table */}
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <h3 style={{ marginBottom: '10px', fontWeight: '600' }}>Crecimiento Usuarios</h3>
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)'
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                <thead style={{
                                    backgroundColor: 'var(--bg-secondary)',
                                    position: 'sticky',
                                    top: 0
                                }}>
                                    <tr>
                                        <th style={thStyle}>Empresa</th>
                                        <th style={thStyle}>Ant.</th>
                                        <th style={thStyle}>Nuevo</th>
                                        <th style={thStyle}>Fecha</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {userGrowthLogs.length === 0 ? (
                                        <tr><td colSpan={4} style={tdStyle}>Sin registros recientes</td></tr>
                                    ) : (
                                        userGrowthLogs.map(log => (
                                            <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={tdStyle}>{log.empresa}</td>
                                                <td style={tdStyle}>{log.valor_anterior}</td>
                                                <td style={tdStyle}>{log.nuevo_valor}</td>
                                                <td style={tdStyle}>{log.date}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const StatCard = ({ title, value }: { title: string, value: number }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{title}</span>
        <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{value}</span>
    </div>
);

const thStyle: React.CSSProperties = {
    padding: '10px',
    textAlign: 'left',
    borderBottom: '1px solid var(--border-color)',
    fontWeight: '600'
};

const tdStyle: React.CSSProperties = {
    padding: '10px',
    color: 'var(--text-main)'
};
