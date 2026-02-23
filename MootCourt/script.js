// =====================================================
// SCOTUS BRIEF GENERATOR - UNIFIED WITH SPARK (FIXED)
// =====================================================

const TEACHER_EMAIL = 'wwilson@mtps.us';

let supabaseClient = null;
let currentUser = null;
let isTeacher = false;

// Global data object
let data = {
    petitioners: [''],
    respondents: [''],
    questions: [''],
    cases: [''],
    statutes: ['']
};

// ─── INITIALIZATION ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Supabase
    if (typeof window.supabase !== 'undefined') {
        const url = window.SUPABASE_URL || 'https://mvxuubwbtkhdbhuadxtu.supabase.co';
        const key = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12eHV1YndidGtoZGJodWFkeHR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExODQyMDgsImV4cCI6MjA4Njc2MDIwOH0.FzsVt0bmWnrc3pYUWfJyS-9PE9oJY1ZzoGbax3q_LGk';
        supabaseClient = window.supabase.createClient(url, key);
        
        // Listen for auth changes
        supabaseClient.auth.onAuthStateChange((event, session) => {
            updateAuthUI(session);
        });
        
        // Initial auth check
        await checkAuth();
        
        // Load cases and docket
        loadCases();
        loadDocket();
    } else {
        console.error('Supabase not loaded');
    }
    
    // Initialize UI
    renderInputFields();
    refresh();
    setupDeleteHandler();
});

// ─── AUTH ───────────────────────────────────────────────────────────────────
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    updateAuthUI(session);
}

function updateAuthUI(session) {
    const authSection = document.getElementById('authSection');
    const authStatus = document.getElementById('auth-status');
    const adminTab = document.getElementById('admin-tab');
    
    if (session) {
        currentUser = session.user.email;
        isTeacher = (currentUser.toLowerCase() === TEACHER_EMAIL.toLowerCase());
        const emailPrefix = currentUser.split('@')[0];
        
        if (authSection) {
            authSection.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="font-weight: 600; color: white;">${emailPrefix}</span>
                    <button onclick="signOut()" style="padding: 6px 12px; font-size: 0.8rem; background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.4); border-radius: 4px; cursor: pointer;">Sign Out</button>
                </div>
            `;
        }
        
        if (authStatus) authStatus.innerText = `Signed in as ${currentUser}`;
        if (adminTab) adminTab.style.display = isTeacher ? 'inline-flex' : 'none';
        
        // Load user projects
        loadUserProjects();
    } else {
        currentUser = null;
        isTeacher = false;
        
        if (authSection) {
            authSection.innerHTML = `
                <button onclick="signIn()" style="display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: white; color: #1a237e; border: none; border-radius: 4px; font-weight: 600; cursor: pointer;">
                    <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" width="18" height="18">
                    Sign in
                </button>
            `;
        }
        
        if (authStatus) authStatus.innerText = 'Not signed in';
        if (adminTab) adminTab.style.display = 'none';
    }
}

window.signIn = async function() {
    await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + window.location.pathname,
            queryParams: { hd: 'mtps.us' }
        }
    });
};

window.signOut = async function() {
    await supabaseClient.auth.signOut();
    window.location.reload();
};

// ─── TAB SWITCHING ──────────────────────────────────────────────────────────
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    
    const btn = event?.target;
    if (btn) btn.classList.add('active');
};

window.toggleAmicusField = function() {
    const briefType = document.getElementById('briefType').value;
    const amicusExtras = document.getElementById('amicus-extras');
    if (amicusExtras) {
        amicusExtras.style.display = briefType === 'Amicus Curiae' ? 'block' : 'none';
    }
    refresh();
};

// ─── DYNAMIC INPUT FIELDS (FIXED) ───────────────────────────────────────────
function renderInputFields() {
    // Map of type to container ID (matching HTML)
    const containers = {
        petitioners: 'petitioner-inputs',
        respondents: 'respondent-inputs',
        cases: 'case-inputs',
        statutes: 'statute-inputs',
        questions: 'question-inputs'
    };
    
    Object.keys(containers).forEach(type => {
        const container = document.getElementById(containers[type]);
        if (!container) return;
        
        container.innerHTML = '';
        data[type].forEach((val, i) => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'display:flex; gap:5px; margin-bottom:5px;';
            
            const input = document.createElement(type === 'questions' ? 'textarea' : 'input');
            if (type === 'questions') input.rows = 2;
            input.value = val;
            input.style.flex = '1';
            input.oninput = (e) => {
                data[type][i] = e.target.value;
                refresh();
            };
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn btn-danger delete-btn';
            deleteBtn.style.cssText = 'width:40px; height:40px; padding:0;';
            deleteBtn.textContent = '✕';
            deleteBtn.setAttribute('data-type', type);
            deleteBtn.setAttribute('data-index', i);
            
            wrapper.appendChild(input);
            wrapper.appendChild(deleteBtn);
            container.appendChild(wrapper);
        });
    });
}

window.addDynamic = function(type) {
    // Convert singular to plural for data object
    const typeMap = {
        'petitioner': 'petitioners',
        'respondent': 'respondents',
        'case': 'cases',
        'statute': 'statutes',
        'question': 'questions'
    };
    
    const dataType = typeMap[type] || type;
    data[dataType].push('');
    renderInputFields();
    refresh();
};

function setupDeleteHandler() {
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const type = e.target.getAttribute('data-type');
            const index = parseInt(e.target.getAttribute('data-index'));
            
            if (data[type]) {
                data[type].splice(index, 1);
                if (data[type].length === 0) data[type].push('');
                renderInputFields();
                refresh();
            }
        }
    });
}

// ─── PREVIEW RENDERING (FIXED) ──────────────────────────────────────────────
function refresh() {
    const target = document.getElementById('render-target');
    if (!target) return;
    
    const projectTitle = document.getElementById('projectTitle')?.value || '';
    const briefType = document.getElementById('briefType')?.value || 'Petitioner';
    const courtTerm = document.getElementById('courtTerm')?.value || 'October Term 2025';
    const docketNum = document.getElementById('docketNum')?.value || 'No. XX-XXXX';
    const lowerCourt = document.getElementById('lowerCourt')?.value || 'United States District Court';
    const firmName = document.getElementById('firmName')?.value || '[Law Firm Name]';
    const studentNames = document.getElementById('studentNames')?.value || '[Counsel Names]';
    const summaryArg = document.getElementById('summaryArg')?.value || '';
    const argBody = document.getElementById('argBody')?.value || '';
    const conclusionText = document.getElementById('conclusionText')?.value || '';
    
    const petitionersList = data.petitioners.filter(p => p.trim()).join(', ') || '[Petitioner Name]';
    const respondentsList = data.respondents.filter(r => r.trim()).join(', ') || '[Respondent Name]';
    
    let briefTitle = '';
    if (briefType === 'Amicus Curiae') {
        const amicusName = document.getElementById('amicusName')?.value || '[Amicus Name]';
        const amicusSupport = document.getElementById('amicusSupport')?.value || 'Petitioner';
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
            ${studentNames.split('\n').join('<br>')}
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
            html += `<p style="margin-left:20px; text-indent:-20px;"><em>${c}</em></p>`;
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
    if (summaryArg.trim()) {
        html += `
    <div class="paper">
        <div class="section-header">Summary of Argument</div>
        <p>${summaryArg.replace(/\n/g, '</p><p>')}</p>
        <div class="manual-footer">${docketNum}</div>
    </div>`;
    }
    
    // Page 5+: Argument
    if (argBody.trim()) {
        html += `
    <div class="paper">
        <div class="section-header">Argument</div>
        <p>${argBody.replace(/\n/g, '</p><p>')}</p>
        <div class="manual-footer">${docketNum}</div>
    </div>`;
    }
    
    // Final Page: Conclusion
    if (conclusionText.trim()) {
        html += `
    <div class="paper">
        <div class="section-header">Conclusion</div>
        <p>${conclusionText.replace(/\n/g, '</p><p>')}</p>
        <div style="margin-top:40px;">
            <p>Respectfully submitted,</p>
            <div style="margin-top:60px;">
                ${firmName}<br>
                ${studentNames.split('\n').join('<br>')}
            </div>
        </div>
        <div class="manual-footer">${docketNum}</div>
    </div>`;
    }
    
    target.innerHTML = html;
    
    // Update case brief link
    updateCaseBriefLink();
}

window.refresh = refresh;

function updateCaseBriefLink() {
    const caseSelect = document.getElementById('assignedCase');
    const linkArea = document.getElementById('caseBriefLinkArea');
    
    if (!caseSelect || !linkArea) return;
    
    const selectedOption = caseSelect.options[caseSelect.selectedIndex];
    const link = selectedOption?.getAttribute('data-link');
    
    if (link) {
        linkArea.innerHTML = `<a href="${link}" target="_blank" style="color: #1a237e;">📄 View Case Brief</a>`;
    } else {
        linkArea.innerHTML = '';
    }
}

// ─── CLOUD SAVE/LOAD ────────────────────────────────────────────────────────
async function loadUserProjects() {
    if (!currentUser || !supabaseClient) return;
    
    const { data: projects } = await supabaseClient
        .from('scotus_projects')
        .select('*')
        .eq('user_id', (await supabaseClient.auth.getUser()).data.user.id)
        .order('updated_at', { ascending: false });
    
    const select = document.getElementById('cloud-projects');
    if (select) {
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
}

window.saveToCloud = async function() {
    if (!currentUser) {
        alert('Please sign in to save projects');
        return;
    }
    
    const title = document.getElementById('projectTitle').value.trim() || 'Untitled Project';
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    const projectData = {
        user_id: user.id,
        title: title,
        data: {
            projectTitle: document.getElementById('projectTitle').value,
            briefType: document.getElementById('briefType').value,
            amicusName: document.getElementById('amicusName')?.value,
            amicusSupport: document.getElementById('amicusSupport')?.value,
            courtTerm: document.getElementById('courtTerm').value,
            firmName: document.getElementById('firmName').value,
            studentNames: document.getElementById('studentNames').value,
            assignedCase: document.getElementById('assignedCase')?.value,
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
};

window.loadSelectedProject = async function() {
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
        if (document.getElementById('amicusName')) document.getElementById('amicusName').value = d.amicusName || '';
        if (document.getElementById('amicusSupport')) document.getElementById('amicusSupport').value = d.amicusSupport || 'Petitioner';
        document.getElementById('courtTerm').value = d.courtTerm || '';
        document.getElementById('firmName').value = d.firmName || '';
        document.getElementById('studentNames').value = d.studentNames || '';
        if (document.getElementById('assignedCase')) document.getElementById('assignedCase').value = d.assignedCase || '';
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
};

window.deleteSelectedProject = async function() {
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
};

// ─── CASES & DOCKET ─────────────────────────────────────────────────────────
async function loadCases() {
    if (!supabaseClient) return;
    
    const { data: cases } = await supabaseClient
        .from('scotus_cases')
        .select('*')
        .order('name');
    
    const select = document.getElementById('assignedCase');
    if (select) {
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

window.addNewCase = async function() {
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
};

window.deleteCase = async function(caseId) {
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
};

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
    if (!tbody) return;
    
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

// ─── PDF & SUBMISSION ───────────────────────────────────────────────────────
window.downloadPDF = async function() {
    const element = document.getElementById('render-target');
    const opt = {
        margin: 0,
        filename: (document.getElementById('projectTitle').value || 'brief') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    html2pdf().from(element).set(opt).save();
};

window.submitToCourt = async function() {
    if (!currentUser) {
        alert('Please sign in to submit');
        return;
    }
    
    const caseName = document.getElementById('assignedCase')?.value;
    if (!caseName) {
        alert('Please select a case first');
        return;
    }
    
    const caseSelect = document.getElementById('assignedCase');
    const selectedOption = caseSelect.options[caseSelect.selectedIndex];
    const caseBriefLink = selectedOption.getAttribute('data-link');
    
    alert('Generating PDF and submitting to court...');
    
    // Generate PDF
    const element = document.getElementById('render-target');
    const opt = {
        margin: 0,
        filename: 'brief.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    const pdfBlob = await html2pdf().from(element).set(opt).outputPdf('blob');
    
    const { data: { user } } = await supabaseClient.auth.getUser();
    const fileName = `${user.id}_${Date.now()}.pdf`;
    
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
            user_id: user.id,
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
};
