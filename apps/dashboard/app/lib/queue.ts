// Queue stub — ioredis not available in Next.js edge/serverless
// Real queue operations happen in the worker service

export type JobStatus = 'active' | 'completed' | 'failed' | 'waiting' | 'delayed'

export interface JobData {
  [key: string]: unknown
}

export async function enqueueJob(
  _queueName: string,
  _data: JobData,
): Promise<void> {
  // Stub: queue not available in Next.js context
}

export async function getJobStatus(
  _queueName: string,
  _jobId: string,
): Promise<JobStatus | null> {
  return null
}
