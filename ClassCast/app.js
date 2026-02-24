// ==========================================
// ClassCast - Unified Logic
// ==========================================

let sb = null;
let currentUser = null;
let googleProviderToken = sessionStorage.getItem('googleClassroomToken') || null; 
const TEACHER_EMAIL = 'wwilson@mtps.us'; 

let currentAssignmentId = null;
let activeQuestions = [];
let answeredCheckpoints = [];
let sessionStartTime = null;
let editingAssignmentId = null;
let maxReachedTime = 0; 
let rewindCount = 0; 
let studentSessionAnswers = {};
let currentActiveQuestionId = null; 
let previousTotalTime = 0; 

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.supabase !== 'undefined') {
        const url = window.SUPABASE_URL || 'https://mvxuubwbtkhdbhuadxtu.supabase.co';
        const key = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12eHV1YndidGtoZGJodWFkeHR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExODQyMDgsImV4cCI6MjA4Njc2MDIwOH0.FzsVt0bmWnrc3pYUWfJyS-9PE9oJY1ZzoGbax3q_LGk';
        sb = window.supabase.createClient(url, key);
        
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
    
    // Setup Custom Audio Player Listeners
    const player = document.getElementById('audioPlayer');
    if(player) {
        player.addEventListener('timeupdate', handleAudioTimeUpdate);
        player.addEventListener('seeking', () => { 
            if(player.currentTime > maxReachedTime + 1) player.currentTime = maxReachedTime; 
        });
        
        const playSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
        const pauseSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
        
        player.addEventListener('play', () => { 
            if(!sessionStartTime) sessionStartTime = new Date(); 
            const playBtn = document.getElementById('playPauseBtn');
            if (playBtn) playBtn.innerHTML = pauseSVG; 
        });
        player.addEventListener('pause', () => { 
            const playBtn = document.getElementById('playPauseBtn');
            if (playBtn) playBtn.innerHTML = playSVG; 
        });
        player.addEventListener('loadedmetadata', () => {
            const scrubber = document.getElementById('audioScrubber');
            const durDisplay = document.getElementById('durationDisplay');
            if (scrubber) scrubber.max = Math.floor(player.duration);
            if (durDisplay) durDisplay.innerText = formatTime(player.duration);
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
    
    document.getElementById(panelId).classList.add('active');
    if(event) event.currentTarget.classList.add('active');
    else document.querySelector(`[onclick*="${panelId}"]`).classList.add('active');

    if (panelId === 'admin-assignments') { loadTeacherAssignments(); populateClassCheckboxes(); }    
    if (panelId === 'admin-progress') loadTeacherProgress();
    if (panelId === 'admin-classes') loadManageClasses();
    if (panelId === 'admin-files') loadManageFiles();
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

window.toggleSubsparkOptions = function() {
    const isChecked = document.getElementById('autoCreateSubspark').checked;
    const container = document.getElementById('subsparkInitialPostContainer');
    if (isChecked) {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
};

// ================= CUSTOM PLAYER CONTROLS =================
window.togglePlayPause = function() {
    const player = document.getElementById('audioPlayer');
    if (player.paused) player.play();
    else player.pause();
};

window.rewindAudio = function() {
    const player = document.getElementById('audioPlayer');
    player.currentTime = Math.max(0, player.currentTime - 10);
    rewindCount++;
    
    const qModal = document.getElementById('questionModal');
    if(qModal) qModal.classList.add('hidden');
    currentActiveQuestionId = null; 
};

const playSpeeds = [1, 1.25, 1.5, 0.75];
let currentSpeedIndex = 0;
window.cycleSpeed = function() {
    currentSpeedIndex = (currentSpeedIndex + 1) % playSpeeds.length;
    const newSpeed = playSpeeds[currentSpeedIndex];
    document.getElementById('audioPlayer').playbackRate = newSpeed;
    document.getElementById('speedToggleBtn').innerText = newSpeed + 'x';
};

window.scrubAudio = function(e) {
    const player = document.getElementById('audioPlayer');
    let targetTime = parseInt(e.target.value);
    if (targetTime > maxReachedTime + 1) {
        targetTime = maxReachedTime;
        e.target.value = maxReachedTime;
    }
    player.currentTime = targetTime;
    
    const qModal = document.getElementById('questionModal');
    if(qModal) qModal.classList.add('hidden');
    currentActiveQuestionId = null;  
};

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// ================= AUTHENTICATION =================
async function checkUser() {
    try {
        const { data: { session } } = await sb.auth.getSession();
        const authSection = document.getElementById('authSection');
        const adminToggle = document.getElementById('adminToggle');
        
        if (session) {
            currentUser = session.user;
            
            const isTeacher = currentUser.email.toLowerCase() === TEACHER_EMAIL.toLowerCase();
            
            if (adminToggle) adminToggle.style.display = isTeacher ? 'block' : 'none';
            if (authSection) {
                authSection.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-weight: 600; font-size: 0.9rem;">${currentUser.email.split('@')[0]}</span>
                        <button onclick="signOut()" class="logout-btn">Log Out</button>
                    </div>`;
            }
            switchView('studentView');
        } else {
            currentUser = null;
            googleProviderToken = null;
            sessionStorage.removeItem('googleClassroomToken');
            
            if (adminToggle) adminToggle.style.display = 'none';
            if (authSection) authSection.innerHTML = ''; 
            
            const loginBtnWrapper = document.getElementById('loginBtnWrapper');
            if (loginBtnWrapper) {
                loginBtnWrapper.innerHTML = `<button onclick="signIn()" class="google-btn">Sign in with Google</button>`;
            }
            switchView('loginView');
        }
    } catch (err) { console.error("Auth error:", err); }
}

window.signIn = async function() { 
    // ADDED NEW GOOGLE SCOPE HERE FOR EXPLICIT EMAIL PERMISSIONS
    await sb.auth.signInWithOAuth({ 
        provider: 'google', 
        options: { 
            scopes: 'https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.profile.emails',
            redirectTo: window.location.origin + window.location.pathname, 
            queryParams: { 
                prompt: 'consent',
                hd: 'mtps.us'
            } 
        } 
    }); 
};

window.signOut = async function() { 
    sessionStorage.removeItem('googleClassroomToken');
    await sb.auth.signOut(); 
    window.location.reload(); 
};

// ================= TEACHER PANEL 1: ASSIGNMENTS =================
function escapeHTML(str) { 
    if (str === null || str === undefined) return '';
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); 
}

window.addQuestionRow = function(type, qData = null) {
    const list = document.getElementById('questionsBuilderList');
    const id = Date.now() + Math.random().toString().slice(2, 6);
    const div = document.createElement('div');
    div.className = 'question-row-item';
    div.setAttribute('data-type', type); 
    div.style.border = "1px solid #ccc";
    div.style.padding = "10px";
    div.style.marginBottom = "10px";
    div.style.borderRadius = "4px";
    div.style.background = "#fff";

    let timeVal = qData && qData.trigger_second ? qData.trigger_second : '';
    let textVal = qData && qData.question_text ? escapeHTML(qData.question_text) : '';

    let headerHtml = `
        <div style="display:flex; gap:10px; margin-bottom:10px; align-items:center;">
            <span style="font-weight:bold; background:#555; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; text-transform:uppercase;">${type}</span>
            <input type="number" class="q-time" value="${timeVal}" placeholder="Time (sec)" style="width: 100px; margin:0;" min="0">
            <input type="text" class="q-text" value="${textVal}" placeholder="Question prompt..." style="flex:1; margin:0;">
            <button type="button" class="danger-btn" onclick="this.parentElement.parentElement.remove()">X</button>
        </div>
    `;

    let bodyHtml = '';

    let parsedOptions = null;
    let parsedCorrectAnswer = null;
    if (qData) {
        if (typeof qData.options === 'object') {
            parsedOptions = qData.options;
        } else if (typeof qData.options === 'string') {
            try { parsedOptions = JSON.parse(qData.options); } catch(e) { parsedOptions = null; }
        }
        
        if (typeof qData.correct_answer === 'object') {
            parsedCorrectAnswer = qData.correct_answer;
        } else if (typeof qData.correct_answer === 'string') {
            try { parsedCorrectAnswer = JSON.parse(qData.correct_answer); } catch(e) { parsedCorrectAnswer = qData.correct_answer; } 
        }
    }

    if (type === 'mc') {
        let opts = parsedOptions || {a:'', b:'', c:'', d:''};
        let ans = parsedCorrectAnswer || 'a'; 
        bodyHtml = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; padding-left:70px; font-size: 0.9rem;">
                <div><label><input type="radio" name="mc_${id}" value="a" ${ans==='a'?'checked':''}> A:</label> <input type="text" class="opt-a" value="${escapeHTML(opts.a)}" style="width:75%; margin:0; padding:4px;"></div>
                <div><label><input type="radio" name="mc_${id}" value="b" ${ans==='b'?'checked':''}> B:</label> <input type="text" class="opt-b" value="${escapeHTML(opts.b)}" style="width:75%; margin:0; padding:4px;"></div>
                <div><label><input type="radio" name="mc_${id}" value="c" ${ans==='c'?'checked':''}> C:</label> <input type="text" class="opt-c" value="${escapeHTML(opts.c)}" style="width:75%; margin:0; padding:4px;"></div>
                <div><label><input type="radio" name="mc_${id}" value="d" ${ans==='d'?'checked':''}> D:</label> <input type="text" class="opt-d" value="${escapeHTML(opts.d)}" style="width:75%; margin:0; padding:4px;"></div>
            </div>
        `;
    } else if (type === 'tf') {
        let ans = parsedCorrectAnswer || 'true';
        bodyHtml = `
            <div style="padding-left:70px; font-size: 0.9rem;">
                <strong>Correct Answer: </strong>
                <label style="margin-right:15px;"><input type="radio" name="tf_${id}" value="true" ${ans==='true'?'checked':''}> True</label>
                <label><input type="radio" name="tf_${id}" value="false" ${ans==='false'?'checked':''}> False</label>
            </div>
        `;
    } else if (type === 'match') {
        let pairs = (parsedOptions && parsedOptions.pairs) ? parsedOptions.pairs : [{t:'',m:''}, {t:'',m:''}, {t:'',m:''}];
        let p1 = pairs[0] || {t:'',m:''};
        let p2 = pairs[1] || {t:'',m:''};
        let p3 = pairs[2] || {t:'',m:''};
        
        bodyHtml = `
            <div style="padding-left:70px; font-size:0.85rem; color:#666;">
                <em>Enter exactly matching pairs. The system will shuffle them for the students automatically.</em>
                <div style="margin-top:5px;">Pair 1: <input type="text" class="p1-t" value="${escapeHTML(p1.t)}" placeholder="Term" style="width:30%; padding:4px;"> = <input type="text" class="p1-m" value="${escapeHTML(p1.m)}" placeholder="Match" style="width:30%; padding:4px;"></div>
                <div style="margin-top:5px;">Pair 2: <input type="text" class="p2-t" value="${escapeHTML(p2.t)}" placeholder="Term" style="width:30%; padding:4px;"> = <input type="text" class="p2-m" value="${escapeHTML(p2.m)}" placeholder="Match" style="width:30%; padding:4px;"></div>
                <div style="margin-top:5px;">Pair 3: <input type="text" class="p3-t" value="${escapeHTML(p3.t)}" placeholder="Term" style="width:30%; padding:4px;"> = <input type="text" class="p3-m" value="${escapeHTML(p3.m)}" placeholder="Match" style="width:30%; padding:4px;"></div>
            </div>
        `;
    }

    div.innerHTML = headerHtml + bodyHtml;
    list.appendChild(div);
};

window.editAssignment = async function(id) {
    editingAssignmentId = id;
    
    const { data: assignData } = await sb.from('classcast_assignments').select('*').eq('id', id).single();
    const { data: qData } = await sb.from('classcast_questions').select('*').eq('assignment_id', id);
    
    if(!assignData) return;

    document.getElementById('newAssignTitle').value = assignData.title;
    
    document.querySelectorAll('.class-checkbox').forEach(cb => cb.checked = false);
    document.querySelectorAll('.student-checkbox').forEach(cb => cb.checked = false);
    
    let targetClasses = [];
    let targetStudents = [];
    try { targetClasses = JSON.parse(assignData.target_class || '[]'); } catch(e) { targetClasses = [assignData.target_class]; }
    try { targetStudents = JSON.parse(assignData.target_students || '[]'); } catch(e) { targetStudents = []; }

    document.querySelectorAll('.class-checkbox').forEach(cb => {
        if (targetClasses.includes(cb.value)) {
            cb.checked = true;
            const classId = cb.getAttribute('data-class-id');
            const studentListDiv = document.getElementById(`student-list-${classId}`);
            if (studentListDiv) studentListDiv.style.display = 'block';
        }
    });

    document.querySelectorAll('.student-checkbox').forEach(cb => {
        if (targetStudents.includes(cb.value)) { cb.checked = true; }
    });

    document.querySelector('input[name="audioSourceType"][value="dropbox"]').checked = true;
    toggleAudioSourceUI();
    document.getElementById('newAssignAudioUrl').value = assignData.audio_url || '';
    document.getElementById('newAssignTranscript').value = assignData.transcript || '';
    
    let speedCheck = document.getElementById('newAssignAllowSpeed');
    if (speedCheck) speedCheck.checked = assignData.allow_speed !== false;

    let existingSpark = document.getElementById('existingSubsparkUrl');
    if (existingSpark) existingSpark.value = assignData.subspark_url || '';
    document.getElementById('autoCreateSubspark').checked = false;
    toggleSubsparkOptions();

    document.getElementById('questionsBuilderList').innerHTML = '';
    if (qData) {
        qData.forEach(q => {
            const qType = q.question_type || 'open'; 
            addQuestionRow(qType, q);
        });
    }

    document.getElementById('publishBtn').innerText = 'Update Assignment';
    document.getElementById('cancelEditBtn').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.cancelEdit = function() {
    editingAssignmentId = null;
    document.getElementById('publishBtn').innerText = 'Publish Assignment';
    document.getElementById('cancelEditBtn').classList.add('hidden');
    
    document.getElementById('newAssignTitle').value = '';
    
    document.querySelectorAll('.class-checkbox').forEach(cb => {
        cb.checked = false;
        const classId = cb.getAttribute('data-class-id');
        if (classId) {
            const studentListDiv = document.getElementById(`student-list-${classId}`);
            if (studentListDiv) studentListDiv.style.display = 'none';
        }
    });
    document.querySelectorAll('.student-checkbox').forEach(cb => cb.checked = false);
    
    if(document.getElementById('newAssignAudioFile')) document.getElementById('newAssignAudioFile').value = '';
    if(document.getElementById('newAssignAudioUrl')) document.getElementById('newAssignAudioUrl').value = '';
    document.getElementById('newAssignTranscript').value = '';
    document.getElementById('questionsBuilderList').innerHTML = '';
    
    let existingSpark = document.getElementById('existingSubsparkUrl');
    if (existingSpark) existingSpark.value = '';
    document.getElementById('autoCreateSubspark').checked = false;
    document.getElementById('subsparkFirstPostText').value = '';
    document.getElementById('subsparkFirstPostPhoto').value = '';
    document.getElementById('subsparkFirstPostLink').value = '';
    toggleSubsparkOptions();
    
    document.querySelector('input[name="audioSourceType"][value="upload"]').checked = true;
    toggleAudioSourceUI();
};

window.saveNewAssignment = async function() {
    const publishBtn = document.getElementById('publishBtn');
    const title = document.getElementById('newAssignTitle').value;
    const transcript = document.getElementById('newAssignTranscript').value;
    const sourceType = document.querySelector('input[name="audioSourceType"]:checked').value;
    
    const selectedClasses = Array.from(document.querySelectorAll('.class-checkbox:checked')).map(cb => cb.value);
    const selectedStudents = Array.from(document.querySelectorAll('.student-checkbox:checked')).map(cb => cb.value);
    
    if(!title || selectedClasses.length === 0) { 
        alert("Title and at least one Target Class are required."); 
        return; 
    }

    const targetClassesJSON = JSON.stringify(selectedClasses);
    const targetStudentsJSON = JSON.stringify(selectedStudents);

    let finalAudioUrl = '';

    try {
        publishBtn.disabled = true;
        publishBtn.innerText = editingAssignmentId ? 'Updating... Please wait...' : 'Publishing... Please wait...';

        if (sourceType === 'upload') {
            const fileInput = document.getElementById('newAssignAudioFile');
            const file = fileInput.files[0];
            if (!file && !editingAssignmentId) { alert("Please select an audio file."); publishBtn.disabled = false; publishBtn.innerText = 'Publish Assignment'; return; }
            
            if (file) {
                const fileExt = file.name.split('.').pop();
                const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const { error: uploadError } = await sb.storage.from('audio-files').upload(uniqueFileName, file);
                if (uploadError) throw new Error("Storage Error: " + uploadError.message);
                const { data: publicUrlData } = sb.storage.from('audio-files').getPublicUrl(uniqueFileName);
                finalAudioUrl = publicUrlData.publicUrl;
            } else {
                finalAudioUrl = document.getElementById('newAssignAudioUrl').value;
            }
        } else if (sourceType === 'dropbox') {
            let dropboxUrl = document.getElementById('newAssignAudioUrl').value;
            if (!dropboxUrl && !editingAssignmentId) { alert("Please paste a Dropbox URL."); publishBtn.disabled = false; publishBtn.innerText = 'Publish Assignment'; return; }
            if (dropboxUrl.includes('dropbox.com')) {
                dropboxUrl = dropboxUrl.replace('?dl=0', '').replace('?dl=1', '');
                finalAudioUrl = dropboxUrl + (dropboxUrl.includes('?') ? '&' : '?') + 'raw=1';
            } else finalAudioUrl = dropboxUrl;
        }

        let existingSpark = document.getElementById('existingSubsparkUrl');
        let finalSubSparkUrl = existingSpark ? existingSpark.value : ''; 
        const isSubsparkEnabled = document.getElementById('autoCreateSubspark').checked;

        if (isSubsparkEnabled && !editingAssignmentId) {
            const postText = document.getElementById('subsparkFirstPostText').value;
            const postPhoto = document.getElementById('subsparkFirstPostPhoto').value;
            const postLink = document.getElementById('subsparkFirstPostLink').value;

            const { data: newSub, error: subError } = await sb.from('subreddits').insert([{
                name: title,
                created_by: currentUser.id
            }]).select().single();

            if (subError) throw new Error("Sub-spark Creation Error: " + subError.message);

            if (postText || postPhoto || postLink) {
                const { error: postError } = await sb.from('posts').insert([{
                    title: `Discussion: ${title}`,
                    content: postText,
                    image_url: postPhoto,
                    url: postLink,
                    subreddit_id: newSub.id,
                    user_id: currentUser.id
                }]);

                if (postError) throw new Error("Sub-spark Post Error: " + postError.message);
            }

            finalSubSparkUrl = `https://wwilson-ui.github.io/r/Spark/?sub=${newSub.id}`;
        }

        let newId;

        if (editingAssignmentId) {
            const { error: updateError } = await sb.from('classcast_assignments').update({
                title: title, 
                target_class: targetClassesJSON, 
                target_students: targetStudentsJSON, 
                audio_url: finalAudioUrl, 
                subspark_url: finalSubSparkUrl, 
                transcript: transcript, 
                allow_speed: document.getElementById('newAssignAllowSpeed') ? document.getElementById('newAssignAllowSpeed').checked : true
            }).eq('id', editingAssignmentId);
            if(updateError) throw updateError;
            
            newId = editingAssignmentId;
            await sb.from('classcast_questions').delete().eq('assignment_id', newId);
        } else {
            const { data: assignData, error: assignError } = await sb.from('classcast_assignments').insert([{
                title: title, 
                target_class: targetClassesJSON, 
                target_students: targetStudentsJSON, 
                audio_url: finalAudioUrl, 
                subspark_url: finalSubSparkUrl, 
                transcript: transcript, 
                allow_speed: document.getElementById('newAssignAllowSpeed') ? document.getElementById('newAssignAllowSpeed').checked : true
            }]).select();
            if(assignError) throw assignError;
            newId = assignData[0].id;
        }

        const questionRows = document.querySelectorAll('.question-row-item');
        const questionsToInsert = [];
        questionRows.forEach(row => {
            const type = row.getAttribute('data-type') || 'open';
            const time = row.querySelector('.q-time').value;
            const text = row.querySelector('.q-text').value;

            if (time && text) {
                let options = null;
                let correctAnswer = null;

                if (type === 'mc') {
                    options = {
                        a: row.querySelector('.opt-a').value,
                        b: row.querySelector('.opt-b').value,
                        c: row.querySelector('.opt-c').value,
                        d: row.querySelector('.opt-d').value
                    };
                    const checkedNode = row.querySelector(`input[type="radio"]:checked`);
                    correctAnswer = checkedNode ? checkedNode.value : 'a';
                } else if (type === 'tf') {
                    const checkedNode = row.querySelector(`input[type="radio"]:checked`);
                    correctAnswer = checkedNode ? checkedNode.value : 'true';
                } else if (type === 'match') {
                    options = {
                        pairs: [
                            { t: row.querySelector('.p1-t').value, m: row.querySelector('.p1-m').value },
                            { t: row.querySelector('.p2-t').value, m: row.querySelector('.p2-m').value },
                            { t: row.querySelector('.p3-t').value, m: row.querySelector('.p3-m').value }
                        ]
                    };
                    correctAnswer = options; 
                }

                questionsToInsert.push({ 
                    assignment_id: newId, 
                    trigger_second: parseInt(time), 
                    question_text: text,
                    question_type: type,
                    options: options,
                    correct_answer: correctAnswer
                });
            }
        });

        if(questionsToInsert.length > 0) await sb.from('classcast_questions').insert(questionsToInsert);

        alert(editingAssignmentId ? "Assignment updated successfully!" : "Assignment published successfully!");
        
        cancelEdit(); 
        loadTeacherAssignments();

    } catch (error) { alert("Error: " + error.message); console.error(error); } 
    finally { publishBtn.disabled = false; publishBtn.innerText = editingAssignmentId ? 'Update Assignment' : 'Publish Assignment'; }
};

async function loadTeacherAssignments() {
    const tbody = document.getElementById('teacherAssignmentsTable');
    if(!tbody) return;
    const { data } = await sb.from('classcast_assignments').select('*').order('created_at', { ascending: false });
    
    if(!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No assignments.</td></tr>'; return; }
    
    tbody.innerHTML = data.map(a => `
    <tr>
        <td><strong>${a.title}</strong></td>
        <td>${a.target_class}</td>
        <td>
            <button class="action-btn" style="padding: 6px 12px; font-size: 0.8rem; background: #555; margin-right: 5px;" onclick="editAssignment(${a.id})">Edit</button>
            <button class="danger-btn" onclick="deleteAssignment(${a.id})">Delete</button>
        </td>
    </tr>`).join('');
}

window.deleteAssignment = async function(id) {
    if(!confirm("Delete this assignment?")) return;
    await sb.from('classcast_assignments').delete().eq('id', id);
    loadTeacherAssignments();
};

// ================= TEACHER PANEL 3: CLASSES & GOOGLE CLASSROOM =================
window.openClassroomImport = async function() {
    if (!googleProviderToken) {
        alert("We don't have permission to view your Classroom yet. Please Sign Out, sign back in, and ensure you check all the boxes!");
        return;
    }

    document.getElementById('classroomImportCard').classList.remove('hidden');
    const statusTxt = document.getElementById('classroomStatus');
    const select = document.getElementById('classroomCourseSelect');
    
    statusTxt.innerText = "Fetching your Google Classrooms...";
    
    try {
        const res = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
            headers: { Authorization: `Bearer ${googleProviderToken}` }
        });
        const data = await res.json();
        
        if (data.error) {
            throw new Error(data.error.message || data.error.status);
        }
        
        select.innerHTML = '<option value="">-- Choose a Google Classroom --</option>';
        if (data.courses && data.courses.length > 0) {
            data.courses.forEach(c => {
                select.innerHTML += `<option value="${c.id}">${c.name} ${c.section ? `(${c.section})` : ''}</option>`;
            });
            statusTxt.innerText = "Select a class to import its roster.";
        } else {
            statusTxt.innerText = "No active Google Classrooms found for your account.";
        }
    } catch (err) {
        console.error("Classroom Error:", err);
        statusTxt.innerText = "Google API Error: " + err.message;
        statusTxt.style.color = "red";
    }
};

window.importSelectedClassroom = async function() {
    const select = document.getElementById('classroomCourseSelect');
    const courseId = select.value;
    const courseName = select.options[select.selectedIndex].text;
    const statusTxt = document.getElementById('classroomStatus');
    const importBtn = document.getElementById('importRosterBtn');
    
    if (!courseId) return alert("Please select a course first.");

    try {
        importBtn.disabled = true;
        statusTxt.innerText = `Downloading roster for ${courseName}...`;
        statusTxt.style.color = "black"; 

        const res = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/students`, {
            headers: { Authorization: `Bearer ${googleProviderToken}` }
        });
        const data = await res.json();
        
        if (data.error) throw new Error("Google Error: " + data.error.message);
        
        const students = data.students || [];
        if (students.length === 0) {
            statusTxt.innerText = "No students found in this Google Classroom.";
            importBtn.disabled = false;
            return;
        }

        let classRecordId;
        const { data: existingClass, error: classSearchError } = await sb.from('classcast_classes').select('*').eq('class_name', courseName).single();
        
        if (classSearchError && classSearchError.code !== 'PGRST116') { 
            throw new Error("DB Search Error: " + classSearchError.message);
        }

        if (existingClass) {
            classRecordId = existingClass.id;
        } else {
            const { data: newClass, error: classInsertError } = await sb.from('classcast_classes').insert([{ class_name: courseName }]).select();
            if (classInsertError) throw new Error("DB Class Insert Error: " + classInsertError.message);
            classRecordId = newClass[0].id;
        }

        const rosterInserts = students.map(s => {
            const email = s.profile.emailAddress;
            const name = s.profile.name?.fullName || `Unknown Student (${s.profile.id})`;
            const identifier = email || name; // Secures the email address into the DB
            return {
                class_id: classRecordId,
                student_email: identifier
            };
        });

        await sb.from('classcast_roster').delete().eq('class_id', classRecordId);
        
        const { error: insertError } = await sb.from('classcast_roster').insert(rosterInserts);
        if (insertError) throw new Error("DB Roster Insert Error: " + insertError.message);

        statusTxt.innerText = `Successfully saved ${students.length} students to the database!`;
        statusTxt.style.color = "#1e8e3e";
        setTimeout(() => {
            document.getElementById('classroomImportCard').classList.add('hidden');
            loadManageClasses();
        }, 1500);

    } catch (err) {
        console.error(err);
        statusTxt.innerText = err.message;
        statusTxt.style.color = "red";
    } finally {
        importBtn.disabled = false;
    }
};

async function loadManageClasses() {
    const container = document.getElementById('classesListContainer');
    container.innerHTML = '<p>Loading classes...</p>';
    
    const { data: classes } = await sb.from('classcast_classes').select('*').order('class_name');
    const { data: rosters } = await sb.from('classcast_roster').select('*');
    
    if(!classes || classes.length === 0) { container.innerHTML = '<p>No classes created yet.</p>'; return; }

    let html = '';
    classes.forEach(cls => {
        const students = (rosters || []).filter(r => r.class_id === cls.id);
        html += `
        <div class="card" style="margin-bottom: 15px; padding: 15px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; color:var(--primary);">${cls.class_name}</h3>
                <button class="danger-btn" onclick="deleteClass(${cls.id})">Delete Class</button>
            </div>
            <div style="margin-top: 15px; display:flex; gap:10px;">
                <input type="email" id="addStudent_${cls.id}" placeholder="Student Email" style="margin:0;">
                <button class="action-btn" onclick="addStudentToClass(${cls.id})">Add Student</button>
            </div>
            <ul style="margin-top: 15px; padding-left: 20px;">
                ${students.length === 0 ? '<li style="color:#666; font-size:0.9rem;">No students added.</li>' : 
                  students.map(s => `<li>${s.student_email} <button onclick="removeStudent(${s.id})" style="background:none; border:none; color:red; cursor:pointer; font-size:0.8rem; margin-left:10px;">[remove]</button></li>`).join('')}
            </ul>
        </div>`;
    });
    container.innerHTML = html;
}

window.createNewClass = async function() {
    const name = document.getElementById('newClassName').value;
    if(!name) return;
    await sb.from('classcast_classes').insert([{ class_name: name }]);
    document.getElementById('newClassName').value = '';
    loadManageClasses();
};
window.deleteClass = async function(id) {
    if(confirm("Delete this class? This removes the roster too.")) { await sb.from('classcast_classes').delete().eq('id', id); loadManageClasses(); }
};
window.addStudentToClass = async function(classId) {
    const email = document.getElementById(`addStudent_${classId}`).value;
    if(!email) return;
    await sb.from('classcast_roster').insert([{ class_id: classId, student_email: email }]);
    document.getElementById(`addStudent_${classId}`).value = '';
    loadManageClasses();
};
window.removeStudent = async function(id) { await sb.from('classcast_roster').delete().eq('id', id); loadManageClasses(); };

async function populateClassDropdown(dropdownId) {
    const select = document.getElementById(dropdownId);
    if(!select) return;
    const { data } = await sb.from('classcast_classes').select('*').order('class_name');
    select.innerHTML = '<option value="">-- Choose Class --</option>';
    if(data) data.forEach(c => select.innerHTML += `<option value="${c.id}">${c.class_name}</option>`);
}

window.populateClassCheckboxes = async function() {
    const container = document.getElementById('assignmentTargetsContainer');
    if(!container) return;
    
    container.innerHTML = '<p style="margin:0; font-size:0.9rem; color:#666;">Loading classes and rosters...</p>';
    
    const { data: classes } = await sb.from('classcast_classes').select('*').order('class_name');
    const { data: rosters } = await sb.from('classcast_roster').select('*');
    
    if(!classes || classes.length === 0) {
        container.innerHTML = '<p style="margin:0; font-size:0.9rem; color:#red;">No classes available. Create one first.</p>';
        return;
    }

    let html = '';
    classes.forEach(cls => {
        const students = (rosters || []).filter(r => r.class_id === cls.id);
        
        html += `
        <div style="margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">
            <label style="font-weight: bold; cursor: pointer;">
                <input type="checkbox" class="class-checkbox" value="${cls.class_name}" data-class-id="${cls.id}" onchange="toggleStudentList(${cls.id})"> 
                ${cls.class_name}
            </label>
            <div id="student-list-${cls.id}" style="display: none; margin-top: 5px; padding-left: 20px;">
                <p style="margin:0 0 5px 0; font-size:0.8rem; font-style:italic;">Select specific students (leave all unchecked to assign to the whole class):</p>
                ${students.map(s => `
                    <label style="display:block; font-size:0.85rem; cursor:pointer; margin-bottom:2px;">
                        <input type="checkbox" class="student-checkbox class-${cls.id}-student" value="${s.student_email}">
                        ${s.student_email}
                    </label>
                `).join('')}
            </div>
        </div>`;
    });
    container.innerHTML = html;
};

window.toggleStudentList = function(classId) {
    const classCheckbox = document.querySelector(`.class-checkbox[data-class-id="${classId}"]`);
    const studentListDiv = document.getElementById(`student-list-${classId}`);
    if (classCheckbox.checked) {
        studentListDiv.style.display = 'block';
    } else {
        studentListDiv.style.display = 'none';
        document.querySelectorAll(`.class-${classId}-student`).forEach(cb => cb.checked = false);
    }
};

// ================= TEACHER PANEL 4: FILES =================
async function loadManageFiles() {
    const tbody = document.getElementById('teacherFilesTable');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Loading...</td></tr>';
    const { data, error } = await sb.storage.from('audio-files').list();
    if(error) { tbody.innerHTML = `<tr><td colspan="3">Error: ${error.message}</td></tr>`; return; }
    if(!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No files found.</td></tr>'; return; }
    
    const validFiles = data.filter(f => f.name !== '.emptyFolderPlaceholder');
    tbody.innerHTML = validFiles.map(f => `<tr><td>${f.name}</td><td>${(f.metadata.size / 1024 / 1024).toFixed(2)} MB</td><td><button class="danger-btn" onclick="deleteFile('${f.name}')">Delete</button></td></tr>`).join('');
}
window.deleteFile = async function(fileName) {
    if(confirm(`Delete ${fileName} from database?`)) { await sb.storage.from('audio-files').remove([fileName]); loadManageFiles(); }
};


// ================= NEW REDESIGNED STUDENT PORTAL =================

async function loadStudentClasses() {
    populateClassDropdown('studentClassFilter'); 
}

window.showStudentDashboard = function() {
    const player = document.getElementById('audioPlayer');
    if (player && !player.paused) {
        player.pause();
        logProgress(Math.floor(player.currentTime), 'in_progress');
    }
    document.getElementById('activeAssignmentCard').classList.add('hidden');
    document.getElementById('studentDashboard').classList.remove('hidden');
    loadStudentAssignments();
};

window.loadStudentAssignments = async function() {
    const classSelect = document.getElementById('studentClassFilter');
    const classId = classSelect.value;
    const selectedOption = classSelect.options[classSelect.selectedIndex];
    const classText = selectedOption ? selectedOption.text.trim() : ''; 
    
    const dashboard = document.getElementById('studentDashboard');
    const playerCard = document.getElementById('activeAssignmentCard');
    
    playerCard.classList.add('hidden');
    dashboard.classList.remove('hidden');

    if(!classId) { 
        dashboard.innerHTML = '<h2 style="margin-top:0;">My Dashboard</h2><p style="color:#666;">Please select your class from the menu on the left to view your assignments.</p>';
        return; 
    }

    dashboard.innerHTML = '<h2 style="margin-top:0;">My Dashboard</h2><p style="color:#666;">Loading your assignments...</p>';

    const { data: assignments, error } = await sb.from('classcast_assignments').select('*');
    if (error) { 
        console.error("Error loading assignments:", error); 
        return; 
    }

    const { data: progressData } = await sb.from('classcast_progress').select('*').eq('student_email', currentUser.email);

    let assignedHtml = '';
    let inProgressHtml = '';
    let completedHtml = '';

    if(assignments) {
        assignments.forEach(d => {
            let isTargeted = false;

            try {
                const targetClassesArray = JSON.parse(d.target_class || '[]');
                if (targetClassesArray.includes(classText)) isTargeted = true;
            } catch (e) {
                if (d.target_class === classText) isTargeted = true;
            }

            try {
                const targetStudentsArray = JSON.parse(d.target_students || '[]');
                if (targetStudentsArray.length > 0 && currentUser && !targetStudentsArray.includes(currentUser.email)) {
                    isTargeted = false; 
                }
            } catch (e) {}

            if (isTargeted) {
                const prog = progressData ? progressData.find(p => p.assignment_id === d.id) : null;
                
                let btnText = 'Start Listening';
                let btnColor = 'var(--primary)';
                if (prog && prog.status === 'completed') { btnText = 'Review Assignment'; btnColor = 'var(--success)'; }
                else if (prog) { btnText = 'Continue Listening'; btnColor = '#f4b400'; }

                const cardHtml = `
                    <div style="border: 1px solid #dee2e6; padding: 15px; border-radius: 6px; margin-bottom: 10px; display:flex; justify-content:space-between; align-items:center; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                        <strong style="font-size: 1.1rem; color: #333;">${d.title}</strong>
                        <button class="action-btn" style="background: ${btnColor}; ${btnColor === '#f4b400' ? 'color: #000;' : ''}" onclick="startAssignment(${d.id})">${btnText}</button>
                    </div>
                `;

                if (!prog) assignedHtml += cardHtml;
                else if (prog.status === 'in_progress') inProgressHtml += cardHtml;
                else if (prog.status === 'completed') completedHtml += cardHtml;
            }
        });
    }

    dashboard.innerHTML = `
        <h2 style="margin-top:0;">My Dashboard</h2>
        
        <h3 style="color: #444; border-bottom: 2px solid #eee; padding-bottom: 5px; margin-top: 20px;">🔴 Not Started</h3>
        ${assignedHtml || '<p style="color:#888; font-size: 0.9rem; font-style: italic;">You have no new assignments.</p>'}
        
        <h3 style="color: #f4b400; border-bottom: 2px solid #eee; padding-bottom: 5px; margin-top: 25px;">🟡 In Progress</h3>
        ${inProgressHtml || '<p style="color:#888; font-size: 0.9rem; font-style: italic;">No assignments currently in progress.</p>'}
        
        <h3 style="color: var(--success); border-bottom: 2px solid #eee; padding-bottom: 5px; margin-top: 25px;">🟢 Completed</h3>
        ${completedHtml || '<p style="color:#888; font-size: 0.9rem; font-style: italic;">No completed assignments yet.</p>'}
    `;
};

window.startAssignment = async function(assignId) {
    if(!assignId) return;

    currentAssignmentId = assignId; 
    answeredCheckpoints = []; 
    sessionStartTime = null;
    maxReachedTime = 0; 
    rewindCount = 0;
    studentSessionAnswers = {};
    currentActiveQuestionId = null; 
    previousTotalTime = 0; 
    
    document.getElementById('studentDashboard').classList.add('hidden');
    document.getElementById('activeAssignmentCard').classList.remove('hidden');

    const subsparkContainer = document.getElementById('subsparkLinkContainer'); 
    if(subsparkContainer) subsparkContainer.classList.add('hidden');

    const { data: assignData } = await sb.from('classcast_assignments').select('*').eq('id', assignId).single();
    const { data: qData } = await sb.from('classcast_questions').select('*').eq('assignment_id', assignId);
    
    if (currentUser) {
        const { data: progData } = await sb.from('classcast_progress').select('*').eq('assignment_id', assignId).eq('student_email', currentUser.email).single();
        if (progData) {
            maxReachedTime = progData.furthest_second || 0;
            rewindCount = progData.rewind_count || 0;
            previousTotalTime = progData.total_session_seconds || 0; 
            studentSessionAnswers = progData.student_answers || {};
            if (qData) {
                qData.forEach(q => {
                    if (studentSessionAnswers[q.id]) answeredCheckpoints.push(q.id);
                });
            }
        }
    }

    if(!assignData) return;
    activeQuestions = qData || [];
    
    document.getElementById('activeAssignmentTitle').innerText = assignData.title;
    document.getElementById('transcriptText').innerText = assignData.transcript || "No transcript provided.";
    
    const audioPlayer = document.getElementById('audioPlayer');
    document.getElementById('audioSource').src = assignData.audio_url; 
    
    const speedBtn = document.getElementById('speedToggleBtn');
    if (assignData.allow_speed === false) {
        speedBtn.classList.add('hidden');
        audioPlayer.playbackRate = 1.0;
    } else {
        speedBtn.classList.remove('hidden');
        currentSpeedIndex = 0;
        speedBtn.innerText = '1x';
        audioPlayer.playbackRate = 1.0;
    }
    
    document.getElementById('audioScrubber').value = 0;
    document.getElementById('currentTimeDisplay').innerText = "0:00";
    
    document.getElementById('playPauseBtn').innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 2px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    
    audioPlayer.load();

    let previewHtml = '';
    activeQuestions.sort((a,b) => a.trigger_second - b.trigger_second).forEach((q, index) => {
        let typeLabel = q.question_type === 'mc' ? '[Multiple Choice]' : q.question_type === 'tf' ? '[True/False]' : q.question_type === 'match' ? '[Matching]' : '[Open-Ended]';
        
        previewHtml += `<div style="margin-bottom: 12px; border-bottom: 1px dashed #ccc; padding-bottom: 8px;">
            <strong>Q${index + 1}:</strong> ${q.question_text} <span style="color:#888; font-size: 0.8rem;">${typeLabel}</span>
        </div>`;
    });
    document.getElementById('questionPreviewList').innerHTML = previewHtml || '<em>No interactive questions for this assignment.</em>';

    if(assignData.subspark_url) document.getElementById('activeSubsparkLink').href = assignData.subspark_url;
};

function handleAudioTimeUpdate() {
    if(!currentAssignmentId) return;
    const player = document.getElementById('audioPlayer');
    
    if (player.currentTime > maxReachedTime + 1) {
        player.currentTime = maxReachedTime;
    } else {
        maxReachedTime = Math.max(maxReachedTime, player.currentTime);
    }

    const scrubber = document.getElementById('audioScrubber');
    const timeDisplay = document.getElementById('currentTimeDisplay');
    if(scrubber) scrubber.value = Math.floor(player.currentTime);
    if(timeDisplay) timeDisplay.innerText = formatTime(player.currentTime);

    const passedQuestion = activeQuestions.find(q => player.currentTime >= q.trigger_second && !answeredCheckpoints.includes(q.id));
    
    if (passedQuestion) {
        if (currentActiveQuestionId !== passedQuestion.id) {
            currentActiveQuestionId = passedQuestion.id; 
            player.pause();
            player.currentTime = passedQuestion.trigger_second; 
            
            document.getElementById('questionModal').classList.remove('hidden');
            document.getElementById('questionText').innerText = passedQuestion.question_text;
            document.getElementById('feedback').innerText = "";
            
            let qType = passedQuestion.question_type || 'open';
            
            let options = {};
            if (typeof passedQuestion.options === 'object' && passedQuestion.options !== null) {
                options = passedQuestion.options;
            } else if (typeof passedQuestion.options === 'string') {
                try { options = JSON.parse(passedQuestion.options); } catch(e) {}
            }
            
            let interactiveHtml = '';

            if (qType === 'mc') {
                interactiveHtml = `
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <label style="cursor:pointer;"><input type="radio" name="student_ans" value="a"> ${escapeHTML(options.a)}</label>
                        <label style="cursor:pointer;"><input type="radio" name="student_ans" value="b"> ${escapeHTML(options.b)}</label>
                        <label style="cursor:pointer;"><input type="radio" name="student_ans" value="c"> ${escapeHTML(options.c)}</label>
                        <label style="cursor:pointer;"><input type="radio" name="student_ans" value="d"> ${escapeHTML(options.d)}</label>
                    </div>`;
            } else if (qType === 'tf') {
                interactiveHtml = `
                    <div style="display:flex; gap:15px;">
                        <label style="cursor:pointer;"><input type="radio" name="student_ans" value="true"> True</label>
                        <label style="cursor:pointer;"><input type="radio" name="student_ans" value="false"> False</label>
                    </div>`;
            } else if (qType === 'match') {
                let pairs = options.pairs || [];
                let shuffledMatches = pairs.map(p => p.m).sort(() => Math.random() - 0.5);
                interactiveHtml = pairs.map((p, i) => `
                    <div style="margin-bottom:8px; display:flex; align-items:center; gap: 10px;">
                        <strong style="width: 40%; text-align:right;">${escapeHTML(p.t)} = </strong> 
                        <select class="student_match_select" data-index="${i}" style="width: 50%; padding: 4px;">
                            <option value="">-- Select Match --</option>
                            ${shuffledMatches.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('')}
                        </select>
                    </div>`).join('');
            } else {
                interactiveHtml = `<textarea id="studentAnswerText" rows="3" style="width:100%; font-family:inherit; padding:8px;" placeholder="Type your answer here..."></textarea>`;
            }
            
            document.getElementById('questionInteractiveArea').innerHTML = interactiveHtml;
            
            document.getElementById('submitAnswerBtn').onclick = () => {
                let studentAns = null;
                let isCorrect = false;
                let valid = false;

                if (qType === 'mc' || qType === 'tf') {
                    const checked = document.querySelector('input[name="student_ans"]:checked');
                    if (checked) { 
                        studentAns = checked.value; 
                        valid = true; 
                        let correctVal = passedQuestion.correct_answer;
                        if (typeof correctVal === 'string') {
                            try { correctVal = JSON.parse(correctVal); } catch(e) {}
                        }
                        isCorrect = (studentAns === String(correctVal)); 
                    }
                } else if (qType === 'match') {
                    const selects = document.querySelectorAll('.student_match_select');
                    studentAns = [];
                    let allFilled = true;
                    let allCorrect = true;
                    
                    selects.forEach(s => {
                        if (!s.value) allFilled = false;
                        let idx = s.getAttribute('data-index');
                        if (s.value !== options.pairs[idx].m) allCorrect = false;
                        studentAns.push(s.value);
                    });
                    if (allFilled) { valid = true; isCorrect = allCorrect; }
                } else {
                    studentAns = document.getElementById('studentAnswerText').value.trim();
                    if (studentAns.length >= 3) { valid = true; isCorrect = null; }
                }

                if(valid) {
                    document.getElementById('questionModal').classList.add('hidden');
                    answeredCheckpoints.push(passedQuestion.id); 
                    studentSessionAnswers[passedQuestion.id] = { answer: studentAns, isCorrect: isCorrect, type: qType };
                    
                    currentActiveQuestionId = null; 
                    player.play(); 
                    
                    logProgress(Math.floor(player.currentTime), 'in_progress');
                } else {
                    document.getElementById('feedback').innerText = "Please complete the question to continue.";
                }
            };
        } else {
            if (!player.paused) player.pause();
        }
    }
    
    const currentTime = Math.floor(player.currentTime);
    if(currentTime > 0 && currentTime % 10 === 0) logProgress(currentTime, 'in_progress');
}

function handleAudioComplete() {
    logProgress(Math.floor(document.getElementById('audioPlayer').currentTime), 'completed');
    if(document.getElementById('activeSubsparkLink').getAttribute('href') !== '#') document.getElementById('subsparkLinkContainer').classList.remove('hidden');
}

async function logProgress(currentSecond, status) {
    if(!currentUser || !currentAssignmentId) return;
    
    let currentSessionTime = sessionStartTime ? Math.floor((new Date() - sessionStartTime) / 1000) : 0;
    let totalListenSeconds = previousTotalTime + currentSessionTime;
    
    await sb.from('classcast_progress').upsert({ 
        student_email: currentUser.email, 
        assignment_id: currentAssignmentId, 
        furthest_second: currentSecond, 
        total_session_seconds: totalListenSeconds, 
        status: status, 
        rewind_count: rewindCount, 
        student_answers: studentSessionAnswers,
        last_updated: new Date().toISOString() 
    }, { onConflict: 'student_email, assignment_id' });
}


// ================= PHASE 4: FORMATIVE.COM STYLE DASHBOARD =================

let currentProgressData = [];
let currentProgressQuestions = [];

async function loadTeacherProgress() {
    const select = document.getElementById('progressAssignmentSelect');
    const { data } = await sb.from('classcast_assignments').select('id, title').order('created_at', { ascending: false });
    
    select.innerHTML = '<option value="">-- Select an Assignment to View Data --</option>';
    if(data) {
        data.forEach(a => {
            select.innerHTML += `<option value="${a.id}">${a.title}</option>`;
        });
    }
    
    document.getElementById('progressTableHeader').innerHTML = '<tr><th style="padding: 20px; text-align: center; color: #666;">Please select an assignment above.</th></tr>';
    document.getElementById('progressTableBody').innerHTML = '';
}

window.loadAssignmentProgress = async function() {
    const assignId = document.getElementById('progressAssignmentSelect').value;
    if(!assignId) {
        document.getElementById('progressTableHeader').innerHTML = '<tr><th style="padding: 20px; text-align: center; color: #666;">Please select an assignment above.</th></tr>';
        document.getElementById('progressTableBody').innerHTML = '';
        return;
    }

    const { data: qData } = await sb.from('classcast_questions').select('*').eq('assignment_id', assignId).order('trigger_second', { ascending: true });
    currentProgressQuestions = qData || [];

    const { data: pData } = await sb.from('classcast_progress').select('*').eq('assignment_id', assignId);
    currentProgressData = pData || [];

    renderProgressGrid();
};

function renderProgressGrid() {
    const thead = document.getElementById('progressTableHeader');
    const tbody = document.getElementById('progressTableBody');

    if (currentProgressData.length === 0) {
        thead.innerHTML = '<tr><th style="padding: 20px; text-align: center; color: #666;">No student data found for this assignment yet.</th></tr>';
        tbody.innerHTML = '';
        return;
    }

    let headerHtml = `<tr>
        <th style="position: sticky; left: 0; background: #f8f9fa; z-index: 2; border-right: 2px solid #ccc;">Student</th>
        <th>Status</th>
        <th>Audio Reached</th>
        <th>Total Time Spent</th>
        <th style="text-align:center;">Rewinds</th>
        <th>Score</th>`;
    
    currentProgressQuestions.forEach((q, i) => {
        let typeLabel = q.question_type ? q.question_type.toUpperCase() : 'OPEN';
        headerHtml += `<th style="min-width: 200px;">Q${i+1} (${typeLabel})<br><span style="font-size:0.75rem; font-weight:normal; color:#666;">@ ${q.trigger_second}s</span></th>`;
    });
    headerHtml += `</tr>`;
    thead.innerHTML = headerHtml;

    let bodyHtml = '';
    currentProgressData.forEach(p => {
        let answers = typeof p.student_answers === 'string' ? JSON.parse(p.student_answers || '{}') : (p.student_answers || {});
        
        let correctCount = 0;
        let totalGraded = 0;
        
        currentProgressQuestions.forEach(q => {
            let ansData = answers[q.id];
            if (ansData) {
                if (ansData.isCorrect === true) correctCount++;
                if (ansData.isCorrect === true || ansData.isCorrect === false) totalGraded++; 
            }
        });
        
        let scoreText = totalGraded > 0 ? `${Math.round((correctCount/totalGraded)*100)}% (${correctCount}/${totalGraded})` : 'N/A';
        
        let reachedText = formatTime(p.furthest_second || 0);
        let timeSpentText = formatTime(p.total_session_seconds || 0);

        bodyHtml += `<tr>
            <td style="position: sticky; left: 0; background: #fff; z-index: 1; border-right: 2px solid #ccc;">
                <strong>${p.student_email.split('@')[0]}</strong>
                <div style="font-size: 0.75rem; color: #888;">${p.student_email}</div>
            </td>
            <td>${p.status === 'completed' ? '✅ Complete' : '🔄 In Progress'}</td>
            <td style="font-family: monospace;">${reachedText}</td>
            <td style="font-family: monospace;">${timeSpentText}</td>
            <td style="text-align:center;">${p.rewind_count || 0}</td>
            <td><strong>${scoreText}</strong></td>`;
        
        currentProgressQuestions.forEach(q => {
            let ansData = answers[q.id];
            if (!ansData) {
                bodyHtml += `<td style="color:#aaa; font-style:italic; background: #f9f9f9;">No Answer</td>`;
            } else {
                let bgColor = '#fff3e0'; 
                if (ansData.isCorrect === true) bgColor = '#e8f5e9'; 
                else if (ansData.isCorrect === false) bgColor = '#ffebee'; 

                let ansText = '';
                if (q.question_type === 'mc') {
                    let opts = typeof q.options === 'string' ? JSON.parse(q.options || '{}') : (q.options || {});
                    let letter = ansData.answer; 
                    ansText = letter ? `${letter.toUpperCase()}: ${opts[letter] || ''}` : 'No Answer';
                } else {
                    ansText = Array.isArray(ansData.answer) ? ansData.answer.join(', ') : escapeHTML(ansData.answer);
                }
                
                let gradingButtons = '';
                if ((q.question_type || 'open') === 'open') {
                    gradingButtons = `<div style="margin-top: 8px; display:flex; gap: 5px;">
                        <button onclick="gradeAnswer('${p.student_email}', ${p.assignment_id}, ${q.id}, true)" style="background:#1e8e3e; color:white; border:none; border-radius:3px; cursor:pointer; font-size:0.75rem; padding:4px 8px;">✅ Correct</button>
                        <button onclick="gradeAnswer('${p.student_email}', ${p.assignment_id}, ${q.id}, false)" style="background:#c62828; color:white; border:none; border-radius:3px; cursor:pointer; font-size:0.75rem; padding:4px 8px;">❌ Incorrect</button>
                    </div>`;
                }

                bodyHtml += `<td style="background-color: ${bgColor}; white-space: normal; word-wrap: break-word;">
                    <div style="font-size: 0.9rem;">${ansText}</div>
                    ${gradingButtons}
                </td>`;
            }
        });
        bodyHtml += `</tr>`;
    });
    tbody.innerHTML = bodyHtml;
}

window.gradeAnswer = async function(email, assignId, questionId, isCorrect) {
    let pRow = currentProgressData.find(p => p.student_email === email && p.assignment_id === assignId);
    if (!pRow) return;
    
    let answers = typeof pRow.student_answers === 'string' ? JSON.parse(pRow.student_answers || '{}') : (pRow.student_answers || {});
    
    if (!answers[questionId]) answers[questionId] = {};
    answers[questionId].isCorrect = isCorrect;
    
    pRow.student_answers = answers; 
    
    await sb.from('classcast_progress').update({ student_answers: answers })
        .eq('student_email', email).eq('assignment_id', assignId);
        
    renderProgressGrid(); 
};

window.exportStudentData = async function() {
    const assignId = document.getElementById('progressAssignmentSelect').value;
    if (!assignId) return alert("Please select an assignment from the dropdown first to export its detailed data.");
    
    const assignDropdown = document.getElementById('progressAssignmentSelect');
    const assignName = assignDropdown.options[assignDropdown.selectedIndex].text;

    // Added explicit Username and Email columns
    let csv = "Student Username,Student Email,Status,Audio Reached,Total Time Spent,Rewind Count,Score";
    currentProgressQuestions.forEach((q, i) => {
        csv += `,Q${i+1} (${q.question_type || 'open'})`;
    });
    csv += "\n";

    currentProgressData.forEach(p => {
        let answers = typeof p.student_answers === 'string' ? JSON.parse(p.student_answers || '{}') : (p.student_answers || {});
        let correctCount = 0; let totalGraded = 0;
        
        currentProgressQuestions.forEach(q => {
            let ansData = answers[q.id];
            if (ansData && (ansData.isCorrect === true || ansData.isCorrect === false)) {
                if (ansData.isCorrect === true) correctCount++;
                totalGraded++;
            }
        });
        
        let scoreText = totalGraded > 0 ? `${Math.round((correctCount/totalGraded)*100)}%` : 'N/A';
        let reachedText = formatTime(p.furthest_second || 0);
        let timeSpentText = formatTime(p.total_session_seconds || 0);

        // Separating username and email
        csv += `"${p.student_email.split('@')[0]}","${p.student_email}","${p.status}","${reachedText}","${timeSpentText}","${p.rewind_count || 0}","${scoreText}"`;
        
        currentProgressQuestions.forEach(q => {
            let ansData = answers[q.id];
            if (!ansData) {
                csv += `,"No Answer"`;
            } else {
                let ansText = '';
                if (q.question_type === 'mc') {
                    let opts = typeof q.options === 'string' ? JSON.parse(q.options || '{}') : (q.options || {});
                    let letter = ansData.answer;
                    // Resolves "a" to "A: The correct choice text"
                    ansText = letter ? `${letter.toUpperCase()}: ${opts[letter] || ''}` : 'No Answer';
                } else {
                    ansText = Array.isArray(ansData.answer) ? ansData.answer.join(', ') : (ansData.answer || '');
                }
                
                let gradeStr = ansData.isCorrect === true ? ' [Correct]' : (ansData.isCorrect === false ? ' [Incorrect]' : ' [Ungraded]');
                // Wraps in quotes and escapes internal quotes for CSV safety
                csv += `,"${String(ansText).replace(/"/g, '""')}${gradeStr}"`;
            }
        });
        csv += "\n";
    });

    // Uses Blob to safely export without the browser truncating hashtags (#)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `ClassCast_${assignName.replace(/[^a-z0-9]/gi, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
