// =====================================================
// SCOTUS BRIEF GENERATOR - UNIFIED WITH SPARK
// =====================================================

const TEACHER_EMAIL = 'wwilson@mtps.us';

let supabaseClient = null;
let currentUser = null;
let isTeacher = false;

window.data = {
    petitioners: [''],
    respondents: [''],
    questions: [''],
    cases: [''],
    statutes: ['']
};

// ─── UNIFIED INITIALIZATION ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Supabase using keys from config.js
    if (typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } else { 
        alert('Supabase not loaded from config.js. Check your script tags.'); 
        return; 
    }

    // 2. Listen for background auth changes
    supabaseClient.auth.onAuthStateChange((event, session) => {
        updateAuthUI(session);
    });

    // 3. Initial Auth Check
    await checkAuth();

    // 4. Load database information
    if (typeof loadCases === 'function') loadCases();
    if (typeof loadDocket === 'function') loadDocket();

    // 5. Initialize SCOTUS UI formatting
    window.renderInputFields();
    window.refresh();
});

// ─── AUTH CHECK & UI UPDATE ─────────────────────────────────────────────────
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    updateAuthUI(session);
}

function updateAuthUI(session) {
    const authSection = document.getElementById('authSection');
    const authStatus = document.getElementById('auth-status'); 

    if (session) {
        currentUser = session.user.email;
        // Make sure the email match is completely case-insensitive
        isTeacher = (currentUser.trim().toLowerCase() === TEACHER_EMAIL.trim().toLowerCase());
        const emailPrefix = currentUser.split('@')[0];
        
        if (authSection) {
            authSection.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="font-weight: 600; color: #1A1A1B;">${emailPrefix}</span>
                    <button onclick="signOut()" class="auth-btn" style="padding: 6px 10px; font-size: 0.8rem;">Sign Out</button>
                </div>
            `;
        }
        
        if (authStatus) authStatus.innerText = `Signed in as ${currentUser}`;
        
        // Explicitly show/hide the admin tab
        const adminTab = document.getElementById('admin-tab');
        if (adminTab) {
            adminTab.style.display = isTeacher ? 'block' : 'none';
        }

    } else {
        currentUser = null;
        isTeacher = false;
        
        if (authSection) {
            authSection.innerHTML = `
                <button onclick="signIn()" class="auth-btn">
                    <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" width="18" height="18" alt="G">
                    Sign in
                </button>
            `;
        }
        
        if (authStatus) authStatus.innerText = 'Not signed in';
        
        const adminTab = document.getElementById('admin-tab');
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


// ─── UI & NAVIGATION LOGIC ─────────────────────────────────────────────────

window.switchTab = function(tabId) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    // Show target content
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    
    // Highlight active button (find the button that called this function)
    const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick') === `switchTab('${tabId}')`);
    if (btn) btn.classList.add('active');
    
    window.refresh();
};

window.renderInputFields = function() {
    function createInputs(type, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        window.data[type].forEach((val, i) => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.gap = '10px';
            div.style.marginBottom = '10px';
            
            const input = document.createElement(type === 'questions' ? 'textarea' : 'input');
            if (type === 'questions') input.rows = 3;
            input.value = val;
            input.style.flex = '1';
            input.style.padding = '8px';
            input.style.border = '1px solid #ccc';
            input.style.borderRadius = '4px';
            input.oninput = (e) => { window.data[type][i] = e.target.value; window.refresh(); };
            
            const btn = document.createElement('button');
            btn.textContent = 'X';
            btn.style.padding = '8px 12px';
            btn.style.background = '#e74c3c';
            btn.style.color = 'white';
            btn.style.border = 'none';
            btn.style.borderRadius = '4px';
            btn.style.cursor = 'pointer';
            btn.onclick = () => { 
                window.data[type].splice(i, 1); 
                window.renderInputFields(); 
                window.refresh(); 
            };
            
            div.appendChild(input);
            div.appendChild(btn);
            container.appendChild(div);
        });
    }

    createInputs('petitioners', 'petitioners-list');
    createInputs('respondents', 'respondents-list');
    createInputs('questions', 'questions-list');
    createInputs('cases', 'cases-list');
    createInputs('statutes', 'statutes-list');
};

window.addInput = function(type) {
    window.data[type].push('');
    window.renderInputFields();
    window.refresh();
};

window.refresh = function() {
    const target = document.getElementById('render-target');
    if (!target) return;
    
    const counselName = document.getElementById('counsel-name') ? document.getElementById('counsel-name').value : '';
    const docketNum = document.getElementById('case-select') && document.getElementById('case-select').options[document.getElementById('case-select').selectedIndex] ? 
                      document.getElementById('case-select').options[document.getElementById('case-select').selectedIndex].text : '[Case Name]';
    
    let html = '';

    // Page 1: Cover
    html += `
    <div class="paper cover-page">
        <div class="docket-number">No. 24-101</div>
        <div class="court-name">IN THE SUPREME COURT OF THE UNITED STATES</div>
        
        <div class="parties">
            ${window.data.petitioners.filter(p => p.trim()).join(', ') || '[Petitioners]'},<br>
            <span style="font-style: italic;">Petitioners,</span><br>
            v.<br>
            ${window.data.respondents.filter(r => r.trim()).join(', ') || '[Respondents]'},<br>
            <span style="font-style: italic;">Respondents.</span>
        </div>
        
        <div class="cert-line">ON WRIT OF CERTIORARI TO THE UNITED STATES COURT OF APPEALS</div>
        
        <div class="brief-title">BRIEF FOR THE ${window.data.petitioners[0] ? 'PETITIONER' : 'RESPONDENT'}</div>
        
        <div class="counsel-info">
            <strong>${counselName || '[Your Name]'}</strong><br>
            Counsel of Record<br>
            Classroom Moot Court Project
        </div>
    </div>`;

    // Page 2: Questions Presented
    html += `
    <div class="paper">
        <div class="section-header">Questions Presented</div>
        <div class="question-list">
            ${window.data.questions.filter(q => q.trim()).map(q => `<p>${q}</p>`).join('') || '<p>[Enter your questions presented]</p>'}
        </div>
        <div class="manual-footer">${docketNum}</div>
    </div>`;

    // Render the rest to the preview
    target.innerHTML = html;
};

// ─── DATABASE LOGIC (Keep your existing Supabase logic here) ────────────────
async function loadCases() {
    if (!supabaseClient) return;
    const { data: activeCases, error } = await supabaseClient.from('active_cases').select('*').order('created_at', { ascending: false });
    
    if (error) {
        console.error('Error loading cases:', error);
        return;
    }

    const select = document.getElementById('case-select');
    if (select) {
        select.innerHTML = '<option value="">-- Choose Case --</option>';
        activeCases.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.case_name;
            opt.dataset.link = c.drive_link || '';
            select.appendChild(opt);
        });
    }
}

async function loadDocket() {
    // Keep your existing docket logic here
}
