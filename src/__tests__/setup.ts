process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = ':memory:';
process.env.LOG_LEVEL = 'error';
// Deliberately leave provider API keys unset in most tests; individual test
// files set fake keys where they need isConfigured() to return true.
