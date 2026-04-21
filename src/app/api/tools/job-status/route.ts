import { NextRequest, NextResponse } from 'next/server';
import { getJobStatus } from '@/lib/job-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');
    const fromLine = parseInt(searchParams.get('fromLine') || '0', 10);

    if (!jobId) {
        return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const status = getJobStatus(jobId, fromLine);

    return NextResponse.json(status);
}
