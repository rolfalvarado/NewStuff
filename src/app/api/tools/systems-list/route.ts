import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'scripts', 'systems_list.json');

export async function GET() {
    try {
        if (!fs.existsSync(configPath)) {
            return NextResponse.json([]);
        }
        const data = fs.readFileSync(configPath, 'utf8');
        const systems = JSON.parse(data);
        return NextResponse.json(systems);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        if (!Array.isArray(body)) {
            return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
        }
        fs.writeFileSync(configPath, JSON.stringify(body, null, 4));
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
    }
}
