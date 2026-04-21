"use client";

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function StatusChecker() {
    const router = useRouter();
    // Use ref to track mounted state to prevent state updates/timeouts after unmount
    const isMounted = useRef(true);
    const timeoutRef = useRef<NodeJS.Timeout>(null);

    useEffect(() => {
        isMounted.current = true;

        const runCheckLoop = async () => {
            if (!isMounted.current) return;

            try {
                // console.log('Running scheduled system status check...');
                const res = await fetch(`/api/check-status?t=${Date.now()}`, { cache: 'no-store' });
                const data = await res.json();

                if (isMounted.current && data.success && data.details) {
                    // Dispatch event with the updated status details
                    const event = new CustomEvent('status-check-complete', {
                        detail: data.details
                    });
                    window.dispatchEvent(event);
                } else if (isMounted.current) {
                    // Fallback using legacy event
                    window.dispatchEvent(new Event('status-check-complete'));
                }
            } catch (error) {
                console.error('Status check failed:', error);
            } finally {
                // SCHEDULING SEGURO:
                // Solo programamos el siguiente chequeo cuando el actual ha TERMINADO (éxito o error).
                // Esto previene "efecto bola de nieve" si el servidor tarda más de 30s.
                if (isMounted.current) {
                    timeoutRef.current = setTimeout(runCheckLoop, 60 * 1000);
                }
            }
        };

        // Iniciar el bucle inmediatamente
        runCheckLoop();

        return () => {
            isMounted.current = false;
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [router]);

    return null;
}
