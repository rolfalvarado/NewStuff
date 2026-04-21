"use client";

import { useEffect, useState, useRef } from 'react';
import { System } from '@/app/actions/get-systems';
import AlertModal from './AlertModal';
import { useRouter } from 'next/navigation';

export default function AlarmManager() {
    const [allSystems, setAllSystems] = useState<System[]>([]);
    const [offlineSystems, setOfflineSystems] = useState<System[]>([]);
    const [isAlarmActive, setIsAlarmActive] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const router = useRouter();

    // 1. Initial Load Removed - System waits for first status-check event


    // 2. Logic to process alarm state based on current systems data
    const processAlarms = (systems: System[]) => {
        const ackRaw = sessionStorage.getItem('acknowledged_outages');
        let acknowledgedIds: string[] = ackRaw ? JSON.parse(ackRaw) : [];

        // Clean up acknowledged list: remove IDs of systems that are now Online
        let ackChanged = false;
        acknowledgedIds = acknowledgedIds.filter(id => {
            const system = systems.find(s => s.url_sitio === id);
            if (system && system.estado_sitio !== 'Offline') {
                ackChanged = true;
                return false; // Remove from ack list
            }
            return true; // Keep in ack list
        });
        
        if (ackChanged) {
            sessionStorage.setItem('acknowledged_outages', JSON.stringify(acknowledgedIds));
        }

        const currentOffline = systems.filter(
            s => s.estado_sitio === 'Offline' &&
                !s.disabled_state && // Ignore explicitly disabled monitors
                !acknowledgedIds.includes(s.url_sitio) // Ignore acknowledged
        );

        if (currentOffline.length > 0) {
            setOfflineSystems(currentOffline);
            setIsAlarmActive(true);
        } else {
            setOfflineSystems([]);
            setIsAlarmActive(false);
        }
    };

    // 3. Listen for status updates (Optimized)
    useEffect(() => {
        // Initialize audio
        audioRef.current = new Audio('/sounds/alarm.mp3');
        audioRef.current.loop = true;

        const handleStatusUpdate = async (event: Event) => {
            const customEvent = event as CustomEvent;

            if (customEvent.detail && Array.isArray(customEvent.detail)) {
                const updates = customEvent.detail;
                const updatesMap = new Map(updates.map((u: any) => [u.url, u]));

                setAllSystems(prev => {
                    // Si no tenemos sistemas previos, construimos la lista desde el evento
                    // El evento check-status ahora retorna nombre y estado_disabled
                    if (prev.length === 0) {
                        const newSystems = updates.map((u: any) => ({
                            url_sitio: u.url,
                            estado_sitio: u.status,
                            disabled_state: u.isDisabled,
                            nombre_empresa: u.name || 'Sistema',
                            nombre_servidor: u.serverName || 'Desconocido',
                            consecutive_failures: u.failures
                            // Otros campos requeridos por interfaz System pueden faltar si no son opcionales
                            // Se asume System tiene opcionales o casting
                        } as unknown as System));
                        processAlarms(newSystems);
                        return newSystems;
                    }

                    // Update existing state
                    const nextSystems = prev.map(sys => {
                        const update = updatesMap.get(sys.url_sitio);
                        if (update) {
                            // Actualizar campos clave
                            if (sys.estado_sitio !== update.status ||
                                sys.disabled_state !== update.isDisabled ||
                                sys.consecutive_failures !== update.failures) {
                                return {
                                    ...sys,
                                    estado_sitio: update.status,
                                    disabled_state: update.isDisabled,
                                    consecutive_failures: update.failures
                                };
                            }
                        }
                        return sys;
                    });

                    // Process alarms with new state
                    processAlarms(nextSystems);
                    return nextSystems;
                });

            } else {
                // Si el evento no trae detalles (legacy fallback), no hacemos fetch
                // Simplemente esperamos al próximo ciclo valido.
                // Esto elimina la dependencia de getAllSystems
                console.warn("AlarmManager recibió evento sin detalles. Esperando datos...");
            }
        };

        const handleDemoAlarm = (e: any) => {
            const demoSystem = e.detail;
            if (demoSystem) {
                setOfflineSystems([demoSystem]);
                setIsAlarmActive(true);
            }
        };

        window.addEventListener('status-check-complete', handleStatusUpdate);
        window.addEventListener('demo-alarm', handleDemoAlarm);

        return () => {
            window.removeEventListener('status-check-complete', handleStatusUpdate);
            window.removeEventListener('demo-alarm', handleDemoAlarm);
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []); // Empty dependency array, state updates inside via callbacks

    // 4. Effects for Audio/Title (Side Effects)
    useEffect(() => {
        let titleInterval: NodeJS.Timeout;
        const originalTitle = document.title;
        let faviconLink = document.querySelector("link[rel~='icon']") as HTMLLinkElement;

        if (!faviconLink) {
            faviconLink = document.createElement('link');
            faviconLink.rel = 'icon';
            document.head.appendChild(faviconLink);
        }

        if (isAlarmActive && offlineSystems.length > 0) {
            // Play Sound
            if (audioRef.current) {
                audioRef.current.play().catch(e => {
                    // console.log("Audio play blocked", e);
                });
            }

            // Flash Title
            let flashState = false;
            titleInterval = setInterval(() => {
                document.title = flashState ? `⚠ ${offlineSystems.length} SERVICIO(S) CAÍDO(S)` : "¡ALERTA!";
                flashState = !flashState;
            }, 1000);

        } else {
            // Stop everything
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            if (titleInterval!) clearInterval(titleInterval);
            document.title = "MonitorApp"; // Reset to static or capture original on mount? keeping simple
        }

        return () => {
            if (titleInterval) clearInterval(titleInterval);
            if (audioRef.current) audioRef.current.pause();
        };
    }, [isAlarmActive, offlineSystems.length]);

    const handleAcknowledge = () => {
        if (!offlineSystems.length) return;

        // Add to ignored list
        const ackRaw = sessionStorage.getItem('acknowledged_outages');
        const currentAck = ackRaw ? JSON.parse(ackRaw) : [];
        const newAck = [...currentAck, ...offlineSystems.map(s => s.url_sitio)];
        sessionStorage.setItem('acknowledged_outages', JSON.stringify(newAck));

        setIsAlarmActive(false);
        setOfflineSystems([]);
    };

    return <AlertModal offlineSystems={offlineSystems} onAcknowledge={handleAcknowledge} />;
}
