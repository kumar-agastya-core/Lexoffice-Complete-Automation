import { Queue } from 'bullmq';
import IORedis from 'ioredis';

let resumeQueue: Queue | undefined;

export function getResumeQueue(): Queue {
  if (!resumeQueue) {
    const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    resumeQueue = new Queue('resume', { connection });
  }
  return resumeQueue;
}
