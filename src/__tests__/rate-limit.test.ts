import request from 'supertest';
import { createApp } from '../app';

const app = createApp();

describe('rate limit split', () => {
  it('uses the generous read limiter for /providers', async () => {
    const response = await request(app).get('/providers');

    expect(response.headers['ratelimit-limit']).toBe('300');
  });

  it('uses the stricter chat limiter for POST /chat', async () => {
    const response = await request(app)
      .post('/chat')
      .send({});

    expect(response.headers['ratelimit-limit']).toBe('60');
  });

  it('uses the stricter chat limiter for POST /chat/stream', async () => {
    const response = await request(app)
      .post('/chat/stream')
      .send({});

    expect(response.headers['ratelimit-limit']).toBe('60');
  });
});
