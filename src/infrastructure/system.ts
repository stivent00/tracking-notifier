import { randomUUID } from 'node:crypto';
import type { Clock } from '../application/ports/clock';
import type { IdGenerator } from '../application/ports/id-generator';

export const systemClock: Clock = { ahora: () => new Date() };

export const uuidGenerator: IdGenerator = { nuevoId: () => randomUUID() };
