import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string | undefined;
  githubToken: string | undefined;
  syncIntervalMinutes: number;
  frontendUrl: string;
  apiKey: string | undefined;
}

export function validateConfig(env: NodeJS.ProcessEnv): AppConfig {
  const nodeEnv = env.NODE_ENV || 'development';
  const databaseUrl = env.DATABASE_URL;
  const apiKey = env.LINK_MANAGER_API_KEY;

  if (!databaseUrl) {
    if (nodeEnv === 'production') {
      throw new Error(
        'DATABASE_URL is required in production. Refusing to start without an explicit database connection string.',
      );
    }
    // Development: warn but continue (db layer falls back to local SQLite).
    // eslint-disable-next-line no-console
    console.warn(
      '[config] DATABASE_URL is not set; falling back to local SQLite for development. Set DATABASE_URL to use PostgreSQL.',
    );
  }

  return {
    port: parseInt(env.PORT || '3000', 10),
    nodeEnv,
    databaseUrl,
    githubToken: env.GITHUB_TOKEN,
    syncIntervalMinutes: parseInt(env.SYNC_INTERVAL_MINUTES || '30', 10),
    frontendUrl: env.FRONTEND_URL || 'http://localhost:5173',
    apiKey,
  };
}

export const config = validateConfig(process.env);
export const apiKey = config.apiKey;
