// Queue stub — BullMQ/ioredis not available in Next.js context
// Real queue operations happen in the worker service

export type JobStatus = 'active' | 'completed' | 'failed' | 'waiting' | 'delayed'

export interface JobData {
  [key: string]: unknown
}

export type Queue = {
  add: (_name: string, _data: JobData) => Promise<void>
  resume: () => Promise<void>
  pause: () => Promise<void>
}

// Stub queue instance
const createStubQueue = (): Queue => ({
  add: async () => {},
  resume: async () => {},
  pause: async () => {},
})

// Named exports expected by route handlers
export function getResumeQueue(_queueName?: string): Queue {
  return createStubQueue()
}

export function getExceptionQueue(): Queue {
  return createStubQueue()
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
