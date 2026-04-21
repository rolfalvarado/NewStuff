// In-memory store for job outputs
// Jobs are cleaned up after 10 minutes of inactivity

interface JobData {
    output: string[];
    status: 'running' | 'completed' | 'error';
    lastUpdated: number;
    exitCode?: number;
}

const jobs: Map<string, JobData> = new Map();

// Clean up old jobs every 5 minutes
setInterval(() => {
    const now = Date.now();
    const TEN_MINUTES = 10 * 60 * 1000;

    jobs.forEach((job, id) => {
        if (now - job.lastUpdated > TEN_MINUTES) {
            jobs.delete(id);
        }
    });
}, 5 * 60 * 1000);

export function createJob(jobId: string): void {
    jobs.set(jobId, {
        output: [],
        status: 'running',
        lastUpdated: Date.now()
    });
}

export function appendOutput(jobId: string, line: string): void {
    const job = jobs.get(jobId);
    if (job) {
        job.output.push(line);
        job.lastUpdated = Date.now();
    }
}

export function completeJob(jobId: string, exitCode: number): void {
    const job = jobs.get(jobId);
    if (job) {
        job.status = exitCode === 0 ? 'completed' : 'error';
        job.exitCode = exitCode;
        job.lastUpdated = Date.now();
    }
}

export function getJobStatus(jobId: string, fromLine: number = 0): {
    output: string[];
    status: 'running' | 'completed' | 'error' | 'not_found';
    exitCode?: number;
    totalLines: number;
} {
    const job = jobs.get(jobId);
    if (!job) {
        return { output: [], status: 'not_found', totalLines: 0 };
    }

    return {
        output: job.output.slice(fromLine),
        status: job.status,
        exitCode: job.exitCode,
        totalLines: job.output.length
    };
}

export function generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}
