let sb = null;
let currentUser = null;
const TEACHER_EMAIL = 'wwilson@mtps.us'; // Same as Spark & SCOTUS

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.supabase !== 'undefined') {
        sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } else {
        alert('Supabase not loaded. Check config.js path.');
        return;
    }

    await checkUser();
    setupAudioListeners();
});

// ================= VIEW MANAGER =================
function switchView(viewId) {
    // Hide all sections, then show the requested one
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';
    
    // If opening the teacher view, refresh the data table automatically
    if (viewId === 'teacherView') {
        loadTeacherData();
    }
}

window.toggleAdminView = function() {
    // Allows teacher to toggle between testing the student view and seeing the admin panel
    const teacherView = document.getElementById('teacherView');
    if (teacherView.style.display === 'block') {
        switchView('studentView');
    } else {
        switchView('teacherView');
    }
};

// ================= AUTHENTICATION =================
async function checkUser() {
    const { data: { session } } = await sb.auth.getSession();
    const authSection = document.getElementById('authSection');
    const adminToggle = document.getElementById('adminToggle');
    const loginBtnWrapper = document.getElementById('loginBtnWrapper');
    
    if (session) {
        currentUser = session.user;
        const isTeacher = currentUser.email.toLowerCase() === TEACHER_EMAIL.toLowerCase();
        
        // Setup Navbar for logged-in user
        adminToggle.style.display = isTeacher ? 'block' : 'none';
        authSection.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: 600; font-size: 0.9rem;">${currentUser.email.split('@')[0]}</span>
                <button onclick="signOut()" class="logout-btn">Log Out</button>
            </div>
        `;
        
        // Direct user to correct view
        switchView('studentView');

    } else {
        currentUser = null;
        adminToggle.style.display = 'none';
        authSection.innerHTML = ''; // Clear navbar auth text
        
        // Show login button in the main center container
        const loginHtml = `
            <button onclick="signIn()" class="google-btn">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Sign in with MTPS Google
            </button>
        `;
        loginBtnWrapper.innerHTML = loginHtml;
        
        switchView('loginView');
    }
}

window.signIn = async function() {
    await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: 'select_account', hd: 'mtps.us' } } });
};

window.signOut = async function() {
    await sb.auth.signOut();
    window.location.reload();
};

// ================= STUDENT AUDIO LOGIC =================
function setupAudioListeners() {
    const audio = document.getElementById('audioPlayer');
    if (!audio) return; 

    let answeredCheckpoints = [];
    audio.addEventListener('timeupdate', () => {
        const currentTime = Math.floor(audio.currentTime);
        
        // Example checkpoint at 10 seconds
        if (currentTime === 10 && !answeredCheckpoints.includes(10)) {
            audio.pause();
            document.getElementById('questionModal').style.display = 'block';
            document.getElementById('questionText').innerText = "What did the narrator just say about the setting?";
            document.getElementById('feedback').innerText = "";
            
            document.getElementById('submitAnswerBtn').onclick = () => {
                const answer = document.getElementById('studentAnswer').value;
                if(answer.length > 5) { // Simple validation
                    document.getElementById('questionModal').style.display = 'none';
                    document.getElementById('studentAnswer').value = ''; // clear input
                    answeredCheckpoints.push(10);
                    audio.play();
                    logProgressToSupabase(currentTime, answeredCheckpoints.length);
                } else {
                    document.getElementById('feedback').innerText = "Please provide a longer answer.";
                }
            };
        }
    });
}

async function logProgressToSupabase(secondsListened, checkpointsPassed) {
    if(currentUser) {
        await sb.from('assignments').upsert({
            email: currentUser.email,
            seconds_listened: secondsListened,
            checkpoints_passed: checkpointsPassed,
            last_updated: new Date().toISOString()
        }, { onConflict: 'email' });
    }
}

// ================= TEACHER DASHBOARD LOGIC =================
async function loadTeacherData() {
    const tableBody = document.getElementById('studentDataTable');
    
    const { data, error } = await sb.from('assignments').select('*').order('email');
    
    if (error) {
        tableBody.innerHTML = `<tr><td colspan="3" style="color:red;">Error loading data: ${error.message}</td></tr>`;
        return;
    }

    if (data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No student data yet.</td></tr>`;
    } else {
        tableBody.innerHTML = data.map(row => `
            <tr>
                <td>${row.email}</td>
                <td>${row.seconds_listened || 0}s</td>
                <td>${row.checkpoints_passed || 0}</td>
            </tr>
        `).join('');
    }
}

// Export CSV Event Listener
document.getElementById('exportCsvBtn').addEventListener('click', async () => {
    const { data, error } = await sb.from('assignments').select('*').order('email');
    if (error || !data) return;

    let csvContent = "data:text/csv;charset=utf-8,Email,Seconds Listened,Checkpoints Passed\n";
    data.forEach(row => {
        csvContent += `${row.email},${row.seconds_listened || 0},${row.checkpoints_passed || 0}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "student_audio_progress.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});
