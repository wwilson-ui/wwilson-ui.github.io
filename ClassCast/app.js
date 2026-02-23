// ==========================================
// ClassCast - Unified Logic
// ==========================================

let sb = null;
let currentUser = null;
const TEACHER_EMAIL = 'wwilson@mtps.us'; 

// State tracking
let currentAssignmentId = null;
let activeQuestions = [];
let answeredCheckpoints = [];
let sessionStartTime = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.supabase !== 'undefined') {
        // Fallback to manual keys if config.js is missing for some reason
        const url = window.SUPABASE_URL || 'https://mvxuubwbtkhdbhuadxtu.supabase.co';
        const key = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12eHV1YndidGtoZGJodWFkeHR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExODQyMDgsImV4cCI6MjA4Njc2MDIwOH0.FzsVt0bmWnrc3pYUWfJyS-9PE9oJY1ZzoGbax3q_LGk';
        sb = window.supabase.createClient(url, key);
    } else {
        alert('Supabase not loaded. Check config.js path.');
        return;
    }

    await checkUser();
    
    // Setup Audio Player Event Listeners
    const player = document.getElementById('audioPlayer');
    if(player) {
        player.addEventListener('timeupdate', handleAudioTimeUpdate);
        player.addEventListener('play', () => {
            if(!sessionStartTime) sessionStartTime = new Date();
        });
        player.addEventListener('ended', handleAudioComplete);
    }
});

// ================= VIEW MANAGER =================
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    const view = document.getElementById(viewId);
    if(view) {
        view.classList.remove('hidden');
        view.style.display = 'block'; // Fallback
    }
    
    if (viewId === 'teacherView') loadTeacherData();
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

// ================= AUTHENTICATION =================
async function checkUser() {
    const { data: { session } } = await sb.auth.getSession();
    const authSection = document.getElementById('authSection');
    const adminToggle = document.getElementById('adminToggle');
    const loginBtnWrapper = document.getElementById('loginBtnWrapper');
    
    if (session) {
        currentUser = session.user;
        const isTeacher = currentUser.email.toLowerCase() === TEACHER_EMAIL.toLowerCase();
        
        adminToggle.style.display = isTeacher ? 'block' : 'none';
        authSection.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: 600; font-size: 0.9rem;">${currentUser.email.split('@')[0]}</span>
                <button onclick="signOut()" class="logout-btn">Log Out</button>
            </div>
        `;
        switchView('studentView');
    } else {
        currentUser = null;
        adminToggle.style.display = 'none';
        authSection.innerHTML = ''; 
        
        loginBtnWrapper.innerHTML = `
            <button onclick="signIn()" class="google-btn">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Sign in
            </button>
        `;
        switchView('loginView');
    }
}

window.signIn = async function() {
    await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: 'select_account' } } });
};

window.signOut = async function() {
    await sb.auth.signOut();
    window.location.reload();
};

// ================= TEACHER: CREATE ASSIGNMENT =================
window.addQuestionBuilderRow = function() {
    const list = document.getElementById('questionsBuilderList');
    const id = Date.now();
    const div = document.createElement('div');
    div.id = `qb-${id}`;
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginBottom = '10px';
    div.innerHTML = `
        <input type="number" class="q-time" placeholder="Timestamp (seconds)" style="width: 150px; margin:0;" min="0">
        <input type="text" class="q-text" placeholder="Question Text" style="flex:1; margin:0;">
        <button class="danger-btn" onclick="document.getElementById('qb-${id}').remove()">X</button>
    `;
    list.appendChild(div);
};

window.saveNewAssignment = async function() {
    console.log("Publishing assignment...");
    
    const title = document.getElementById('newAssignTitle').value;
    const targetClass = document.getElementById('newAssignClass').value;
    let audioUrl = document.getElementById('newAssignAudio').value; // Changed to 'let' so we can modify it
    const subSpark = document.getElementById('newAssignSpark').value;
    const transcript = document.getElementById('newAssignTranscript').value;

    if(!title || !audioUrl) { 
        alert("Title and Audio URL are required fields."); 
        return; 
    }

    // --- NEW: Convert Google Drive link to a direct streaming link ---
    if (audioUrl.includes('drive.google.com/file/d/')) {
        const fileIdMatch = audioUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (fileIdMatch && fileIdMatch[1]) {
            // Reformat into a direct streamable URL
            audioUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
        }
    }
    // -----------------------------------------------------------------

    try {
        // 1. Insert Assignment
        const { data: assignData, error: assignError } = await sb.from('classcast_assignments').insert([{
            title: title,
            target_class: targetClass,
            audio_url: audioUrl, // It will now save the clean, streamable link
            subspark_url: subSpark,
            transcript: transcript
        }]).select();

    if(assignError) { alert("Error saving assignment: " + assignError.message); return; }
    
    const newId = assignData[0].id;

    // 2. Insert Questions
    const questionRows = document.querySelectorAll('#questionsBuilderList > div');
    const questionsToInsert = [];
    questionRows.forEach(row => {
        const time = row.querySelector('.q-time').value;
        const text = row.querySelector('.q-text').value;
        if(time && text) {
            questionsToInsert.push({ assignment_id: newId, trigger_second: parseInt(time), question_text: text });
        }
    });

    if(questionsToInsert.length > 0) {
        await sb.from('classcast_questions').insert(questionsToInsert);
    }

    alert("Assignment published successfully!");
    
    // Clear form
    document.getElementById('newAssignTitle').value = '';
    document.getElementById('newAssignClass').value = '';
    document.getElementById('newAssignAudio').value = '';
    document.getElementById('newAssignSpark').value = '';
    document.getElementById('newAssignTranscript').value = '';
    document.getElementById('questionsBuilderList').innerHTML = '';
    
    loadTeacherData();
};

window.deleteAssignment = async function(id) {
    if(!confirm("Are you sure? This deletes all student progress for this assignment too.")) return;
    await sb.from('classcast_assignments').delete().eq('id', id);
    loadTeacherData();
};

// ================= STUDENT: LOAD & PLAY ASSIGNMENT =================
async function loadStudentClasses() {
    // Fetch unique classes
    const { data } = await sb.from('classcast_assignments').select('target_class');
    if(!data) return;
    
    const classes = [...new Set(data.map(d => d.target_class).filter(c => c))];
    const select = document.getElementById('studentClassFilter');
    select.innerHTML = '<option value="">-- Select Your Class/Period --</option>';
    classes.forEach(c => select.innerHTML += `<option value="${c}">${c}</option>`);
}

window.loadStudentAssignments = async function() {
    const classFilter = document.getElementById('studentClassFilter').value;
    const assignSelect = document.getElementById('studentAssignmentSelect');
    
    if(!classFilter) {
        assignSelect.classList.add('hidden');
        return;
    }

    const { data } = await sb.from('classcast_assignments').select('*').eq('target_class', classFilter);
    
    assignSelect.innerHTML = '<option value="">-- Choose Assignment --</option>';
    data.forEach(d => assignSelect.innerHTML += `<option value="${d.id}">${d.title}</option>`);
    assignSelect.classList.remove('hidden');
};

window.startAssignment = async function() {
    const assignId = document.getElementById('studentAssignmentSelect').value;
    if(!assignId) return;

    // Reset tracking state
    currentAssignmentId = assignId;
    answeredCheckpoints = [];
    sessionStartTime = null;
    document.getElementById('subsparkLinkContainer').classList.add('hidden');

    // Fetch details
    const { data: assignData } = await sb.from('classcast_assignments').select('*').eq('id', assignId).single();
    const { data: qData } = await sb.from('classcast_questions').select('*').eq('assignment_id', assignId);
    
    if(!assignData) return;

    activeQuestions = qData || [];
    
    // Update UI
    document.getElementById('activeAssignmentTitle').innerText = assignData.title;
    document.getElementById('transcriptText').innerText = assignData.transcript || "No transcript provided.";
    
    const audioPlayer = document.getElementById('audioPlayer');
    document.getElementById('audioSource').src = assignData.audio_url;
    audioPlayer.load();

    if(assignData.subspark_url) {
        document.getElementById('activeSubsparkLink').href = assignData.subspark_url;
    }

    document.getElementById('activeAssignmentCard').classList.remove('hidden');
};

// ================= AUDIO TRACKING LOGIC =================
function handleAudioTimeUpdate() {
    if(!currentAssignmentId) return;
    const player = document.getElementById('audioPlayer');
    const currentTime = Math.floor(player.currentTime);

    // Check for interactive question
    const question = activeQuestions.find(q => q.trigger_second === currentTime);
    
    if (question && !answeredCheckpoints.includes(question.id)) {
        player.pause();
        document.getElementById('questionModal').classList.remove('hidden');
        document.getElementById('questionText').innerText = question.question_text;
        document.getElementById('feedback').innerText = "";
        
        document.getElementById('submitAnswerBtn').onclick = () => {
            const answer = document.getElementById('studentAnswer').value;
            if(answer.length > 3) {
                document.getElementById('questionModal').classList.add('hidden');
                document.getElementById('studentAnswer').value = ''; 
                answeredCheckpoints.push(question.id);
                player.play();
                logProgress(currentTime, 'in_progress');
            } else {
                document.getElementById('feedback').innerText = "Please provide a valid answer.";
            }
        };
    }
    
    // Debounce progress saving (every 10 seconds)
    if(currentTime > 0 && currentTime % 10 === 0) {
        logProgress(currentTime, 'in_progress');
    }
}

function handleAudioComplete() {
    logProgress(Math.floor(document.getElementById('audioPlayer').currentTime), 'completed');
    
    // Show SubSpark Link if it exists
    if(document.getElementById('activeSubsparkLink').getAttribute('href') !== '#') {
        document.getElementById('subsparkLinkContainer').classList.remove('hidden');
    }
}

async function logProgress(currentSecond, status) {
    if(!currentUser || !currentAssignmentId) return;
    
    // Calculate total listen time (minutes/seconds could be formatted later)
    let totalListenSeconds = 0;
    if(sessionStartTime) {
        totalListenSeconds = Math.floor((new Date() - sessionStartTime) / 1000);
    }

    await sb.from('classcast_progress').upsert({
        student_email: currentUser.email,
        assignment_id: currentAssignmentId,
        furthest_second: currentSecond,
        total_session_seconds: totalListenSeconds,
        status: status,
        last_updated: new Date().toISOString()
    }, { onConflict: 'student_email, assignment_id' });
}

// ================= TEACHER DASHBOARD LOGIC =================
async function loadTeacherData() {
    const tbody = document.getElementById('teacherProgressTable');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';
    
    // We fetch assignments and progress separately and join them locally to keep it simple
    const { data: assignments } = await sb.from('classcast_assignments').select('id, title');
    const { data: progress } = await sb.from('classcast_progress').select('*');
    
    if(!assignments || assignments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No assignments created yet.</td></tr>';
        return;
    }

    let html = '';
    
    // First, list assignments to allow deleting even if no progress
    assignments.forEach(a => {
        const studentRows = (progress || []).filter(p => p.assignment_id === a.id);
        
        if(studentRows.length === 0) {
            html += `
                <tr>
                    <td><strong>${a.title}</strong></td>
                    <td colspan="4" style="color:#666; font-style:italic;">No student data yet.</td>
                    <td><button class="danger-btn" onclick="deleteAssignment(${a.id})">Delete</button></td>
                </tr>`;
        } else {
            studentRows.forEach((p, index) => {
                const isFirstRow = index === 0;
                const startTime = new Date(p.last_updated).toLocaleString();
                const statusBadge = p.status === 'completed' ? '<span style="color:green;font-weight:bold;">Completed</span>' : 'In Progress';
                
                html += `
                    <tr>
                        <td>${isFirstRow ? `<strong>${a.title}</strong>` : ''}</td>
                        <td>${p.student_email}</td>
                        <td>${statusBadge}</td>
                        <td>${startTime}</td>
                        <td>${p.total_session_seconds || 0}s</td>
                        <td>${isFirstRow ? `<button class="danger-btn" onclick="deleteAssignment(${a.id})">Delete</button>` : ''}</td>
                    </tr>`;
            });
        }
    });

    tbody.innerHTML = html;
}
