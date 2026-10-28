export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

type LogFields = Record<string, unknown>;

const consoleMethod: Record<LogLevel, 'info' | 'warn' | 'error'> = {
	INFO: 'info',
	WARN: 'warn',
	ERROR: 'error',
};

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
	console[consoleMethod[level]](
		JSON.stringify({
			...fields,
			timestamp: new Date().toISOString(),
			level,
			event,
		}),
	);
}
