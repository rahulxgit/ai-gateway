import request from 'supertest';
import { runMigrations } from '../database/client';
import { createApp } from '../app';

beforeAll(() => {
  runMigrations();
});

const app = createApp();

describe('GET /health', () => {
  it('returns ok status with a health entry per provider', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.providers.length).toBe(7);
  });
});

describe('GET /providers', () => {
  it('lists all supported providers and which are configured', async () => {
    const res = await request(app).get('/providers');
    expect(res.status).toBe(200);
    expect(res.body.all).toEqual(
      expect.arrayContaining(['gemini', 'anthropic', 'openai', 'groq', 'together', 'openrouter', 'huggingface'])
    );
  });
});

describe('POST /chat validation', () => {
  it('rejects an empty messages array', async () => {
    const res = await request(app).post('/chat').send({ messages: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request body');
  });

  it('rejects an invalid taskType', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }], taskType: 'not-a-real-task' });
    expect(res.status).toBe(400);
  });

  it('returns 503 when no providers are configured (valid body, no keys set)', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(503);
  });
});

describe('Project + workspace API', () => {
  it('creates a project, writes a file, and reads it back', async () => {
    const createRes = await request(app)
      .post('/projects')
      .send({ name: 'API Test Project', goal: 'verify endpoints' });
    expect(createRes.status).toBe(201);
    const projectId = createRes.body.projectId;

    const fileRes = await request(app)
      .put(`/projects/${projectId}/files`)
      .send({ path: 'src/app.ts', content: 'console.log(1)', provider: 'openai' });
    expect(fileRes.status).toBe(200);
    expect(fileRes.body.version).toBe(1);

    const getRes = await request(app).get(`/projects/${projectId}/files/src/app.ts`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.content).toBe('console.log(1)');
  });

  it('404s for a project that does not exist', async () => {
    const res = await request(app).get('/projects/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('404 handler', () => {
  it('returns a structured 404 for unknown routes', async () => {
    const res = await request(app).get('/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Not found');
  });
});
