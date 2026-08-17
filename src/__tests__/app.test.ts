import request from 'supertest';
import path from 'path';
import { runMigrations } from '../database/client';

// See upload.test.ts for why this is mocked rather than exercised for real
// here — pdfjs-dist is ESM-only and Jest can't execute it, though it's
// been verified working end-to-end under real Node via manual curl tests.
jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({
          items: [{ str: 'This is a test project spec.' }],
        }),
      }),
    }),
  }),
}));

import { createApp } from '../app';

beforeAll(() => {
  runMigrations();
});

const app = createApp();

describe('Request correlation ids', () => {
  it('assigns a UUID correlation id and returns it as X-Request-ID', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('generates a different correlation id for each request', async () => {
    const first = await request(app).get('/health');
    const second = await request(app).get('/health');
    expect(first.headers['x-request-id']).toBeDefined();
    expect(second.headers['x-request-id']).toBeDefined();
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });
});

describe('GET /health', () => {
  it('returns ok status with a health entry per provider', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    // 11 original providers + 10 free/free-tier providers + 2 genuinely
    // free recurring-quota providers (GitHub Models, Cohere).
    expect(res.body.providers.length).toBe(23);
  });
});

describe('GET /providers', () => {
  it('lists all supported providers and which are configured', async () => {
    const res = await request(app).get('/providers');
    expect(res.status).toBe(200);
    expect(res.body.all).toEqual(
      expect.arrayContaining([
        'gemini',
        'anthropic',
        'openai',
        'groq',
        'together',
        'openrouter',
        'huggingface',
        'deepseek',
        'kimi',
        'cerebras',
        'mistral',
      ])
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

  it('accepts a large code paste (~2.3M characters, ~50k lines) that would have been rejected by the old 32k-char limit', async () => {
    const bigCode = Array.from({ length: 50_000 }, (_, i) => `function example${i}() { return ${i} * 2; }`).join(
      '\n'
    );
    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: bigCode }] });
    // Reaches the router (503 no-providers) rather than being rejected at
    // the validation layer (400 invalid body) — that's the fix being tested.
    expect(res.status).toBe(503);
    expect(res.body.error).not.toMatch(/Invalid request body/i);
  });

  // Regression test: chatRequestSchema.maxTokens was previously capped at
  // 65536, silently rejecting valid requests to DeepSeek (real ceiling
  // 384,000) with a 400 before they ever reached the adapter's own correct
  // per-provider clamping. A maxTokens value above the old cap but within
  // DeepSeek's real ceiling must now pass validation and reach the router
  // (503 no-providers-configured in this test env), not fail at 400.
  it('accepts a maxTokens value above the old 65536 cap, up to DeepSeek\'s real 384000 ceiling', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 200000 });
    expect(res.status).toBe(503);
    expect(res.body.error).not.toMatch(/Invalid request body/i);
  });

  it('still rejects a maxTokens value above every provider\'s real ceiling', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 500000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request body');
  });

  it('rejects an oversized non-chat JSON request with 413', async () => {
    const oversizedBody = { name: 'x'.repeat(2_100_000) };
    const res = await request(app).post('/sessions').send(oversizedBody);
    expect(res.status).toBe(413);
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

describe('DELETE session routes', () => {
  it('deletes a session via the canonical plural /sessions/:id route', async () => {
    const createRes = await request(app).post('/sessions').send({ title: 'To delete' });
    const id = createRes.body.id;

    const deleteRes = await request(app).delete(`/sessions/${id}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app).get('/sessions');
    expect(listRes.body.some((s: { id: string }) => s.id === id)).toBe(false);
  });

  it('still accepts the deprecated singular /session/:id route as an alias', async () => {
    const createRes = await request(app).post('/sessions').send({ title: 'To delete via legacy route' });
    const id = createRes.body.id;

    const deleteRes = await request(app).delete(`/session/${id}`);
    expect(deleteRes.status).toBe(204);

    const listRes = await request(app).get('/sessions');
    expect(listRes.body.some((s: { id: string }) => s.id === id)).toBe(false);
  });
});

describe('POST /uploads', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'sample.pdf');

  it('extracts text from an uploaded PDF', async () => {
    const res = await request(app).post('/uploads').attach('file', fixturePath);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('text');
    expect(res.body.extractedText).toContain('test project spec');
  });

  it('rejects requests with no file attached', async () => {
    const res = await request(app).post('/uploads');
    expect(res.status).toBe(400);
  });

  it('saves the extracted text into a project workspace when projectId is given', async () => {
    const createRes = await request(app).post('/projects').send({ name: 'Upload Test Project' });
    const projectId = createRes.body.projectId;

    const uploadRes = await request(app)
      .post('/uploads')
      .field('projectId', projectId)
      .attach('file', fixturePath);

    expect(uploadRes.body.savedToProject).toBe(true);

    const filesRes = await request(app).get(`/projects/${projectId}/files`);
    expect(filesRes.body.some((f: { path: string }) => f.path === 'uploads/sample.pdf')).toBe(true);
  });
});
