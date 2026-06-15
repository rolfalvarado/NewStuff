"use client";

import { System } from "@/app/actions/get-systems";
import { ServerPublic } from "@/app/actions/get-servers";
import { useState, useMemo, useEffect } from "react";
import Image from "next/image";

interface DatosGridProps {
    initialSystems: System[];
    initialServers: ServerPublic[];
}

export default function DatosGrid({ initialSystems, initialServers }: DatosGridProps) {
    const [systems] = useState<System[]>(initialSystems);
    const [servers] = useState<ServerPublic[]>(initialServers);
    const [sortConfig, setSortConfig] = useState<{ key: keyof System | null; direction: 'asc' | 'desc' }>({
        key: null,
        direction: 'asc',
    });

    // Filter State
    const [filters, setFilters] = useState<{ [key: string]: string | null }>({});
    const [openFilter, setOpenFilter] = useState<string | null>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 25;

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setOpenFilter(null);
        if (openFilter) {
            window.addEventListener('click', handleClickOutside);
        }
        return () => window.removeEventListener('click', handleClickOutside);
    }, [openFilter]);

    const handleSort = (key: keyof System) => {
        let direction: 'asc' | 'desc' = 'asc';

        if (sortConfig.key === key) {
            direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // Initial sort direction for ultima_conexion should be descending (newest first)
            if (key === 'ultima_conexion') {
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

    const getValue = (system: System, accessor: string) => {
        // Integration with Servers Table - String conversion to handle numeric names correctly (e.g., 200, 222)
        const linkedServer = servers.find(s => String(s.nombre_servidor) === String(system.nombre_servidor));

        if (accessor === 'ip_sitio') {
            return linkedServer?.ip_servidor || '-';
        }
        if (accessor === 'version_sistema') {
            return linkedServer?.version_sistema || '-';
        }
        if (accessor === 'memoria_sistema') {
            return linkedServer?.tipo_instancia || '-';
        }

        if (accessor.startsWith('actividad_')) {
            const index = parseInt(accessor.replace('actividad_', ''));
            return system.actividad && system.actividad.length > index ? system.actividad[index] : "";
        }

        if (accessor.startsWith('mod_')) {
            const moduleName = accessor.replace('mod_', '');
            return (system.modulos_activos || []).includes(moduleName) ? "Si" : "No";
        }
        return system[accessor as keyof System];
    };

    // Calculate unique values for a column
    const getUniqueValues = (key: keyof System) => {
        const values = new Set<string>();
        systems.forEach(s => {
            const val = getValue(s, key as string);
            if (val !== undefined && val !== null && val !== "") {
                values.add(String(val));
            }
        });
        return Array.from(values).sort();
    };

    const formatDate = (dateStr: string | undefined) => {
        if (!dateStr) return "-";
        // Handle ISO string or YYYY-MM-DD
        const simpleDate = dateStr.split('T')[0];
        if (simpleDate.includes('-')) {
            const parts = simpleDate.split('-');
            if (parts.length === 3) {
                const [year, month, day] = parts;
                return `${day}/${month}/${year.slice(-2)}`;
            }
        }
        return dateStr;
    };

    const maxActividades = useMemo(() => {
        return Math.max(...systems.map(s => s.actividad?.length || 0), 1);
    }, [systems]);

    // Define columns configuration
    const columns = useMemo(() => {
        const cols: any[] = [
            { header: "Empresa", accessor: "nombre_empresa", searchable: true },
            { header: "URL Sitio", accessor: "url_sitio", searchable: true },
            { header: "Holding", accessor: "holding", filterable: true, searchable: true },
            { header: "País", accessor: "pais", filterable: true },
            { header: "Giro", accessor: "giro", filterable: true },
        ];

        for (let i = 0; i < maxActividades; i++) {
            cols.push({ header: `Actividad ${i + 1}`, accessor: `actividad_${i}`, filterable: true });
        }

        cols.push(
            { header: "Servidor", accessor: "nombre_servidor", filterable: true },
            { header: "IP Sitio", accessor: "ip_sitio" },
            { header: "Estado", accessor: "estado_sitio", filterable: true },
            { header: "Usuarios", accessor: "usuarios_totales", sortable: true },
            { header: "Ult. Conexión", accessor: "ultima_conexion", sortable: true },
            { header: "Contratados", accessor: "usuarios_contratados", sortable: true },
            { header: "Versión", accessor: "version_sistema", filterable: true },
            { header: "Memoria", accessor: "memoria_sistema", filterable: true },
            { header: "Backup", accessor: "ultimo_backup", sortable: true },
            { header: "Renovación", accessor: "fecha_renovacion" },
            { header: "Base", accessor: "mod_Base", filterable: true },
            { header: "Amazon", accessor: "mod_Amazon", filterable: true },
            { header: "Bandeja", accessor: "mod_Bandeja", filterable: true },
            { header: "Contabilidad", accessor: "mod_Contabilidad", filterable: true },
            { header: "Fac.cl", accessor: "mod_Fac.cl", filterable: true }
        );
        return cols;
    }, [maxActividades]);

    const processedSystems = useMemo(() => {
        let items = [...systems];

        // Apply Filters
        Object.keys(filters).forEach(key => {
            const filterValue = filters[key];
            if (filterValue) {
                // Find column def to check if it's a search field or a dropdown filter
                const colDef = columns.find(c => c.accessor === key);

                items = items.filter(item => {
                    const rawVal = getValue(item, key);
                    const itemValue = String(rawVal === undefined || rawVal === null ? "" : rawVal);

                    if (colDef?.searchable) {
                        return itemValue.toLowerCase().includes(filterValue.toLowerCase());
                    }
                    // Exact match for dropdown filters
                    return itemValue === filterValue;
                });
            }
        });

        // Apply Sort
        if (sortConfig.key !== null) {
            items.sort((a, b) => {
                const aValue = getValue(a, sortConfig.key as string) ?? 0;
                const bValue = getValue(b, sortConfig.key as string) ?? 0;

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
    }, [systems, sortConfig, filters]);

    // Calculate column widths based on the maximum content length in the filtered dataset
    const columnWidths = useMemo(() => {
        const widths: { [key: string]: number } = {};
        columns.forEach(col => {
            let maxLen = col.header.length;
            processedSystems.forEach(sys => {
                let val: any = getValue(sys, col.accessor);
                if (col.accessor === 'ultima_conexion' && typeof val === 'string') {
                    val = formatDate(val);
                }

                if (val !== undefined && val !== null) {
                    const strLen = String(val).length;
                    if (strLen > maxLen) maxLen = strLen;
                }
            });
            // Add padding for sort/filter icons + breathing room
            // Base padding + extra for sort/filter buttons if present
            let padding = 4;
            if (col.sortable) padding += 3;
            if (col.filterable) padding += 3;

            widths[col.accessor] = maxLen + padding;
        });
        return widths;
    }, [processedSystems, columns]);

    // Reset page when filters or sort change
    useEffect(() => {
        setCurrentPage(1);
    }, [filters, sortConfig]);

    const paginatedSystems = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return processedSystems.slice(startIndex, startIndex + itemsPerPage);
    }, [processedSystems, currentPage]);

    const totalPages = Math.ceil(processedSystems.length / itemsPerPage);

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
                            {/* Row Number Column Header */}
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
                                                    onClick={() => handleSort(col.accessor as keyof System)}
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

                                        {/* Filter Button */}
                                        {col.filterable && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenFilter(openFilter === col.accessor ? null : col.accessor);
                                                }}
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
                                                    src="/Icons/filter-list-circle-solid.svg"
                                                    alt="Filter"
                                                    width={16}
                                                    height={16}
                                                    style={{
                                                        objectFit: "contain",
                                                        opacity: filters[col.accessor] ? 1 : 0.4,
                                                        filter: filters[col.accessor] ? "invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg) brightness(104%) contrast(97%)" : "none"
                                                    }}
                                                />
                                            </button>
                                        )}
                                    </div>

                                    {/* Filter Dropdown */}
                                    {col.filterable && openFilter === col.accessor && (
                                        <div
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                position: "absolute",
                                                top: "100%",
                                                right: 0,
                                                backgroundColor: "#FFFFFF",
                                                border: "1px solid #D1D5DB",
                                                borderRadius: "4px",
                                                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                                                zIndex: 20,
                                                minWidth: "150px",
                                                maxHeight: "300px",
                                                overflowY: "auto",
                                                marginTop: "4px"
                                            }}
                                        >
                                            <div
                                                onClick={() => {
                                                    handleFilter(col.accessor, null);
                                                    setOpenFilter(null);
                                                }}
                                                style={{
                                                    padding: "0.5rem 1rem",
                                                    cursor: "pointer",
                                                    fontSize: "0.75rem",
                                                    color: !filters[col.accessor] ? "#2563EB" : "#374151",
                                                    fontWeight: !filters[col.accessor] ? "600" : "400",
                                                    backgroundColor: !filters[col.accessor] ? "#F3F4F6" : "transparent"
                                                }}
                                            >
                                                Todos
                                            </div>
                                            {getUniqueValues(col.accessor as keyof System).map((val) => (
                                                <div
                                                    key={val}
                                                    onClick={() => {
                                                        handleFilter(col.accessor, val);
                                                        setOpenFilter(null);
                                                    }}
                                                    style={{
                                                        padding: "0.5rem 1rem",
                                                        cursor: "pointer",
                                                        fontSize: "0.75rem",
                                                        color: filters[col.accessor] === val ? "#2563EB" : "#374151",
                                                        fontWeight: filters[col.accessor] === val ? "600" : "400",
                                                        backgroundColor: filters[col.accessor] === val ? "#F3F4F6" : "transparent",
                                                        borderTop: "1px solid #F3F4F6"
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#F9FAFB"}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = filters[col.accessor] === val ? "#F3F4F6" : "transparent"}
                                                >
                                                    {val}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedSystems.map((system, index) => (
                            <tr key={index} style={{ backgroundColor: index % 2 === 0 ? "#FFFFFF" : "#F9FAFB" }}>
                                {/* Row Number */}
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

                                {/* Data Cells */}
                                {columns.map((col) => {
                                    const value = getValue(system, col.accessor);
                                    let displayValue: any = value;

                                    if (col.accessor === 'ultima_conexion' && typeof value === 'string') {
                                        displayValue = formatDate(value);
                                    }

                                    return (
                                        <td key={col.accessor} style={{
                                            border: "1px solid #E5E7EB",
                                            padding: "0.25rem 0.75rem",
                                            color: "#111827"
                                        }}>
                                            {col.accessor === 'url_sitio' && value ? (
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
                                                    {displayValue as React.ReactNode}
                                                </a>
                                            ) : (
                                                (displayValue === true ? "Yes" : displayValue === false ? "No" : displayValue) as React.ReactNode
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
                    Mostrando {processedSystems.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} - {Math.min(currentPage * itemsPerPage, processedSystems.length)} de {processedSystems.length} registros
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

