import {appendFileSync} from 'node:fs';

export type Logger = {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
};

export type LogSink = {
  write(line: string): void;
};

export const StderrSink: LogSink = {
  write(line: string): void {
    process.stderr.write(line);
  },
};

export function createFileSink(path: string): LogSink {
  return {
    write(line: string): void {
      appendFileSync(path, line);
    },
  };
}

export function createJsonLogger(sink: LogSink = StderrSink): Logger {
  return {
    info(message, fields) {
      emit(sink, 'info', message, fields);
    },
    warn(message, fields) {
      emit(sink, 'warn', message, fields);
    },
  };
}

export const StderrJsonLogger: Logger = createJsonLogger(StderrSink);

function emit(
  sink: LogSink,
  level: 'info' | 'warn',
  message: string,
  fields: Record<string, unknown> | undefined,
): void {
  const event = {
    '@timestamp': new Date().toISOString(),
    'log.level': level,
    'service.name': 'agent-evals',
    message,
    ...fields,
  };
  sink.write(JSON.stringify(event) + '\n');
}
