import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const logFile = join(tmpdir(), `mcp-test-${process.pid}.log`);
const rotatedFile = `${logFile}.1`;

function cleanup() {
	for (const f of [logFile, rotatedFile]) {
		try { unlinkSync(f); } catch { /* ignore */ }
	}
}

beforeEach(() => {
	cleanup();
	process.env.MCP_LOG_FILE = logFile;
	process.env.MCP_LOG_MAX_BYTES = '100';
	vi.resetModules();
});

afterEach(() => {
	cleanup();
	delete process.env.MCP_LOG_FILE;
	delete process.env.MCP_LOG_MAX_BYTES;
});

describe('logger', () => {
	it('writes INFO entry to log file', async () => {
		const { logger } = await import('../logger.js');
		logger.log('hello test');

		const { readFileSync } = await import('fs');
		const contents = readFileSync(logFile, 'utf8');
		expect(contents).toContain('[INFO] hello test');
	});

	it('writes ERROR entry to log file', async () => {
		const { logger } = await import('../logger.js');
		logger.error('something broke');

		const { readFileSync } = await import('fs');
		const contents = readFileSync(logFile, 'utf8');
		expect(contents).toContain('[ERROR] something broke');
	});

	it('rotates log file when size exceeds MAX_BYTES', async () => {
		// Pre-fill file past the 100-byte limit
		writeFileSync(logFile, 'x'.repeat(101));

		const { logger } = await import('../logger.js');
		logger.log('trigger rotation');

		const { existsSync } = await import('fs');
		expect(existsSync(rotatedFile)).toBe(true);
		expect(existsSync(logFile)).toBe(true);
	});

	it('does not rotate when file is under MAX_BYTES', async () => {
		writeFileSync(logFile, 'small');

		const { logger } = await import('../logger.js');
		logger.log('no rotation');

		const { existsSync } = await import('fs');
		expect(existsSync(rotatedFile)).toBe(false);
	});

	it('includes data as JSON when provided', async () => {
		const { logger } = await import('../logger.js');
		logger.log('with data', { key: 'value' });

		const { readFileSync } = await import('fs');
		const contents = readFileSync(logFile, 'utf8');
		expect(contents).toContain('"key": "value"');
	});

	it('writes JSON format when MCP_LOG_FORMAT=json', async () => {
		process.env.MCP_LOG_FORMAT = 'json';
		const { logger } = await import('../logger.js');
		logger.log('json test', { count: 42 });

		const { readFileSync } = await import('fs');
		const line = readFileSync(logFile, 'utf8').trim();
		const parsed = JSON.parse(line);
		expect(parsed.level).toBe('INFO');
		expect(parsed.message).toBe('json test');
		expect(parsed.data).toEqual({ count: 42 });
		delete process.env.MCP_LOG_FORMAT;
	});
});
