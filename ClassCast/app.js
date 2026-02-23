// ==========================================
// ClassCast - Unified Logic
// ==========================================

let sb = null;
let currentUser = null;
// Pull the token from browser memory if it exists
let googleProviderToken = sessionStorage.getItem('googleClassroomToken') || null; 
const TEACHER_EMAIL = 'wwilson@mtps.us'; 

let currentAssignmentId = null;
let activeQuestions = [];
let answeredCheckpoints = [];
let sessionStartTime = null;
let editingAssignmentId = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.supabase !== 'undefined') {
        const url = window.SUPABASE_URL || 'https://mvxuubwbtkhdbhuadxtu.supabase.co';
        const key = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12eHV1YndidGtoZGJodWFkeHR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExODQyMDgsImV4cCI6MjA4Njc2MDIwOH0.FzsVt0bmWnrc3pYUWfJyS-9PE9oJY1ZzoGbax3q_LGk';
        sb = window.supabase.createClient(url, key);
        
        // Listen for logins and save the Google Token permanently to browser memory
        sb.auth.onAuthStateChange((event, session) => {
            if (session && session.provider_token) {
                googleProviderToken = session.provider_token;
                sessionStorage.setItem('googleClassroomToken', session.provider_token);
            }
        });

    } else {
        alert('Supabase not loaded. Check config.js path.');
        return;
    }

    await checkUser();
    
    const player = document.getElementById('audioPlayer');
    if(player) {
        player.addEventListener('timeupdate', handleAudioTimeUpdate);
        player.addEventListener('play', () => { if(!sessionStartTime) sessionStartTime = new Date(); });
        player.addEventListener('ended', handleAudioComplete);
    }
});

// ================= VIEW MANAGER =================
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    const view = document.getElementById(viewId);
    if(view) {
        view.classList.remove('hidden');
        view.style.display = 'block'; 
    }
    
    if (viewId === 'teacherView') window.switchAdminPanel('admin-assignments');
    if (viewId === 'studentView') loadStudentClasses();
}

window.toggleAdminView = function() {
    const teacherView = document.getElementById('teacherView');
    if (!teacherView.classList.contains('hidden')) {
        switchView('studentView');
    } else {
        switchView('teacherView');
    }
};

window.switchAdminPanel = function(panelId, event = null) {
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
