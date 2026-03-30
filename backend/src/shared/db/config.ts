import dotenv from 'dotenv';
dotenv.config();

const isDevelopment = process.env.NODE_ENV !== 'production';

export const dbConfig = {
  useSqlite: isDevelopment && !process.env.DATABASE_URL?.includes('postgresql'),
};
