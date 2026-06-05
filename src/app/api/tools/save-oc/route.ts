import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import * as XLSX from 'xlsx';
import { createJob, appendOutput, completeJob, generateJobId } from '@/lib/job-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const url = formData.get('url') as string;
        const user = formData.get('user') as string;
        const password = formData.get('password') as string;

        if (!file || !url || !user || !password) {
            return NextResponse.json({ error: 'Missing Required Fields' }, { status: 400 });
        }

        // 1. Process Excel File to get Order Numbers
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

        const orders: string[] = [];
        jsonData.forEach((row) => {
            if (row[0]) {
                orders.push(String(row[0]).trim());
            }
        });

        if (orders.length === 0) {
            return NextResponse.json({ error: 'No orders found in the first column of the Excel file.' }, { status: 400 });
        }

        // 2. Create job and start process
        const jobId = generateJobId();
        createJob(jobId);

        const config = JSON.stringify({
            credentials: { url, user, password },
            orders: orders
        });

        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const scriptPath = path.join(process.cwd(), 'scripts', 'ordenes_compra.py');
        const pythonProcess = spawn(pythonCmd, ['-u', scriptPath, '--config', config]);

        pythonProcess.stdout.on('data', (data) => {
            const text = data.toString('utf-8');
            const lines = text.split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    appendOutput(jobId, line);
                }
            }
        });

        pythonProcess.stderr.on('data', (data) => {
            const text = data.toString('utf-8');
            appendOutput(jobId, `[ERROR] ${text}`);
        });

        pythonProcess.on('close', (code) => {
            appendOutput(jobId, `\nProceso finalizado con código: ${code}`);
            completeJob(jobId, code ?? 1);
        });

        pythonProcess.on('error', (err) => {
            appendOutput(jobId, `[FATAL] Error al iniciar proceso: ${err.message}`);
            completeJob(jobId, 1);
        });

        return NextResponse.json({ jobId, status: 'started' });

    } catch (error) {
        console.error('Error in save-oc:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
