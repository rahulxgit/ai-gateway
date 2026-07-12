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

describe('GET /health', () => {
  it('returns ok status with a health entry per provider', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.providers.length).toBe(11);
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
