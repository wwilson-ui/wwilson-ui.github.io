// ============================================
// SUPABASE CONFIGURATION
// ============================================
// Your Supabase credentials

const SUPABASE_URL = 'https://dfmugytablgldpkadfrl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmbXVneXRhYmxnbGRwa2FkZnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTQyOTYsImV4cCI6MjA4NjA5MDI5Nn0.DYwDl1XAe5xlskaNyKJiDiojBohEi0Im-az2qR1X5nY';

// Initialize the client globally so app.js can find it immediately
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Initialize after DOM loads
if (typeof window !== 'undefined' && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
