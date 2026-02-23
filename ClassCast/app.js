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
        view.style.display = 'block'; 
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

window.toggleAudioSourceUI = function() {
    const sourceType = document.querySelector('input[name="audioSourceType"]:checked').value;
    if (sourceType === 'upload') {
        document.getElementById('audioUploadContainer').classList.remove('hidden');
        document.getElementById('audioDropboxContainer').classList.add('hidden');
    } else {
        document.getElementById('audioUploadContainer').classList.add('hidden');
        document.getElementById('audioDropboxContainer').classList.remove('hidden');
    }
};

// ================= AUTHENTICATION =================
async function checkUser() {
    try {
        const { data: { session } } = await sb.auth.getSession();
        const authSection = document.getElementById('authSection');
        const adminToggle = document.getElementById('adminToggle');
        const loginBtnWrapper = document.getElementById('loginBtnWrapper');
        
        if (session) {
            currentUser = session.user;
            const isTeacher = currentUser.email.toLowerCase() === TEACHER_EMAIL.toLowerCase();
            
            if (adminToggle) adminToggle.style.display = isTeacher ? 'block' : 'none';
            if (authSection) {
                authSection.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-weight: 600; font-size: 0.9rem;">${currentUser.email.split('@')[0]}</span>
                        <button onclick="signOut()" class="logout-btn">Log Out</button>
                    </div>
                `;
            }
            switchView('studentView');
        } else {
            currentUser = null;
            if (adminToggle) adminToggle.style.display = 'none';
            if (authSection) authSection.innerHTML = ''; 
            
            if (loginBtnWrapper) {
                loginBtnWrapper.innerHTML = `
                    <button onclick="signIn()" class="google-btn">
                        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                        Sign in
                    </button>
                `;
            }
            switchView('loginView');
        }
    } catch (err) {
        console.error("Auth error:", err);
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
    const publishBtn = document.getElementById('publishBtn');
    const title = document.getElementById('newAssignTitle').value;
    const targetClass = document.getElementById('newAssignClass').value;
    const subSpark = document.getElementById('newAssignSpark').value;
    const transcript = document.getElementById('newAssignTranscript').value;
    const sourceType = document.querySelector('input[name="audioSourceType"]:checked').value;
    
    let finalAudioUrl = '';

    if(!title) { 
        alert("Assignment Title is required."); 
        return; 
    }

    try {
        publishBtn.disabled = true;
        publishBtn.innerText = 'Publishing... Please wait...';

        // --- STEP 1: Handle Audio URL Based on Selection ---
        if (sourceType === 'upload') {
            const fileInput = document.getElementById('newAssignAudioFile');
            const file = fileInput.files[0];
            
            if (!file) {
                alert("Please select an audio file to upload.");
                publishBtn.disabled = false;
                publishBtn.innerText = 'Publish Assignment';
                return;
            }

            // Generate a unique filename to prevent overwriting
            const fileExt = file.name.split('.').pop();
            const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            // Upload the file to Supabase bucket 'audio-files'
            const { data: uploadData, error: uploadError } = await sb.storage
                .from('audio-files')
                .upload(uniqueFileName, file);

            if (uploadError) {
                throw new Error("Failed to upload file to Supabase: " + uploadError.message);
            }

            // Retrieve the public URL for the newly uploaded file
            const { data: publicUrlData } = sb.storage
                .from('audio-files')
                .getPublicUrl(uniqueFileName);

            finalAudioUrl = publicUrlData.publicUrl;

        } else if (sourceType === 'dropbox') {
            let dropboxUrl = document.getElementById('newAssignAudioUrl').value;
            if (!dropboxUrl) {
                alert("Please paste a Dropbox URL.");
                publishBtn.disabled = false;
                publishBtn.innerText = 'Publish Assignment';
                return;
            }

            // Convert Dropbox URL to a direct stream link
            if (dropboxUrl.includes('dropbox.com')) {
                dropboxUrl = dropboxUrl.replace('?dl=0', '').replace('?dl=1', '');
                const joiner = dropboxUrl.includes('?') ? '&' : '?';
                finalAudioUrl = dropboxUrl + joiner + 'raw=1';
            } else {
                finalAudioUrl = dropboxUrl; // Fallback just in case
            }
        }

        // --- STEP 2: Save to Database ---
        const { data: assignData, error: assignError } = await sb.from('classcast_assignments').insert([{
            title: title,
            target_class: targetClass,
            audio_url: finalAudioUrl, 
            subspark_url: subSpark,
            transcript: transcript
        }]).select();

        if(assignError) throw assignError;
        
        const newId = assignData[0].id;

        // --- STEP 3: Save Questions ---
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
        if(document.getElementById('newAssignAudioFile')) document.getElementById('newAssignAudioFile').value = '';
        if(document.getElementById('newAssignAudioUrl')) document.getElementById('newAssignAudioUrl').value = '';
        document.getElementById('newAssignSpark').value = '';
        document.getElementById('newAssignTranscript').value = '';
        document.getElementById('questionsBuilderList').innerHTML = '';
        
        loadTeacherData();

    } catch (error) {
        console.error("Critical error saving assignment:", error);
        alert("An error occurred: " + error.message);
    } finally {
        publishBtn.disabled = false;
        publishBtn.innerText = 'Publish Assignment';
    }
};

window.deleteAssignment = async function(id) {
    if(!confirm("Are you sure? This deletes all student progress for this assignment too.")) return;
    try {
        await sb.from('classcast_assignments').delete().eq('id', id);
        loadTeacherData();
    } catch (err) {
        console.error(err);
    }
};

// ================= STUDENT: LOAD & PLAY ASSIGNMENT =================
async function loadStudentClasses() {
    try {
        const { data } = await sb.from('classcast_assignments').select('target_class');
        if(!data) return;
        
        const classes = [...new Set(data.map(d => d.target_class).filter(c => c))];
        const select = document.getElementById('studentClassFilter');
        if(select) {
            select.innerHTML = '<option value="">-- Select Your Class/Period --</option>';
            classes.forEach(c => select.innerHTML += `<option value="${c}">${c}</option>`);
        }
    } catch(err) {
        console.error("Error loading classes:", err);
    }
}

window.loadStudentAssignments = async function() {
    const classFilter = document.getElementById('studentClassFilter').value;
    const assignSelect = document.getElementById('studentAssignmentSelect');
    
    if(!classFilter) {
        assignSelect.classList.add('hidden');
        return;
    }

    try {
        const { data } = await sb.from('classcast_assignments').select('*').eq('target_class', classFilter);
        
        assignSelect.innerHTML = '<option value="">-- Choose Assignment --</option>';
        data.forEach(d => assignSelect.innerHTML += `<option value="${d.id}">${d.title}</option>`);
        assignSelect.classList.remove('hidden');
    } catch(err) {
        console.error(err);
    }
};

window.startAssignment = async function() {
    const assignId = document.getElementById('studentAssignmentSelect').value;
    if(!assignId) return;

    currentAssignmentId = assignId;
    answeredCheckpoints = [];
    sessionStartTime = null;
    const subsparkContainer = document.getElementById('subsparkLinkContainer');
    if(subsparkContainer) subsparkContainer.classList.add('hidden');

    try {
        const { data: assignData } = await sb.from('classcast_assignments').select('*').eq('id', assignId).single();
        const { data: qData } = await sb.from('classcast_questions').select('*').eq('assignment_id', assignId);
        
        if(!assignData) return;

        activeQuestions = qData || [];
        
        document.getElementById('activeAssignmentTitle').innerText = assignData.title;
        document.getElementById('transcriptText').innerText = assignData.transcript || "No transcript provided.";
        
        const audioPlayer = document.getElementById('audioPlayer');
        document.getElementById('audioSource').src = assignData.audio_url;
        audioPlayer.load();

        if(assignData.subspark_url) {
            document.getElementById('activeSubsparkLink').href = assignData.subspark_url;
        }

        document.getElementById('activeAssignmentCard').classList.remove('hidden');
    } catch (err) {
        console.error(err);
    }
};

// ================= AUDIO TRACKING LOGIC =================
function handleAudioTimeUpdate() {
    if(!currentAssignmentId) return;
    const player = document.getElementById('audioPlayer');
    const currentTime = Math.floor(player.currentTime);

    const question = activeQuestions.find(q => q.trigger_second === currentTime);
    
    if (question && !answeredCheckpoints.includes(question.id)) {
        player.pause();
        document.getElementById('questionModal').classList.remove('hidden');
        document.getElementById('questionText').innerText = question.question_text;
        document.getElementById('feedback').innerText = "";
        
        document.getElementById('submitAnswerBtn').onclick = () => {
            const answer = document.getElementById('studentAnswer').value;
            if(answer.trim().length >= 3) {
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
    
    if(currentTime > 0 && currentTime % 10 === 0) {
        logProgress(currentTime, 'in_progress');
    }
}

function handleAudioComplete() {
    logProgress(Math.floor(document.getElementById('audioPlayer').currentTime), 'completed');
    
    if(document.getElementById('activeSubsparkLink').getAttribute('href') !== '#') {
        document.getElementById('subsparkLinkContainer').classList.remove('hidden');
    }
}

async function logProgress(currentSecond, status) {
    if(!currentUser || !currentAssignmentId) return;
    
    let totalListenSeconds = 0;
    if(sessionStartTime) {
        totalListenSeconds = Math.floor((new Date() - sessionStartTime) / 1000);
    }

    try {
        await sb.from('classcast_progress').upsert({
            student_email: currentUser.email,
            assignment_id: currentAssignmentId,
            furthest_second: currentSecond,
            total_session_seconds: totalListenSeconds,
            status: status,
            last_updated: new Date().toISOString()
        }, { onConflict: 'student_email, assignment_id' });
    } catch (err) {
        console.error("Progress save error:", err);
    }
}

// ================= TEACHER DASHBOARD LOGIC =================
async function loadTeacherData() {
    const tbody = document.getElementById('teacherProgressTable');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';
    
    try {
        const { data: assignments } = await sb.from('classcast_assignments').select('id, title');
        const { data: progress } = await sb.from('classcast_progress').select('*');
        
        if(!assignments || assignments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No assignments created yet.</td></tr>';
            return;
        }

        let html = '';
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
    } catch (err) {
        console.error("Error loading teacher data:", err);
    }
}

// Export CSV Event Listener
const exportBtn = document.getElementById('exportCsvBtn');
if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
        try {
            const { data, error } = await sb.from('classcast_progress').select(`
                student_email, furthest_second, total_session_seconds, status, last_updated,
                classcast_assignments ( title )
            `);
            
            if (error || !data) {
                alert("Could not load export data.");
                return;
            }

            let csvContent = "data:text/csv;charset=utf-8,Assignment,Email,Furthest Second,Total Session Time,Status,Last Updated\n";
            data.forEach(row => {
                const title = row.classcast_assignments ? row.classcast_assignments.title : 'Unknown';
                csvContent += `"${title}",${row.student_email},${row.furthest_second || 0},${row.total_session_seconds || 0},${row.status},"${new Date(row.last_updated).toLocaleString()}"\n`;
            });
            
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "ClassCast_Progress.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error("Export Error:", err);
        }
    });
}
