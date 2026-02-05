// State
let questions = [];
let authorities = [];
let argumentSections = [];

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('App initialized');
    
    // Set up tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
    
    // Set up all input listeners
    document.getElementById('main-inputs')?.addEventListener('input', updatePreview);
    document.getElementById('docType')?.addEventListener('change', handleDocTypeChange);
    
    // Set up button listeners
    document.getElementById('add-question-btn')?.addEventListener('click', addQuestion);
    document.getElementById('add-auth-btn')?.addEventListener('click', addAuthority);
    document.getElementById('add-heading-btn')?.addEventListener('click', () => addArgumentSection('heading'));
    document.getElementById('add-sub-btn')?.addEventListener('click', () => addArgumentSection('sub'));
    document.getElementById('generate-pdf-btn')?.addEventListener('click', generatePDF);
    
    // Initial render
    updatePreview();
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(tabId)?.classList.add('active');
    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
}

function handleDocTypeChange() {
    const isAmicus = document.getElementById('docType').value === 'amicus';
    const amicusOptions = document.getElementById('amicus-options');
    const amicusInterest = document.getElementById('amicus-interest-section');
    
    if (amicusOptions) amicusOptions.style.display = isAmicus ? 'block' : 'none';
    if (amicusInterest) amicusInterest.style.display = isAmicus ? 'block' : 'none';
    
    updatePreview();
}

function addQuestion() {
    questions.push('');
    renderQuestions();
    updatePreview();
}

function renderQuestions() {
    const container = document.getElementById('questions-list');
    if (!container) return;
    
    container.innerHTML = questions.map((q, i) => `
        <div class="dynamic-item">
            <button class="delete-x" onclick="removeQuestion(${i})">×</button>
            <label>Question ${i + 1}:</label>
            <textarea data-question-index="${i}" rows="3">${q}</textarea>
        </div>
    `).join('');
    
    // Add listeners to new textareas
    container.querySelectorAll('textarea').forEach(ta => {
        ta.addEventListener('input', function() {
            const idx = parseInt(this.getAttribute('data-question-index'));
            questions[idx] = this.value;
            updatePreview();
        });
    });
}

function removeQuestion(index) {
    questions.splice(index, 1);
    renderQuestions();
    updatePreview();
}

function addAuthority() {
    const name = document.getElementById('authName')?.value;
    const year = document.getElementById('authYear')?.value;
    const type = document.getElementById('authType')?.value;
    
    if (!name) return;
    
    authorities.push({ name, year, type });
    document.getElementById('authName').value = '';
    document.getElementById('authYear').value = '';
    
    renderAuthorities();
    updatePreview();
}

function renderAuthorities() {
    const container = document.getElementById('auth-list');
    if (!container) return;
    
    container.innerHTML = authorities.map((a, i) => `
        <div class="dynamic-item">
            <button class="delete-x" onclick="removeAuthority(${i})">×</button>
            <strong>${a.type}:</strong> ${a.name} (${a.year})
        </div>
    `).join('');
}

function removeAuthority(index) {
    authorities.splice(index, 1);
    renderAuthorities();
    updatePreview();
}

function addArgumentSection(type) {
    argumentSections.push({ type, title: '', body: '' });
    renderArgumentSections();
    updatePreview();
}

function renderArgumentSections() {
    const container = document.getElementById('argument-sections');
    if (!container) return;
    
    container.innerHTML = argumentSections.map((sec, i) => `
        <div class="dynamic-item" style="${sec.type === 'sub' ? 'margin-left: 30px; border-left: 4px solid #1a237e;' : ''}">
            <button class="delete-x" onclick="removeArgumentSection(${i})">×</button>
            <label>${sec.type === 'heading' ? 'Main Point' : 'Sub-Point'}:</label>
            <input type="text" data-arg-index="${i}" data-arg-field="title" value="${sec.title}" placeholder="Title">
            <textarea data-arg-index="${i}" data-arg-field="body" rows="3" placeholder="Text...">${sec.body}</textarea>
        </div>
    `).join('');
    
    // Add listeners
    container.querySelectorAll('input, textarea').forEach(el => {
        el.addEventListener('input', function() {
            const idx = parseInt(this.getAttribute('data-arg-index'));
            const field = this.getAttribute('data-arg-field');
            argumentSections[idx][field] = this.value;
            updatePreview();
        });
    });
}

function removeArgumentSection(index) {
    argumentSections.splice(index, 1);
    renderArgumentSections();
    updatePreview();
}

function romanize(num) {
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

function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function updatePreview() {
    const previewContent = document.getElementById('preview-content');
    if (!previewContent) return;
    
    const isAmicus = getValue('docType') === 'amicus';
    
    let html = `
        <div class="docket">${getValue('docket') || 'No. 24-XXXX'}</div>
        <div class="court-header">In the Supreme Court of the United States</div>
        
        <div class="caption-box">
            <div class="parties">
                ${getValue('petitioner') || '[Petitioner]'},<br>
                <i>Petitioner</i>,<br>
                <div style="margin: 10px 0">v.</div>
                ${getValue('respondent') || '[Respondent]'},<br>
                <i>Respondent</i>.
            </div>
            <div class="bracket">
                On Writ of Certiorari to the ${getValue('lowerCourt') || '[Lower Court]'}
            </div>
        </div>
        
        ${getValue('termDate') ? `<div style="text-align:center; margin-bottom:20px;">${getValue('termDate')}</div>` : ''}

        <div class="title-box">
            ${isAmicus 
                ? `BRIEF OF ${getValue('firmName') || '[FIRM NAME]'} AS AMICUS CURIAE SUPPORTING ${getValue('amicusSupport')}` 
                : `BRIEF FOR THE PETITIONER`
            }
        </div>

        <div style="text-align:center; margin-top:40px;">
            <b>Respectfully Submitted,</b><br><br>
            ${getValue('firmName') || '[Law Firm Name]'}<br>
            <div style="font-size:0.9rem; margin-top:10px;">
                ${getValue('studentNames').replace(/\n/g, '<br>') || '[Student Names]'}
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
            : authorities.sort((a,b) => a.name.localeCompare(b.name)).map(a => `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span>${a.name} (${a.year})</span>
                    <span>[Page]</span>
                </div>
            `).join('')
        }

        <div class="page-break"></div>
        <div class="center-head">ARGUMENT</div>
        
        ${isAmicus && getValue('interestAmicus') 
            ? `<h4>Interest of Amicus Curiae</h4><p>${getValue('interestAmicus')}</p>` 
            : ''
        }
        
        ${getValue('statementCase') 
            ? `<h4>Statement of the Case</h4><p>${getValue('statementCase')}</p>` 
            : ''
        }
        
        ${getValue('summaryArg') 
            ? `<h4>Summary of Argument</h4><p>${getValue('summaryArg')}</p>` 
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
            html += `<h4 style="margin-top:20px;">${romanize(mainCount)}. ${sec.title || '[Untitled]'}</h4><p>${sec.body}</p>`;
        } else {
            subCount++;
            const letter = String.fromCharCode(64 + subCount);
            html += `<div style="margin-left:30px; margin-top:10px;"><b>${letter}. ${sec.title || '[Untitled]'}</b><p>${sec.body}</p></div>`;
        }
    });

    // Conclusion
    if (getValue('conclusion')) {
        html += `<div class="page-break"></div><div class="center-head">CONCLUSION</div><p>${getValue('conclusion')}</p>`;
    }

    previewContent.innerHTML = html;
}

function generatePDF() {
    const element = document.getElementById('printable-area');
    html2pdf().from(element).set({
        margin: 0.5,
        filename: 'MootCourt_Brief.pdf',
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    }).save();
}

function handleCredentialResponse(response) {
    console.log('Google Sign-In:', response.credential);
    alert('Signed in successfully!');
}
