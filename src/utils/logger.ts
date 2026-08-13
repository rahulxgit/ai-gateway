import winston from 'winston';
import { env } from '../config/env';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} [${level}] ${message}${metaStr}`;
  })
);

const jsonConsoleFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: env.logLevel,
  transports: [
    new winston.transports.Console({
      format: env.nodeEnv === 'production' ? jsonConsoleFormat : consoleFormat,
    }),
  ],
});

// Dedicated logger for provider failover events — kept separate so ops can
// tail just this stream to watch routing behavior in real time.
export const failoverLogger = logger.child({ scope: 'failover' });
