// DATA ARRAYS
let questions = [];
let authorities = [];
let argumentPoints = [];

// 1. INITIALIZE & LISTENERS
window.onload = () => {
    // This "Global Listener" ensures the preview updates the second you type
    document.addEventListener('input', updatePreview);
    updatePreview(); 
};

// 2. TAB LOGIC
function showTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    // Highlight active button
    const btns = document.querySelectorAll('.tab-btn');
    btns.forEach(btn => { if(btn.innerText.toLowerCase().includes(id)) btn.classList.add('active'); });
}

// 3. DYNAMIC CONTENT HANDLERS
function addQuestion() {
    questions.push("");
    renderQuestions();
}

function renderQuestions() {
    const container = document.getElementById('questions-list');
    container.innerHTML = questions.map((q, i) => `
        <div class="item-card">
            <button class="del-btn" onclick="questions.splice(${i},1); renderQuestions(); updatePreview();">X</button>
            <textarea placeholder="Enter question..." oninput="questions[${i}]=this.value">${q}</textarea>
        </div>
    `).join('');
}

function addAuthority() {
    const name = document.getElementById('authName').value;
    const year = document.getElementById('authYear').value;
    if(name) {
        authorities.push({ name, year });
        document.getElementById('authName').value = "";
        document.getElementById('authYear').value = "";
        renderAuthorities();
        updatePreview();
    }
}

function renderAuthorities() {
    const container = document.getElementById('auth-list');
    container.innerHTML = authorities.map((a, i) => `
        <div class="item-card" style="font-size:0.85rem">
            <button class="del-btn" onclick="authorities.splice(${i},1); renderAuthorities(); updatePreview();">X</button>
            <b>${a.name}</b> (${a.year})
        </div>
    `).join('');
}

function addArg(type) {
    argumentPoints.push({ type, title: "", body: "" });
    renderArgs();
}

function renderArgs() {
    const container = document.getElementById('argument-list');
    container.innerHTML = argumentPoints.map((arg, i) => `
        <div class="item-card" style="${arg.type==='sub'?'margin-left:20px':''}">
            <button class="del-btn" onclick="argumentPoints.splice(${i},1); renderArgs(); updatePreview();">X</button>
            <input type="text" placeholder="Heading Title" value="${arg.title}" oninput="argumentPoints[${i}].title=this.value">
            <textarea placeholder="Argument body..." oninput="argumentPoints[${i}].body=this.value">${arg.body}</textarea>
        </div>
    `).join('');
}

function romanize(num) {
    const lookup = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1};
    let roman = '';
    for (let i in lookup) { while (num >= lookup[i]) { roman += i; num -= lookup[i]; } }
    return roman;
}

// 4. THE PREVIEW ENGINE
function updatePreview() {
    // Safe-Getter helper
    const get = (id) => document.getElementById(id) ? document.getElementById(id).value : "";
    
    const docType = get('docType');
    const isAmicus = (docType === 'amicus');
    
    // Toggle Amicus UI
    document.querySelectorAll('.amicus-only').forEach(el => el.style.display = isAmicus ? 'block' : 'none');

    let html = `
        <div class="docket">${get('docket') || 'No. 24-XXXX'}</div>
        <div class="court-title">In the Supreme Court of the United States</div>
        
        <div class="caption">
            <div class="parties">
                ${get('petitioner') || '[Petitioner]'},<br>
                <i>Petitioner</i>,<br>
                <div style="margin:10px 0">v.</div>
                ${get('respondent') || '[Respondent]'},<br>
                <i>Respondent</i>.
            </div>
            <div class="bracket">
                On Writ of Certiorari to the ${get('lowerCourt') || '[Lower Court]'}
            </div>
        </div>

        <div class="title-box">
            ${isAmicus ? 
                `BRIEF OF ${get('firmName') || '[NAME]'} AS AMICUS CURIAE SUPPORTING ${get('amicusSupport')}` : 
                `BRIEF FOR THE ${docType.toUpperCase()}`
            }
        </div>

        <div style="text-align:center; margin-top:50px;">
            <b>Respectfully Submitted,</b><br><br>
            ${get('firmName') || '[Law Firm/Group Name]'}<br>
            <div style="font-size:0.9rem; margin-top:10px;">
                ${get('studentNames').replace(/\n/g, '<br>')}
            </div>
        </div>

        <div class="page-break"></div>
        <h3 style="text-align:center">QUESTIONS PRESENTED</h3>
        ${questions.map((q, i) => `<p><b>${i+1}.</b> ${q}</p>`).join('') || '<p><i>[No questions entered]</i></p>'}

        <div class="page-break"></div>
        <h3 style="text-align:center">TABLE OF AUTHORITIES</h3>
        ${authorities.sort((a,b)=>a.name.localeCompare(b.name)).map(a => `<div style="display:flex; justify-content:space-between"><span>${a.name} (${a.year})</span><span>... [Page]</span></div>`).join('')}

        <div class="page-break"></div>
        <h3 style="text-align:center">ARGUMENT</h3>
    `;

    if(isAmicus && get('interestAmicus')) {
        html += `<h4>Interest of Amicus Curiae</h4><p>${get('interestAmicus')}</p>`;
    }
    
    if(get('summaryArg')) {
        html += `<h4>Summary of Argument</h4><p>${get('summaryArg')}</p><hr>`;
    }

    let mainI = 0;
    let subI = 0;
    argumentPoints.forEach(arg => {
        if(arg.type === 'heading') {
            mainI++; subI = 0;
            html += `<h4 style="margin-top:20px;">${romanize(mainI)}. ${arg.title}</h4><p>${arg.body}</p>`;
        } else {
            subI++;
            let letter = String.fromCharCode(64 + subI);
            html += `<div style="margin-left:30px"><b>${letter}. ${arg.title}</b><p>${arg.body}</p></div>`;
        }
    });

    if(get('conclusionText')) {
        html += `<div class="page-break"></div><h3 style="text-align:center">CONCLUSION</h3><p>${get('conclusionText')}</p>`;
    }

    document.getElementById('preview-render').innerHTML = html;
}

// 5. EXPORT
function generatePDF() {
    const element = document.getElementById('pdf-container');
    html2pdf().from(element).set({
        margin: 0.5,
        filename: 'Moot_Court_Brief.pdf',
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    }).save();
}

function handleCredentialResponse(r) { console.log("Login success"); }
