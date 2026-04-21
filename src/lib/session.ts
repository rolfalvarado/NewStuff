"use server";

import { cookies } from 'next/headers';
import { db, TABLE_NAMES } from './db';
import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

// Configuración de sesión
const SESSION_COOKIE_NAME = 'session_token';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 horas

// Genera un token aleatorio seguro
function generateToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export interface SessionData {
    email: string;
    role?: string;
    name?: string;
    createdAt: number;
    expiresAt: number;
}

// Crear una nueva sesión
export async function createSession(userData: { email: string; role?: string; name?: string }): Promise<string> {
    const token = generateToken();
    const now = Date.now();

    const sessionData: SessionData = {
        email: userData.email,
        role: userData.role,
        name: userData.name,
        createdAt: now,
        expiresAt: now + SESSION_DURATION_MS,
    };

    // Guardar sesión en DynamoDB
    await db.send(new PutCommand({
        TableName: TABLE_NAMES.SESSIONS || 'Sessions',
        Item: {
            token,
            ...sessionData,
            ttl: Math.floor((now + SESSION_DURATION_MS) / 1000) // TTL para auto-eliminación
        }
    }));

    // Configurar cookie HTTP-only
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: isProduction, // HTTPS en producción, HTTP permitido en desarrollo
        sameSite: 'lax',
        maxAge: SESSION_DURATION_MS / 1000,
        path: '/',
    });

    return token;
}

// Validar sesión existente
export async function validateSession(): Promise<SessionData | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

        if (!token) {
            return null;
        }

        const result = await db.send(new GetCommand({
            TableName: TABLE_NAMES.SESSIONS || 'Sessions',
            Key: { token }
        }));

        if (!result.Item) {
            return null;
        }

        const session = result.Item as SessionData & { token: string };

        // Verificar expiración
        if (Date.now() > session.expiresAt) {
            await destroySession();
            return null;
        }

        return {
            email: session.email,
            role: session.role,
            name: session.name,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
        };
    } catch (error) {
        console.error('Error validating session:', error);
        return null;
    }
}

// Destruir sesión (logout)
export async function destroySession(): Promise<void> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

        if (token) {
            // Eliminar de DynamoDB
            await db.send(new DeleteCommand({
                TableName: TABLE_NAMES.SESSIONS || 'Sessions',
                Key: { token }
            }));
        }

        // Eliminar cookie explícitamente expirándola
        const isProduction = process.env.NODE_ENV === 'production';
        cookieStore.set(SESSION_COOKIE_NAME, '', {
            maxAge: 0,
            path: '/',
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax'
        });
    } catch (error) {
        console.error('Error destroying session:', error);
    }
}

// Verificar si hay sesión válida (para middleware)
export async function hasValidSession(): Promise<boolean> {
    const session = await validateSession();
    return session !== null;
}
