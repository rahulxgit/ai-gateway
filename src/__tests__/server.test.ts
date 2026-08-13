import http from 'http';
import { createGracefulShutdown } from '../server';

describe('graceful server shutdown', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('drains the HTTP server before closing the database', () => {
    const close = jest.fn((callback?: (err?: Error) => void) => callback?.());
    const server = { close } as unknown as http.Server;
    const closeDatabase = jest.fn();
    const shutdown = createGracefulShutdown(server, closeDatabase, 1000);

    shutdown();

    expect(close).toHaveBeenCalledTimes(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  it('only performs shutdown once when invoked repeatedly', () => {
    const close = jest.fn((callback?: (err?: Error) => void) => callback?.());
    const server = { close } as unknown as http.Server;
    const closeDatabase = jest.fn();
    const shutdown = createGracefulShutdown(server, closeDatabase, 1000);

    shutdown();
    shutdown();

    expect(close).toHaveBeenCalledTimes(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  it('forces open connections closed after the drain timeout', () => {
    jest.useFakeTimers();

    const closeAllConnections = jest.fn();
    const close = jest.fn();
    const server = { close, closeAllConnections } as unknown as http.Server;
    const closeDatabase = jest.fn();
    const shutdown = createGracefulShutdown(server, closeDatabase, 1000);

    shutdown();
    jest.advanceTimersByTime(1000);

    expect(closeAllConnections).toHaveBeenCalledTimes(1);
    expect(closeDatabase).not.toHaveBeenCalled();

    jest.useRealTimers();
  });
});
