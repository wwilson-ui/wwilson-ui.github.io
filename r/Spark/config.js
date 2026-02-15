// ============================================
// SUPABASE CONFIGURATION
// ============================================
// Your Supabase credentials

const SUPABASE_URL = 'https://dfmugytablgldpkadfrl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmbXVneXRhYmxnbGRwa2FkZnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTQyOTYsImV4cCI6MjA4NjA5MDI5Nn0.DYwDl1XAe5xlskaNyKJiDiojBohEi0Im-az2qR1X5nY';

// Check if the library loaded
if (typeof window.supabase === 'undefined') {
    console.error('Supabase library not loaded! Check your script tags in index.html');
} else {
    // Initialize the client and attach it to the window so app.js can use it
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase Client Initialized');
}
