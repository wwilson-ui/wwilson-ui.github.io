// ============================================
// SUPABASE CONFIGURATION
// ============================================
// Your Supabase credentials

const SUPABASE_URL = 'https://dfmugytablgldpkadfrl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmbXVneXRhYmxnbGRwa2FkZnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTQyOTYsImV4cCI6MjA4NjA5MDI5Nn0.DYwDl1XAe5xlskaNyKJiDiojBohEi0Im-az2qR1X5nY';

// Initialize Supabase client
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
