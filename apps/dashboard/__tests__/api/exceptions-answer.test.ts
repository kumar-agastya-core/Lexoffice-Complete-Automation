import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/app/lib/db', () => ({
  getException: vi.fn(),
  answerClarification: vi.fn(),
  allBlockersResolved: vi.fn(),
}));

vi.mock('@/app/lib/auth', () => ({
  requireAuth: vi.fn().mockReturnValue(null),
  getApiKey: vi.fn().mockReturnValue('test-key'),
}));

// Mock queue to avoid bullmq Redis connection in tests
vi.mock('@/app/lib/queue', () => ({
  getResumeQueue: vi.fn().mockReturnValue({
    add: vi.fn().mockResolvedValue({}),
    getWaiting: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('@lexware/db', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));

import { PATCH } from '@/app/api/exceptions/[id]/answer/route';
import { getException, answerClarification, allBlockersResolved } from '@/app/lib/db';

const mockGetException = getException as ReturnType<typeof vi.fn>;
const mockAnswer = answerClarification as ReturnType<typeof vi.fn>;
const mockAllResolved = allBlockersResolved as ReturnType<typeof vi.fn>;

const FAKE_EXCEPTION = {
  id: 'ex-uuid',
  status: 'pending',
  payload: { lexwareDraftVoucherId: 'voucher-uuid', triggerReasons: [] },
  sessions: [],
};

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/exceptions/ex-uuid/answer', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/exceptions/[id]/answer', () => {
  beforeEach(() => {
    mockGetException.mockResolvedValue(FAKE_EXCEPTION);
    mockAnswer.mockResolvedValue(undefined);
    mockAllResolved.mockResolvedValue(false);
  });
  afterEach(() => vi.clearAllMocks());

  it('returns 400 when body is missing sessionId', async () => {
    const res = await PATCH(makeRequest({ answer: 'yes' }), { params: Promise.resolve({ id: 'ex-uuid' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is missing answer', async () => {
    const res = await PATCH(makeRequest({ sessionId: 's-1' }), { params: Promise.resolve({ id: 'ex-uuid' }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when exception not found', async () => {
    mockGetException.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest({ sessionId: 's-1', answer: 'test' }),
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(res.status).toBe(404);
  });

  it('calls answerClarification with correct args', async () => {
    await PATCH(
      makeRequest({ sessionId: 'sess-123', answer: 'It is a marketing expense' }),
      { params: Promise.resolve({ id: 'ex-uuid' }) },
    );
    expect(mockAnswer).toHaveBeenCalledWith('ex-uuid', 'sess-123', 'It is a marketing expense', null);
  });

  it('returns allResolved: false when blockers remain', async () => {
    mockAllResolved.mockResolvedValue(false);
    const res = await PATCH(
      makeRequest({ sessionId: 's-1', answer: 'yes' }),
      { params: Promise.resolve({ id: 'ex-uuid' }) },
    );
    const data = await res.json() as any;
    expect(data.status).toBe('answered');
    expect(data.allResolved).toBe(false);
  });

  it('returns allResolved: true when all blockers answered', async () => {
    mockAllResolved.mockResolvedValue(true);
    const res = await PATCH(
      makeRequest({ sessionId: 's-1', answer: 'yes' }),
      { params: Promise.resolve({ id: 'ex-uuid' }) },
    );
    const data = await res.json() as any;
    expect(data.allResolved).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    mockGetException.mockRejectedValue(new Error('DB error'));
    const res = await PATCH(
      makeRequest({ sessionId: 's-1', answer: 'yes' }),
      { params: Promise.resolve({ id: 'ex-uuid' }) },
    );
    expect(res.status).toBe(500);
  });
});
