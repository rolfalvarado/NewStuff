"use client";

import { MonitoredUser } from "@/app/actions/get-monitored-users";
import { useState, useMemo, useEffect } from "react";
import Image from "next/image";

interface UsuariosGridProps {
    initialUsers: MonitoredUser[];
}

export default function UsuariosGrid({ initialUsers }: UsuariosGridProps) {
    const [users] = useState<MonitoredUser[]>(initialUsers);
    const [sortConfig, setSortConfig] = useState<{ key: keyof MonitoredUser | null; direction: 'asc' | 'desc' }>({
        key: null,
        direction: 'asc',
    });

    // Filter State
    const [filters, setFilters] = useState<{ [key: string]: string | null }>({});

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 25;

    const handleSort = (key: keyof MonitoredUser) => {
        let direction: 'asc' | 'desc' = 'asc';

        if (sortConfig.key === key) {
            direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // Initial sort for dates usually desc
            if (key === 'tipo_ultima_conex') {
                direction = 'desc';
            }
        }

        setSortConfig({ key, direction });
    };

    const handleFilter = (key: string, value: string | null) => {
        setFilters(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const parseDate = (dateStr: string) => {
        if (!dateStr) return -1;
        // Handle "00-00-00 00:00:00" generic format as lowest value
        if (dateStr.startsWith("00-00-00") || dateStr.startsWith("00/00/00")) return -1;

        try {
            // Format: "28-12-2025 06:28:53 WEB"
            const parts = dateStr.split(' ');
            if (parts.length < 2) return -1;
            const [datePart, timePart] = parts;
            const [day, month, year] = datePart.split(/[-/]/);
            if (!year || !month || !day) return -1;
            const t = new Date(`${year}-${month}-${day}T${timePart}`).getTime();
            return isNaN(t) ? -1 : t;
        } catch (e) {
            return -1;
        }
    };

    // Define columns configuration
    const columns = [
        { header: "Nombres", accessor: "nombres", searchable: true },
        { header: "Apellido Paterno", accessor: "ape_paterno", searchable: true },
        { header: "Login", accessor: "login", searchable: true },
        { header: "Email", accessor: "email", searchable: true },
        { header: "URL Sitio", accessor: "hostname", searchable: true }, // As requested
        { header: "Tipo Ultima Conex", accessor: "tipo_ultima_conex", sortable: true },
    ];

    const processedUsers = useMemo(() => {
        let items = [...users];

        // Apply Filters
        Object.keys(filters).forEach(key => {
            const filterValue = filters[key];
            if (filterValue) {
                items = items.filter(item => {
                    const rawVal = item[key as keyof MonitoredUser];
                    const itemValue = String(rawVal === undefined || rawVal === null ? "" : rawVal);
                    return itemValue.toLowerCase().includes(filterValue.toLowerCase());
                });
            }
        });

        // Apply Sort
        if (sortConfig.key !== null) {
            items.sort((a, b) => {
                let aValue: any = a[sortConfig.key!] ?? "";
                let bValue: any = b[sortConfig.key!] ?? "";

                if (sortConfig.key === 'tipo_ultima_conex') {
                    aValue = parseDate(aValue);
                    bValue = parseDate(bValue);
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return items;
    }, [users, sortConfig, filters]);

    // Calculate column widths
    const columnWidths = useMemo(() => {
        const widths: { [key: string]: number } = {};
        columns.forEach(col => {
            let maxLen = col.header.length;
            processedUsers.forEach(u => {
                let val = u[col.accessor as keyof MonitoredUser];
                if (val !== undefined && val !== null) {
                    const strLen = String(val).length;
                    if (strLen > maxLen) maxLen = strLen;
                }
            });
            let padding = 4;
            if (col.sortable) padding += 3;
            if (col.searchable) padding += 0; // search input takes space but width is mainly content
            widths[col.accessor] = maxLen + padding;
        });
        return widths;
    }, [processedUsers, columns]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filters, sortConfig]);

    const paginatedUsers = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return processedUsers.slice(startIndex, startIndex + itemsPerPage);
    }, [processedUsers, currentPage]);

    const totalPages = Math.ceil(processedUsers.length / itemsPerPage);

    return (
        <div style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            border: "1px solid #E5E7EB",
            backgroundColor: "#FFFFFF"
        }}>
            {/* The Grid Container */}
            <div style={{ flex: 1, overflow: "auto" }}>
                <table style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.80rem",
                    fontFamily: "var(--font-mono, monospace)",
                    whiteSpace: "nowrap"
                }}>
                    <thead style={{
                        position: "sticky",
                        top: 0,
                        backgroundColor: "#F3F4F6",
                        zIndex: 10
                    }}>
                        {/* Search Row */}
                        <tr>
                            <th style={{
                                border: "1px solid #D1D5DB",
                                backgroundColor: "#E5E7EB",
                                padding: "0.25rem"
                            }}></th>
                            {columns.map((col) => (
                                <th key={`search-${col.accessor}`} style={{
                                    border: "1px solid #D1D5DB",
                                    padding: "0.25rem",
                                    textAlign: "left",
                                    backgroundColor: "#E5E7EB"
                                }}>
                                    {col.searchable ? (
                                        <input
                                            type="text"
                                            placeholder="..."
                                            value={filters[col.accessor] || ""}
                                            onChange={(e) => handleFilter(col.accessor, e.target.value)}
                                            style={{
                                                width: "100%",
                                                padding: "0.1rem 0.25rem",
                                                fontSize: "0.75rem",
                                                border: "1px solid #D1D5DB",
                                                borderRadius: "2px",
                                                outline: "none"
                                            }}
                                        />
                                    ) : null}
                                </th>
                            ))}
                        </tr>
                        {/* Header Title Row */}
                        <tr>
                            <th style={{
                                border: "1px solid #D1D5DB",
                                padding: "0.25rem 0.5rem",
                                textAlign: "center",
                                width: "40px",
                                backgroundColor: "#E5E7EB",
                                color: "#374151",
                                fontWeight: "600"
                            }}>
                                #
                            </th>
                            {columns.map((col) => (
                                <th key={col.accessor} style={{
                                    border: "1px solid #D1D5DB",
                                    padding: "0.25rem 0.75rem",
                                    textAlign: "left",
                                    color: "#374151",
                                    fontWeight: "600",
                                    userSelect: "none",
                                    position: "relative",
                                    minWidth: `${columnWidths[col.accessor]}ch`
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "space-between" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            {col.header}
                                            {col.sortable && (
                                                <button
                                                    onClick={() => handleSort(col.accessor as keyof MonitoredUser)}
                                                    style={{
                                                        background: "none",
                                                        border: "none",
                                                        cursor: "pointer",
                                                        padding: 0,
                                                        display: "flex",
                                                        alignItems: "center"
                                                    }}
                                                >
                                                    <Image
                                                        src="/Icons/sortb.svg"
                                                        alt="Sort"
                                                        width={14}
                                                        height={14}
                                                        style={{ objectFit: "contain", opacity: sortConfig.key === col.accessor ? 1 : 0.4 }}
                                                    />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedUsers.map((user, index) => (
                            <tr key={user.id || index} style={{ backgroundColor: index % 2 === 0 ? "#FFFFFF" : "#F9FAFB" }}>
                                <td style={{
                                    border: "1px solid #E5E7EB",
                                    borderRight: "1px solid #D1D5DB",
                                    padding: "0.25rem 0.5rem",
                                    textAlign: "center",
                                    backgroundColor: "#F3F4F6",
                                    color: "#6B7280"
                                }}>
                                    {(currentPage - 1) * itemsPerPage + index + 1}
                                </td>
                                {columns.map((col) => {
                                    const value = user[col.accessor as keyof MonitoredUser];
                                    return (
                                        <td key={col.accessor} style={{
                                            border: "1px solid #E5E7EB",
                                            padding: "0.25rem 0.75rem",
                                            color: "#111827"
                                        }}>
                                            {col.accessor === 'hostname' && value ? (
                                                <a
                                                    href={String(value).startsWith('http') ? String(value) : `https://${value}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        color: "#2563EB",
                                                        textDecoration: "none"
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = "underline"}
                                                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = "none"}
                                                >
                                                    {String(value)}
                                                </a>
                                            ) : (
                                                String(value ?? "")
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination Footer */}
            <div style={{
                padding: "0.5rem 1rem",
                borderTop: "1px solid #E5E7EB",
                backgroundColor: "#F9FAFB",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.80rem",
                color: "#374151"
            }}>
                <div>
                    Mostrando {processedUsers.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} - {Math.min(currentPage * itemsPerPage, processedUsers.length)} de {processedUsers.length} registros
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        style={{
                            padding: "0.25rem 0.75rem",
                            border: "1px solid #D1D5DB",
                            borderRadius: "4px",
                            backgroundColor: currentPage === 1 ? "#E5E7EB" : "#FFFFFF",
                            color: currentPage === 1 ? "#9CA3AF" : "#374151",
                            cursor: currentPage === 1 ? "not-allowed" : "pointer"
                        }}
                    >
                        Anterior
                    </button>
                    <span>Página {currentPage} de {totalPages || 1}</span>
                    <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages || totalPages === 0}
                        style={{
                            padding: "0.25rem 0.75rem",
                            border: "1px solid #D1D5DB",
                            borderRadius: "4px",
                            backgroundColor: (currentPage === totalPages || totalPages === 0) ? "#E5E7EB" : "#FFFFFF",
                            color: (currentPage === totalPages || totalPages === 0) ? "#9CA3AF" : "#374151",
                            cursor: (currentPage === totalPages || totalPages === 0) ? "not-allowed" : "pointer"
                        }}
                    >
                        Siguiente
                    </button>
                </div>
            </div>
        </div>
    );
}

