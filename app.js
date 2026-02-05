// STATE
let questions = [];
let authorities = [];
let argumentSections = [];

// Wait for page to load
window.addEventListener('load', function() {
    console.log('Page loaded, initializing...');
    
    // Attach input listeners to ALL inputs in the input panel
    const inputPanel = document.querySelector('.input-panel');
    if (inputPanel) {
        inputPanel.addEventListener('input', updatePreview);
        inputPanel.addEventListener('change', updatePreview);
    }
    
    // Initial render
    updatePreview();
    console.log('Initial preview rendered');
});

// TAB NAVIGATION
function openTab(tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
    });
    
    // Deactivate all buttons
    document.querySelectorAll('.tab-btn').forEach(el => {
        el.classList.remove('active');
    });
    
    // Show selected tab
    const targetTab = document.getElementById(tabId);
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // Activate clicked button
    event.target.classList.add('active');
}

// HELPER FUNCTION
function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

// QUESTIONS
function addQuestion() {
    questions.push('');
    renderQuestions();
}

function renderQuestions() {
    const container = document.getElementById('questions-list');
    if (!container) return;
    
    container.innerHTML = questions.map((q, i) => `
        <div class="dynamic-item">
            <button class="delete-x" onclick="removeQuestion(${i})">×</button>
            <label>Question ${i + 1}:</label>
            <textarea rows="3" oninput="updateQuestionText(${i}, this.value)">${q}</textarea>
        </div>
    `).join('');
}

function updateQuestionText(index, value) {
    questions[index] = value;
    updatePreview();
}

function removeQuestion(index) {
    questions.splice(index, 1);
    renderQuestions();
    updatePreview();
}

// AUTHORITIES
function addAuthority() {
    const name = getVal('authName');
    const year = getVal('authYear');
    const type = getVal('authType');
    
    if (!name) return;
    
    authorities.push({ name, year, type });
    
    document.getElementById('authName').value = '';
    document.getElementById('authYear').value = '';
    
    renderAuthorities();
}

function renderAuthorities() {
    const container = document.getElementById('auth-list');
    if (!container) return;
    
    container.innerHTML = authorities.map((a, i) => `
        <div class="dynamic-item" style="font-size: 0.9rem;">
            <button class="delete-x" onclick="removeAuthority(${i})">×</button>
            <strong>${a.type}:</strong> ${a.name} ${a.year ? '(' + a.year + ')' : ''}
        </div>
    `).join('');
    
    updatePreview();
}

function removeAuthority(index) {
    authorities.splice(index, 1);
    renderAuthorities();
}

// ARGUMENTS
function addArgumentSection(type) {
    argumentSections.push({ type, title: '', body: '' });
    renderArgumentSections();
}

function renderArgumentSections() {
    const container = document.getElementById('argument-sections');
    if (!container) return;
    
    container.innerHTML = argumentSections.map((sec, i) => `
        <div class="dynamic-item" style="${sec.type === 'sub' ? 'margin-left: 30px; border-left: 4px solid #1a237e; padding-left: 10px;' : ''}">
            <button class="delete-x" onclick="removeArgumentSection(${i})">×</button>
            <label>${sec.type === 'heading' ? 'Main Point' : 'Sub-Point'}:</label>
            <input type="text" value="${sec.title}" placeholder="Title" 
                   oninput="updateArgument(${i}, 'title', this.value)">
            <textarea rows="3" placeholder="Text..." 
                      oninput="updateArgument(${i}, 'body', this.value)">${sec.body}</textarea>
        </div>
    `).join('');
}

function updateArgument(index, field, value) {
    argumentSections[index][field] = value;
    updatePreview();
}

function removeArgumentSection(index) {
    argumentSections.splice(index, 1);
    renderArgumentSections();
    updatePreview();
}

// ROMAN NUMERALS
function romanize(num) {
    if (!num || num < 1) return '';
    const lookup = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1};
    let roman = '';
    for (let i in lookup) {
        while (num >= lookup[i]) {
            roman += i;
            num -= lookup[i];
        }
    }
    return roman;
}

// MAIN UPDATE FUNCTION
function updatePreview() {
    const previewContent = document.getElementById('preview-content');
    if (!previewContent) return;
    
    const isAmicus = getVal('docType') === 'amicus';
    
    // Toggle Amicus fields
    const amicusOptions = document.getElementById('amicus-options');
    const amicusInterest = document.getElementById('amicus-interest-section');
    if (amicusOptions) amicusOptions.style.display = isAmicus ? 'block' : 'none';
    if (amicusInterest) amicusInterest.style.display = isAmicus ? 'block' : 'none';
    
    let html = `
        <div class="docket">${getVal('docket') || 'No. 24-XXXX'}</div>
        <div class="court-header">In the Supreme Court of the United States</div>
        
        <div class="caption-box">
            <div class="parties">
                ${getVal('petitioner') || '[Petitioner]'},<br>
                <i>Petitioner</i>,<br>
                <div style="margin: 10px 0">v.</div>
                ${getVal('respondent') || '[Respondent]'},<br>
                <i>Respondent</i>.
            </div>
            <div class="bracket">
                On Writ of Certiorari to the ${getVal('lowerCourt') || '[Lower Court]'}
            </div>
        </div>
        
        ${getVal('termDate') ? `<div style="text-align:center; margin-bottom:20px;">${getVal('termDate')}</div>` : ''}

        <div class="title-box">
            ${isAmicus 
                ? `BRIEF OF ${getVal('firmName') || '[FIRM NAME]'} AS AMICUS CURIAE SUPPORTING ${getVal('amicusSupport') || 'PETITIONER'}` 
                : `BRIEF FOR THE PETITIONER`
            }
        </div>

        <div style="text-align:center; margin-top:40px;">
            <b>Respectfully Submitted,</b><br><br>
            ${getVal('firmName') || '[Law Firm Name]'}<br>
            <div style="font-size:0.9rem; margin-top:10px;">
                ${getVal('studentNames').replace(/\n/g, '<br>') || '[Student Names]'}
            </div>
        </div>

        <div class="page-break"></div>
        <div class="center-head">QUESTIONS PRESENTED</div>
        ${questions.length === 0 
            ? '<p><i>[No questions entered]</i></p>' 
            : questions.map((q, i) => `<p><b>${i + 1}.</b> ${q || '[Question text]'}</p>`).join('')
        }

        <div class="page-break"></div>
        <div class="center-head">TABLE OF AUTHORITIES</div>
        ${authorities.length === 0
            ? '<p><i>[No authorities registered]</i></p>'
            : authorities.slice().sort((a,b) => a.name.localeCompare(b.name)).map(a => `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span>${a.name}${a.year ? ' (' + a.year + ')' : ''}</span>
                    <span>[Page]</span>
                </div>
            `).join('')
        }

        <div class="page-break"></div>
        <div class="center-head">ARGUMENT</div>
        
        ${isAmicus && getVal('interestAmicus') 
            ? `<h4>Interest of Amicus Curiae</h4><p>${getVal('interestAmicus')}</p>` 
            : ''
        }
        
        ${getVal('statementCase') 
            ? `<h4>Statement of the Case</h4><p>${getVal('statementCase')}</p>` 
            : ''
        }
        
        ${getVal('summaryArg') 
            ? `<h4>Summary of Argument</h4><p>${getVal('summaryArg')}</p>` 
            : ''
        }
        
        <hr style="margin:20px 0;">
    `;

    // Add argument sections
    let mainCount = 0;
    let subCount = 0;
    
    argumentSections.forEach(sec => {
        if (sec.type === 'heading') {
            mainCount++;
            subCount = 0;
            html += `<h4 style="margin-top:20px;">${romanize(mainCount)}. ${sec.title || '[Untitled]'}</h4><p>${sec.body || ''}</p>`;
        } else {
            subCount++;
            const letter = String.fromCharCode(64 + subCount);
            html += `<div style="margin-left:30px; margin-top:10px;"><b>${letter}. ${sec.title || '[Untitled]'}</b><p>${sec.body || ''}</p></div>`;
        }
    });

    // Conclusion
    if (getVal('conclusion')) {
        html += `<div class="page-break"></div><div class="center-head">CONCLUSION</div><p>${getVal('conclusion')}</p>`;
    }

    previewContent.innerHTML = html;
}

// PDF GENERATION
function generatePDF() {
    const element = document.getElementById('printable-area');
    if (!element) {
        alert('Error: Unable to generate PDF');
        return;
    }
