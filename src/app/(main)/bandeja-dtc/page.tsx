"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/app/actions/auth";


async function siiProxy(endpoint: string, method: string = "GET", payload?: any) {
    const res = await fetch("/api/sii-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, method, payload }),
    });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
        const text = await res.text();
        console.error("[siiProxy] Respuesta no-JSON:", text.substring(0, 200));
        return {
            success: false,
            ok: false,
            error: `El servidor devolvió una respuesta inesperada (status ${res.status})`,
            message: `Error de comunicación con el servidor (status ${res.status})`,
        };
    }

    return res.json();
}


interface Client {
    id: string;
    label: string;
    subdomain: string;
    rut: string;
    clave: string;
    rutApoderado: string;
    claveApoderado: string;
    estado: string | boolean;
}

interface UserItem {
    id: string;
    name: string;
    email: string;
    role: string;
    avatarUrl: string | null;
}


function normalizeClient(val: string): string {
    let v = val.replace(/\s+/g, "").toLowerCase();
    if (!v) return "";
    if (!v.includes(".")) v = `${v}.unabase.com`;
    return v.replace(/^https?:\/\//, "");
}

function formatRut(val: string): string {
    let r = val.replace(/[^\dkK]/g, "").toUpperCase();
    if (!r) return "";
    const body = r.slice(0, -1);
    const dv = r.slice(-1);
    const bodyFmt = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${bodyFmt}-${dv}`;
}

const HORAS_OPTIONS = [
    "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
    "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
    "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
];


export default function BandejaDTCPage() {
    const router = useRouter();

    useEffect(() => {
        getCurrentUser().then((u) => {
            if (u?.email === 'administracion') {
                router.push('/sistemas');
            }
        });
    }, [router]);


    const [clients, setClients] = useState<Client[]>([]);
    const [loadingClients, setLoadingClients] = useState(false);
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
    const [clientSearch, setClientSearch] = useState("");
    const [showClientDropdown, setShowClientDropdown] = useState(false);


    const [form, setForm] = useState({
        clientSubdomain: "",
        rut: "",
        claveSii: "",
        rutApoderado: "",
        claveApoderado: "",
        enabled: true,
        scraping_diario: true,
        horas_envio: ["08:30"] as string[],
        isEnabledUser: true,
    });
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [showSiiPass, setShowSiiPass] = useState(false);
    const [showApoderadoPass, setShowApoderadoPass] = useState(false);
    const [testingSii, setTestingSii] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; msg: string }>({ ok: false, msg: "" });


    const [users, setUsers] = useState<UserItem[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [usersSearch, setUsersSearch] = useState("");
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [savingRecipients, setSavingRecipients] = useState(false);


    const [snackbar, setSnackbar] = useState<{ show: boolean; message: string }>({ show: false, message: "" });

    const showSnackbar = useCallback((msg: string) => {
        setSnackbar({ show: true, message: msg });
        setTimeout(() => setSnackbar({ show: false, message: "" }), 4000);
    }, []);


    const filteredClients = useMemo(() => {
        const q = clientSearch.toLowerCase().trim();
        if (!q) return clients;
        return clients.filter(c => c.label.toLowerCase().includes(q));
    }, [clients, clientSearch]);

    const filteredUsers = useMemo(() => {
        const q = usersSearch.toLowerCase().trim();
        if (!q) return users;
        return users.filter(u =>
            u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
        );
    }, [users, usersSearch]);

    const canTestSii = !!(form.rut && form.claveSii);
    const canSaveConfig = !!(form.clientSubdomain && form.rut && form.claveSii);

    const selectedClient = useMemo(() =>
        clients.find(c => c.id === selectedClientId) || null
        , [clients, selectedClientId]);


    useEffect(() => {
        loadClients();
    }, []);


    async function loadClients() {
        setLoadingClients(true);
        try {
            const data = await siiProxy("roma:/sii/list?limit=1000");
            const list = Array.isArray(data?.data) ? data.data : [];
            const mapped: Client[] = list.map((c: any) => ({
                id: c._id,
                label: `${c.empresa} — ${c.rut}`,
                subdomain: c.empresa,
                rut: c.rut,
                clave: c.clave,
                rutApoderado: c.rutApoderado || "",
                claveApoderado: c.claveApoderado || "",
                estado: c.estado,
            }));
            setClients(mapped);
            showSnackbar("Listo");
        } catch (e) {
            console.error("Error cargando clientes:", e);
            setClients([]);
        } finally {
            setLoadingClients(false);
        }
    }

    async function fetchUsersByClient(empresa: string) {
        try {
            const data = await siiProxy(`roma:/sii/clients/${empresa}/users?limit=1000`);
            const usersRaw = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
            const mapped: UserItem[] = usersRaw.map((u: any) => ({
                id: u.id || u._id,
                name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.name || "",
                email: u.email,
                role: u.role || "",
                avatarUrl: u.profilePicture || u.avatarUrl || null,
            }));
            const preselected = Array.isArray(data?.selectedRecipientIds)
                ? data.selectedRecipientIds.map(String)
                : [];
            setUsers(mapped);
            setSelectedUserIds(preselected);
            return { users: mapped, preselected };
        } catch (e) {
            console.error("Error cargando usuarios:", e);
            setUsers([]);
            setSelectedUserIds([]);
            return { users: [], preselected: [] };
        }
    }

    async function fetchSiiConfig(clientId: string) {
        try {
            const data = await siiProxy(`roma:/sii/config/${clientId}`);
            return data;
        } catch (e) {
            return null;
        }
    }


    async function onClientChanged(clientId: string | null) {
        setSelectedClientId(clientId);
        setShowClientDropdown(false);

        const c = clients.find(x => x.id === clientId);
        if (c) {
            setForm(prev => ({
                ...prev,
                clientSubdomain: c.subdomain || "",
                rut: c.rut || "",
                claveSii: c.clave || "",
                rutApoderado: c.rutApoderado || "",
                claveApoderado: c.claveApoderado || "",
                isEnabledUser: c.estado === "ACTIVO" || c.estado === true,
            }));
            setClientSearch(c.label);
        } else {
            setForm({
                clientSubdomain: "",
                rut: "",
                claveSii: "",
                rutApoderado: "",
                claveApoderado: "",
                enabled: true,
                scraping_diario: true,
                horas_envio: ["08:30"],
                isEnabledUser: true,
            });
            setClientSearch("");
        }

        setUsersSearch("");

        if (!clientId || !c) {
            setUsers([]);
            setSelectedUserIds([]);
            return;
        }

        setLoadingUsers(true);
        try {
            const [usersResult] = await Promise.all([
                fetchUsersByClient(c.subdomain),
                loadSiiConfig(clientId),
            ]);
            if (usersResult && Array.isArray(usersResult.preselected)) {
                setSelectedUserIds(usersResult.preselected);
            }
            showSnackbar("Actualizado con éxito");
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingUsers(false);
        }
    }

    async function loadSiiConfig(clientId: string) {
        if (!clientId) return;
        try {
            const data = await fetchSiiConfig(clientId);
            if (data) {
                setForm(prev => ({
                    ...prev,
                    clientSubdomain: data.clientHost || data.host || prev.clientSubdomain || "",
                    rut: data.rut ? formatRut(String(data.rut)) : prev.rut || "",
                    rutApoderado: data.rutApoderado ? formatRut(String(data.rutApoderado)) : prev.rutApoderado || "",
                    enabled: data.estado === "ACTIVO" || !!data.enabled,
                    horas_envio: Array.isArray(data.horas_envio) && data.horas_envio.length
                        ? data.horas_envio
                        : prev.horas_envio,
                    claveSii: prev.claveSii || "",
                    claveApoderado: prev.claveApoderado || "",
                }));
            }
        } catch (e) {
            setForm(prev => ({
                ...prev,
                enabled: true,
                horas_envio: prev.horas_envio || ["08:30"],
                claveSii: prev.claveSii || "",
                claveApoderado: prev.claveApoderado || "",
            }));
        }
    }

    async function testSiiLogin() {
        if (!canTestSii || !selectedClientId) return;
        setTestingSii(true);
        setTestResult({ ok: false, msg: "" });

        try {
            const rutPlain = form.rut.replace(/\./g, "");
            const payload: any = {
                rut: rutPlain,
                clave: form.claveSii,
                clientId: selectedClientId,
                empresa: form.clientSubdomain || undefined,
            };

            // Incluir datos de apoderado si están presentes
            if (form.rutApoderado) {
                payload.rutApoderado = form.rutApoderado.replace(/\./g, "");
            }
            if (form.claveApoderado) {
                payload.claveApoderado = form.claveApoderado;
            }

            // Incluir rango de fechas si están presentes
            if (dateFrom) {
                payload.dateFrom = dateFrom;
            }
            if (dateTo) {
                payload.dateTo = dateTo;
            }

            const data = await siiProxy("frank:/sii/load", "POST", { payload });

            if (data?.error || data?.success === false) {
                throw new Error(data?.message || data?.error || "Error al verificar SII");
            }

            if (data?.success || data?.ok) {
                setTestResult({ ok: true, msg: "Conexión SII exitosa ✅" });
                showSnackbar("Carga completada, ya puedes revisar la bandeja dtc");
            } else {
                throw new Error(data?.message || "Error al verificar SII");
            }

        } catch (e: any) {
            setTestResult({ ok: false, msg: e?.message || "Error al verificar SII" });
        } finally {
            setTestingSii(false);
        }
    }

    async function saveSiiConfig() {
        const normalized = normalizeClient(form.clientSubdomain);
        setForm(prev => ({ ...prev, clientSubdomain: normalized }));
        setSavingConfig(true);

        try {
            const payload: any = {
                empresa: normalized,
                rut: form.rut.replace(/\./g, ""),
                ...(form.claveSii ? { clave: form.claveSii } : {}),
                ...(form.rutApoderado ? { rutApoderado: form.rutApoderado.replace(/\./g, "") } : {}),
                ...(form.claveApoderado ? { claveApoderado: form.claveApoderado } : {}),
                estado: !!form.enabled,
                horas_envio: form.horas_envio,
                scraping_diario: form.scraping_diario,
            };

            const url = selectedClientId
                ? `roma:/sii/update/${selectedClientId}`
                : `roma:/sii/save`;
            const method = selectedClientId ? "PUT" : "POST";

            const data = await siiProxy(url, method, payload);
            if (data?.success === false || data?.ok === false) {
                showSnackbar("No se pudo guardar la configuración");
            } else {
                showSnackbar("Configuración SII guardada");
            }
        } catch (e: any) {
            showSnackbar(e?.message || "Error al guardar la configuración");
        } finally {
            setSavingConfig(false);
        }
    }

    async function saveRecipients() {
        if (!selectedClientId) return;
        setSavingRecipients(true);
        try {
            const data = await siiProxy(`roma:/sii/recipients/${selectedClientId}`, "PUT", { userIds: selectedUserIds });
            if (data?.success || data?.ok) {
                showSnackbar("Destinatarios guardados");
            } else {
                throw new Error(data?.message || "No se pudo guardar los destinatarios");
            }
        } catch (e: any) {
            showSnackbar(e?.message || "Error al guardar destinatarios");
        } finally {
            setSavingRecipients(false);
        }
    }

    async function disableUser(val: boolean) {
        const c = clients.find(x => x.id === selectedClientId);
        if (!c) return;
        const prev = form.isEnabledUser;
        setForm(f => ({ ...f, isEnabledUser: val }));

        try {
            const data = await siiProxy(`roma:/sii/update/${c.id}`, "PUT", { estado: val });
            if (data?.success === false || data?.ok === false) {
                throw new Error("No se pudo actualizar el estado");
            }
            showSnackbar("Estado actualizado");
        } catch (e) {
            setForm(f => ({ ...f, isEnabledUser: prev }));
            showSnackbar("No se pudo actualizar el estado");
            console.error(e);
        }
    }

    function toggleUserSelection(userId: string) {
        setSelectedUserIds(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    }

    function selectAll() {
        setSelectedUserIds(filteredUsers.map(u => u.id));
    }

    function clearSelection() {
        setSelectedUserIds([]);
    }

    function toggleHora(h: string) {
        setForm(prev => ({
            ...prev,
            horas_envio: prev.horas_envio.includes(h)
                ? prev.horas_envio.filter(x => x !== h)
                : [...prev.horas_envio, h],
        }));
    }


    return (
        <div className="container" style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            paddingTop: "1rem",
            paddingBottom: "1rem",
            gap: "1rem"
        }}>
            {/* Header */}
            <div className="card-panel" style={{
                padding: "1.5rem 2rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1rem"
            }}>
                <div>
                    <h2 style={{ fontSize: "1.25rem", color: "var(--text-main)", margin: 0 }}>
                        Bot SII · Configurador
                    </h2>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0.25rem 0 0" }}>
                        Selecciona un cliente para configurar el scraping del SII y los destinatarios del email diario.
                    </p>
                </div>

                {/* Client Selector */}
                <div style={{ position: "relative", width: "320px" }}>
                    <input
                        type="text"
                        value={clientSearch}
                        onChange={(e) => {
                            setClientSearch(e.target.value);
                            setShowClientDropdown(true);
                        }}
                        onFocus={() => setShowClientDropdown(true)}
                        placeholder={loadingClients ? "Cargando..." : "Buscar cliente..."}
                        disabled={loadingClients}
                        style={{
                            width: "100%",
                            padding: "0.6rem 1rem",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-color)",
                            background: "var(--bg-card)",
                            color: "var(--text-main)",
                            fontSize: "13px",
                            outline: "none",
                        }}
                    />
                    {clientSearch && (
                        <button
                            onClick={() => {
                                setClientSearch("");
                                onClientChanged(null);
                            }}
                            style={{
                                position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
                                background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
                                fontSize: "16px"
                            }}
                        >×</button>
                    )}
                    {showClientDropdown && filteredClients.length > 0 && (
                        <div style={{
                            position: "absolute", top: "100%", left: 0, right: 0,
                            maxHeight: "250px", overflow: "auto",
                            background: "var(--bg-card)", border: "1px solid var(--border-color)",
                            borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-md)",
                            zIndex: 100, marginTop: "4px"
                        }}>
                            {filteredClients.map(c => (
                                <div
                                    key={c.id}
                                    onClick={() => onClientChanged(c.id)}
                                    style={{
                                        padding: "0.5rem 1rem", cursor: "pointer",
                                        fontSize: "13px", color: "var(--text-main)",
                                        backgroundColor: c.id === selectedClientId ? "var(--bg-main)" : "transparent",
                                        borderBottom: "1px solid var(--border-color)",
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bg-main)"}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = c.id === selectedClientId ? "var(--bg-main)" : "transparent"}
                                >
                                    {c.label}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Two-column Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", flex: 1, minHeight: 0 }}>

                {/* Panel 1: Configuración SII */}
                <div className="card-panel" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", overflow: "auto" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                        1) Configuración SII del Cliente
                    </h3>

                    {/* Subdominio */}
                    <div>
                        <label style={labelStyle}>Cliente (subdominio)</label>
                        <input
                            type="text"
                            value={form.clientSubdomain}
                            onChange={e => setForm(f => ({ ...f, clientSubdomain: e.target.value }))}
                            onBlur={() => setForm(f => ({ ...f, clientSubdomain: normalizeClient(f.clientSubdomain) }))}
                            placeholder="Ej: sud.unabase.com"
                            style={inputStyle}
                        />
                    </div>

                    {/* RUT + Clave */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                        <div>
                            <label style={labelStyle}>RUT SII</label>
                            <input
                                type="text"
                                value={form.rut}
                                onChange={e => setForm(f => ({ ...f, rut: e.target.value }))}
                                onBlur={() => setForm(f => ({ ...f, rut: formatRut(f.rut) }))}
                                placeholder="Ej: 12.345.678-9"
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Clave SII</label>
                            <div style={{ position: "relative" }}>
                                <input
                                    type={showSiiPass ? "text" : "password"}
                                    value={form.claveSii}
                                    onChange={e => setForm(f => ({ ...f, claveSii: e.target.value }))}
                                    style={{ ...inputStyle, paddingRight: "2.5rem" }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowSiiPass(!showSiiPass)}
                                    style={{
                                        position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
                                        background: "none", border: "none", cursor: "pointer",
                                        color: "var(--text-muted)", fontSize: "12px"
                                    }}
                                >
                                    {showSiiPass ? "Ocultar" : "Mostrar"}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* RUT Apoderado + Clave Apoderado */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                        <div>
                            <label style={labelStyle}>RUT Apoderado SII</label>
                            <input
                                type="text"
                                value={form.rutApoderado}
                                onChange={e => setForm(f => ({ ...f, rutApoderado: e.target.value }))}
                                onBlur={() => setForm(f => ({ ...f, rutApoderado: f.rutApoderado ? formatRut(f.rutApoderado) : "" }))}
                                placeholder="Ej: 12.345.678-9"
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Clave Apoderado SII</label>
                            <div style={{ position: "relative" }}>
                                <input
                                    type={showApoderadoPass ? "text" : "password"}
                                    value={form.claveApoderado}
                                    onChange={e => setForm(f => ({ ...f, claveApoderado: e.target.value }))}
                                    style={{ ...inputStyle, paddingRight: "2.5rem" }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApoderadoPass(!showApoderadoPass)}
                                    style={{
                                        position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
                                        background: "none", border: "none", cursor: "pointer",
                                        color: "var(--text-muted)", fontSize: "12px"
                                    }}
                                >
                                    {showApoderadoPass ? "Ocultar" : "Mostrar"}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Rango de fechas para prueba de carga */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                        <div>
                            <label style={labelStyle}>Fecha desde</label>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={e => setDateFrom(e.target.value)}
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Fecha hasta</label>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={e => setDateTo(e.target.value)}
                                style={inputStyle}
                            />
                        </div>
                    </div>

                    {/* Scraping + Horas */}
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.75rem", alignItems: "start" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "13px", color: "var(--text-main)", cursor: "pointer" }}>
                            <input
                                type="checkbox"
                                checked={form.scraping_diario}
                                onChange={e => setForm(f => ({ ...f, scraping_diario: e.target.checked }))}
                                style={{ width: "16px", height: "16px", cursor: "pointer" }}
                            />
                            Scraping diario
                        </label>

                        <div>
                            <label style={labelStyle}>Horas de actualización</label>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                                {HORAS_OPTIONS.map(h => (
                                    <button
                                        key={h}
                                        type="button"
                                        onClick={() => toggleHora(h)}
                                        style={{
                                            padding: "2px 8px",
                                            borderRadius: "999px",
                                            fontSize: "11px",
                                            border: form.horas_envio.includes(h) ? "1px solid var(--primary)" : "1px solid var(--border-color)",
                                            background: form.horas_envio.includes(h) ? "var(--primary)" : "transparent",
                                            color: form.horas_envio.includes(h) ? "#fff" : "var(--text-secondary)",
                                            cursor: "pointer",
                                            fontFamily: "inherit",
                                        }}
                                    >
                                        {h}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                        <button
                            className="btn btn-primary"
                            onClick={testSiiLogin}
                            disabled={!canTestSii || !selectedClientId || testingSii}
                            style={{ fontSize: "13px", padding: "0.5rem 1.25rem" }}
                        >
                            {testingSii ? "Probando..." : "Realizar prueba de carga"}
                        </button>
                        <button
                            className="btn"
                            onClick={saveSiiConfig}
                            disabled={!canSaveConfig || savingConfig}
                            style={{
                                fontSize: "13px", padding: "0.5rem 1.25rem",
                                background: "#16a34a", color: "white",
                                border: "none", borderRadius: "var(--radius-md)",
                                cursor: canSaveConfig && !savingConfig ? "pointer" : "not-allowed",
                                opacity: canSaveConfig && !savingConfig ? 1 : 0.5,
                            }}
                        >
                            {savingConfig ? "Guardando..." : "Guardar configuración"}
                        </button>
                        <label style={{
                            display: "flex", alignItems: "center", gap: "0.5rem",
                            fontSize: "13px", color: "var(--text-main)", cursor: "pointer", marginLeft: "auto"
                        }}>
                            <input
                                type="checkbox"
                                checked={form.isEnabledUser}
                                onChange={e => disableUser(e.target.checked)}
                                style={{ width: "16px", height: "16px", cursor: "pointer" }}
                            />
                            Empresa activa
                        </label>
                    </div>

                    {/* Test Result Alert */}
                    {testResult.msg && (
                        <div style={{
                            padding: "0.75rem 1rem",
                            borderRadius: "var(--radius-md)",
                            fontSize: "13px",
                            fontWeight: "500",
                            backgroundColor: testResult.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                            color: testResult.ok ? "#16a34a" : "#dc2626",
                            border: `1px solid ${testResult.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                        }}>
                            {testResult.msg}
                        </div>
                    )}
                </div>

                {/* Panel 2: Destinatarios */}
                <div className="card-panel" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", overflow: "hidden" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                        2) Destinatarios del Email Diario
                    </h3>

                    {/* Search */}
                    <input
                        type="text"
                        value={usersSearch}
                        onChange={e => setUsersSearch(e.target.value)}
                        placeholder="Buscar usuario"
                        disabled={loadingUsers || !selectedClientId}
                        style={inputStyle}
                    />

                    {/* Selection info + actions */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                            Seleccionados: <b style={{ color: "var(--text-main)" }}>{selectedUserIds.length}</b>
                        </span>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                                type="button"
                                onClick={selectAll}
                                disabled={!filteredUsers.length}
                                style={textBtnStyle}
                            >
                                Seleccionar todos
                            </button>
                            <button
                                type="button"
                                onClick={clearSelection}
                                disabled={!selectedUserIds.length}
                                style={textBtnStyle}
                            >
                                Limpiar
                            </button>
                        </div>
                    </div>

                    {/* Users Table */}
                    <div style={{ flex: 1, overflow: "auto", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                            <thead>
                                <tr style={{ backgroundColor: "var(--bg-main)" }}>
                                    <th style={thStyle}>
                                        <input
                                            type="checkbox"
                                            checked={filteredUsers.length > 0 && filteredUsers.every(u => selectedUserIds.includes(u.id))}
                                            onChange={e => e.target.checked ? selectAll() : clearSelection()}
                                            style={{ cursor: "pointer" }}
                                        />
                                    </th>
                                    <th style={{ ...thStyle, textAlign: "left" }}>Usuario</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>Rol</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingUsers ? (
                                    <tr>
                                        <td colSpan={3} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                                            Cargando usuarios...
                                        </td>
                                    </tr>
                                ) : filteredUsers.length > 0 ? (
                                    filteredUsers.map(u => {
                                        const isSelected = selectedUserIds.includes(u.id);
                                        return (
                                            <tr
                                                key={u.id}
                                                onClick={() => toggleUserSelection(u.id)}
                                                style={{
                                                    cursor: "pointer",
                                                    backgroundColor: isSelected ? "rgba(30,136,229,0.06)" : "transparent",
                                                    transition: "background-color 0.15s"
                                                }}
                                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = "var(--bg-main)"; }}
                                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = "transparent"; }}
                                            >
                                                <td style={tdStyle}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleUserSelection(u.id)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{ cursor: "pointer" }}
                                                    />
                                                </td>
                                                <td style={{ ...tdStyle, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                                    {u.avatarUrl ? (
                                                        <img
                                                            src={u.avatarUrl}
                                                            alt=""
                                                            style={{ width: "26px", height: "26px", borderRadius: "50%", objectFit: "cover" }}
                                                        />
                                                    ) : (
                                                        <div style={{
                                                            width: "26px", height: "26px", borderRadius: "50%",
                                                            background: "var(--bg-main)", display: "flex", alignItems: "center",
                                                            justifyContent: "center", fontSize: "11px", fontWeight: "600",
                                                            color: "var(--text-secondary)"
                                                        }}>
                                                            {u.name.charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div style={{ fontWeight: "500", color: "var(--text-main)" }}>{u.name}</div>
                                                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{u.email}</div>
                                                    </div>
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-secondary)" }}>
                                                    {u.role}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={3} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                                            {selectedClientId ? "No hay usuarios para este cliente" : "Selecciona un cliente primero"}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Save Recipients */}
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                            className="btn btn-primary"
                            onClick={saveRecipients}
                            disabled={!selectedClientId || savingRecipients}
                            style={{ fontSize: "13px", padding: "0.5rem 1.25rem" }}
                        >
                            {savingRecipients ? "Guardando..." : "Guardar destinatarios"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Snackbar */}
            {snackbar.show && (
                <div style={{
                    position: "fixed",
                    top: "1rem",
                    right: "1rem",
                    backgroundColor: "#20A789",
                    color: "white",
                    padding: "0.75rem 1.5rem",
                    borderRadius: "var(--radius-md)",
                    fontSize: "13px",
                    fontWeight: "500",
                    boxShadow: "var(--shadow-md)",
                    zIndex: 1000,
                    animation: "fadeIn 0.3s ease"
                }}>
                    {snackbar.message}
                </div>
            )}
        </div>
    );
}


const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    fontWeight: "600",
    color: "var(--text-secondary)",
    marginBottom: "4px",
};

const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.75rem",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border-color)",
    background: "var(--bg-card)",
    color: "var(--text-main)",
    fontSize: "13px",
    outline: "none",
    fontFamily: "inherit",
};

const thStyle: React.CSSProperties = {
    padding: "0.75rem",
    fontWeight: "600",
    color: "var(--text-secondary)",
    borderBottom: "2px solid var(--border-color)",
    fontSize: "12px",
};

const tdStyle: React.CSSProperties = {
    padding: "0.6rem 0.75rem",
    borderBottom: "1px solid var(--border-color)",
};

const textBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "var(--primary)",
    cursor: "pointer",
    fontSize: "12px",
    fontFamily: "inherit",
    padding: "0.25rem 0.5rem",
};
