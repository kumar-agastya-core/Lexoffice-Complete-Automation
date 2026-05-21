import { RateLimiter } from './rate-limiter';
import type { WriteResult, LexwareLogger } from './types';

const LEXWARE_API_BASE = 'https://api.lexware.io';
const USER_AGENT = 'mcp-lexware-office/0.6.0';
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 2000;

const noopLogger: LexwareLogger = {
  log: () => {},
  error: () => {},
};

export class LexwareClient {
  private readonly apiKey: string;
  private readonly rateLimiter: RateLimiter;
  private readonly logger: LexwareLogger;

  constructor(apiKey: string, logger?: LexwareLogger) {
    this.apiKey = apiKey;
    this.rateLimiter = new RateLimiter(1100);
    this.logger = logger ?? noopLogger;
  }

  resetRateLimiter(): void {
    this.rateLimiter.reset();
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      ...extra,
    };
  }

  private async withRetry(fn: () => Promise<Response>): Promise<Response> {
    let delay = BACKOFF_BASE_MS;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await this.rateLimiter.wait();
      const response = await fn();
      if (response.status !== 429) return response;
      if (attempt === MAX_RETRIES) return response;
      this.logger.log(`Rate limited (429) — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 32000);
    }
    return fn();
  }

  async request<T>(path: string): Promise<T | null> {
    const url = `${LEXWARE_API_BASE}${path}`;
    this.logger.log('Making Lexware Office request', { url });
    try {
      const response = await this.withRetry(() => fetch(url, { headers: this.authHeaders() }));
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const json = await response.json();
      this.logger.log('Lexware Office response', { json });
      return json as T;
    } catch (error) {
      this.logger.error('Error making Lexware Office request', { error });
      return null;
    }
  }

  async fileRequest(
    path: string,
    accept: 'application/pdf' | 'application/xml',
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    const url = `${LEXWARE_API_BASE}${path}`;
    this.logger.log('Making Lexware Office file request', { url });
    try {
      const response = await this.withRetry(() =>
        fetch(url, { headers: this.authHeaders({ Accept: accept }) }),
      );
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const contentType = response.headers.get('Content-Type') ?? accept;
      const mimeType = contentType.split(';')[0].trim();
      const arrayBuffer = await response.arrayBuffer();
      const data = Buffer.from(arrayBuffer);
      this.logger.log('Lexware Office file response received', { mimeType, bytes: data.length });
      return { data, mimeType };
    } catch (error) {
      this.logger.error('Error making Lexware Office file request', { error });
      return null;
    }
  }

  async writeRequest<T>(
    path: string,
    method: 'POST' | 'PUT',
    body: unknown,
  ): Promise<WriteResult<T> | null> {
    const url = `${LEXWARE_API_BASE}${path}`;
    this.logger.log('Making Lexware Office write request', { url, method });
    try {
      const response = await this.withRetry(() =>
        fetch(url, {
          method,
          headers: this.authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body),
        }),
      );
      let responseBody: unknown;
      try { responseBody = await response.json(); } catch { responseBody = null; }
      if (!response.ok) {
        this.logger.error('Lexware Office write request failed', { status: response.status, error: responseBody });
        return { ok: false, status: response.status, error: responseBody };
      }
      this.logger.log('Lexware Office write response', { status: response.status });
      return { ok: true, data: responseBody as T };
    } catch (error) {
      this.logger.error('Error making Lexware Office write request', { error });
      return null;
    }
  }

  async deleteRequest(
    path: string,
  ): Promise<{ ok: true } | { ok: false; status: number; error: unknown } | null> {
    const url = `${LEXWARE_API_BASE}${path}`;
    this.logger.log('Making Lexware Office DELETE request', { url });
    try {
      const response = await this.withRetry(() =>
        fetch(url, { method: 'DELETE', headers: this.authHeaders() }),
      );
      if (response.status === 204) return { ok: true };
      let responseBody: unknown;
      try { responseBody = await response.json(); } catch { responseBody = null; }
      this.logger.error('Lexware Office DELETE request failed', { status: response.status, error: responseBody });
      return { ok: false, status: response.status, error: responseBody };
    } catch (error) {
      this.logger.error('Error making Lexware Office DELETE request', { error });
      return null;
    }
  }

  async fileUpload<T>(
    path: string,
    file: { buffer: Buffer; fileName: string; mimeType: string },
  ): Promise<WriteResult<T> | null> {
    const url = `${LEXWARE_API_BASE}${path}`;
    const boundary = `----LexwareBoundary${Date.now().toString(16)}`;
    const CRLF = '\r\n';
    const partHeader = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="${file.fileName}"${CRLF}` +
      `Content-Type: ${file.mimeType}${CRLF}` +
      CRLF,
    );
    const partFooter = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
    const body = Buffer.concat([partHeader, file.buffer, partFooter]);
    const headers = {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
    };
    this.logger.log('Making Lexware Office file upload request', {
      url,
      fileName: file.fileName,
      mimeType: file.mimeType,
      bytes: file.buffer.length,
    });
    try {
      const response = await this.withRetry(() =>
        fetch(url, { method: 'POST', headers, body }),
      );
      let responseBody: unknown;
      try { responseBody = await response.json(); } catch { responseBody = null; }
      if (!response.ok) {
        this.logger.error('Lexware Office file upload failed', { status: response.status, error: responseBody });
        return { ok: false, status: response.status, error: responseBody };
      }
      this.logger.log('Lexware Office file upload response', { status: response.status });
      return { ok: true, data: responseBody as T };
    } catch (error) {
      this.logger.error('Error making Lexware Office file upload request', { error });
      return null;
    }
  }

  async multipartRequest<T>(path: string, formData: FormData): Promise<WriteResult<T> | null> {
    const url = `${LEXWARE_API_BASE}${path}`;
    this.logger.log('Making Lexware Office multipart request', { url });
    try {
      const response = await this.withRetry(() =>
        fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': USER_AGENT, Authorization: `Bearer ${this.apiKey}` },
          body: formData,
        }),
      );
      let responseBody: unknown;
      try { responseBody = await response.json(); } catch { responseBody = null; }
      if (!response.ok) {
        this.logger.error('Lexware Office multipart request failed', { status: response.status, error: responseBody });
        return { ok: false, status: response.status, error: responseBody };
      }
      return { ok: true, data: responseBody as T };
    } catch (error) {
      this.logger.error('Error making Lexware Office multipart request', { error });
      return null;
    }
  }

  async writeWithRetry<T>(
    path: string,
    method: 'POST' | 'PUT',
    body: Record<string, unknown>,
    fetchFreshVersion?: () => Promise<Record<string, unknown> | null>,
  ): Promise<WriteResult<T> | null> {
    const result = await this.writeRequest<T>(path, method, body);
    if (result && !result.ok && result.status === 409 && method === 'PUT' && fetchFreshVersion) {
      this.logger.log('409 conflict on PUT — re-fetching and retrying once', { path });
      const fresh = await fetchFreshVersion();
      if (!fresh) return result;
      const merged = { ...body, version: fresh.version };
      return this.writeRequest<T>(path, method, merged);
    }
    return result;
  }

  async paginateAll<T>(
    basePath: string,
    params: URLSearchParams,
    pageSize = 250,
  ): Promise<T[] | null> {
    const all: T[] = [];
    let page = 0;
    let isLast = false;
    while (!isLast) {
      params.set('page', String(page));
      params.set('size', String(pageSize));
      const data = await this.request<{ content: T[]; last: boolean }>(
        `${basePath}?${params.toString()}`,
      );
      if (!data) return null;
      all.push(...(data.content ?? []));
      isLast = data.last ?? true;
      page++;
    }
    return all;
  }
}
