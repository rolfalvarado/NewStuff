import { URL } from "url";

/**
 * Verifica si una URL es segura para realizar peticiones salientes (SSRF mitigation).
 * Bloquea IPs privadas, localhost y esquemas no http/https.
 */
export function isSafePublicUrl(urlString: string): boolean {
    try {
        const url = new URL(urlString);

        // 1. Validar protocolo
        if (!['http:', 'https:'].includes(url.protocol)) {
            return false;
        }

        const hostname = url.hostname;

        // 2. Bloquear localhost explícito
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
            return false;
        }

        // 3. Bloquear rangos de IP privada comunes (IPv4)
        // 10.0.0.0/8
        // 172.16.0.0/12
        // 192.168.0.0/16
        // 169.254.0.0/16 (Link-local / AWS Metadata)
        const parts = hostname.split('.').map(Number);
        if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
            const [a, b, c, d] = parts;

            // 10.x.x.x
            if (a === 10) return false;

            // 172.16.x.x - 172.31.x.x
            if (a === 172 && b >= 16 && b <= 31) return false;

            // 192.168.x.x
            if (a === 192 && b === 168) return false;

            // 169.254.x.x (AWS Metadata!)
            if (a === 169 && b === 254) return false;

            // 0.0.0.0
            if (a === 0) return false;
        }

        return true;
    } catch (e) {
        // Si la URL es inválida, se considera insegura
        return false;
    }
}
