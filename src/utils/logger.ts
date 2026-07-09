import winston from 'winston';
import path from 'path';
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

export const logger = winston.createLogger({
  level: env.logLevel,
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
    }),
  ],
});

if (env.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({ format: consoleFormat }));
}

// Dedicated logger for provider failover events — kept separate so ops can
// tail just this stream to watch routing behavior in real time.
export const failoverLogger = logger.child({ scope: 'failover' });
