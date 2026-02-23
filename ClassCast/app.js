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
let maxReachedTime = 0; // NEW: Tracks how far the student has listened

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
        player.addEventListener('seeking', () => { 
            if(player.currentTime > maxReachedTime + 1) player.currentTime = maxReachedTime; 
        });
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
    
    document.getElementById(panelId).classList.add('active');
    if(event) event.currentTarget.classList.add('active');
    else document.querySelector(`[onclick*="${panelId}"]`).classList.add('active');

    if (panelId === 'admin-assignments') { loadTeacherAssignments(); populateClassCheckboxes(); }    if (panelId === 'admin-progress') loadTeacherProgress();
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
    await sb.auth.signInWithOAuth({ 
        provider: 'google', 
        options: { 
            scopes: 'https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.rosters.readonly',
            redirectTo: window.location.origin + window.location.pathname, 
            queryParams: { 
                prompt: 'consent',
                hd: 'mtps.us' // RESTRICTS TO MTPS ONLY
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
window.addQuestionBuilderRow = function() {
    const list = document.getElementById('questionsBuilderList');
    const id = Date.now();
    const div = document.createElement('div');
    div.id = `qb-${id}`;
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginBottom = '10px';
    div.innerHTML = `
        <input type="number" class="q-time" placeholder="Timestamp (sec)" style="width: 130px; margin:0;" min="0">
        <input type="text" class="q-text" placeholder="Question Text" style="flex:1; margin:0;">
        <button class="danger-btn" onclick="document.getElementById('qb-${id}').remove()">X</button>
    `;
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

    // Sub-spark existing memory
    document.getElementById('existingSubsparkUrl').value = assignData.subspark_url || '';
    document.getElementById('autoCreateSubspark').checked = false;
    toggleSubsparkOptions();

    document.getElementById('questionsBuilderList').innerHTML = '';
    if (qData) {
        qData.forEach(q => {
            const list = document.getElementById('questionsBuilderList');
            const rowId = Date.now() + Math.random();
            const div = document.createElement('div');
            div.id = `qb-${rowId}`;
            div.style.display = 'flex'; div.style.gap = '10px'; div.style.marginBottom = '10px';
            div.innerHTML = `
                <input type="number" class="q-time" value="${q.trigger_second}" placeholder="Timestamp (sec)" style="width: 130px; margin:0;" min="0">
                <input type="text" class="q-text" value="${q.question_text}" placeholder="Question Text" style="flex:1; margin:0;">
                <button class="danger-btn" onclick="document.getElementById('qb-${rowId}').remove()">X</button>
            `;
            list.appendChild(div);
        });
    }

    document.getElementById('publishBtn').innerText = 'Update Assignment';
    document.getElementById('cancelEditBtn').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};;

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
    
    // Sub-spark Resets
    document.getElementById('existingSubsparkUrl').value = '';
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
    
    // --- Gather selected classes and students ---
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

        // ==========================================
        // 1. AUDIO UPLOAD LOGIC
        // ==========================================
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

        // ==========================================
        // 2. SUBSPARK AUTOMATION LOGIC
        // ==========================================
        let finalSubSparkUrl = document.getElementById('existingSubsparkUrl')?.value || ''; 
        const isSubsparkEnabled = document.getElementById('autoCreateSubspark').checked;

        // Only create a new community if this is a brand new assignment AND the box is checked
        if (isSubsparkEnabled && !editingAssignmentId) {
            const postText = document.getElementById('subsparkFirstPostText').value;
            const postPhoto = document.getElementById('subsparkFirstPostPhoto').value;
            const postLink = document.getElementById('subsparkFirstPostLink').value;

            // A. Create the Community (Subreddit)
            const { data: newSub, error: subError } = await sb.from('subreddits').insert([{
                name: title,
                created_by: currentUser.id
            }]).select().single();

            if (subError) throw new Error("Sub-spark Creation Error: " + subError.message);

            // B. Create the First Post (if they typed anything)
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

            // C. Save the direct link to the community!
            finalSubSparkUrl = `https://wwilson-ui.github.io/r/Spark/?sub=${newSub.id}`;
        }

        // ==========================================
        // 3. DATABASE SAVING
        // ==========================================
        let newId;

        if (editingAssignmentId) {
            const { error: updateError } = await sb.from('classcast_assignments').update({
                title: title, 
                target_class: targetClassesJSON, 
                target_students: targetStudentsJSON, 
                audio_url: finalAudioUrl, 
                subspark_url: finalSubSparkUrl, 
                transcript: transcript
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
                transcript: transcript
            }]).select();
            if(assignError) throw assignError;
            newId = assignData[0].id;
        }

        // --- Save Interactive Questions ---
        const questionRows = document.querySelectorAll('#questionsBuilderList > div');
        const questionsToInsert = [];
        questionRows.forEach(row => {
            const time = row.querySelector('.q-time').value;
            const text = row.querySelector('.q-text').value;
            if(time && text) questionsToInsert.push({ assignment_id: newId, trigger_second: parseInt(time), question_text: text });
        });

        if(questionsToInsert.length > 0) await sb.from('classcast_questions').insert(questionsToInsert);

        alert(editingAssignmentId ? "Assignment updated successfully!" : "Assignment and Community published successfully!");
        
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

// ================= TEACHER PANEL 2: PROGRESS =================
async function loadTeacherProgress() {
    const tbody = document.getElementById('teacherProgressTable');
    const { data: assignments } = await sb.from('classcast_assignments').select('id, title');
    const { data: progress } = await sb.from('classcast_progress').select('*');
    
    if(!assignments || assignments.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No data.</td></tr>'; return; }

    let html = '';
    assignments.forEach(a => {
        const studentRows = (progress || []).filter(p => p.assignment_id === a.id);
        if(studentRows.length > 0) {
            studentRows.forEach((p, index) => {
                const statusBadge = p.status === 'completed' ? '<span style="color:green;font-weight:bold;">Completed</span>' : 'In Progress';
                html += `<tr><td>${index === 0 ? `<strong>${a.title}</strong>` : ''}</td><td>${p.student_email}</td><td>${statusBadge}</td><td>${p.total_session_seconds || 0}s</td></tr>`;
            });
        }
    });
    tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center;">No progress logged yet.</td></tr>';
}

window.exportStudentData = async function() {
    const { data } = await sb.from('classcast_progress').select(`student_email, furthest_second, total_session_seconds, status, classcast_assignments ( title )`);
    if (!data) return alert("No data");
    let csv = "data:text/csv;charset=utf-8,Assignment,Email,Furthest Second,Total Time,Status\n";
    data.forEach(r => csv += `"${r.classcast_assignments?.title || 'Unknown'}",${r.student_email},${r.furthest_second||0},${r.total_session_seconds||0},${r.status}\n`);
    const link = document.createElement("a"); link.setAttribute("href", encodeURI(csv)); link.setAttribute("download", "Progress.csv"); document.body.appendChild(link); link.click();
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
        // Display the EXACT error Google is giving us so we can troubleshoot it easily
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
        statusTxt.style.color = "black"; // Reset color

        // 1. Fetch from Google
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

        // 2. Ensure Class Exists in Database
        let classRecordId;
        const { data: existingClass, error: classSearchError } = await sb.from('classcast_classes').select('*').eq('class_name', courseName).single();
        
        if (classSearchError && classSearchError.code !== 'PGRST116') { // PGRST116 just means no rows found, which is fine
            throw new Error("DB Search Error: " + classSearchError.message);
        }

        if (existingClass) {
            classRecordId = existingClass.id;
        } else {
            const { data: newClass, error: classInsertError } = await sb.from('classcast_classes').insert([{ class_name: courseName }]).select();
            if (classInsertError) throw new Error("DB Class Insert Error: " + classInsertError.message);
            classRecordId = newClass[0].id;
        }

        // 3. Map students, providing a fallback if Google hid the email
        const rosterInserts = students.map(s => {
            // If the district blocks emails, grab their full name instead so it doesn't crash
            const identifier = s.profile.emailAddress || s.profile.name?.fullName || `Unknown Student (${s.profile.id})`;
            return {
                class_id: classRecordId,
                student_email: identifier
            };
        });

        // 4. Clear old roster and insert new one
        await sb.from('classcast_roster').delete().eq('class_id', classRecordId);
        
        const { error: insertError } = await sb.from('classcast_roster').insert(rosterInserts);
        if (insertError) throw new Error("DB Roster Insert Error: " + insertError.message);

        // 5. Success!
        statusTxt.innerText = `Successfully saved ${students.length} students to the database!`;
        statusTxt.style.color = "#1e8e3e";
        setTimeout(() => {
            document.getElementById('classroomImportCard').classList.add('hidden');
            loadManageClasses();
        }, 1500);

    } catch (err) {
        console.error(err);
        // Print the EXACT database or Google error to the screen
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

window.populateClassCheckboxes = async function() {
    const container = document.getElementById('assignmentTargetsContainer');
    if(!container) return;
    
    container.innerHTML = '<p style="margin:0; font-size:0.9rem; color:#666;">Loading classes and rosters...</p>';
    
    // Fetch classes and rosters
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

// Helper function to show/hide the student lists when a class is checked
window.toggleStudentList = function(classId) {
    const classCheckbox = document.querySelector(`.class-checkbox[data-class-id="${classId}"]`);
    const studentListDiv = document.getElementById(`student-list-${classId}`);
    if (classCheckbox.checked) {
        studentListDiv.style.display = 'block';
    } else {
        studentListDiv.style.display = 'none';
        // Uncheck all students if the class is unchecked
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

// ================= STUDENT: ASSIGNMENTS & TRACKING =================
async function loadStudentClasses() {
    populateClassDropdown('studentClassFilter'); 
}

window.loadStudentAssignments = async function() {
    const classId = document.getElementById('studentClassFilter').value;
    const classText = document.getElementById('studentClassFilter').options[document.getElementById('studentClassFilter').selectedIndex]?.text;
    const assignSelect = document.getElementById('studentAssignmentSelect');
    
    if(!classId) { assignSelect.classList.add('hidden'); return; }

    // Fetch ALL assignments and filter them in the browser so we can parse the JSON
    const { data } = await sb.from('classcast_assignments').select('*');
    
    assignSelect.innerHTML = '<option value="">-- Choose Assignment --</option>';
    
    if(data) {
        data.forEach(d => {
            let isTargeted = false;
            
            try {
                // Try to read it as our new Multi-Class JSON format
                const targetClassesArray = JSON.parse(d.target_class || '[]');
                if (targetClassesArray.includes(classText)) {
                    isTargeted = true;
                }
            } catch (e) {
                // Fallback: If JSON parsing fails, it's an old assignment from before the update
                if (d.target_class === classText) isTargeted = true;
            }

            // If the student is looking at the right class, we add the assignment
            if (isTargeted) {
                assignSelect.innerHTML += `<option value="${d.id}">${d.title}</option>`;
            }
        });
    }
    assignSelect.classList.remove('hidden');
};

window.startAssignment = async function() {
    const assignId = document.getElementById('studentAssignmentSelect').value;
    if(!assignId) return;

    currentAssignmentId = assignId; answeredCheckpoints = []; sessionStartTime = null;
    maxReachedTime = 0; // Reset anti-cheat tracker
    
    const subsparkContainer = document.getElementById('subsparkLinkContainer'); 
    if(subsparkContainer) subsparkContainer.classList.add('hidden');

    const { data: assignData } = await sb.from('classcast_assignments').select('*').eq('id', assignId).single();
    const { data: qData } = await sb.from('classcast_questions').select('*').eq('assignment_id', assignId);
    
    // Check if the student already started this previously to restore their max time
    if (currentUser) {
        const { data: progData } = await sb.from('classcast_progress').select('furthest_second').eq('assignment_id', assignId).eq('student_email', currentUser.email).single();
        if (progData && progData.furthest_second) {
            maxReachedTime = progData.furthest_second;
        }
    }

    if(!assignData) return;
    activeQuestions = qData || [];
    
    document.getElementById('activeAssignmentTitle').innerText = assignData.title;
    document.getElementById('transcriptText').innerText = assignData.transcript || "No transcript provided.";
    
    const audioPlayer = document.getElementById('audioPlayer');
    document.getElementById('audioSource').src = assignData.audio_url; 
    audioPlayer.load();

    if(assignData.subspark_url) document.getElementById('activeSubsparkLink').href = assignData.subspark_url;
    document.getElementById('activeAssignmentCard').classList.remove('hidden');
};

function handleAudioTimeUpdate() {
    if(!currentAssignmentId) return;
    const player = document.getElementById('audioPlayer');
    
    // --- ANTI-CHEAT LOGIC ---
    // If they scrubbed forward more than 1 second past their max time, snap them back
    if (player.currentTime > maxReachedTime + 1) {
        player.currentTime = maxReachedTime;
    } else {
        // Otherwise, they are listening normally, so update their max reached time
        maxReachedTime = Math.max(maxReachedTime, player.currentTime);
    }

    const currentTime = Math.floor(player.currentTime);

    const question = activeQuestions.find(q => q.trigger_second === currentTime);
    if (question && !answeredCheckpoints.includes(question.id)) {
        player.pause();
        document.getElementById('questionModal').classList.remove('hidden');
        document.getElementById('questionText').innerText = question.question_text;
        document.getElementById('feedback').innerText = "";
        
        document.getElementById('submitAnswerBtn').onclick = () => {
            if(document.getElementById('studentAnswer').value.trim().length >= 3) {
                document.getElementById('questionModal').classList.add('hidden');
                document.getElementById('studentAnswer').value = ''; 
                answeredCheckpoints.push(question.id); 
                player.play(); 
                logProgress(currentTime, 'in_progress');
            } else document.getElementById('feedback').innerText = "Please provide a valid answer.";
        };
    }
    if(currentTime > 0 && currentTime % 10 === 0) logProgress(currentTime, 'in_progress');
}

function handleAudioComplete() {
    logProgress(Math.floor(document.getElementById('audioPlayer').currentTime), 'completed');
    if(document.getElementById('activeSubsparkLink').getAttribute('href') !== '#') document.getElementById('subsparkLinkContainer').classList.remove('hidden');
}

async function logProgress(currentSecond, status) {
    if(!currentUser || !currentAssignmentId) return;
    let totalListenSeconds = sessionStartTime ? Math.floor((new Date() - sessionStartTime) / 1000) : 0;
    await sb.from('classcast_progress').upsert({ student_email: currentUser.email, assignment_id: currentAssignmentId, furthest_second: currentSecond, total_session_seconds: totalListenSeconds, status: status, last_updated: new Date().toISOString() }, { onConflict: 'student_email, assignment_id' });
}
