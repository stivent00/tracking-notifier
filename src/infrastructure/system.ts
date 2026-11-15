import { randomBytes, randomUUID } from 'node:crypto';
import type { Clock } from '../application/ports/clock';
import type { IdGenerator } from '../application/ports/id-generator';
import type { SecretGenerator } from '../application/ports/secret-generator';

export const systemClock: Clock = { ahora: () => new Date() };

export const uuidGenerator: IdGenerator = { nuevoId: () => randomUUID() };

export const secretGenerator: SecretGenerator = {
  nuevoSecreto: () => `whsec_${randomBytes(32).toString('base64url')}`,
};
