import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Credentials live in .env only — never hardcode a fallback here.
    url: (() => {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error('DATABASE_URL is not set — see .env.example');
      return url;
    })(),
  },
  verbose: true,
  strict: true,
});
