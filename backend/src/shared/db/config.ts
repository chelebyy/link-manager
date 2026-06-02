import dotenv from 'dotenv';
import { db } from './index.js';

dotenv.config();

const isDevelopment = process.env.NODE_ENV !== 'production';

export const dbConfig = {
  useSqlite: isDevelopment && !db.isPostgres,
};
