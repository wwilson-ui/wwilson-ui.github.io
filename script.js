// Database Config (Replace with your keys from Supabase)
const SUPABASE_URL = 'YOUR_PROJECT_URL';
const SUPABASE_KEY = 'YOUR_ANON_KEY';
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let data = { petitioners: [""], respondents: [""], questions: [""], cases: [""], statutes: [""] };
let userKey = null;

window.onload = () => { renderInputFields(); refresh(); };

function addDynamic(type) { data[type + 's'].push(""); renderInputFields(); refresh(); }

function renderInputFields() {
    ['petitioner', 'respondent', 'question', 'case', 'statute'].forEach(t => {
        const container = document.getElementById(`${t}-inputs`);
        if(!container) return;
        container.innerHTML = data[t+'s'].map((val, i) => `
            <div style="display:flex; gap:5px; margin-bottom:5px;">
                <input type="text" value="${val}" placeholder="..." oninput="data['${t}s'][${i}]=this.value; refresh()">
                <button onclick="removeDynamic('${t}', ${i})" style="background:none; border:none; cursor:pointer;">❌</button>
            </div>
        `).join('');
    });
}

function refresh() {
    const get = (id) => document.getElementById(id)?.value || "";
    let pageNum = 1; // Start counter

    const makePage = (content) => {
        return `<div class="paper">${content}<div class="manual-footer">${pageNum++}</div></div>`;
    };

    // Re-building HTML sections...
    const coverHTML = `<div class="court-header">In the <span class="sc-caps">Supreme Court of the United States</span></div>...`; 
    // (Inject your full cover, questions, etc HTML here as per previous versions)

    // FORCE RENDER
    document.getElementById('render-target').innerHTML = 
        makePage(coverHTML) + 
        makePage(questionsHTML) + 
        makePage(authoritiesHTML) + 
        makePage(argumentHTML);
}

// DATABASE LOGIC (Supabase)
async function dbSave() {
    if(!userKey) return alert("Please sign in first.");
    const title = document.getElementById('projectTitle').value;
    const { error } = await supabase.from('briefs').upsert({ 
        user_id: userKey, 
        title: title, 
        content: { data, inputs: getFormInputs() } 
    });
    if(error) alert("Error saving: " + error.message);
    else alert("Saved to Database!");
}

async function loadSelectedProject() {
    const title = document.getElementById('projectList').value;
    const { data: records } = await supabase.from('briefs').select('*').eq('user_id', userKey).eq('title', title);
    if(records.length) {
        const saved = records[0].content;
        data = saved.data;
        // map saved.inputs back to DOM...
        refresh();
    }
}

function downloadPDF() {
    const element = document.getElementById('render-target');
    html2pdf().from(element).set({
        margin: 0,
        filename: 'SCOTUS-Brief.pdf',
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter' }
    }).save();
}
