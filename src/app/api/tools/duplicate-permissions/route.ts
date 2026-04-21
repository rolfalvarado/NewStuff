import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { createJob, appendOutput, completeJob, generateJobId } from '@/lib/job-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const config = JSON.stringify(body);

        const jobId = generateJobId();
        createJob(jobId);

        const scriptPath = path.join(process.cwd(), 'scripts', 'clona.py');
        const pythonProcess = spawn('python3', ['-u', scriptPath, '--config', config]);

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
        console.error('Error executing script:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
