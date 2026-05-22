// Queue stub — BullMQ/ioredis not available in Next.js context
// Real queue operations happen in the worker service

export type JobStatus = 'active' | 'completed' | 'failed' | 'waiting' | 'delayed'

export interface JobData {
  [key: string]: unknown
}

// Minimal Job interface matching BullMQ's Job shape
export interface QueueJob {
  id?: string | undefined
  name: string
  data: JobData
  opts?: Record<string, unknown>
}

// Minimal Queue interface matching what route handlers call
export interface Queue {
  add: (_name: string, _data: JobData, _opts?: Record<string, unknown>) => Promise<QueueJob>
  resume: () => Promise<void>
  pause: () => Promise<void>
  getWaiting: () => Promise<QueueJob[]>
  getActive: () => Promise<QueueJob[]>
  getCompleted: (_start?: number, _end?: number) => Promise<QueueJob[]>
  getFailed: (_start?: number, _end?: number) => Promise<QueueJob[]>
  getJobCounts: () => Promise<Record<string, number>>
  close: () => Promise<void>
}

const createStubQueue = (): Queue => ({
  add: async (_name, _data) => ({ name: _name, data: _data }),
  resume: async () => {},
  pause: async () => {},
  getWaiting: async () => [],
  getActive: async () => [],
  getCompleted: async () => [],
  getFailed: async () => [],
  getJobCounts: async () => ({}),
  close: async () => {},
})

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
