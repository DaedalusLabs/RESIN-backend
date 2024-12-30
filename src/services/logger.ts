import pino from 'pino';

// Create a central logger instance
const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      messageFormat: '[{module}] - {msg}',
      colorize: true,
      ignore: 'pid,hostname,module',
    },
  },
  // Add any other Pino options here
});

export default logger;
