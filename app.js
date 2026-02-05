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
    
    // Set up global input listener on the input panel
    const inputPanel = document.querySelector('.input-panel');
    if (inputPanel) {
        inputPanel.addEventListener('input', function(e) {
            if (e.target.matches('input, textarea, select')) {
                updatePreview();
            }
        });
        
        inputPanel.addEventListener('change', function(e) {
            if (e.target.matches('select')) {
                if (e.target.id === 'docType') {
                    handleDocTypeChange();
                } else {
                    updatePreview();
                }
            }
        });
    }
    
    // Set up button listeners
    const addQuestionBtn = document.getElementById('add-question-btn');
    if (addQuestionBtn) addQuestionBtn.addEventListener('click', addQuestion);
    
    const addAuthBtn = document.getElementById('add-auth-btn');
    if (addAuthBtn) addAuthBtn.addEventListener('click', addAuthority);
    
    const addHeadingBtn = document.getElementById('add-heading-btn');
    if (addHeadingBtn) addHeadingBtn.addEventListener('click', () => addArgumentSection('heading'));
    
    const addSubBtn = document.getElementById('add-sub-btn');
    if (addSubBtn) addSubBtn.addEventListener('click', () => addArgumentSection('sub'));
    
    const generatePdfBtn = document.getElementById('generate-pdf-btn');
    if (generatePdfBtn) generatePdfBtn.addEventListener('click', generatePDF);
    
    // Initial render
    updatePreview();
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    
    const targetBtn = document.querySelector(`[data-tab="${tabId}"]`);
    if (targetBtn) targetBtn.classList.add('active');
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
}

function renderQuestions() {
    const container = document.getElementById('questions-list');
    if (!container) return;
    
    container.innerHTML = questions.map((q, i) => `
        <div class="dynamic-item">
            <button class="delete-x" onclick="removeQuestion(${i})">×</button>
            <label>Question ${i + 1}:</label>
            <textarea rows="3">${q}</textarea>
        </div>
    `).join('');
    
    // Attach listeners to the new textareas
    const textareas = container.querySelectorAll('textarea');
    textareas.forEach((ta, index) => {
        ta.addEventListener('input', function() {
            questions[index] = this.value;
            updatePreview();
        });
    });
    
    updatePreview();
}

function removeQuestion(index) {
    questions.splice(index, 1);
    renderQuestions();
}

function addAuthority() {
    const nameInput = document.getElementById('authName');
    const yearInput = document.getElementById('authYear');
    const typeSelect = document.getElementById('authType');
    
    if (!nameInput || !nameInput.value.trim()) return;
    
    authorities.push({ 
        name: nameInput.value, 
        year: yearInput ? yearInput.value : '', 
        type: typeSelect ? typeSelect.value : 'Cases'
    });
    
    nameInput.value = '';
    if (yearInput) yearInput.value = '';
    
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
            <input type="text" value="${sec.title}" placeholder="Title">
            <textarea rows="3" placeholder="Text...">${sec.body}</textarea>
        </div>
    `).join('');
    
    // Attach listeners
    const items = container.querySelectorAll('.dynamic-item');
    items.forEach((item, index) => {
        const input = item.querySelector('input');
        const textarea = item.querySelector('textarea');
        
        if (input) {
            input.addEventListener('input', function() {
                argumentSections[index].title = this.value;
                updatePreview();
            });
        }
        
        if (textarea) {
            textarea.addEventListener('input', function() {
                argumentSections[index].body = this.value;
                updatePreview();
            });
        }
    });
    
    updatePreview();
}

function removeArgumentSection(index) {
    argumentSections.splice(index, 1);
    renderArgumentSections();
}

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

function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function updatePreview() {
    const previewContent = document.getElementById('preview-content');
    if (!previewContent) {
        console.error('Preview content element not found!');
        return;
    }
    
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
                ? `BRIEF OF ${getValue('firmName') || '[FIRM NAME]'} AS AMICUS CURIAE SUPPORTING ${getValue('amicusSupport') || 'PETITIONER'}` 
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
            : authorities.slice().sort((a,b) => a.name.localeCompare(b.name)).map(a => `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span>${a.name}${a.year ? ' (' + a.year + ')' : ''}</span>
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
            html += `<h4 style="margin-top:20px;">${romanize(mainCount)}. ${sec.title || '[Untitled]'}</h4><p>${sec.body || ''}</p>`;
        } else {
            subCount++;
            const letter = String.fromCharCode(64 + subCount);
            html += `<div style="margin-left:30px; margin-top:10px;"><b>${letter}. ${sec.title || '[Untitled]'}</b><p>${sec.body || ''}</p></div>`;
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
    if (!element) {
        alert('Error: Unable to generate PDF');
        return;
    }
    
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
