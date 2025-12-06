import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uvvskcosmbpxqaamkimo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2dnNrY29zbWJweHFhYW1raW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NDY0ODgsImV4cCI6MjA4MDUyMjQ4OH0.fCqw5ci5g_S9f2o6dYaRWNciPiJaENWRWNiNCXmrG6k';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);