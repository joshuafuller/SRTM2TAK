import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Setup server for Node.js tests; lifecycle is controlled in tests/setup.ts
export const server = setupServer(...handlers);
