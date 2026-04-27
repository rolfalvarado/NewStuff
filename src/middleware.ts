import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas públicas que no requieren autenticación (incluye assets y rutas de cron que manejan su propio secret)
const PUBLIC_ROUTES = ['/login', '/api/cron'];

// Rutas de API que requieren autenticación
const PROTECTED_API_ROUTES = ['/api/check-status'];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Permitir assets estáticos
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/static') ||
        pathname.startsWith('/favicon.ico') ||
        pathname.startsWith('/Icons') ||
        pathname.startsWith('/logos') ||
        pathname.startsWith('/sounds') ||
        pathname.endsWith('.svg') ||
        pathname.endsWith('.png') ||
        pathname.endsWith('.jpg') ||
        pathname.endsWith('.mp3')
    ) {
        return NextResponse.next();
    }

    // Redirigir raíz a login
    if (pathname === '/') {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Permitir rutas públicas
    if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
        return NextResponse.next();
    }

    // Verificar cookie de sesión
    const sessionToken = request.cookies.get('session_token')?.value;

    // Validación básica de token (debe existir y tener longitud razonable de UUID)
    if (!sessionToken || sessionToken.length < 32) {
        // Si es una petición de API, devolver 401
        if (pathname.startsWith('/api/')) {
            return NextResponse.json(
                { error: 'No autorizado' },
                { status: 401 }
            );
        }
        // Para páginas, redirigir a login
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // La sesión existe (la validación completa se hace en el servidor)
    // Añadir headers de seguridad
    const response = NextResponse.next();

    // Content Security Policy
    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // unsafe-eval/inline reducidos pero necesarios para Next.js
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' blob: data: https://glovox.unabase.com https://lisboa.unabase.com", // Logos + adjuntos TAREAS
        "media-src 'self' blob: https://lisboa.unabase.com", // Videos adjuntos en TAREAS
        "font-src 'self'",
        "connect-src 'self' https://lisboa.unabase.com", // Endpoint de usuarios + adjuntos
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "frame-ancestors 'none'"
        // "upgrade-insecure-requests" // Comentado para permitir acceso HTTP local
    ].join('; ');

    // Headers de seguridad adicionales
    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // HSTS (Strict-Transport-Security) - Fuerza HTTPS en producción
    if (process.env.NODE_ENV === 'production') {
        response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }

    // Prevenir caching de páginas protegidas
    if (!pathname.startsWith('/api/')) {
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        response.headers.set('Pragma', 'no-cache');
        response.headers.set('Expires', '0');
    }

    return response;
}

export const config = {
    // Proteger todas las rutas excepto las estáticas
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
