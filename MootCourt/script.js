// ----- Update ---//
const SUPABASE_URL  = 'https://dfmugytablgldpkadfrl.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_AoeVLd5TSJMGyhAyDmXTng_5C-_C8nC';
const TEACHER_EMAIL = 'wwilson@mtps.us';

let supabaseClient = null;
let currentUser    = null;

let data = {
    petitioners: [''],
    respondents:  [''],
    questions:    [''],
    cases:        [''],
    statutes:     ['']
};

// ─── SUPABASE INIT ──────────────────────────────────────────────────────────
function initSupabase() {
    if (window.supabase && !supabaseClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        // Public data - no login required
        loadCases();
        loadDocket();
    }
}

// ─── BOOT ───────────────────────────────────────────────────────────────────
window.onload = async () => {
    initSupabase();
    renderInputFields();
    refresh();
    setupDeleteHandler(); 

    // Replaces the old localStorage logic with Supabase Session checking
    await checkSession();
};

// ─── SUPABASE AUTHENTICATION ────────────────────────────────────────────────
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const wrapper = document.getElementById('google-btn-wrapper');
    const authStatus = document.getElementById('auth-status');

    if (session) {
        currentUser = session.user.email;
        const emailPrefix = currentUser.split('@')[0];
        
        // Render logged-in state
        wrapper.innerHTML = `
            <div style="display: flex; align-items: center; gap: 15px;">
                <span style="font-weight: 600; color: white;">${emailPrefix}</span>
                <button onclick="signOut()" style="background: white; color: #444; border: 1px solid #ddd; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">Sign Out</button>
            </div>
        `;
        authStatus.innerText = `Signed in as ${currentUser}`;

        // Show admin tab if the teacher logs in
        if (currentUser.toLowerCase() === TEACHER_EMAIL.toLowerCase()) {
            document.getElementById('admin-tab').style.display = 'block';
        }
    } else {
        currentUser = null;
        
        // Render Sign-In Button
        wrapper.innerHTML = `
            <button onclick="signIn()" style="background: white; color: #444; border: 1px solid #ddd; padding: 8px 15px; border-radius: 4px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 0.9rem;">
                <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" width="18" height="18" alt="G">
                Sign in
            </button>
        `;
        authStatus.innerText = 'Not signed in';
        document.getElementById('admin-tab').style.display = 'none';
    }
}

window.signIn = async function() {
    await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { 
            redirectTo: window.location.href,
            queryParams: { hd: 'mtps.us' } // Restricts to school emails!
        }
    });
};

window.signOut = async function() {
    await supabaseClient.auth.signOut();
    window.location.reload();
};

// ─── DATA LOADING (CASES & DOCKET) ──────────────────────────────────────────
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

    renderAdminCaseList(activeCases);
}

// Keep all your existing functions exactly the same below this line
// (refresh, renderInputFields, switchTab, setupDeleteHandler, loadDocket, etc.)
