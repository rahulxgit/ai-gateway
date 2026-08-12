import { runMigrations } from '../database/client';
import {
  createSession,
  getOrCreateSession,
  saveMessage,
  saveMessages,
  getSessionHistory,
  historyAsChatMessages,
} from '../services/conversation.service';

beforeAll(() => {
  runMigrations();
});

describe('getOrCreateSession', () => {
  it('creates a brand new "New Chat" session when no id is given', () => {
    const session = getOrCreateSession();
    expect(session.id).toBeTruthy();
    expect(session.title).toBe('New Chat');
  });

  it('returns the existing session when a valid id is given', () => {
    const created = createSession('My Session');
    const fetched = getOrCreateSession(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.title).toBe('My Session');
  });

  it('falls back to creating a new session when the given id does not exist', () => {
    const session = getOrCreateSession('00000000-0000-0000-0000-000000000000');
    expect(session.id).not.toBe('00000000-0000-0000-0000-000000000000');
    expect(session.title).toBe('New Chat');
  });
});

describe('saveMessages (batched)', () => {
  it('persists every message in the batch under the same session', () => {
    const session = createSession();
    const saved = saveMessages(session.id, [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second', provider: 'gemini', model: 'gemini-3.1-flash-lite' },
    ]);

    expect(saved).toHaveLength(2);
    const history = getSessionHistory(session.id);
    expect(history.map((m) => m.content)).toEqual(['first', 'second']);
    expect(history[1].provider).toBe('gemini');
  });

  it('returns an empty array and writes nothing for an empty batch', () => {
    const session = createSession();
    const saved = saveMessages(session.id, []);
    expect(saved).toEqual([]);
    expect(getSessionHistory(session.id)).toEqual([]);
  });

  it('produces the same persisted result as calling saveMessage individually', () => {
    const batchedSession = createSession();
    saveMessages(batchedSession.id, [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);

    const individualSession = createSession();
    saveMessage(individualSession.id, 'user', 'hi');
    saveMessage(individualSession.id, 'assistant', 'hello');

    const batchedContents = historyAsChatMessages(batchedSession.id).map((m) => m.content);
    const individualContents = historyAsChatMessages(individualSession.id).map((m) => m.content);
    expect(batchedContents).toEqual(individualContents);
  });
});
