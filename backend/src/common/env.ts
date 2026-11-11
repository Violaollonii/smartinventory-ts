/**
 * Validates environment variables once at startup, so a missing or weak
 * secret stops the app immediately instead of failing on the first request.
 */
export interface Env {
  MONGODB_URI: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  PORT: number;
  FRONTEND_ORIGIN: string;
}

export function validateEnv(raw: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];

  const mongoUri = String(raw.MONGODB_URI ?? '');
  if (!/^mongodb(\+srv)?:\/\//.test(mongoUri) || mongoUri.includes('<')) {
    errors.push('MONGODB_URI must be a real mongodb:// or mongodb+srv:// connection string');
  }

  const secret = String(raw.JWT_SECRET ?? '');
  if (secret.length < 32 || secret.startsWith('replace-with')) {
    errors.push('JWT_SECRET must be a random string of at least 32 characters');
  }

  const port = Number(raw.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('PORT must be a valid port number');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment (check backend/.env):\n- ${errors.join('\n- ')}`);
  }

  return {
    ...raw,
    MONGODB_URI: mongoUri,
    JWT_SECRET: secret,
    JWT_EXPIRES_IN: String(raw.JWT_EXPIRES_IN ?? '8h'),
    PORT: port,
    FRONTEND_ORIGIN: String(raw.FRONTEND_ORIGIN ?? 'http://localhost:5173'),
  };
}
