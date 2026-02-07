// ... (keep the top part of your script the same until the refresh function)

function refresh() {
    const get = (id) => document.getElementById(id)?.value || "";
    let pageNum = 1;

    const makePage = (content) => `
        <div class="paper">
            ${content}
            <div class="manual-footer">${pageNum++}</div>
        </div>`;

    // Cover Page
    const coverHTML = `
        <div style="font-weight:bold;">${get('docketNum').toUpperCase() || 'NO. 00-000'}</div>
        <div class="court-header">In the <span class="sc-caps">Supreme Court of the United States</span></div>
        <div style="text-align:center; font-weight:bold;">${get('courtTerm').toUpperCase() || 'OCTOBER TERM 202X'}</div>
        <hr style="border:0; border-top:1.5pt solid black; margin:10px 0;">
        <div style="display:flex; margin:20px 0;">
            <div style="flex:1;">
                ${data.petitioners.map(p => p.toUpperCase() || 'PETITIONER').join(',<br>')},<br>
                <i>Petitioner</i>,<br><div style="margin:15px 40px;">v.</div>
                ${data.respondents.map(r => r.toUpperCase() || 'RESPONDENT').join(',<br>')},<br>
                <i>Respondent</i>.
            </div>
            <div style="border-left:1.5pt solid black; padding-left:20px; width:40%; font-style:italic;">
                On Writ of Certiorari to the ${get('lowerCourt') || 'the Lower Court'}
            </div>
        </div>
        <div class="title-box">BRIEF FOR THE ${get('briefType').toUpperCase()}</div>
        <div style="text-align:center; margin-top:1in;">
            <b>Respectfully Submitted,</b><br><br>
            <span class="sc-caps">${get('firmName') || 'FIRM NAME'}</span><br>
            <div style="font-size:11pt; margin-top:10px;">${get('studentNames').replace(/\n/g, '<br>') || 'COUNSEL NAME'}</div>
        </div>`;

    const questionsHTML = `
        <div class="section-header">QUESTIONS PRESENTED</div>
        ${data.questions.map((q, i) => `<p><b>${i+1}.</b> ${q || '...'}</p>`).join('')}`;
    
    const authoritiesHTML = `
        <div class="section-header">TABLE OF AUTHORITIES</div>
        <p><b>Cases:</b></p>
        ${data.cases.filter(x=>x).sort().map(c => `<div style="margin-bottom:5px; padding-left: 20px;"><i>${c}</i></div>`).join('')}
        <p style="margin-top:20px;"><b>Statutes:</b></p>
        ${data.statutes.filter(x=>x).sort().map(s => `<div style="margin-bottom:5px; padding-left: 20px;">${s}</div>`).join('')}`;

    // Argument Body
    const argumentBodyHTML = `
        <div class="section-header">SUMMARY OF ARGUMENT</div>
        <p style="text-indent: 0.5in;">${get('summaryArg') || '...'}</p>
        <div class="section-header">ARGUMENT</div>
        <p style="white-space: pre-wrap; text-indent: 0.5in;">${get('argBody') || '...'}</p>`;

    // Dedicated Conclusion Page (to prevent it from disappearing)
    const conclusionHTML = `
        <div class="section-header">CONCLUSION</div>
        <p style="text-indent: 0.5in;">${get('conclusionText') || '...'}</p>
        <div style="margin-top: 50px;">
            <p>Respectfully submitted,</p>
            <br>
            <p>__________________________</p>
            <p>${get('studentNames').split('\n')[0] || 'Counsel for Petitioner'}</p>
        </div>`;

    document.getElementById('render-target').innerHTML = 
        makePage(coverHTML) + 
        makePage(questionsHTML) + 
        makePage(authoritiesHTML) +
        makePage(argumentBodyHTML) +
        makePage(conclusionHTML); // Forces Conclusion onto its own numbered page
}
// ... (keep the rest of the script for file ops/PDF)
