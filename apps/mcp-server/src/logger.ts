import { appendFileSync, statSync, renameSync } from 'fs';
import { join } from 'path';

const DEFAULT_LOG_PATH = join(import.meta.dirname, 'mcp-server.log');
const LOG_FILE = process.env.MCP_LOG_FILE ?? DEFAULT_LOG_PATH;
const MAX_BYTES = parseInt(process.env.MCP_LOG_MAX_BYTES ?? '10485760', 10); // 10 MB default
const LOG_FORMAT = process.env.MCP_LOG_FORMAT ?? 'text'; // 'json' | 'text'

function rotateIfNeeded(): void {
	try {
		const size = statSync(LOG_FILE).size;
		if (size >= MAX_BYTES) {
			renameSync(LOG_FILE, `${LOG_FILE}.1`);
		}
	} catch {
		// file doesn't exist yet — fine
	}
}

function formatMessage(level: string, message: string, data?: unknown): string {
	const timestamp = new Date().toISOString();
	if (LOG_FORMAT === 'json') {
		return JSON.stringify({
			timestamp,
			level,
			message,
			...(data !== undefined ? { data } : {}),
		}) + '\n';
	}
	const dataStr = data !== undefined ? `\n${JSON.stringify(data, null, 2)}` : '';
	return `[${timestamp}] [${level}] ${message}${dataStr}\n`;
}

export const logger = {
	log(message: string, data?: unknown) {
		rotateIfNeeded();
		appendFileSync(LOG_FILE, formatMessage('INFO', message, data));
	},
	error(message: string, data?: unknown) {
		rotateIfNeeded();
		const logMessage = formatMessage('ERROR', message, data);
		appendFileSync(LOG_FILE, logMessage);
		console.error(logMessage);
	},
};
