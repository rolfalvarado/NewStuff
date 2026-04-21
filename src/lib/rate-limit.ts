// Utility module for rate limiting (Server Side Only)

// Rate Limiter simple usando almacenamiento en memoria
// Para producción en múltiples instancias, considerar Redis

interface RateLimitEntry {
    attempts: number;
    lastAttempt: number;
    blockedUntil: number;
}

// Almacenamiento en memoria (reset al reiniciar servidor)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Configuración
const MAX_ATTEMPTS = 5;           // Máximo de intentos antes de bloquear
const BLOCK_DURATION_MS = 15 * 60 * 1000;  // 15 minutos de bloqueo
const WINDOW_MS = 60 * 1000;      // Ventana de 1 minuto para contar intentos

/**
 * Verifica si una IP/email está bloqueada por rate limiting
 * @param identifier - IP o email para identificar al usuario
 * @returns objeto con estado de bloqueo y tiempo restante
 */
export function checkRateLimit(identifier: string): {
    isBlocked: boolean;
    remainingAttempts: number;
    blockedForMs: number
} {
    const now = Date.now();
    const entry = rateLimitStore.get(identifier);

    if (!entry) {
        return {
            isBlocked: false,
            remainingAttempts: MAX_ATTEMPTS,
            blockedForMs: 0
        };
    }

    // Si está bloqueado y el tiempo de bloqueo no ha pasado
    if (entry.blockedUntil > now) {
        return {
            isBlocked: true,
            remainingAttempts: 0,
            blockedForMs: entry.blockedUntil - now
        };
    }

    // Si el bloqueo expiró, resetear
    if (entry.blockedUntil > 0 && entry.blockedUntil <= now) {
        rateLimitStore.delete(identifier);
        return {
            isBlocked: false,
            remainingAttempts: MAX_ATTEMPTS,
            blockedForMs: 0
        };
    }

    // Si el último intento fue hace más de WINDOW_MS, resetear contador
    if (now - entry.lastAttempt > WINDOW_MS) {
        rateLimitStore.delete(identifier);
        return {
            isBlocked: false,
            remainingAttempts: MAX_ATTEMPTS,
            blockedForMs: 0
        };
    }

    return {
        isBlocked: false,
        remainingAttempts: MAX_ATTEMPTS - entry.attempts,
        blockedForMs: 0
    };
}

/**
 * Registra un intento fallido de login
 * @param identifier - IP o email para identificar al usuario
 * @returns true si ahora está bloqueado, false si puede seguir intentando
 */
export function recordFailedAttempt(identifier: string): boolean {
    const now = Date.now();
    const entry = rateLimitStore.get(identifier);

    if (!entry) {
        rateLimitStore.set(identifier, {
            attempts: 1,
            lastAttempt: now,
            blockedUntil: 0
        });
        return false;
    }

    // Si el último intento fue hace más de WINDOW_MS, resetear y contar este
    if (now - entry.lastAttempt > WINDOW_MS) {
        rateLimitStore.set(identifier, {
            attempts: 1,
            lastAttempt: now,
            blockedUntil: 0
        });
        return false;
    }

    // Incrementar intentos
    entry.attempts++;
    entry.lastAttempt = now;

    // Si excede el máximo, bloquear
    if (entry.attempts >= MAX_ATTEMPTS) {
        entry.blockedUntil = now + BLOCK_DURATION_MS;
        rateLimitStore.set(identifier, entry);
        console.warn(`[Rate Limit] Blocked ${identifier} until ${new Date(entry.blockedUntil).toISOString()}`);
        return true;
    }

    rateLimitStore.set(identifier, entry);
    return false;
}

/**
 * Resetea el contador de intentos después de un login exitoso
 * @param identifier - IP o email para identificar al usuario
 */
export function resetRateLimit(identifier: string): void {
    rateLimitStore.delete(identifier);
}

/**
 * Limpia entradas expiradas del store (llamar periódicamente si es necesario)
 */
export function cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        // Limpiar si el bloqueo expiró hace más de 1 hora o si no hay actividad en 1 hora
        if (
            (entry.blockedUntil > 0 && now - entry.blockedUntil > 60 * 60 * 1000) ||
            (now - entry.lastAttempt > 60 * 60 * 1000)
        ) {
            rateLimitStore.delete(key);
        }
    }
}
