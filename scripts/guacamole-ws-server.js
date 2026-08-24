/**
 * Guacamole WebSocket Proxy Server
 * 
 * Servidor ligero que hace de puente entre el cliente web (guacamole-common-js)
 * y el demonio guacd (Apache Guacamole proxy daemon).
 * 
 * Usa guacamole-lite con tokens JWT para pasar parámetros de conexión
 * de forma segura sin exponer credenciales RDP en el frontend.
 */

const GuacamoleLite = require('guacamole-lite');

// Configuración
const WS_PORT = parseInt(process.env.GUAC_WS_PORT || '8081', 10);
const GUACD_HOST = process.env.GUACD_HOST || '127.0.0.1';
const GUACD_PORT = parseInt(process.env.GUACD_PORT || '4822', 10);

// Clave para firmar/verificar tokens JWT
// Usa la misma SERVER_ENCRYPTION_KEY del proyecto para consistencia
const JWT_SECRET = process.env.SERVER_ENCRYPTION_KEY || process.env.GUAC_JWT_SECRET;

if (!JWT_SECRET) {
    console.error('❌ SERVER_ENCRYPTION_KEY or GUAC_JWT_SECRET must be set');
    process.exit(1);
}

// Format the key exactly as the Next.js action does (32 bytes for AES-256-CBC)
const CRYPT_KEY = Buffer.from(JWT_SECRET, 'base64').subarray(0, 32);
console.log('✅ CRYPT_KEY (base64):', CRYPT_KEY.toString('base64'));

// Configuración de guacamole-lite
const websocketOptions = {
    port: WS_PORT,
};

const guacdOptions = {
    host: GUACD_HOST,
    port: GUACD_PORT,
};

const clientOptions = {
    // Opciones de conexión por defecto para RDP
    // Estas se pueden sobreescribir via el token JWT
    crypt: {
        cypher: 'AES-256-CBC',
        key: CRYPT_KEY,
    },

    // Configuración de logs
    log: {
        level: process.env.NODE_ENV === 'production' ? 'ERRORS' : 'VERBOSE',
    },

    // Parámetros RDP por defecto que se aplican a todas las conexiones
    connectionDefaultSettings: {
        rdp: {
            // Seguridad
            'security': 'any',
            'ignore-cert': 'true',
            'disable-auth': 'false',
            
            // Rendimiento - optimizar para red
            'enable-wallpaper': 'false',
            'enable-theming': 'true',
            'enable-font-smoothing': 'true',
            'enable-full-window-drag': 'false',
            'enable-desktop-composition': 'false',
            'enable-menu-animations': 'false',
            'disable-bitmap-caching': 'false',
            'disable-offscreen-caching': 'false',
            
            // Audio (desactivado para mejor rendimiento)
            'disable-audio': 'true',
            
            // Teclado - layout español
            'server-layout': 'es-latam-qwerty',
            
            // Resolución por defecto (se ajusta con resize-method)
            'width': '1920',
            'height': '1080',
            'dpi': '96',
            
            // Permitir redimensionar
            'resize-method': 'display-update',
        }
    }
};

try {
    const guacServer = new GuacamoleLite(websocketOptions, guacdOptions, clientOptions);

    guacServer.on('open', (clientConnection) => {
        const connectionId = clientConnection?.connectionId || 'unknown';
        console.log(`🖥️  [${new Date().toISOString()}] New RDP connection opened: ${connectionId}`);
    });

    guacServer.on('close', (clientConnection) => {
        const connectionId = clientConnection?.connectionId || 'unknown';
        console.log(`🔌 [${new Date().toISOString()}] RDP connection closed: ${connectionId}`);
    });

    guacServer.on('error', (clientConnection, error) => {
        console.error(`❌ [${new Date().toISOString()}] Connection error:`, error?.message || error);
    });

    console.log(`✅ Guacamole WebSocket proxy running on ws://0.0.0.0:${WS_PORT}`);
    console.log(`   → guacd backend: ${GUACD_HOST}:${GUACD_PORT}`);
    console.log(`   → Environment: ${process.env.NODE_ENV || 'development'}`);

} catch (err) {
    console.error('❌ Failed to start Guacamole WebSocket server:', err);
    process.exit(1);
}
