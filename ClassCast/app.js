// ==========================================
// ClassCast - Unified Logic with Super Admin, Filters & Full Screen
// ==========================================

let sb = null;
let currentUser = null;
let googleProviderToken = sessionStorage.getItem('googleClassroomToken') || null; 

// SUPER ADMIN DEFINITION
const MAIN_ADMIN = 'wwilson@mtps.us'; 

let userPerms = { isTeacher: false, isSuperAdmin: false, email: '' };

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
let realtimeSubscription = null; 
let lastSkipTime = -999; // Track last skip to prevent infinite loops

// Progress View State
let filterNeedsGrading = false;
let currentProgressData = [];
let currentProgressQuestions = [];

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
    if (panelId === 'admin-super') loadSuperAdminTeachers();
    
    if (panelId !== 'admin-progress' && realtimeSubscription) {
        sb.removeChannel(realtimeSubscription);
        document.getElementById('liveUpdateBadge').classList.add('hidden');
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

window.toggleSubsparkOptions = function() {
    const isChecked = document.getElementById('autoCreateSubspark').checked;
    const container = document.getElementById('subsparkInitialPostContainer');
    if (isChecked) { container.classList.remove('hidden'); } else { container.classList.add('hidden'); }
};

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
    if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

async function checkUser() {
    try {
        const { data: { session } } = await sb.auth.getSession();
        const authSection = document.getElementById('authSection');
        const adminToggle = document.getElementById('adminToggle');
        const superAdminBtn = document.getElementById('superAdminNavBtn');
        
        if (session) {
            currentUser = session.user;
            const safeEmail = (currentUser?.email || '').toLowerCase();
            userPerms.email = safeEmail;
            
            // [NEW] SELF-HEALING PROFILE SYNC:
            // This guarantees the Teacher has a profile in Spark's shared database
            // so that "Create First Post" doesn't fail a foreign-key database constraint.
            const { error: profError } = await sb.from('profiles').upsert({
                id: session.user.id,
                email: safeEmail,
                username: safeEmail.split('@')[0]
            }, { onConflict: 'id' });
            if (profError) console.error("Profile Sync Error (Spark):", profError);

            const { data: teacherRecord } = await sb.from('classcast_teachers').select('*').eq('email', safeEmail).single();
            
            userPerms.isSuperAdmin = (safeEmail === MAIN_ADMIN);
            userPerms.isTeacher = !!teacherRecord || userPerms.isSuperAdmin;
            
            if (superAdminBtn) {
                if (userPerms.isSuperAdmin) {
                    superAdminBtn.classList.remove('hidden'); 
                    superAdminBtn.style.display = 'block';
                } else {
                    superAdminBtn.classList.add('hidden');
                    superAdminBtn.style.display = 'none';
                }
            }
            if (adminToggle) adminToggle.style.display = userPerms.isTeacher ? 'block' : 'none';
            
            if (authSection) {
                authSection.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-weight: 600; font-size: 0.9rem;">${safeEmail.split('@')[0]}</span>
                        <button onclick="signOut()" class="logout-btn">Log Out</button>
                    </div>`;
            }
            
            if (userPerms.isTeacher) { switchView('teacherView'); } else { switchView('studentView'); }
        } else {
            currentUser = null;
            googleProviderToken = null;
            sessionStorage.removeItem('googleClassroomToken');
            if (adminToggle) adminToggle.style.display = 'none';
            if (authSection) authSection.innerHTML = ''; 
            const loginBtnWrapper = document.getElementById('loginBtnWrapper');
            if (loginBtnWrapper) loginBtnWrapper.innerHTML = `<button onclick="signIn()" class="google-btn">Sign in with Google</button>`;
            switchView('loginView');
        }
    } catch (err) { console.error("Auth error:", err); }
}

window.signIn = async function() { 
    await sb.auth.signInWithOAuth({ 
        provider: 'google', 
        options: { 
            scopes: 'https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.profile.emails',
            redirectTo: window.location.origin + window.location.pathname, 
            queryParams: { prompt: 'consent', hd: 'mtps.us' } 
        } 
    }); 
};

window.signOut = async function() { 
    sessionStorage.removeItem('googleClassroomToken');
    await sb.auth.signOut(); 
    window.location.reload(); 
};

function escapeHTML(str) { 
    if (str === null || str === undefined) return '';
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); 
}

// ================= LINKS BUILDER =================
window.addLinkRow = function(linkData = null) {
    const list = document.getElementById('linksBuilderList');
    const div = document.createElement('div');
    div.className = 'link-row-item';
    div.style.display = "flex"; div.style.gap = "10px"; div.style.marginBottom = "10px";
    
    let titleVal = linkData ? escapeHTML(linkData.title) : '';
    let urlVal = linkData ? escapeHTML(linkData.url) : '';

    div.innerHTML = `
        <input type="text" class="l-title" value="${titleVal}" placeholder="Link Title (e.g. Chapter 1 PDF)" style="flex:1; margin:0;">
        <input type="url" class="l-url" value="${urlVal}" placeholder="https://..." style="flex:2; margin:0;">
        <button type="button" class="danger-btn" onclick="this.parentElement.remove()">X</button>
    `;
    list.appendChild(div);
};

window.addQuestionRow = function(type, qData = null) {
    const list = document.getElementById('questionsBuilderList');
    const id = Date.now() + Math.random().toString().slice(2, 6);
    const div = document.createElement('div');
    div.className = 'question-row-item';
    div.setAttribute('data-type', type); 
    div.style.border = "1px solid #ccc"; div.style.padding = "10px"; div.style.marginBottom = "10px"; div.style.borderRadius = "4px"; div.style.background = "#fff";

    let timeVal = qData && qData.trigger_second ? qData.trigger_second : '';
    let textVal = qData && qData.question_text ? escapeHTML(qData.question_text) : '';

    let headerHtml = `
        <div style="display:flex; gap:10px; margin-bottom:10px; align-items:center;">
            <span style="font-weight:bold; background:#555; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; text-transform:uppercase;">${type}</span>
            <input type="number" class="q-time" value="${timeVal}" placeholder="Time (s)" style="width: 80px; margin:0;" min="0">
            <input type="text" class="q-text" value="${textVal}" placeholder="Question prompt..." style="flex:1; margin:0;">
            <button type="button" class="danger-btn" onclick="this.parentElement.parentElement.remove()">X</button>
        </div>
    `;

    let bodyHtml = '';
    let parsedOptions = null; let parsedCorrectAnswer = null;
    if (qData) {
        if (typeof qData.options === 'object') parsedOptions = qData.options;
        else if (typeof qData.options === 'string') { try { parsedOptions = JSON.parse(qData.options); } catch(e) {} }
        if (typeof qData.correct_answer === 'object') parsedCorrectAnswer = qData.correct_answer;
        else if (typeof qData.correct_answer === 'string') { try { parsedCorrectAnswer = JSON.parse(qData.correct_answer); } catch(e) { parsedCorrectAnswer = qData.correct_answer; } }
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
            </div>`;
    } else if (type === 'tf') {
        let ans = parsedCorrectAnswer || 'true';
        bodyHtml = `<div style="padding-left:70px; font-size: 0.9rem;"><strong>Correct Answer: </strong><label style="margin-right:15px;"><input type="radio" name="tf_${id}" value="true" ${ans==='true'?'checked':''}> True</label><label><input type="radio" name="tf_${id}" value="false" ${ans==='false'?'checked':''}> False</label></div>`;
    } else if (type === 'match') {
        let pairs = (parsedOptions && parsedOptions.pairs) ? parsedOptions.pairs : [{t:'',m:''}, {t:'',m:''}, {t:'',m:''}];
        bodyHtml = `
            <div style="padding-left:70px; font-size:0.85rem; color:#666;">
                <em>Enter exactly matching pairs. The system will shuffle them for the students automatically.</em>
                <div style="margin-top:5px;">Pair 1: <input type="text" class="p1-t" value="${escapeHTML(pairs[0]?.t)}" placeholder="Term" style="width:30%; padding:4px;"> = <input type="text" class="p1-m" value="${escapeHTML(pairs[0]?.m)}" placeholder="Match" style="width:30%; padding:4px;"></div>
                <div style="margin-top:5px;">Pair 2: <input type="text" class="p2-t" value="${escapeHTML(pairs[1]?.t)}" placeholder="Term" style="width:30%; padding:4px;"> = <input type="text" class="p2-m" value="${escapeHTML(pairs[1]?.m)}" placeholder="Match" style="width:30%; padding:4px;"></div>
                <div style="margin-top:5px;">Pair 3: <input type="text" class="p3-t" value="${escapeHTML(pairs[2]?.t)}" placeholder="Term" style="width:30%; padding:4px;"> = <input type="text" class="p3-m" value="${escapeHTML(pairs[2]?.m)}" placeholder="Match" style="width:30%; padding:4px;"></div>
            </div>`;
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
    
    let targetClasses = []; let targetStudents = [];
    try { targetClasses = JSON.parse(assignData.target_class || '[]'); } catch(e) { targetClasses = [assignData.target_class]; }
    try { targetStudents = JSON.parse(assignData.target_students || '[]'); } catch(e) { targetStudents = []; }

    document.querySelectorAll('.class-checkbox').forEach(cb => {
        if (targetClasses.includes(cb.value)) {
            cb.checked = true;
            document.getElementById(`student-list-${cb.getAttribute('data-class-id')}`).style.display = 'block';
        }
    });

    document.querySelectorAll('.student-checkbox').forEach(cb => { if (targetStudents.includes(cb.value)) cb.checked = true; });

    document.querySelector('input[name="audioSourceType"][value="dropbox"]').checked = true;
    toggleAudioSourceUI();
    document.getElementById('newAssignAudioUrl').value = assignData.audio_url || '';
    document.getElementById('newAssignTranscript').value = assignData.transcript || '';
    document.getElementById('newAssignAllowSpeed').checked = assignData.allow_speed !== false;

    document.getElementById('existingSubsparkUrl').value = assignData.subspark_url || '';
    document.getElementById('autoCreateSubspark').checked = false;
    toggleSubsparkOptions();

    document.getElementById('linksBuilderList').innerHTML = '';
    let links = [];
    try { links = JSON.parse(assignData.additional_links || '[]'); } catch(e) {}
    links.forEach(l => addLinkRow(l));

    document.getElementById('questionsBuilderList').innerHTML = '';
    if (qData) qData.forEach(q => addQuestionRow(q.question_type || 'open', q));

    // FIXED: Load skip zones when editing
    currentSkipZones = [];
    if (assignData.skip_zones) {
        try {
            // Handle if it's stored as a string
            if (typeof assignData.skip_zones === 'string') {
                currentSkipZones = JSON.parse(assignData.skip_zones);
            } else if (Array.isArray(assignData.skip_zones)) {
                currentSkipZones = assignData.skip_zones;
            }
        } catch(e) {
            console.error('Error loading skip zones:', e);
            currentSkipZones = [];
        }
    }
    renderSkipZones(); // Display the loaded skip zones

    // FEATURE 4: Load dates when editing
    document.getElementById('newAssignOpenDate').value = assignData.open_date ? assignData.open_date.slice(0, 16) : '';
    document.getElementById('newAssignCloseDate').value = assignData.close_date ? assignData.close_date.slice(0, 16) : '';

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
        document.getElementById(`student-list-${cb.getAttribute('data-class-id')}`).style.display = 'none';
    });
    document.querySelectorAll('.student-checkbox').forEach(cb => cb.checked = false);
    
    if(document.getElementById('newAssignAudioFile')) document.getElementById('newAssignAudioFile').value = '';
    document.getElementById('newAssignAudioUrl').value = '';
    document.getElementById('newAssignTranscript').value = '';
    document.getElementById('questionsBuilderList').innerHTML = '';
    document.getElementById('linksBuilderList').innerHTML = '';
    
    document.getElementById('existingSubsparkUrl').value = '';
    document.getElementById('autoCreateSubspark').checked = false;
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
    
    if(!title || selectedClasses.length === 0) return alert("Title and at least one Target Class are required.");

    const linkRows = document.querySelectorAll('.link-row-item');
    const finalLinks = [];
    linkRows.forEach(row => {
        const t = row.querySelector('.l-title').value.trim();
        const u = row.querySelector('.l-url').value.trim();
        if (t && u) finalLinks.push({ title: t, url: u });
    });

    let finalAudioUrl = '';
    try {
        publishBtn.disabled = true; publishBtn.innerText = 'Publishing...';

        if (sourceType === 'upload') {
            const file = document.getElementById('newAssignAudioFile').files[0];
            if (!file && !editingAssignmentId) { alert("Select audio file."); publishBtn.disabled=false; publishBtn.innerText='Publish'; return; }
            if (file) {
                const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${file.name.split('.').pop()}`;
                const { error } = await sb.storage.from('audio-files').upload(uniqueName, file);
                if (error) throw error;
                finalAudioUrl = sb.storage.from('audio-files').getPublicUrl(uniqueName).data.publicUrl;
            } else {
                finalAudioUrl = document.getElementById('newAssignAudioUrl').value;
            }
        } else {
            let dropboxUrl = document.getElementById('newAssignAudioUrl').value;
            if (!dropboxUrl && !editingAssignmentId) { alert("Paste Dropbox URL."); publishBtn.disabled=false; publishBtn.innerText='Publish'; return; }
            finalAudioUrl = dropboxUrl.includes('dropbox.com') ? dropboxUrl.replace('?dl=0', '').replace('?dl=1', '') + (dropboxUrl.includes('?') ? '&' : '?') + 'raw=1' : dropboxUrl;
        }

        let existingSpark = document.getElementById('existingSubsparkUrl');
        let finalSubSparkUrl = existingSpark ? existingSpark.value : ''; 
        
        // --- UPDATED SUB-SPARK CREATION WITH ERROR CAPTURING ---
        if (document.getElementById('autoCreateSubspark').checked && !editingAssignmentId) {
            const { data: newSub, error: subError } = await sb.from('subreddits').insert([{ name: title, created_by: currentUser.id }]).select().single();
            if (subError) throw new Error("Subreddit Creation Error: " + subError.message);
            
            const postText = document.getElementById('subsparkFirstPostText').value;
            if (postText) {
                const imgVal = document.getElementById('subsparkFirstPostPhoto').value;
                const linkVal = document.getElementById('subsparkFirstPostLink').value;
                
                const { error: postError } = await sb.from('posts').insert([{ 
                    title: `Discussion: ${title}`, 
                    content: postText, 
                    image_url: imgVal || null,
                    url: linkVal || null,
                    subreddit_id: newSub.id, 
                    user_id: currentUser.id 
                }]);
                
                if (postError) throw new Error("Spark First Post Error: " + postError.message);
            }
            finalSubSparkUrl = `https://wwilson-ui.github.io/r/Spark/?sub=${newSub.id}`;
        }

        let newId;
        const assignPayload = {
            title: title, 
            target_class: JSON.stringify(selectedClasses), 
            target_students: JSON.stringify(selectedStudents), 
            audio_url: finalAudioUrl, 
            subspark_url: finalSubSparkUrl, 
            transcript: transcript, 
            allow_speed: document.getElementById('newAssignAllowSpeed').checked,
            additional_links: JSON.stringify(finalLinks),
            skip_zones: currentSkipZones,
            open_date: document.getElementById('newAssignOpenDate').value || null,
            close_date: document.getElementById('newAssignCloseDate').value || null,
            is_manually_closed: false
        };

        if (editingAssignmentId) {
            await sb.from('classcast_assignments').update(assignPayload).eq('id', editingAssignmentId);
            newId = editingAssignmentId;
            await sb.from('classcast_questions').delete().eq('assignment_id', newId);
        } else {
            const { data: assignData } = await sb.from('classcast_assignments').insert([assignPayload]).select();
            newId = assignData[0].id;
        }

        const questionsToInsert = [];
        document.querySelectorAll('.question-row-item').forEach(row => {
            const type = row.getAttribute('data-type') || 'open';
            const time = row.querySelector('.q-time').value;
            const text = row.querySelector('.q-text').value;

            if (time && text) {
                let options = null; let correctAnswer = null;
                if (type === 'mc') {
                    options = { a: row.querySelector('.opt-a').value, b: row.querySelector('.opt-b').value, c: row.querySelector('.opt-c').value, d: row.querySelector('.opt-d').value };
                    correctAnswer = (row.querySelector(`input[type="radio"]:checked`) || {}).value || 'a';
                } else if (type === 'tf') {
                    correctAnswer = (row.querySelector(`input[type="radio"]:checked`) || {}).value || 'true';
                } else if (type === 'match') {
                    options = { pairs: [{ t: row.querySelector('.p1-t').value, m: row.querySelector('.p1-m').value }, { t: row.querySelector('.p2-t').value, m: row.querySelector('.p2-m').value }, { t: row.querySelector('.p3-t').value, m: row.querySelector('.p3-m').value }] };
                    correctAnswer = options; 
                }
                questionsToInsert.push({ assignment_id: newId, trigger_second: parseInt(time), question_text: text, question_type: type, options: options, correct_answer: correctAnswer });
            }
        });

        if(questionsToInsert.length > 0) await sb.from('classcast_questions').insert(questionsToInsert);
        alert("Assignment saved!"); cancelEdit(); loadTeacherAssignments();
        currentSkipZones = []; renderSkipZones(); // Add this line to clear the cuts

    } catch (error) { alert("Error: " + error.message); } 
    finally { publishBtn.disabled = false; publishBtn.innerText = 'Publish Assignment'; }
};

async function loadTeacherAssignments() {
    const tbody = document.getElementById('teacherAssignmentsTable');
    if(!tbody) return;
    let { data } = await sb.from('classcast_assignments').select('*').order('created_at', { ascending: false });
    if(!data) return;

    if (!userPerms.isSuperAdmin) {
        const { data: myClasses } = await sb.from('classcast_classes').select('class_name').contains('teacher_emails', `["${userPerms.email}"]`);
        const myClassNames = myClasses ? myClasses.map(c => c.class_name) : [];
        data = data.filter(a => {
            try { const targets = JSON.parse(a.target_class || '[]'); return targets.some(c => myClassNames.includes(c)); } catch(e) { return myClassNames.includes(a.target_class); }
        });
    }

    if(data.length === 0) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No assignments.</td></tr>'; return; }
    
    tbody.innerHTML = data.map(a => {
        // FEATURE 4: Check assignment status
        const now = new Date();
        const openDate = a.open_date ? new Date(a.open_date) : null;
        const closeDate = a.close_date ? new Date(a.close_date) : null;
        const isClosed = a.is_manually_closed || (closeDate && now > closeDate);
        const isScheduled = openDate && now < openDate;
        
        let statusBadge = '';
        if (isClosed) {
            statusBadge = '<span style="background: #f44336; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 8px;">🔒 Closed</span>';
        } else if (isScheduled) {
            statusBadge = '<span style="background: #ff9800; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 8px;">📅 Scheduled</span>';
        } else {
            statusBadge = '<span style="background: #4caf50; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 8px;">✅ Open</span>';
        }
        
        // IMPROVED: Toggle switch instead of button
        const isOpen = !isClosed;
        const toggleSwitch = `
            <label style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; margin-right: 10px;">
                <span style="font-size: 0.85rem; font-weight: 600; color: #666;">${isOpen ? 'Open' : 'Closed'}</span>
                <div style="position: relative; width: 50px; height: 26px; background: ${isOpen ? '#4caf50' : '#ccc'}; border-radius: 13px; transition: background 0.3s;">
                    <input type="checkbox" ${isOpen ? 'checked' : ''} onchange="toggleAssignmentStatus(${a.id}, this.checked)" style="opacity: 0; width: 0; height: 0;">
                    <span style="position: absolute; top: 3px; left: ${isOpen ? '26px' : '3px'}; width: 20px; height: 20px; background: white; border-radius: 50%; transition: left 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></span>
                </div>
            </label>
        `;
        
        return `
        <tr>
            <td><strong>${a.title}</strong>${statusBadge}</td>
            <td>${a.target_class}</td>
            <td>
                ${toggleSwitch}
                <button class="action-btn" style="padding: 6px 12px; font-size: 0.8rem; background: #555; margin-right: 5px;" onclick="editAssignment(${a.id})">Edit</button>
                <button class="danger-btn" onclick="deleteAssignment(${a.id})">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

window.deleteAssignment = async function(id) { if(confirm("Delete this assignment?")) { await sb.from('classcast_assignments').delete().eq('id', id); loadTeacherAssignments(); } };

// ================= TEACHER PANEL 3: CLASSES & ROSTERS =================

window.populateClassCheckboxes = async function() {
    const container = document.getElementById('assignmentTargetsContainer');
    if(!container) return;
    container.innerHTML = '<p style="font-size:0.9rem; color:#666;">Loading classes...</p>';
    
    let query = sb.from('classcast_classes').select('*').order('class_name');
    if (!userPerms.isSuperAdmin) query = query.contains('teacher_emails', `["${userPerms.email}"]`);
    
    const { data: classes } = await query;
    const { data: rosters } = await sb.from('classcast_roster').select('*');
    
    if(!classes || classes.length === 0) { container.innerHTML = '<p style="color:red;">No classes available.</p>'; return; }

    let html = '';
    classes.forEach(cls => {
        const students = (rosters || []).filter(r => r.class_id === cls.id);
        html += `
        <div style="margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">
            <label style="font-weight: bold; cursor: pointer;"><input type="checkbox" class="class-checkbox" value="${cls.class_name}" data-class-id="${cls.id}" onchange="toggleStudentList(${cls.id})"> ${cls.class_name}</label>
            <div id="student-list-${cls.id}" style="display: none; margin-top: 5px; padding-left: 20px;">
                <p style="margin:0 0 5px 0; font-size:0.8rem; font-style:italic;">Select specific students (leave blank for whole class):</p>
                ${students.map(s => `<label style="display:block; font-size:0.85rem;"><input type="checkbox" class="student-checkbox class-${cls.id}-student" value="${s.student_email}"> ${s.student_name || s.student_email}</label>`).join('')}
            </div>
        </div>`;
    });
    container.innerHTML = html;
};

window.toggleStudentList = function(classId) {
    const isChecked = document.querySelector(`.class-checkbox[data-class-id="${classId}"]`).checked;
    document.getElementById(`student-list-${classId}`).style.display = isChecked ? 'block' : 'none';
    if (!isChecked) document.querySelectorAll(`.class-${classId}-student`).forEach(cb => cb.checked = false);
};

window.openClassroomImport = async function() {
    if (!googleProviderToken) return alert("Please Sign Out, sign back in, and ensure you check the box to view Classroom Emails!");
    document.getElementById('classroomImportCard').classList.remove('hidden');
    const statusTxt = document.getElementById('classroomStatus');
    const select = document.getElementById('classroomCourseSelect');
    statusTxt.innerText = "Fetching Google Classrooms...";
    try {
        const res = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', { headers: { Authorization: `Bearer ${googleProviderToken}` } });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        select.innerHTML = '<option value="">-- Choose a Google Classroom --</option>';
        if (data.courses && data.courses.length > 0) {
            data.courses.forEach(c => select.innerHTML += `<option value="${c.id}">${c.name} ${c.section ? `(${c.section})` : ''}</option>`);
            statusTxt.innerText = "Select a class to sync its roster.";
        } else statusTxt.innerText = "No active Classrooms found.";
    } catch (err) { statusTxt.innerText = "Error: " + err.message; statusTxt.style.color = "red"; }
};

window.importSelectedClassroom = async function() {
    const courseId = document.getElementById('classroomCourseSelect').value;
    const courseName = document.getElementById('classroomCourseSelect').options[document.getElementById('classroomCourseSelect').selectedIndex].text;
    const statusTxt = document.getElementById('classroomStatus');
    if (!courseId) return alert("Select a course.");
    try {
        statusTxt.innerText = `Syncing roster for ${courseName}...`;
        const res = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/students`, { headers: { Authorization: `Bearer ${googleProviderToken}` } });
        const data = await res.json();
        const students = data.students || [];
        if (students.length === 0) return statusTxt.innerText = "No students found.";

        const { data: existingClass } = await sb.from('classcast_classes').select('*').eq('class_name', courseName).single();
        let classRecordId;
        if (existingClass) { classRecordId = existingClass.id; }
        else {
            const { data: newClass } = await sb.from('classcast_classes').insert([{ class_name: courseName, teacher_emails: [userPerms.email] }]).select();
            classRecordId = newClass[0].id;
        }

        const incoming = students.map(s => ({ email: s.profile.emailAddress || '', name: s.profile.name?.fullName || 'Unknown' }));
        const { data: existingRoster } = await sb.from('classcast_roster').select('*').eq('class_id', classRecordId);
        
        const existingEmails = new Set(existingRoster.map(r => r.student_email));
        const incomingEmails = new Set(incoming.map(s => s.email));

        const toInsert = incoming.filter(s => !existingEmails.has(s.email)).map(s => ({ class_id: classRecordId, student_email: s.email, student_name: s.name }));
        const toDelete = existingRoster.filter(r => !incomingEmails.has(r.student_email));

        for (let r of toDelete) await sb.from('classcast_roster').delete().eq('id', r.id);
        if (toInsert.length > 0) await sb.from('classcast_roster').insert(toInsert);

        statusTxt.innerText = `Synced! Added ${toInsert.length}, Removed ${toDelete.length}.`; statusTxt.style.color = "green";
        setTimeout(() => { document.getElementById('classroomImportCard').classList.add('hidden'); loadManageClasses(); }, 2000);
    } catch (err) { statusTxt.innerText = err.message; statusTxt.style.color = "red"; }
};

window.importFromCSV = async function() {
    const file = document.getElementById('csvFileInput').files[0];
    const statusTxt = document.getElementById('csvImportStatus');
    if (!file) return statusTxt.innerText = "Select CSV.";
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const rows = e.target.result.split('\n').map(r => r.trim()).filter(r => r.length > 0);
            const splitCSV = (str) => { let res=[], cur='', inQ=false; for(let c of str){ if(c==='"')inQ=!inQ; else if(c===',' && !inQ){ res.push(cur.trim().replace(/^"|"$/g,'')); cur=''; } else cur+=c; } res.push(cur.trim().replace(/^"|"$/g,'')); return res; };
            const headers = splitCSV(rows[0]).map(h => h.toLowerCase());
            let nameIdx = headers.findIndex(h => h.includes('name')); let emailIdx = headers.findIndex(h => h.includes('email')); let classIdx = headers.findIndex(h => h.includes('class') || h.includes('period'));
            if (emailIdx === -1 || classIdx === -1) throw new Error("Requires 'Email' and 'Class' columns.");

            let parsed = [];
            for (let i = 1; i < rows.length; i++) {
                const cols = splitCSV(rows[i]);
                if (cols[emailIdx] && cols[classIdx]) parsed.push({ name: nameIdx!==-1?cols[nameIdx]:'', email: cols[emailIdx], className: cols[classIdx] });
            }

            const uniqueClasses = [...new Set(parsed.map(d => d.className))];
            const { data: existingClasses } = await sb.from('classcast_classes').select('*');
            let classMap = {}; existingClasses.forEach(c => classMap[c.class_name] = c.id);

            for (const cName of uniqueClasses) {
                if (!classMap[cName]) {
                    const { data: newClass } = await sb.from('classcast_classes').insert([{ class_name: cName, teacher_emails: [userPerms.email] }]).select();
                    classMap[cName] = newClass[0].id;
                }
            }

            statusTxt.innerText = "Merging roster data safely...";
            let addedCount = 0;
            for (const cName of uniqueClasses) {
                const cid = classMap[cName];
                const studentsInClass = parsed.filter(p => p.className === cName);
                const { data: existRost } = await sb.from('classcast_roster').select('student_email').eq('class_id', cid);
                const existSet = new Set(existRost.map(r => r.student_email));
                
                const inserts = [];
                studentsInClass.forEach(s => {
                    if (!existSet.has(s.email)) { inserts.push({ class_id: cid, student_email: s.email, student_name: s.name || s.email.split('@')[0] }); existSet.add(s.email); }
                });
                if (inserts.length > 0) { await sb.from('classcast_roster').insert(inserts); addedCount += inserts.length; }
            }
            statusTxt.innerText = `Success! Added ${addedCount} new students.`; statusTxt.style.color = "green";
            setTimeout(() => { document.getElementById('csvFileInput').value=''; statusTxt.innerText=''; loadManageClasses(); }, 3000);
        } catch (err) { statusTxt.innerText = err.message; statusTxt.style.color = "red"; }
    };
    reader.readAsText(file);
};

async function loadManageClasses() {
    const container = document.getElementById('classesListContainer');
    container.innerHTML = '<p>Loading classes...</p>';
    
    let query = sb.from('classcast_classes').select('*').order('class_name');
    if (!userPerms.isSuperAdmin) query = query.contains('teacher_emails', `["${userPerms.email}"]`);
    const { data: classes } = await query;
    const { data: rosters } = await sb.from('classcast_roster').select('*');
    
    if(!classes || classes.length === 0) { container.innerHTML = '<p>No classes created yet.</p>'; return; }

    let html = '';
    classes.forEach(cls => {
        const students = (rosters || []).filter(r => r.class_id === cls.id);
        const tEmails = Array.isArray(cls.teacher_emails) ? cls.teacher_emails : [cls.teacher_emails];
        
        let studentRows = students.length === 0 ? '<tr><td colspan="3" style="text-align:center; color:#666;">No students added.</td></tr>'
            : students.map(s => {
                const safe = s.student_email || '';
                const name = s.student_name ? s.student_name : (safe.includes('@') ? safe.split('@')[0] : `<strong>${safe}</strong>`);
                const emailDisplay = safe.includes('@') ? `<span style="color:#555;">${safe}</span>` : `<span style="color:red; font-weight:bold;">⚠️ Blocked by Google/IT</span>`;
                return `<tr><td><strong>${name}</strong></td><td>${emailDisplay}</td><td style="text-align:center;"><button class="danger-btn" onclick="removeStudent(${s.id})">Remove</button></td></tr>`;
            }).join('');

        html += `
        <div class="card" style="margin-bottom: 25px; border: 1px solid #dee2e6;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; color:var(--primary);">${cls.class_name}</h3>
                <button class="danger-btn" onclick="deleteClass(${cls.id})">Delete Class</button>
            </div>
            
            <div style="margin-top: 10px; font-size: 0.85rem; color: #555;">
                <strong>Co-Teachers:</strong> ${tEmails.join(', ')} 
                <button onclick="addCoTeacherPrompt(${cls.id})" style="margin-left: 10px; background: none; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">+ Add Co-Teacher</button>
            </div>

            <div style="margin-top: 15px; display:flex; gap:10px;">
                <input type="text" id="addStudentName_${cls.id}" placeholder="Name (e.g. John Doe)" style="margin:0; flex:1;">
                <input type="email" id="addStudentEmail_${cls.id}" placeholder="Email (jdoe@...)" style="margin:0; flex:1;">
                <button class="action-btn" onclick="addStudentToClass(${cls.id})">Add Student</button>
            </div>
            
            <div style="margin-top: 20px; border: 1px solid #dee2e6; border-radius: 6px; overflow: hidden;">
                <table style="margin-top: 0; border-collapse: collapse; white-space: nowrap;">
                    <thead style="background: #f8f9fa;"><tr><th>Student Name</th><th>Student Email</th><th style="width: 120px; text-align: center;">Actions</th></tr></thead>
                    <tbody>${studentRows}</tbody>
                </table>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

window.createNewClass = async function() {
    const name = document.getElementById('newClassName').value;
    if(!name) return;
    await sb.from('classcast_classes').insert([{ class_name: name, teacher_emails: [userPerms.email] }]);
    document.getElementById('newClassName').value = ''; loadManageClasses();
};
window.deleteClass = async function(id) { if(confirm("Delete class?")) { await sb.from('classcast_classes').delete().eq('id', id); loadManageClasses(); } };
window.addStudentToClass = async function(classId) {
    const n = document.getElementById(`addStudentName_${classId}`).value; const e = document.getElementById(`addStudentEmail_${classId}`).value;
    if(!e) return; await sb.from('classcast_roster').insert([{ class_id: classId, student_name: n, student_email: e }]);
    loadManageClasses();
};
window.removeStudent = async function(id) { await sb.from('classcast_roster').delete().eq('id', id); loadManageClasses(); };

window.addCoTeacherPrompt = async function(classId) {
    const email = prompt("Enter the Google Email of the Co-Teacher you want to add to this class:");
    if (!email) return;
    const { data: cls } = await sb.from('classcast_classes').select('teacher_emails').eq('id', classId).single();
    let emails = Array.isArray(cls.teacher_emails) ? cls.teacher_emails : [cls.teacher_emails];
    if (!emails.includes(email)) emails.push(email.toLowerCase());
    await sb.from('classcast_classes').update({ teacher_emails: emails }).eq('id', classId);
    loadManageClasses();
};

async function loadManageFiles() {
    const tbody = document.getElementById('teacherFilesTable');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Loading...</td></tr>';
    const { data, error } = await sb.storage.from('audio-files').list();
    if(error) return tbody.innerHTML = `<tr><td colspan="3">Error: ${error.message}</td></tr>`;
    const valid = (data||[]).filter(f => f.name !== '.emptyFolderPlaceholder');
    tbody.innerHTML = valid.length ? valid.map(f => `<tr><td>${f.name}</td><td>${(f.metadata.size/1024/1024).toFixed(2)} MB</td><td><button class="danger-btn" onclick="deleteFile('${f.name}')">Delete</button></td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center;">No files found.</td></tr>';
}
window.deleteFile = async function(n) { if(confirm(`Delete ${n}?`)) { await sb.storage.from('audio-files').remove([n]); loadManageFiles(); } };

// ================= SUPER ADMIN PANEL =================
async function loadSuperAdminTeachers() {
    const tbody = document.getElementById('superAdminTeachersTable');
    tbody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';
    const { data } = await sb.from('classcast_teachers').select('*').order('email');
    if (!data || data.length === 0) return tbody.innerHTML = '<tr><td colspan="2">No authorized teachers found.</td></tr>';
    
    tbody.innerHTML = data.map(t => `
        <tr>
            <td><strong>${t.email}</strong> ${t.email === MAIN_ADMIN ? '<span style="color:red; font-size:0.8rem;">(Super Admin)</span>' : ''}</td>
            <td style="text-align:center;">
                ${t.email !== MAIN_ADMIN ? `<button class="danger-btn" onclick="removeTeacher('${t.email}')">Revoke Access</button>` : '<span style="color:#666; font-size: 0.8rem;">System Linked</span>'}
            </td>
        </tr>
    `).join('');
}
window.addAuthorizedTeacher = async function() {
    const email = document.getElementById('newTeacherEmail').value.trim().toLowerCase();
    if (!email) return;
    await sb.from('classcast_teachers').insert([{ email: email }]);
    document.getElementById('newTeacherEmail').value = '';
    loadSuperAdminTeachers();
};
window.removeTeacher = async function(email) {
    if (confirm(`Revoke admin dashboard access for ${email}?`)) {
        await sb.from('classcast_teachers').delete().eq('email', email);
        loadSuperAdminTeachers();
    }
}


// ================= STUDENT PORTAL =================

async function getStudentClassNames() {
    const safeEmail = currentUser?.email || ''; if (!safeEmail) return [];
    const { data: rData } = await sb.from('classcast_roster').select('class_id').eq('student_email', safeEmail);
    if (!rData || rData.length === 0) return [];
    const cIds = rData.map(r => r.class_id);
    const { data: cData } = await sb.from('classcast_classes').select('class_name').in('id', cIds);
    return cData ? cData.map(c => c.class_name) : [];
}

async function loadStudentClasses() {
    const classNames = await getStudentClassNames();
    const select = document.getElementById('studentClassFilter');
    if (!select) return;
    select.innerHTML = '<option value="all">My Assignments (All Classes)</option>';
    classNames.forEach(name => select.innerHTML += `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`);
    showStudentDashboard();
}

window.showStudentDashboard = function() {
    const player = document.getElementById('audioPlayer');
    if (player && !player.paused) { player.pause(); logProgress(Math.floor(player.currentTime), 'in_progress'); }
    document.getElementById('activeAssignmentCard').classList.add('hidden');
    document.getElementById('studentDashboard').classList.remove('hidden');
    loadStudentAssignments();
};

window.loadStudentAssignments = async function() {
    const selectedValue = document.getElementById('studentClassFilter').value || 'all'; 
    const dash = document.getElementById('studentDashboard');
    document.getElementById('activeAssignmentCard').classList.add('hidden'); dash.classList.remove('hidden');

    const names = await getStudentClassNames();
    if (names.length === 0) return dash.innerHTML = '<h2 style="margin-top:0;">My Dashboard</h2><p>You are not currently enrolled in any classes.</p>';

    dash.innerHTML = '<h2 style="margin-top:0;">My Dashboard</h2><p>Loading your assignments...</p>';
    const { data: assignments } = await sb.from('classcast_assignments').select('*').order('created_at', { ascending: false });
    const { data: progressData } = await sb.from('classcast_progress').select('*').eq('student_email', currentUser?.email || '');

    let assigned='', inProg='', comp='';

    if(assignments) {
        assignments.forEach(d => {
            let isTarget = false; let aClasses = [];
            try { aClasses = JSON.parse(d.target_class || '[]'); } catch (e) { aClasses = [d.target_class]; }
            if (selectedValue === 'all') isTarget = aClasses.some(c => names.includes(c));
            else isTarget = aClasses.includes(selectedValue);

            try {
                const ts = JSON.parse(d.target_students || '[]');
                if (ts.length > 0 && currentUser && !ts.includes(currentUser.email)) isTarget = false; 
            } catch (e) {}

            if (isTarget) {
                // FEATURE 4: Check if assignment is available
                const now = new Date();
                const openDate = d.open_date ? new Date(d.open_date) : null;
                const closeDate = d.close_date ? new Date(d.close_date) : null;
                const isClosed = d.is_manually_closed || (closeDate && now > closeDate);
                const isScheduled = openDate && now < openDate;
                
                // Skip closed or scheduled assignments
                if (isClosed || isScheduled) return;
                
                const prog = progressData ? progressData.find(p => p.assignment_id === d.id) : null;
                let btnText = 'Start Listening'; let btnColor = 'var(--primary)';
                if (prog && prog.status === 'completed') { btnText = 'Review'; btnColor = 'var(--success)'; }
                else if (prog) { btnText = 'Continue'; btnColor = '#f4b400'; }

                let badge = selectedValue === 'all' ? `<span style="background:#eee; color:#555; padding:2px 6px; border-radius:4px; font-size:0.75rem; margin-right:10px;">${aClasses.filter(c=>names.includes(c)).join(', ')}</span>` : '';
                const card = `<div style="border: 1px solid #dee2e6; padding: 15px; border-radius: 6px; margin-bottom: 10px; display:flex; justify-content:space-between; align-items:center; background: #fff;">
                                <div>${badge} <strong style="font-size: 1.1rem; color: #333;">${d.title}</strong></div>
                                <button class="action-btn" style="background: ${btnColor}; ${btnColor==='#f4b400'?'color: #000;':''}" onclick="startAssignment(${d.id})">${btnText}</button>
                              </div>`;

                if (!prog) assigned += card; else if (prog.status === 'in_progress') inProg += card; else comp += card;
            }
        });
    }

    dash.innerHTML = `<h2 style="margin-top:0;">${selectedValue === 'all' ? "My Assignments (All Classes)" : `Assignments: ${escapeHTML(selectedValue)}`}</h2>
                      <h3 style="color:#444; border-bottom:2px solid #eee; margin-top:20px;">🔴 Not Started</h3> ${assigned || '<p style="color:#888;">No new assignments.</p>'}
                      <h3 style="color:#f4b400; border-bottom:2px solid #eee; margin-top:25px;">🟡 In Progress</h3> ${inProg || '<p style="color:#888;">No assignments in progress.</p>'}
                      <h3 style="color:var(--success); border-bottom:2px solid #eee; margin-top:25px;">🟢 Completed</h3> ${comp || '<p style="color:#888;">No completed assignments yet.</p>'}`;
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
    lastSkipTime = -999; // Reset skip tracking
    
    document.getElementById('studentDashboard').classList.add('hidden'); 
    document.getElementById('activeAssignmentCard').classList.remove('hidden');
    document.getElementById('subsparkLinkContainer').classList.add('hidden');
    document.getElementById('studentLinksDisplayArea').classList.add('hidden');

    const { data: assignData } = await sb.from('classcast_assignments').select('*').eq('id', assignId).single();
    const { data: qData } = await sb.from('classcast_questions').select('*').eq('assignment_id', assignId);
    
    const safeUserEmail = currentUser?.email || '';
    if (safeUserEmail) {
        const { data: progData } = await sb.from('classcast_progress').select('*').eq('assignment_id', assignId).eq('student_email', safeUserEmail).single();
        if (progData) {
            maxReachedTime = progData.furthest_second || 0; rewindCount = progData.rewind_count || 0; previousTotalTime = progData.total_session_seconds || 0; 
            studentSessionAnswers = progData.student_answers || {};
            if (qData) qData.forEach(q => { if (studentSessionAnswers[q.id]) answeredCheckpoints.push(q.id); });
        }
    }

    if(!assignData) return; 
    
    // FEATURE 4: Check if assignment is available
    const now = new Date();
    const openDate = assignData.open_date ? new Date(assignData.open_date) : null;
    const closeDate = assignData.close_date ? new Date(assignData.close_date) : null;
    const isClosed = assignData.is_manually_closed || (closeDate && now > closeDate);
    const isScheduled = openDate && now < openDate;
    
    if (isClosed) {
        alert('This assignment is closed and no longer available.');
        showStudentDashboard();
        return;
    }
    
    if (isScheduled) {
        const openStr = openDate.toLocaleString();
        alert(`This assignment is not yet available. It opens on ${openStr}`);
        showStudentDashboard();
        return;
    }
    
    // FIXED: Store assignment globally so skip zones work during playback
    window.currentAssignment = assignData;
    
    activeQuestions = qData || [];
    
    document.getElementById('activeAssignmentTitle').innerText = assignData.title;
    document.getElementById('transcriptText').innerText = assignData.transcript || "No transcript provided.";
    
    const audioPlayer = document.getElementById('audioPlayer');
    document.getElementById('audioSource').src = assignData.audio_url; 
    
    if (assignData.allow_speed === false) { document.getElementById('speedToggleBtn').classList.add('hidden'); audioPlayer.playbackRate = 1.0; } 
    else { document.getElementById('speedToggleBtn').classList.remove('hidden'); currentSpeedIndex = 0; document.getElementById('speedToggleBtn').innerText = '1x'; audioPlayer.playbackRate = 1.0; }
    
    document.getElementById('audioScrubber').value = 0; document.getElementById('currentTimeDisplay').innerText = "0:00";
    document.getElementById('playPauseBtn').innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    
    audioPlayer.load();

    // HIDES OR ATTACHES THE SPARK LINK FOR THE MODAL POPUP LATER
    const sparkLinkEl = document.getElementById('activeSubsparkLink');
    if(sparkLinkEl) {
        sparkLinkEl.href = assignData.subspark_url || '#';
    }

    // SHOW ADDITIONAL LINKS TO STUDENT
    let links = [];
    try { links = JSON.parse(assignData.additional_links || '[]'); } catch(e) {}
    if (links.length > 0) {
        const linksCont = document.getElementById('studentLinksContainer');
        linksCont.innerHTML = links.map(l => `<a href="${escapeHTML(l.url)}" target="_blank" class="action-btn" style="background: white; color: var(--primary); border: 2px solid var(--primary); text-decoration: none;">📄 ${escapeHTML(l.title)}</a>`).join('');
        document.getElementById('studentLinksDisplayArea').classList.remove('hidden');
    }

    let previewHtml = '';
    activeQuestions.sort((a,b) => a.trigger_second - b.trigger_second).forEach((q, index) => {
        let t = q.question_type === 'mc' ? '[Multiple Choice]' : q.question_type === 'tf' ? '[True/False]' : q.question_type === 'match' ? '[Matching]' : '[Open-Ended]';
        previewHtml += `<div style="margin-bottom: 12px; border-bottom: 1px dashed #ccc; padding-bottom: 8px;"><strong>Q${index + 1}:</strong> ${q.question_text} <span style="color:#888; font-size: 0.8rem;">${t}</span></div>`;
    });
    document.getElementById('questionPreviewList').innerHTML = previewHtml || '<em>No interactive questions for this assignment.</em>';
};

function handleAudioTimeUpdate() {
    if(!currentAssignmentId) return; 
    const player = document.getElementById('audioPlayer');
    const currentTime = player.currentTime;

    // --- SKIP ZONES CHECK (FIXED - NO INFINITE LOOPS) ---
    if (window.currentAssignment && window.currentAssignment.skip_zones) {
        let zones = window.currentAssignment.skip_zones;
        
        // Handle if stored as string
        if (typeof zones === 'string') {
            try {
                zones = JSON.parse(zones);
            } catch(e) {
                console.error('Failed to parse skip zones:', e);
                zones = [];
            }
        }
        
        // Check each zone
        if (Array.isArray(zones)) {
            for (let zone of zones) {
                // Check if we're inside a skip zone AND haven't just skipped this zone
                if (currentTime >= zone.start && currentTime < zone.end) {
                    // Only skip if we haven't just done this skip (prevent infinite loop)
                    if (Math.abs(currentTime - lastSkipTime) > 0.5) {
                        console.log(`⏭️ Skipping from ${currentTime.toFixed(2)} to ${zone.end}`);
                        player.currentTime = zone.end;
                        lastSkipTime = zone.end; // Remember this skip
                        maxReachedTime = Math.max(maxReachedTime, zone.end); // Update max time
                        return; // Exit early, let next timeupdate handle the new position
                    }
                }
            }
        }
    }
    // ----------------------------------------

    // Prevent scrubbing ahead (but allow skip zone jumps)
    if (currentTime > maxReachedTime + 1) {
        player.currentTime = maxReachedTime;
    } else {
        maxReachedTime = Math.max(maxReachedTime, currentTime);
    }
    
    // Update UI
    const scrubber = document.getElementById('audioScrubber'); 
    const timeDisplay = document.getElementById('currentTimeDisplay');
    if(scrubber) scrubber.value = Math.floor(currentTime); 
    if(timeDisplay) timeDisplay.innerText = formatTime(currentTime);

    const passedQuestion = activeQuestions.find(q => player.currentTime >= q.trigger_second && !answeredCheckpoints.includes(q.id));
    if (passedQuestion) {
        if (currentActiveQuestionId !== passedQuestion.id) {
            currentActiveQuestionId = passedQuestion.id; player.pause(); player.currentTime = passedQuestion.trigger_second; 
            
            document.getElementById('questionModal').classList.remove('hidden'); 
            document.getElementById('submitAnswerBtn').style.display = 'block'; // Ensure button is visible for regular questions
            document.getElementById('questionText').innerText = passedQuestion.question_text; 
            document.getElementById('feedback').innerText = "";
            let qType = passedQuestion.question_type || 'open';
            let options = {};
            if (typeof passedQuestion.options === 'object' && passedQuestion.options !== null) options = passedQuestion.options;
            else if (typeof passedQuestion.options === 'string') { try { options = JSON.parse(passedQuestion.options); } catch(e) {} }
            
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
                interactiveHtml = `<div style="display:flex; gap:15px;"><label style="cursor:pointer;"><input type="radio" name="student_ans" value="true"> True</label><label style="cursor:pointer;"><input type="radio" name="student_ans" value="false"> False</label></div>`;
            } else if (qType === 'match') {
                let pairs = options.pairs || []; let shuffledMatches = pairs.map(p => p.m).sort(() => Math.random() - 0.5);
                interactiveHtml = pairs.map((p, i) => `<div style="margin-bottom:8px; display:flex; align-items:center; gap: 10px;"><strong style="width: 40%; text-align:right;">${escapeHTML(p.t)} = </strong> <select class="student_match_select" data-index="${i}" style="width: 50%; padding: 4px;"><option value="">-- Select Match --</option>${shuffledMatches.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('')}</select></div>`).join('');
            } else interactiveHtml = `<textarea id="studentAnswerText" rows="3" style="width:100%; font-family:inherit; padding:8px;" placeholder="Type your answer here..."></textarea>`;
            
            document.getElementById('questionInteractiveArea').innerHTML = interactiveHtml;
            
            document.getElementById('submitAnswerBtn').onclick = () => {
                let studentAns = null; let isCorrect = false; let valid = false;
                if (qType === 'mc' || qType === 'tf') {
                    const checked = document.querySelector('input[name="student_ans"]:checked');
                    if (checked) { 
                        studentAns = checked.value; valid = true; 
                        let correctVal = passedQuestion.correct_answer; if (typeof correctVal === 'string') { try { correctVal = JSON.parse(correctVal); } catch(e) {} }
                        isCorrect = (studentAns === String(correctVal)); 
                    }
                } else if (qType === 'match') {
                    const selects = document.querySelectorAll('.student_match_select'); studentAns = []; let allFilled = true; let allCorrect = true;
                    selects.forEach(s => {
                        if (!s.value) allFilled = false;
                        let idx = s.getAttribute('data-index'); if (s.value !== options.pairs[idx].m) allCorrect = false;
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
                    currentActiveQuestionId = null; player.play(); 
                    logProgress(Math.floor(player.currentTime), 'in_progress');
                } else document.getElementById('feedback').innerText = "Please complete the question to continue.";
            };
        } else { if (!player.paused) player.pause(); }
    }
    // Log progress every 10 seconds
    const progressCheckTime = Math.floor(player.currentTime);
    if(progressCheckTime > 0 && progressCheckTime % 10 === 0) logProgress(progressCheckTime, 'in_progress');
}

function handleAudioComplete() {
    logProgress(Math.floor(document.getElementById('audioPlayer').currentTime), 'completed');
    
    // THE NEW SPARK END-OF-AUDIO POPUP!
    const sparkUrl = document.getElementById('activeSubsparkLink').getAttribute('href');
    const modal = document.getElementById('questionModal');
    
    document.getElementById('submitAnswerBtn').style.display = 'none'; // Hide submit button so they don't get confused
    document.getElementById('feedback').innerText = "";
    
    if (sparkUrl && sparkUrl !== '#') {
        document.getElementById('questionText').innerHTML = "🎉 Assignment Complete!";
        document.getElementById('questionInteractiveArea').innerHTML = `
            <div style="text-align: center; margin: 20px 0; animation: slideDown 0.5s ease-out;">
                <p style="font-size: 1.1rem; color: #555; margin-bottom: 25px;">Great job! You have finished the audio. Head over to the community forum to discuss this episode with your class.</p>
                <a href="${sparkUrl}" target="_blank" class="action-btn" style="background: #FF4500; color: white; text-decoration: none; font-size: 1.2rem; padding: 15px 30px; display: inline-block; border-radius: 8px; font-weight: bold; box-shadow: 0 4px 10px rgba(255,69,0,0.3); transition: transform 0.2s;">
                    ⚡ Join the Discussion on r/Spark
                </a>
            </div>
        `;
        modal.classList.remove('hidden');
    } else {
        document.getElementById('questionText').innerHTML = "🎉 Assignment Complete!";
        document.getElementById('questionInteractiveArea').innerHTML = `
            <div style="text-align: center; margin: 20px 0;">
                <p style="font-size: 1.1rem; color: #555;">You have successfully completed this audio assignment. You can now close this and return to your dashboard.</p>
            </div>
        `;
        modal.classList.remove('hidden');
    }
}

async function logProgress(currentSecond, status) {
    const safeUserEmail = currentUser?.email || ''; if(!safeUserEmail || !currentAssignmentId) return;
    let currentSessionTime = sessionStartTime ? Math.floor((new Date() - sessionStartTime) / 1000) : 0;
    let totalListenSeconds = previousTotalTime + currentSessionTime;
    
    await sb.from('classcast_progress').upsert({ 
        student_email: safeUserEmail, 
        assignment_id: currentAssignmentId, 
        furthest_second: currentSecond, 
        total_session_seconds: totalListenSeconds, 
        status: status, 
        rewind_count: rewindCount, 
        student_answers: studentSessionAnswers,
        last_updated: new Date().toISOString() 
    }, { onConflict: 'student_email, assignment_id' });
}


// ================= PHASE 4: FORMATIVE.COM STYLE DASHBOARD & REALTIME =================

window.toggleFullScreenProgress = function() {
    const panel = document.getElementById('admin-progress');
    panel.classList.toggle('fullscreen-mode');
    const btn = document.getElementById('fullScreenBtn');
    if (panel.classList.contains('fullscreen-mode')) {
        btn.innerText = "⛶ Exit Full Screen";
        document.body.style.overflow = "hidden"; 
    } else {
        btn.innerText = "⛶ Full Screen";
        document.body.style.overflow = "auto";
    }
};

window.toggleGradingFilter = function() {
    filterNeedsGrading = !filterNeedsGrading;
    const btn = document.getElementById('filterGradingBtn');
    if (filterNeedsGrading) {
        btn.innerText = "👀 Showing Needs Grading";
        btn.style.background = "#1e8e3e";
        btn.style.color = "white";
    } else {
        btn.innerText = "🔎 Show Needs Grading";
        btn.style.background = "#f4b400";
        btn.style.color = "black";
    }
    renderProgressGrid();
};

async function loadTeacherProgress() {
    const select = document.getElementById('progressAssignmentSelect');
    let { data } = await sb.from('classcast_assignments').select('id, title, target_class').order('created_at', { ascending: false });
    
    if (!userPerms.isSuperAdmin) {
        const { data: myClasses } = await sb.from('classcast_classes').select('class_name').contains('teacher_emails', `["${userPerms.email}"]`);
        const myClassNames = myClasses ? myClasses.map(c => c.class_name) : [];
        data = data.filter(a => {
            try { const targets = JSON.parse(a.target_class || '[]'); return targets.some(c => myClassNames.includes(c)); } catch(e) { return myClassNames.includes(a.target_class); }
        });
    }
    
    select.innerHTML = '<option value="">-- Select an Assignment to View Data --</option>';
    if(data) data.forEach(a => select.innerHTML += `<option value="${a.id}">${a.title}</option>`);
    
    document.getElementById('progressTableHeader').innerHTML = '<tr><th style="padding: 20px; text-align: center; color: #666;">Please select an assignment above.</th></tr>';
    document.getElementById('progressTableBody').innerHTML = '';
}

function setupRealtimeProgress(assignId) {
    if (realtimeSubscription) sb.removeChannel(realtimeSubscription);
    document.getElementById('liveUpdateBadge').classList.remove('hidden');
    
    realtimeSubscription = sb.channel('progress-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'classcast_progress', filter: `assignment_id=eq.${assignId}` }, payload => {
            loadAssignmentProgress(true);
        }).subscribe();
}

window.loadAssignmentProgress = async function(isSilentRefresh = false) {
    const assignId = document.getElementById('progressAssignmentSelect').value;
    if(!assignId) {
        document.getElementById('progressTableHeader').innerHTML = '<tr><th style="padding: 20px; text-align: center; color: #666;">Please select an assignment above.</th></tr>';
        document.getElementById('progressTableBody').innerHTML = '';
        if (realtimeSubscription) { sb.removeChannel(realtimeSubscription); document.getElementById('liveUpdateBadge').classList.add('hidden'); }
        return;
    }

    if (!isSilentRefresh) setupRealtimeProgress(assignId);

    const { data: qData } = await sb.from('classcast_questions').select('*').eq('assignment_id', assignId).order('trigger_second', { ascending: true });
    currentProgressQuestions = qData || [];

    const { data: pData } = await sb.from('classcast_progress').select('*').eq('assignment_id', assignId);
    
    const { data: assignData } = await sb.from('classcast_assignments').select('target_class').eq('id', assignId).single();
    let targetClassNames = []; try { targetClassNames = JSON.parse(assignData.target_class || '[]'); } catch(e) { targetClassNames = [assignData.target_class]; }
    
    const { data: classRecords } = await sb.from('classcast_classes').select('id, class_name').in('class_name', targetClassNames);
    const cIds = classRecords ? classRecords.map(c => c.id) : [];
    
    // Create map of class ID to class name
    const classIdToName = {};
    if (classRecords) {
        classRecords.forEach(c => { classIdToName[c.id] = c.class_name; });
    }
    
    const { data: rosterData } = await sb.from('classcast_roster').select('student_email, student_name, class_id').in('class_id', cIds);
    window.currentRosterMap = {};
    window.currentClassMap = {}; // NEW: Map email to class name
    const validRosterEmails = new Set();
    if (rosterData) {
        rosterData.forEach(r => { 
            if (r.student_name && r.student_email) {
                window.currentRosterMap[r.student_email] = r.student_name;
                window.currentClassMap[r.student_email] = classIdToName[r.class_id] || 'Unknown Class';
            }
            validRosterEmails.add(r.student_email);
        });
    }

    currentProgressData = (pData || []).filter(p => validRosterEmails.has(p.student_email));
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

    let displayData = currentProgressData;
    if (filterNeedsGrading) {
        displayData = currentProgressData.filter(p => {
            let answers = typeof p.student_answers === 'string' ? JSON.parse(p.student_answers || '{}') : (p.student_answers || {});
            return currentProgressQuestions.some(q => {
                let ansData = answers[q.id];
                return ansData && (q.question_type === 'open' || !q.question_type) && (ansData.isCorrect === null || ansData.isCorrect === undefined);
            });
        });
    }

    // FEATURE 2: Apply sorting
    const sortBy = window.currentProgressSort || 'name-asc';
    displayData.sort((a, b) => {
        const aEmail = a.student_email || '';
        const bEmail = b.student_email || '';
        const aName = window.currentRosterMap[aEmail] || aEmail.split('@')[0] || '';
        const bName = window.currentRosterMap[bEmail] || bEmail.split('@')[0] || '';
        const aClass = window.currentClassMap[aEmail] || '';
        const bClass = window.currentClassMap[bEmail] || '';
        
        // Extract last names (word after last space, or entire name if no space)
        const aLastName = aName.includes(' ') ? aName.split(' ').pop() : aName;
        const bLastName = bName.includes(' ') ? bName.split(' ').pop() : bName;

        if (sortBy === 'name-asc') return aName.localeCompare(bName);
        if (sortBy === 'name-desc') return bName.localeCompare(aName);
        if (sortBy === 'lastname-asc') return aLastName.localeCompare(bLastName);
        if (sortBy === 'lastname-desc') return bLastName.localeCompare(aLastName);
        if (sortBy === 'class') {
            const classCompare = aClass.localeCompare(bClass);
            if (classCompare !== 0) return classCompare;
            // Secondary sort by last name within same class
            return aLastName.localeCompare(bLastName);
        }
        if (sortBy === 'status') return (b.status === 'completed' ? 1 : 0) - (a.status === 'completed' ? 1 : 0);
        
        if (sortBy === 'score-high' || sortBy === 'score-low') {
            let aAnswers = typeof a.student_answers === 'string' ? JSON.parse(a.student_answers || '{}') : (a.student_answers || {});
            let bAnswers = typeof b.student_answers === 'string' ? JSON.parse(b.student_answers || '{}') : (b.student_answers || {});
            let aCorrect = 0, bCorrect = 0;
            currentProgressQuestions.forEach(q => {
                if (aAnswers[q.id]?.isCorrect === true) aCorrect++;
                if (bAnswers[q.id]?.isCorrect === true) bCorrect++;
            });
            const totalQ = currentProgressQuestions.length || 1;
            const aScore = (aCorrect / totalQ) * 100;
            const bScore = (bCorrect / totalQ) * 100;
            return sortBy === 'score-high' ? bScore - aScore : aScore - bScore;
        }
        
        return 0;
    });

    let headerHtml = `<tr>
        <th style="position: sticky; left: 0; background: #f8f9fa; z-index: 2; border-right: 2px solid #ccc;">Student</th>
        <th>Class</th>
        <th>Status</th>
        <th>Audio Reached</th>
        <th>Total Time Spent</th>
        <th style="text-align:center;">Rewinds</th>
        <th>Score</th>`;
    
    currentProgressQuestions.forEach((q, i) => {
        let typeLabel = q.question_type ? q.question_type.toUpperCase() : 'OPEN';
        headerHtml += `<th style="min-width: 200px;">
            Q${i+1} (${typeLabel})<br>
            <span style="font-size:0.75rem; font-weight:normal; color:#666;">@ ${q.trigger_second}s</span>
            <button onclick="showQuestionPreview(${i})" style="margin-left: 6px; background: none; border: 1px solid #0079D3; color: #0079D3; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 0.75rem; line-height: 1; padding: 0;" title="View full question">?</button>
        </th>`;
    });
    headerHtml += `</tr>`;
    thead.innerHTML = headerHtml;

    if (displayData.length === 0 && filterNeedsGrading) {
        tbody.innerHTML = '<tr><td colspan="100%" style="padding: 20px; text-align: center; color: #1e8e3e; font-weight: bold;">🎉 All caught up! No grading needed.</td></tr>';
        return;
    }

    let bodyHtml = '';
    displayData.forEach(p => {
        let answers = typeof p.student_answers === 'string' ? JSON.parse(p.student_answers || '{}') : (p.student_answers || {});
        
        let correctCount = 0;
        let totalQuestions = currentProgressQuestions.length; 
        
        currentProgressQuestions.forEach(q => {
            let ansData = answers[q.id];
            if (ansData && ansData.isCorrect === true) correctCount++;
        });
        
        let scoreText = totalQuestions > 0 ? `${Math.round((correctCount/totalQuestions)*100)}% (${correctCount}/${totalQuestions})` : 'N/A';
        let reachedText = formatTime(p.furthest_second || 0);
        let timeSpentText = formatTime(p.total_session_seconds || 0);

        let safeEmail = p.student_email || '';
        let displayName = window.currentRosterMap[safeEmail] || safeEmail.split('@')[0] || 'Unknown Student';
        let className = window.currentClassMap[safeEmail] || 'Unknown Class';

        bodyHtml += `<tr>
            <td style="position: sticky; left: 0; background: #fff; z-index: 1; border-right: 2px solid #ccc;">
                <strong>${displayName}</strong>
                <div style="font-size: 0.75rem; color: #888;">${safeEmail}</div>
            </td>
            <td><span style="background: #e3f2fd; color: #0079D3; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">${className}</span></td>
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
                        <button onclick="gradeAnswer('${safeEmail}', ${p.assignment_id}, ${q.id}, true)" style="background:#1e8e3e; color:white; border:none; border-radius:3px; cursor:pointer; font-size:0.75rem; padding:4px 8px;">✅ Correct</button>
                        <button onclick="gradeAnswer('${safeEmail}', ${p.assignment_id}, ${q.id}, false)" style="background:#c62828; color:white; border:none; border-radius:3px; cursor:pointer; font-size:0.75rem; padding:4px 8px;">❌ Incorrect</button>
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
    await sb.from('classcast_progress').update({ student_answers: answers }).eq('student_email', email).eq('assignment_id', assignId);
    renderProgressGrid(); 
};

window.exportStudentData = async function() {
    const assignId = document.getElementById('progressAssignmentSelect').value;
    if (!assignId) return alert("Please select an assignment from the dropdown first to export its detailed data.");
    
    const assignDropdown = document.getElementById('progressAssignmentSelect');
    const assignName = assignDropdown.options[assignDropdown.selectedIndex].text;

    let csv = "Student Name,Student Email,Class,Raw Score,Percentage,Status,Audio Reached,Total Time Spent,Rewind Count";
    currentProgressQuestions.forEach((q, i) => { csv += `,Q${i+1} (${q.question_type || 'open'})`; });
    csv += "\n";

    currentProgressData.forEach(p => {
        let answers = typeof p.student_answers === 'string' ? JSON.parse(p.student_answers || '{}') : (p.student_answers || {});
        let correctCount = 0; let totalQuestions = currentProgressQuestions.length; 
        
        currentProgressQuestions.forEach(q => {
            let ansData = answers[q.id];
            if (ansData && ansData.isCorrect === true) correctCount++;
        });
        
        let rawScore = totalQuestions > 0 ? `${correctCount}/${totalQuestions}` : 'N/A';
        let percentScore = totalQuestions > 0 ? `${Math.round((correctCount/totalQuestions)*100)}%` : 'N/A';
        let reachedText = formatTime(p.furthest_second || 0);
        let timeSpentText = formatTime(p.total_session_seconds || 0);

        let safeEmail = p.student_email || '';
        let displayName = window.currentRosterMap[safeEmail] || safeEmail.split('@')[0] || 'Unknown';
        let className = window.currentClassMap[safeEmail] || 'Unknown Class';

        csv += `"${displayName}","${safeEmail}","${className}","${rawScore}","${percentScore}","${p.status}","${reachedText}","${timeSpentText}","${p.rewind_count || 0}"`;
        
        currentProgressQuestions.forEach(q => {
            let ansData = answers[q.id];
            if (!ansData) csv += `,"No Answer"`;
            else {
                let ansText = '';
                if (q.question_type === 'mc') {
                    let opts = typeof q.options === 'string' ? JSON.parse(q.options || '{}') : (q.options || {});
                    let letter = ansData.answer;
                    ansText = letter ? `${letter.toUpperCase()}: ${opts[letter] || ''}` : 'No Answer';
                } else ansText = Array.isArray(ansData.answer) ? ansData.answer.join(', ') : (ansData.answer || '');
                
                let gradeStr = ansData.isCorrect === true ? ' [Correct]' : (ansData.isCorrect === false ? ' [Incorrect]' : ' [Ungraded]');
                csv += `,"${String(ansText).replace(/"/g, '""')}${gradeStr}"`;
            }
        });
        csv += "\n";
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `ClassCast_${assignName.replace(/[^a-z0-9]/gi, '_')}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
};



// ==========================================
// CLASSCAST: PODCAST SEARCH ENGINE
// ==========================================

window.searchPodcasts = async function() {
    const query = document.getElementById('podcastSearchInput').value.trim();
    const resultsContainer = document.getElementById('podcastSearchResults');
    
    if (!query) return;
    
    resultsContainer.innerHTML = '<div style="text-align: center; font-size: 1.2rem; color: #666; padding: 40px;">Searching database... 🎧</div>';
    
    try {
        const url = `https://itunes.apple.com/search?media=podcast&entity=podcastEpisode&term=${encodeURIComponent(query)}&limit=15`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            resultsContainer.innerHTML = '<div style="text-align: center; font-size: 1.2rem; color: #666; padding: 40px;">No episodes found. Try a different search term.</div>';
            return;
        }
        
        let html = '';
        data.results.forEach(ep => {
            const title = ep.trackName || 'Unknown Episode';
            const podcastName = ep.collectionName || 'Unknown Podcast';
            const audioUrl = ep.episodeUrl; 
            const artwork = ep.artworkUrl160 || ep.artworkUrl600 || '';
            
            let durationStr = 'Unknown Length';
            if (ep.trackTimeMillis) {
                const totalSeconds = Math.floor(ep.trackTimeMillis / 1000);
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                durationStr = hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`;
            }
            
            if (!audioUrl) return; 
            
            const safeTitle = title.replace(/'/g, "\\'").replace(/"/g, "&quot;");
            const safeAudioUrl = audioUrl.replace(/'/g, "\\'").replace(/"/g, "&quot;");
            
            html += `
                <div style="background: white; border: 1px solid #e0e0e0; border-radius: 12px; padding: 20px; display: flex; gap: 25px; align-items: center; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.boxShadow='0 6px 15px rgba(0,0,0,0.1)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.boxShadow='none'; this.style.transform='translateY(0)'">
                    
                    ${artwork ? `<img src="${artwork}" style="width: 120px; height: 120px; border-radius: 8px; object-fit: cover; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">` : ''}
                    
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.85rem; color: #673ab7; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${podcastName}</div>
                        <h3 style="margin: 5px 0 10px 0; color: #333; font-size: 1.3rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</h3>
                        <div style="font-size: 0.9rem; color: #888; margin-bottom: 15px; font-weight: 600;">⏱️ ${durationStr}</div>
                        
                        <audio controls style="width: 100%; height: 35px; outline: none;" preload="none">
                            <source src="${audioUrl}" type="audio/mpeg">
                        </audio>
                    </div>
                    
                    <div style="padding-left: 10px;">
                        <button onclick="selectPodcastEpisode('${safeAudioUrl}', '${safeTitle}')" style="background: #2e7d32; color: white; border: none; padding: 15px 25px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 1rem; white-space: nowrap; box-shadow: 0 2px 5px rgba(46,125,50,0.3);">
                            Select Episode ➔
                        </button>
                    </div>
                </div>
            `;
        });
        
        resultsContainer.innerHTML = html;
        
    } catch (err) {
        console.error("Search error:", err);
        resultsContainer.innerHTML = '<div style="text-align: center; font-size: 1.2rem; color: #d32f2f; padding: 40px;">Error connecting to search database. Please try again.</div>';
    }
};

window.selectPodcastEpisode = function(audioUrl, title) {
    // 1. Fill in the Assignment Title
    const titleInput = document.getElementById('newAssignTitle');
    if (titleInput) {
        titleInput.value = title;
    }
    
    // 2. Switch the Audio Source radio button to "Dropbox/Link" mode
    const linkRadioBtn = document.querySelector('input[name="audioSourceType"][value="dropbox"]');
    if (linkRadioBtn) {
        linkRadioBtn.checked = true;
        
        // Trigger your existing UI toggle to show the URL box
        if (typeof toggleAudioSourceUI === 'function') {
            toggleAudioSourceUI();
        }
    }

    // 3. Fill in the newly revealed Audio URL box
    const urlInput = document.getElementById('newAssignAudioUrl');
    if (urlInput) {
        urlInput.value = audioUrl;
    }
    
    // 4. Close the Studio Overlay
    document.getElementById('classcastStudio').style.display = 'none';
    
    // 5. Scroll the teacher smoothly back to the Create Assignment section
    if (titleInput) {
        titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Optional: Briefly flash the title box green so they see what changed
        titleInput.style.transition = 'background-color 0.5s';
        titleInput.style.backgroundColor = '#e8f5e9'; // Light green
        setTimeout(() => { titleInput.style.backgroundColor = ''; }, 1500);
    }
};



// ==========================================
// AUDIO TRIMMER / SKIP ZONES LOGIC
// ==========================================

let currentSkipZones = []; // Holds the cuts before saving

window.addSkipZone = function() {
    const startStr = document.getElementById('skipStart').value.trim();
    const endStr = document.getElementById('skipEnd').value.trim();

    const startSec = parseTimeToSeconds(startStr);
    const endSec = parseTimeToSeconds(endStr);

    if (startSec === null || endSec === null || startSec >= endSec) {
        alert("Invalid times. Use MM:SS format, and ensure Start is before End.");
        return;
    }

    currentSkipZones.push({ start: startSec, end: endSec, label: `${startStr} - ${endStr}` });
    document.getElementById('skipStart').value = '';
    document.getElementById('skipEnd').value = '';
    renderSkipZones();
};

window.renderSkipZones = function() {
    const list = document.getElementById('skipZonesList');
    if(!list) return;
    list.innerHTML = '';
    currentSkipZones.forEach((zone, index) => {
        const li = document.createElement('li');
        li.style.cssText = "display: flex; justify-content: space-between; background: #fff; padding: 8px 12px; margin-bottom: 5px; border: 1px solid #ccc; border-radius: 4px; font-size: 0.9rem;";
        li.innerHTML = `
            <span>⏭️ Skip: <b>${zone.label}</b></span>
            <button type="button" onclick="removeSkipZone(${index})" style="color: red; border: none; background: none; cursor: pointer; font-weight: bold;">✖</button>
        `;
        list.appendChild(li);
    });
};

window.removeSkipZone = function(index) {
    currentSkipZones.splice(index, 1);
    renderSkipZones();
};

function parseTimeToSeconds(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length !== 2) return null;
    const m = parseInt(parts[0], 10);
    const s = parseInt(parts[1], 10);
    if (isNaN(m) || isNaN(s)) return null;
    return (m * 60) + s;
}

// ==========================================
// FEATURE 1: Question Preview Modal
// ==========================================
window.showQuestionPreview = function(questionIndex) {
    const q = currentProgressQuestions[questionIndex];
    if (!q) return;
    
    let optionsHtml = '';
    if (q.question_type === 'mc') {
        const opts = typeof q.options === 'string' ? JSON.parse(q.options || '{}') : (q.options || {});
        optionsHtml = `
            <div style="margin-top: 15px;">
                <strong>Answer Choices:</strong>
                <ul style="margin-top: 8px; padding-left: 20px;">
                    <li><strong>A:</strong> ${escapeHTML(opts.a || '')}</li>
                    <li><strong>B:</strong> ${escapeHTML(opts.b || '')}</li>
                    <li><strong>C:</strong> ${escapeHTML(opts.c || '')}</li>
                    <li><strong>D:</strong> ${escapeHTML(opts.d || '')}</li>
                </ul>
                <div style="margin-top: 10px; padding: 10px; background: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px;">
                    <strong>Correct Answer:</strong> ${String(q.correct_answer).toUpperCase()}
                </div>
            </div>
        `;
    } else if (q.question_type === 'tf') {
        optionsHtml = `
            <div style="margin-top: 15px; padding: 10px; background: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px;">
                <strong>Correct Answer:</strong> ${q.correct_answer === 'true' ? 'True' : 'False'}
            </div>
        `;
    } else if (q.question_type === 'match') {
        const opts = typeof q.options === 'string' ? JSON.parse(q.options || '{}') : (q.options || {});
        const pairs = opts.pairs || [];
        optionsHtml = `
            <div style="margin-top: 15px;">
                <strong>Matching Pairs:</strong>
                <ul style="margin-top: 8px; padding-left: 20px;">
                    ${pairs.map(p => `<li><strong>${escapeHTML(p.t)}</strong> = ${escapeHTML(p.m)}</li>`).join('')}
                </ul>
            </div>
        `;
    } else {
        optionsHtml = '<div style="margin-top: 15px; color: #666; font-style: italic;">Open-ended question - no specific correct answer required.</div>';
    }
    
    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 8px; max-width: 600px; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #eee; padding-bottom: 15px;">
                <h3 style="margin: 0; color: #0079D3;">Question ${questionIndex + 1} Preview</h3>
                <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666;">&times;</button>
            </div>
            <div style="margin-bottom: 10px;">
                <span style="background: #e3f2fd; color: #0079D3; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 600;">
                    ${q.question_type ? q.question_type.toUpperCase() : 'OPEN'}
                </span>
                <span style="margin-left: 10px; color: #666; font-size: 0.9rem;">@ ${q.trigger_second}s</span>
            </div>
            <div style="font-size: 1.1rem; font-weight: 600; margin: 15px 0; line-height: 1.5;">
                ${escapeHTML(q.question_text)}
            </div>
            ${optionsHtml}
            <button onclick="this.closest('div[style*=fixed]').remove()" style="margin-top: 20px; background: #0079D3; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; width: 100%; font-weight: 600;">Close</button>
        </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
};

// ==========================================
// FEATURE 2: Sort Function
// ==========================================
window.currentProgressSort = 'class'; // Default to class sorting
window.changeProgressSort = function(sortValue) {
    window.currentProgressSort = sortValue;
    renderProgressGrid();
};

// ==========================================
// FEATURE 4: Assignment Toggle (replaces close/reopen buttons)
// ==========================================
window.toggleAssignmentStatus = async function(assignId, shouldBeOpen) {
    const action = shouldBeOpen ? 'open' : 'close';
    
    await sb.from('classcast_assignments').update({ 
        is_manually_closed: !shouldBeOpen
    }).eq('id', assignId);
    
    loadTeacherAssignments();
};
