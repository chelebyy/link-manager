import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/linkmanager',
  githubToken: process.env.GITHUB_TOKEN,
  syncIntervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES || '30', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};
