import { NextResponse } from 'next/server';
import { validateSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await validateSession();

        if (!session) {
            return NextResponse.json(
                { authenticated: false },
                { status: 401 }
            );
        }

        return NextResponse.json({
            authenticated: true,
            user: {
                email: session.email,
                role: session.role,
                name: session.name
            }
        });
    } catch (error) {
        console.error('Auth verify error:', error);
        return NextResponse.json(
            { authenticated: false, error: 'Error de verificación' },
            { status: 500 }
        );
    }
}
