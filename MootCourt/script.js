// =====================================================
// SCOTUS BRIEF GENERATOR - UNIFIED WITH SPARK
// Uses same Supabase + Google OAuth as Spark forum
// =====================================================

const TEACHER_EMAIL = 'wwilson@mtps.us';

let supabaseClient = null;
let currentUser = null;
let isTeacher = false;

let data = {
    petitioners: [''],
    respondents: [''],
    questions: [''],
    cases: [''],
    statutes: ['']
};



// ─── SUPABASE INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.supabase !== 'undefined') {
        sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } else { alert('Supabase not loaded'); return; }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal('createPostModal');
            closeModal('createSubModal');
        }
    });

    await checkUser();
    await loadTeacherSettings(); // Load teacher settings
    await fetchNameMaskingSettings(); // Load name masking settings
    pollingInterval = setInterval(checkForNameChanges, 5000); // Poll for changes
    loadSubreddits();
    loadPosts(); 
    setupFormListeners();
});

// ─── AUTHENTICATION (Unified with Spark) ──────────────────────────────────
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const authSection = document.getElementById('authSection');
    const authStatus = document.getElementById('auth-status'); // Sidebar status

    if (session) {
        currentUser = session.user.email;
        isTeacher = (currentUser.toLowerCase() === TEACHER_EMAIL.toLowerCase());
        const emailPrefix = currentUser.split('@')[0];
        
        // Render logged-in state (Matches Spark)
        authSection.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                <span style="font-weight: 600; color: #444;">${emailPrefix}</span>
                <button onclick="signOut()" class="auth-btn" style="padding: 6px 10px; font-size: 0.8rem;">Sign Out</button>
            </div>
        `;
        
        if (authStatus) authStatus.innerText = `Signed in as ${currentUser}`;
        
        // Show Admin tab if Teacher
        if (isTeacher) {
            document.getElementById('admin-tab').style.display = 'block';
        }
    } else {
        currentUser = null;
        isTeacher = false;
        
        // Render Google Sign-In button (Matches Spark)
        authSection.innerHTML = `
            <button onclick="signIn()" class="auth-btn">
                <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" width="18" height="18" alt="G">
                Sign in
            </button>
        `;
        
        if (authStatus) authStatus.innerText = 'Not signed in';
        document.getElementById('admin-tab').style.display = 'none';
    }
}

window.signIn = async function() {
    await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { 
            redirectTo: window.location.href,
            queryParams: { hd: 'mtps.us' } // Restricts to school emails
        }
    });
};

window.signOut = async function() {
    await supabaseClient.auth.signOut();
    window.location.reload();
};




// ─── UI UPDATE AFTER LOGIN ──────────────────────────────────────────────────
function applyLoggedInUI(email) {
    const displayName = email.split('@')[0];
    document.getElementById('auth-status').innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 5px;">
            <span style="font-weight: 600; color: #333;">👤 ${displayName}</span>
            <button class="action-btn" style="height: 30px; font-size: 0.75rem;" onclick="signOut()">Sign Out</button>
        </div>
    `;
    
    if (isTeacher) {
        document.getElementById('admin-tab-btn').style.display = 'block';
    }
}

// ─── BOOT ───────────────────────────────────────────────────────────────────
window.onload = () => {
    initSupabase();
    renderInputFields();
    refresh();
    setupDeleteHandler();
};

// ─── TAB SWITCHING ──────────────────────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tab).classList.add('active');
    event.target.classList.add('active');
}

// ─── SAVE TO CLOUD ──────────────────────────────────────────────────────────
async function saveToCloud() {
    if (!currentUser) {
        alert('Please sign in to save projects');
        return;
    }
    
    const title = document.getElementById('projectTitle').value.trim() || 'Untitled Project';
    
    const projectData = {
        user_id: currentUser.id,
        title: title,
        data: {
            projectTitle: document.getElementById('projectTitle').value,
            briefType: document.getElementById('briefType').value,
            amicusName: document.getElementById('amicusName').value,
            amicusSupport: document.getElementById('amicusSupport').value,
            courtTerm: document.getElementById('courtTerm').value,
            firmName: document.getElementById('firmName').value,
            studentNames: document.getElementById('studentNames').value,
            assignedCase: document.getElementById('assignedCase').value,
            docketNum: document.getElementById('docketNum').value,
            lowerCourt: document.getElementById('lowerCourt').value,
            petitioners: data.petitioners,
            respondents: data.respondents,
            cases: data.cases,
            statutes: data.statutes,
            questions: data.questions,
            summaryArg: document.getElementById('summaryArg').value,
            argBody: document.getElementById('argBody').value,
            conclusionText: document.getElementById('conclusionText').value
        }
    };
    
    const { error } = await supabaseClient
        .from('scotus_projects')
        .upsert(projectData, { onConflict: 'user_id,title' });
    
    if (error) {
        alert('Error saving: ' + error.message);
    } else {
        alert('✅ Project saved!');
        loadUserProjects();
    }
}

// ─── LOAD USER PROJECTS ─────────────────────────────────────────────────────
async function loadUserProjects() {
    if (!currentUser) return;
    
    const { data: projects } = await supabaseClient
        .from('scotus_projects')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('updated_at', { ascending: false });
    
    const select = document.getElementById('cloud-projects');
    select.innerHTML = '<option value="">📂 Select a Project...</option>';
    
    if (projects) {
        projects.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.title;
            select.appendChild(option);
        });
    }
}

// ─── LOAD SELECTED PROJECT ──────────────────────────────────────────────────
async function loadSelectedProject() {
    const projectId = document.getElementById('cloud-projects').value;
    if (!projectId) {
        alert('Please select a project first');
        return;
    }
    
    const { data: project } = await supabaseClient
        .from('scotus_projects')
        .select('*')
        .eq('id', projectId)
        .single();
    
    if (project && project.data) {
        const d = project.data;
        
        document.getElementById('projectTitle').value = d.projectTitle || '';
        document.getElementById('briefType').value = d.briefType || 'Petitioner';
        document.getElementById('amicusName').value = d.amicusName || '';
        document.getElementById('amicusSupport').value = d.amicusSupport || 'Petitioner';
        document.getElementById('courtTerm').value = d.courtTerm || '';
        document.getElementById('firmName').value = d.firmName || '';
        document.getElementById('studentNames').value = d.studentNames || '';
        document.getElementById('assignedCase').value = d.assignedCase || '';
        document.getElementById('docketNum').value = d.docketNum || '';
        document.getElementById('lowerCourt').value = d.lowerCourt || '';
        document.getElementById('summaryArg').value = d.summaryArg || '';
        document.getElementById('argBody').value = d.argBody || '';
        document.getElementById('conclusionText').value = d.conclusionText || '';
        
        data.petitioners = d.petitioners || [''];
        data.respondents = d.respondents || [''];
        data.cases = d.cases || [''];
        data.statutes = d.statutes || [''];
        data.questions = d.questions || [''];
        
        toggleAmicusField();
        renderInputFields();
        refresh();
        
        alert('✅ Project loaded!');
    }
}

// ─── DELETE SELECTED PROJECT ────────────────────────────────────────────────
async function deleteSelectedProject() {
    const projectId = document.getElementById('cloud-projects').value;
    if (!projectId) {
        alert('Please select a project first');
        return;
    }
    
    if (!confirm('Delete this project permanently?')) return;
    
    const { error } = await supabaseClient
        .from('scotus_projects')
        .delete()
        .eq('id', projectId);
    
    if (error) {
        alert('Error deleting: ' + error.message);
    } else {
        alert('✅ Project deleted');
        document.getElementById('cloud-projects').value = '';
        loadUserProjects();
    }
}

// ─── CASE MANAGEMENT (TEACHER) ──────────────────────────────────────────────
async function loadCases() {
    if (!supabaseClient) return;
    
    const { data: cases } = await supabaseClient
        .from('scotus_cases')
        .select('*')
        .order('name');
    
    const select = document.getElementById('assignedCase');
    select.innerHTML = '<option value="">-- Select a Case --</option>';
    
    if (cases) {
        cases.forEach(c => {
            const option = document.createElement('option');
            option.value = c.name;
            option.setAttribute('data-link', c.brief_link || '');
            option.textContent = c.name;
            select.appendChild(option);
        });
    }
    
    if (isTeacher) {
        updateAdminCasesList(cases);
    }
}

function updateAdminCasesList(cases) {
    const container = document.getElementById('manage-cases-list');
    if (!container) return;
    
    if (!cases || cases.length === 0) {
        container.innerHTML = '<p style="color: #999;">No cases yet. Add one above!</p>';
        return;
    }
    
    container.innerHTML = '';
    cases.forEach(c => {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 10px; margin-bottom: 10px; background: #f8f9fa; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;';
        div.innerHTML = `
            <div>
                <strong>${c.name}</strong>
                ${c.brief_link ? `<br><a href="${c.brief_link}" target="_blank" style="font-size: 0.85em; color: #1a237e;">View Brief</a>` : ''}
            </div>
            <button class="action-btn btn-danger" style="width: auto; padding: 8px 15px; height: auto;" onclick="deleteCase('${c.id}')">Delete</button>
        `;
        container.appendChild(div);
    });
}

async function addNewCase() {
    if (!isTeacher) {
        alert('Only teachers can add cases');
        return;
    }
    
    const name = document.getElementById('newCaseName').value.trim();
    const link = document.getElementById('newCaseLink').value.trim();
    
    if (!name) {
        alert('Please enter a case name');
        return;
    }
    
    const { error } = await supabaseClient
        .from('scotus_cases')
        .insert([{ name, brief_link: link }]);
    
    if (error) {
        alert('Error adding case: ' + error.message);
    } else {
        document.getElementById('newCaseName').value = '';
        document.getElementById('newCaseLink').value = '';
        alert('✅ Case added!');
        loadCases();
    }
}

async function deleteCase(caseId) {
    if (!isTeacher) return;
    if (!confirm('Delete this case?')) return;
    
    const { error } = await supabaseClient
        .from('scotus_cases')
        .delete()
        .eq('id', caseId);
    
    if (error) {
        alert('Error: ' + error.message);
    } else {
        loadCases();
    }
}

// ─── DOCKET (PUBLIC SUBMISSIONS) ────────────────────────────────────────────
async function loadDocket() {
    if (!supabaseClient) return;
    
    const { data: briefs } = await supabaseClient
        .from('scotus_submissions')
        .select(`
            *,
            profiles(email)
        `)
        .order('submitted_at', { ascending: false });
    
    const tbody = document.getElementById('docket-body');
    if (!briefs || briefs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">No briefs submitted yet</td></tr>';
        return;
    }
    
    // Group by case name
    const grouped = {};
    briefs.forEach(b => {
        const caseName = b.case_name || 'Unknown Case';
        if (!grouped[caseName]) {
            grouped[caseName] = { petitioner: [], respondent: [], amicus: [], brief_link: null };
        }
        
        if (!grouped[caseName].brief_link && b.case_brief_link) {
            grouped[caseName].brief_link = b.case_brief_link;
        }
        
        const authorEmail = b.profiles?.email || 'Anonymous';
        const link = `<a href="${b.pdf_url}" target="_blank" style="color: #1a237e;">${authorEmail.split('@')[0]}</a>`;
        
        if (b.brief_type === 'Petitioner') {
            grouped[caseName].petitioner.push(link);
        } else if (b.brief_type === 'Respondent') {
            grouped[caseName].respondent.push(link);
        } else if (b.brief_type === 'Amicus Curiae') {
            grouped[caseName].amicus.push(link);
        }
    });
    
    tbody.innerHTML = '';
    Object.keys(grouped).forEach(caseName => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td><strong>${caseName}</strong></td>
            <td>${grouped[caseName].brief_link ? `<a href="${grouped[caseName].brief_link}" target="_blank" style="color: #1a237e;">View Brief</a>` : '-'}</td>
            <td>${grouped[caseName].petitioner.join('<br>') || '-'}</td>
            <td>${grouped[caseName].respondent.join('<br>') || '-'}</td>
            <td>${grouped[caseName].amicus.join('<br>') || '-'}</td>
        `;
    });
}

async function submitToCourt() {
    if (!currentUser) {
        alert('Please sign in to submit');
        return;
    }
    
    const caseName = document.getElementById('assignedCase').value;
    if (!caseName) {
        alert('Please select a case first');
        return;
    }
    
    const caseSelect = document.getElementById('assignedCase');
    const selectedOption = caseSelect.options[caseSelect.selectedIndex];
    const caseBriefLink = selectedOption.getAttribute('data-link');
    
    alert('Generating PDF and submitting to court...');
    
    const pdfBlob = await generatePDFBlob();
    
    const fileName = `${currentUser.id}_${Date.now()}.pdf`;
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('scotus-briefs')
        .upload(fileName, pdfBlob);
    
    if (uploadError) {
        alert('Upload error: ' + uploadError.message);
        return;
    }
    
    const { data: { publicUrl } } = supabaseClient.storage
        .from('scotus-briefs')
        .getPublicUrl(fileName);
    
    const { error } = await supabaseClient
        .from('scotus_submissions')
        .insert([{
            user_id: currentUser.id,
            case_name: caseName,
            case_brief_link: caseBriefLink,
            brief_type: document.getElementById('briefType').value,
            pdf_url: publicUrl
        }]);
    
    if (error) {
        alert('Error submitting: ' + error.message);
    } else {
        alert('✅ Brief submitted to court docket!');
        loadDocket();
    }
}

async function generatePDFBlob() {
    const element = document.getElementById('render-target');
    const opt = {
        margin: 0,
        filename: 'brief.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    return await html2pdf().from(element).set(opt).outputPdf('blob');
}

async function downloadPDF() {
    const element = document.getElementById('render-target');
    const opt = {
        margin: 0,
        filename: (document.getElementById('projectTitle').value || 'brief') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    html2pdf().from(element).set(opt).save();
}

// ─── DYNAMIC INPUT RENDERING ────────────────────────────────────────────────
function renderInputFields() {
    ['petitioner', 'respondent', 'case', 'statute', 'question'].forEach(type => {
        const container = document.getElementById(`${type}-inputs`);
        if (!container) return;
        
        container.innerHTML = '';
        const arr = type === 'petitioner' ? data.petitioners :
                    type === 'respondent' ? data.respondents :
                    type === 'case' ? data.cases :
                    type === 'statute' ? data.statutes :
                    data.questions;
        
        arr.forEach((val, i) => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'display:flex; gap:5px; margin-bottom:5px;';
            wrapper.innerHTML = `
                <input type="text" value="${val}" oninput="updateData('${type}', ${i}, this.value)" style="flex:1;">
                <button class="action-btn btn-danger delete-btn" data-type="${type}" data-index="${i}" style="width:40px; height:40px; padding:0;">✕</button>
            `;
            container.appendChild(wrapper);
        });
    });
}

function updateData(type, index, value) {
    const arr = type === 'petitioner' ? data.petitioners :
                type === 'respondent' ? data.respondents :
                type === 'case' ? data.cases :
                type === 'statute' ? data.statutes :
                data.questions;
    arr[index] = value;
    refresh();
}

function addDynamic(type) {
    const arr = type === 'petitioner' ? data.petitioners :
                type === 'respondent' ? data.respondents :
                type === 'case' ? data.cases :
                type === 'statute' ? data.statutes :
                data.questions;
    arr.push('');
    renderInputFields();
    refresh();
}

function setupDeleteHandler() {
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const type = e.target.getAttribute('data-type');
            const index = parseInt(e.target.getAttribute('data-index'));
            
            const arr = type === 'petitioner' ? data.petitioners :
                        type === 'respondent' ? data.respondents :
                        type === 'case' ? data.cases :
                        type === 'statute' ? data.statutes :
                        data.questions;
            
            arr.splice(index, 1);
            if (arr.length === 0) arr.push('');
            
            renderInputFields();
            refresh();
        }
    });
}

function toggleAmicusField() {
    const briefType = document.getElementById('briefType').value;
    document.getElementById('amicus-extras').style.display = 
        briefType === 'Amicus Curiae' ? 'block' : 'none';
}

// ─── PREVIEW RENDERING ──────────────────────────────────────────────────────
function refresh() {
    const renderTarget = document.getElementById('render-target');
    renderTarget.innerHTML = generateBriefHTML();
    
    const caseSelect = document.getElementById('assignedCase');
    const selectedOption = caseSelect.options[caseSelect.selectedIndex];
    const link = selectedOption ? selectedOption.getAttribute('data-link') : null;
    
    const linkArea = document.getElementById('caseBriefLinkArea');
    if (linkArea) {
        if (link) {
            linkArea.innerHTML = `<a href="${link}" target="_blank" style="color: #1a237e;">📄 View Case Brief</a>`;
        } else {
            linkArea.innerHTML = '';
        }
    }
}

function generateBriefHTML() {
    const projectTitle = document.getElementById('projectTitle').value || 'Case Name';
    const briefType = document.getElementById('briefType').value;
    const courtTerm = document.getElementById('courtTerm').value || 'October Term 2025';
    const docketNum = document.getElementById('docketNum').value || 'No. XX-XXXX';
    const lowerCourt = document.getElementById('lowerCourt').value || 'United States District Court';
    
    const petitionersList = data.petitioners.filter(p => p.trim()).join(', ') || '[Petitioner Name]';
    const respondentsList = data.respondents.filter(r => r.trim()).join(', ') || '[Respondent Name]';
    
    const firmName = document.getElementById('firmName').value || '[Law Firm Name]';
    const studentNames = document.getElementById('studentNames').value.split('\n').filter(n => n.trim()).join('<br>') || '[Counsel Names]';
    
    let briefTitle = '';
    if (briefType === 'Amicus Curiae') {
        const amicusName = document.getElementById('amicusName').value || '[Amicus Name]';
        const amicusSupport = document.getElementById('amicusSupport').value;
        briefTitle = `Brief for ${amicusName}<br>as Amicus Curiae ${amicusSupport}`;
    } else {
        briefTitle = `Brief for ${briefType}`;
    }
    
    // Page 1: Cover
    let html = `
    <div class="paper">
        <div class="court-header">
            Supreme Court of the United States
        </div>
        <div style="text-align:center; margin:30px 0;">
            ${courtTerm}
        </div>
        <hr>
        <div class="title-box">
            ${petitionersList}<br>
            <span style="font-style:italic;">Petitioners</span><br>
            v.<br>
            ${respondentsList}<br>
            <span style="font-style:italic;">Respondents</span>
        </div>
        <div style="text-align:center; font-weight:bold; margin:20px 0;">
            On Writ of Certiorari to the<br>${lowerCourt}
        </div>
        <hr>
        <div style="text-align:center; font-weight:bold; margin:20px 0; font-size:14pt;">
            ${briefTitle}
        </div>
        <div style="margin-top:80px;">
            ${firmName}<br>
            ${studentNames}
        </div>
        <div class="manual-footer">${docketNum}</div>
    </div>`;
    
    // Page 2: Questions
    const questions = data.questions.filter(q => q.trim());
    if (questions.length > 0) {
        html += `
    <div class="paper">
        <div class="section-header">Question(s) Presented</div>
        ${questions.map((q, i) => `<p>${questions.length > 1 ? `${i + 1}. ` : ''}${q}</p>`).join('')}
        <div class="manual-footer">${docketNum}</div>
    </div>`;
    }
    
    // Page 3: Parties & Table of Authorities
    html += `
    <div class="paper">
        <div class="section-header">Parties to the Proceeding</div>
        <p><strong>Petitioners:</strong> ${petitionersList}</p>
        <p><strong>Respondents:</strong> ${respondentsList}</p>
        
        <div class="section-header">Table of Authorities</div>
        <p style="font-weight:bold; margin-top:15px;">Cases:</p>`;
    
    const cases = data.cases.filter(c => c.trim());
    if (cases.length > 0) {
        cases.forEach(c => {
            html += `<p style="margin-left:20px; text-indent:-20px;">${c}</p>`;
        });
    } else {
        html += `<p style="margin-left:20px; font-style:italic;">[No cases cited]</p>`;
    }
    
    html += `<p style="font-weight:bold; margin-top:15px;">Statutes:</p>`;
    const statutes = data.statutes.filter(s => s.trim());
    if (statutes.length > 0) {
        statutes.forEach(s => {
            html += `<p style="margin-left:20px; text-indent:-20px;">${s}</p>`;
        });
    } else {
        html += `<p style="margin-left:20px; font-style:italic;">[No statutes cited]</p>`;
    }
    
    html += `<div class="manual-footer">${docketNum}</div></div>`;
    
    // Page 4: Summary of Argument
    const summary = document.getElementById('summaryArg').value;
    if (summary.trim()) {
        html += `
    <div class="paper">
        <div class="section-header">Summary of Argument</div>
        <p>${summary.replace(/\n/g, '</p><p>')}</p>
        <div class="manual-footer">${docketNum}</div>
    </div>`;
    }
    
    // Page 5+: Argument
    const argBody = document.getElementById('argBody').value;
    if (argBody.trim()) {
        html += `
    <div class="paper">
        <div class="section-header">Argument</div>
        <p>${argBody.replace(/\n/g, '</p><p>')}</p>
        <div class="manual-footer">${docketNum}</div>
    </div>`;
    }
    
    // Final Page: Conclusion
    const conclusion = document.getElementById('conclusionText').value;
    if (conclusion.trim()) {
        html += `
    <div class="paper">
        <div class="section-header">Conclusion</div>
        <p>${conclusion.replace(/\n/g, '</p><p>')}</p>
        <div style="margin-top:40px;">
            <p>Respectfully submitted,</p>
            <div style="margin-top:60px;">
                ${firmName}<br>
                ${studentNames}
            </div>
        </div>
        <div class="manual-footer">${docketNum}</div>
    </div>`;
    }
    
    return html;
}
