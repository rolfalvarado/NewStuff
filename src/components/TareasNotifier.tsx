"use client";

/**
 * Polling silencioso del módulo TAREAS para emitir notificaciones del navegador
 * desde cualquier módulo de NewStuff (no sólo desde /tareas).
 *
 * Reglas:
 *  - Si el usuario está en /tareas, no se hace nada (TareasClient ya gestiona sus
 *    propios toasts/notificaciones en esa pantalla).
 *  - Devs reciben "Nuevo reporte" cuando soporte sube una nueva tarea.
 *  - Soporte/administración recibe "Tu reporte fue resuelto" cuando una tarea
 *    que ellos reportaron pasa a estado done.
 *  - Se "ceba" la primera ronda para no disparar todas las tareas existentes al
 *    entrar a la app.
 *  - Las notificaciones usan `tag` único por tarea para evitar duplicados con
 *    el flujo local de /tareas si llegasen al mismo tiempo.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { TareasAPI, deriveTareasRole, type Task } from "@/lib/tareas-api";
import { getCurrentUser } from "@/app/actions/auth";

const POLL_MS = 20_000;

export default function TareasNotifier() {
    const pathname = usePathname();
    const onTareas = pathname?.startsWith("/tareas") || false;

    const sessionRef = useRef<{ email: string; isDev: boolean } | null>(null);
    const prevRef = useRef<Map<string, { status: string; reporterId: string }>>(new Map());
    const primedRef = useRef(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        // En /tareas el propio cliente maneja todo. Apagamos el polling global.
        if (onTareas) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }

        let cancelled = false;

        function notify(title: string, body: string, tag: string) {
            try {
                if (
                    typeof window !== "undefined" &&
                    "Notification" in window &&
                    Notification.permission === "granted"
                ) {
                    const n = new Notification(title, {
                        body,
                        icon: "/logo.png",
                        tag,
                    });
                    n.onclick = () => {
                        window.focus();
                        // Lleva al usuario al módulo de tareas si hace click
                        if (typeof window !== "undefined") {
                            window.location.href = "/tareas";
                        }
                        n.close();
                    };
                    setTimeout(() => n.close(), 8000);
                }
            } catch (e) {
                console.warn("[TareasNotifier] notify error:", e);
            }
        }

        function detect(tasks: Task[]) {
            const session = sessionRef.current;
            if (!session) return;

            const next = new Map(
                tasks.map((t) => [t.id, { status: t.status, reporterId: t.reporterId }])
            );

            // Primera vuelta: solo guardar snapshot.
            if (!primedRef.current) {
                primedRef.current = true;
                prevRef.current = next;
                return;
            }
            const prev = prevRef.current;

            for (const t of tasks) {
                const before = prev.get(t.id);

                // 1) Tarea nueva → notifica al desarrollador
                if (!before) {
                    if (session.isDev) {
                        const body = `${t.title}${t.client ? ` · ${t.client}` : ""}`;
                        notify("📩 Nuevo reporte", body, `tarea-nueva-${t.id}`);
                    }
                    continue;
                }

                // 2) Pending → in_progress (alguien la tomó)
                if (before.status === "pending" && t.status === "in_progress") {
                    const who = t.assignedToName || "Alguien";
                    const desc = t.description?.trim()
                        ? t.description.trim().slice(0, 140)
                        : t.title;
                    // Aviso a todos los devs
                    if (session.isDev) {
                        notify(
                            `🛠 ${who} tomó un reporte`,
                            `${t.title}\n${desc}`,
                            `tarea-taken-dev-${t.id}`
                        );
                    }
                    // Aviso al soporte que lo reportó
                    if (!session.isDev && t.reporterId === session.email) {
                        notify(
                            `🛠 ${who} está trabajando en tu reporte`,
                            `${t.title}\n${desc}`,
                            `tarea-taken-${t.id}`
                        );
                    }
                }

                // 3) Tarea pasa a done
                if (before.status !== "done" && t.status === "done") {
                    // 2a) Soporte / admin: avisa cuando un reporte propio fue resuelto
                    if (!session.isDev && t.reporterId === session.email) {
                        const body = `${t.title}${
                            t.assignedToName ? ` · resuelto por ${t.assignedToName}` : ""
                        }`;
                        notify("✅ Tu reporte fue resuelto", body, `tarea-done-${t.id}`);
                    }
                    // 2b) Dev: aviso al equipo de desarrollo cuando alguien cierra un reporte
                    if (session.isDev) {
                        const who = t.assignedToName || "Alguien";
                        const desc = t.description?.trim()
                            ? t.description.trim().slice(0, 140)
                            : t.title;
                        notify(
                            `✅ ${who} ha terminado un reporte`,
                            `${t.title}\n${desc}`,
                            `tarea-done-dev-${t.id}`
                        );
                    }
                }
            }

            prevRef.current = next;
        }

        async function tick() {
            if (cancelled || !sessionRef.current) return;
            try {
                const tasks = await TareasAPI.listAll();
                if (!cancelled) detect(tasks);
            } catch {
                // silencioso: si ROMA no responde, no quemamos al usuario con alertas
            }
        }

        // Bootstrap
        getCurrentUser()
            .then((user) => {
                if (cancelled || !user) return;
                const role = deriveTareasRole(user.email, user.role);
                sessionRef.current = { email: user.email, isDev: role === "dev" };

                // Pedir permiso de notificaciones la primera vez
                if (
                    typeof window !== "undefined" &&
                    "Notification" in window &&
                    Notification.permission === "default"
                ) {
                    Notification.requestPermission().catch(() => {});
                }

                // Primer poll inmediato + recurrente
                tick();
                intervalRef.current = setInterval(tick, POLL_MS);
            })
            .catch(() => {});

        return () => {
            cancelled = true;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            // Reseteamos la "ceba" para que al volver a montar (entrar/salir de
            // /tareas) no dispare ráfagas de notificaciones por diff acumulado.
            primedRef.current = false;
        };
    }, [onTareas]);

    return null;
}
