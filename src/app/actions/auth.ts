"use server";

import { db, TABLE_NAMES } from "@/lib/db";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import { createSession, destroySession, validateSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { checkRateLimit, recordFailedAttempt, resetRateLimit } from "@/lib/rate-limit";

export async function loginAction(formData: FormData) {
    const email = formData.get("username_app_custom") as string;
    const password = formData.get("password_app_custom") as string;

    if (!email || !password) {
        return { success: false, message: "Faltan credenciales" };
    }

    // Rate limiting: verificar si el email está bloqueado
    const rateLimitStatus = checkRateLimit(email);

    if (rateLimitStatus.isBlocked) {
        const minutesRemaining = Math.ceil(rateLimitStatus.blockedForMs / 1000 / 60);
        return {
            success: false,
            message: `Demasiados intentos fallidos. Intenta de nuevo en ${minutesRemaining} minuto(s).`,
            isBlocked: true
        };
    }

    try {
        const result = await db.send(new GetCommand({
            TableName: TABLE_NAMES.USERS,
            Key: { email }
        }));

        const user = result.Item;

        if (!user) {
            // Registrar intento fallido
            const nowBlocked = recordFailedAttempt(email);
            console.warn(`[Security] GUEST LOGIN ATTEMPT: Failed login for non-existent user: ${email}`);

            // Delay para prevenir timing attacks
            await new Promise(resolve => setTimeout(resolve, 500));

            if (nowBlocked) {
                console.error(`[Security] RATE LIMIT: Account blocked for user: ${email}`);
                return {
                    success: false,
                    message: "Demasiados intentos fallidos. Cuenta bloqueada por 15 minutos.",
                    isBlocked: true
                };
            }

            return {
                success: false,
                message: "Credenciales inválidas",
                remainingAttempts: checkRateLimit(email).remainingAttempts
            };
        }

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            // Registrar intento fallido
            const nowBlocked = recordFailedAttempt(email);
            console.warn(`[Security] AUTH FAILED: Incorrect password for user: ${email}`);

            // Delay para prevenir timing attacks
            await new Promise(resolve => setTimeout(resolve, 500));

            if (nowBlocked) {
                console.error(`[Security] RATE LIMIT: Account blocked for user: ${email}`);
                return {
                    success: false,
                    message: "Demasiados intentos fallidos. Cuenta bloqueada por 15 minutos.",
                    isBlocked: true
                };
            }

            return {
                success: false,
                message: "Credenciales inválidas",
                remainingAttempts: checkRateLimit(email).remainingAttempts
            };
        }

        // Login exitoso: resetear rate limit
        resetRateLimit(email);
        console.info(`[Security] LOGIN SUCCESS: User ${email} authenticated successfully.`);

        // Crear sesión segura con cookie HTTP-only
        await createSession({
            email: user.email,
            role: user.role,
            name: user.name
        });

        return {
            success: true,
            user: {
                email: user.email,
                role: user.role,
                name: user.name
            }
        };

    } catch (error) {
        console.error(`[Security] INTERNAL SERVER ERROR during login for ${email}:`, error);
        return { success: false, message: "Error interno del servidor" };
    }
}

export async function logoutAction() {
    await destroySession();
    return { success: true };
}

export async function getCurrentUser() {
    const session = await validateSession();
    if (!session) {
        return null;
    }
    return {
        email: session.email,
        role: session.role,
        name: session.name
    };
}

export async function requireAuth() {
    const session = await validateSession();
    if (!session) {
        redirect('/login');
    }
    return session;
}

