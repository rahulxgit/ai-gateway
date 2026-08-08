// Verifies the optional bearer-token gate added around /chat and /uploads:
// when GATEWAY_API_KEY is unset (default), everything behaves exactly as
// before (open). When set, those routes require a matching bearer token,
// while read-only routes (sessions, analytics, projects) stay open either
// way since they don't spend provider tokens.
describe('requireGatewayKey', () => {
  afterEach(() => {
    delete process.env.GATEWAY_API_KEY;
    jest.resetModules();
  });

  it('lets requests through untouched when GATEWAY_API_KEY is unset', async () => {
    jest.resetModules();
    delete process.env.GATEWAY_API_KEY;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireGatewayKey } = require('../middleware');
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    requireGatewayKey({ headers: {} } as any, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects requests with no/invalid bearer token when GATEWAY_API_KEY is set', async () => {
    process.env.GATEWAY_API_KEY = 'secret-123';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireGatewayKey } = require('../middleware');
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    requireGatewayKey({ headers: {} } as any, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('lets requests through with the correct bearer token', async () => {
    process.env.GATEWAY_API_KEY = 'secret-123';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireGatewayKey } = require('../middleware');
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    requireGatewayKey(
      { headers: { authorization: 'Bearer secret-123' } } as any,
      res,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
