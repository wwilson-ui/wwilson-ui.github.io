// admin.js
let sb = null;
let currentUser = null;
let currentTab = 'pending';

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.supabase !== 'undefined') {
        sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } else {
        alert('Supabase not loaded');
        return;
    }

    await checkAuth();
    loadFlags();
});

async function checkAuth() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
        alert('Please sign in first');
        window.location.href = 'index.html';
        return;
    }

    const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'teacher') {
        alert('Access denied. Teachers only.');
        window.location.href = 'index.html';
        return;
    }

    currentUser = profile;
    document.getElementById('teacherName').textContent = profile.email.split('@')[0];
}

window.switchTab = function(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    document.getElementById('pendingFlags').style.display = tab === 'pending' ? 'block' : 'none';
    document.getElementById('reviewedFlags').style.display = tab === 'reviewed' ? 'block' : 'none';
    
    loadFlags();
};

async function loadFlags() {
    const isPending = currentTab === 'pending';
    const container = document.getElementById(isPending ? 'pendingFlags' : 'reviewedFlags');
    container.innerHTML = '<div style="text-align:center; padding:40px;">Loading...</div>';

    // Fetch flags with related content
    const { data: flags, error } = await sb
        .from('flags')
        .select(`
            *,
            profiles!flags_user_id_fkey(email),
            posts(id, title, content, user_id, profiles!posts_user_id_fkey(email)),
            comments(id, content, user_id, profiles!comments_user_id_fkey(email))
        `)
        .eq('reviewed', !isPending)
        .order('created_at', { ascending: false });

    if (error) {
        container.innerHTML = '<div style="color:red;">Error loading flags</div>';
        console.error(error);
        return;
    }

    // Update pending count
    if (isPending) {
        document.getElementById('pendingCount').textContent = flags.length;
    }

    if (flags.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:#999;">
            ${isPending ? 'No pending flags! 🎉' : 'No reviewed flags yet'}
        </div>`;
        return;
    }

    container.innerHTML = '';
    flags.forEach(flag => {
        container.appendChild(createFlagCard(flag));
    });
}

function createFlagCard(flag) {
    const div = document.createElement('div');
    div.className = `flag-card ${flag.reviewed ? 'reviewed' : ''}`;

    const isPost = flag.post_id !== null;
    const content = isPost ? flag.posts : flag.comments;
    const contentType = isPost ? 'Post' : 'Comment';
    const contentText = isPost ? content.title : content.content;
    const authorEmail = isPost ? content.profiles.email : content.profiles.email;
    const flaggerEmail = flag.profiles.email;

    const timestamp = new Date(flag.created_at).toLocaleString();

    div.innerHTML = `
        <div class="flag-header">
            <div>
                <strong style="color:#ff8800;">🚩 ${contentType} Flagged</strong>
                <div style="font-size:0.85em; color:#666; margin-top:5px;">
                    Flagged by: <strong>${flaggerEmail.split('@')[0]}</strong> | ${timestamp}
                </div>
            </div>
            <span style="background:#ff8800; color:white; padding:4px 12px; border-radius:12px; font-size:0.8em; font-weight:600;">
                ${flag.reviewed ? 'REVIEWED' : 'PENDING'}
            </span>
        </div>

        <div style="margin-bottom:10px;">
            <strong>Reason:</strong> <em>${flag.reason || 'No reason provided'}</em>
        </div>

        <div class="content-preview">
            <div style="font-size:0.85em; color:#666; margin-bottom:8px;">
                ${contentType} by: <strong>${authorEmail.split('@')[0]}</strong>
            </div>
            <div style="font-size:0.95em;">
                ${escapeHtml(contentText || '').substring(0, 300)}${contentText && contentText.length > 300 ? '...' : ''}
            </div>
        </div>

        ${!flag.reviewed ? `
            <div class="flag-actions">
                <button class="btn btn-remove" onclick="removeContent('${flag.id}', '${isPost ? flag.post_id : flag.comment_id}', '${contentType.toLowerCase()}')">
                    🗑️ Remove ${contentType}
                </button>
                <button class="btn btn-ignore" onclick="ignoreFlag('${flag.id}')">
                    ✓ Ignore Flag
                </button>
            </div>
        ` : `
            <div style="margin-top:10px; padding:10px; background:#f0f0f0; border-radius:4px; font-size:0.9em;">
                Reviewed on ${new Date(flag.reviewed_at).toLocaleString()}
            </div>
        `}
    `;

    return div;
}

window.removeContent = async function(flagId, contentId, contentType) {
    if (!confirm(`Are you sure you want to remove this ${contentType}? It will be hidden from the feed.`)) {
        return;
    }

    // Delete the content
    const table = contentType === 'post' ? 'posts' : 'comments';
    const { error: deleteError } = await sb.from(table).delete().eq('id', contentId);

    if (deleteError) {
        alert('Error removing content: ' + deleteError.message);
        return;
    }

    // Mark flag as reviewed
    const { error: flagError } = await sb.from('flags')
        .update({
            reviewed: true,
            reviewed_by: currentUser.id,
            reviewed_at: new Date().toISOString()
        })
        .eq('id', flagId);

    if (flagError) {
        alert('Error updating flag: ' + flagError.message);
    }

    loadFlags();
};

window.ignoreFlag = async function(flagId) {
    if (!confirm('Mark this flag as reviewed without removing the content?')) {
        return;
    }

    const { error } = await sb.from('flags')
        .update({
            reviewed: true,
            reviewed_by: currentUser.id,
            reviewed_at: new Date().toISOString()
        })
        .eq('id', flagId);

    if (error) {
        alert('Error updating flag: ' + error.message);
        return;
    }

    loadFlags();
};

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;");
}

// ========================================
// ASSIGNMENT BUILDER
// ========================================

let allSubreddits = [];
let currentAdminTab = 'flags';

// Switch between admin tabs
window.switchAdminTab = function(tab) {
    currentAdminTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.admin-tab').forEach(btn => {
        btn.style.borderBottomColor = 'transparent';
        btn.classList.remove('active');
    });
    event.target.style.borderBottomColor = '#FF4500';
    event.target.classList.add('active');
    
    // Show/hide sections
    document.getElementById('flagsSection').style.display = tab === 'flags' ? 'block' : 'none';
    document.getElementById('assignmentsSection').style.display = tab === 'assignments' ? 'block' : 'none';
    
    const subsparksSection = document.getElementById('subsparksSection');
    if (subsparksSection) subsparksSection.style.display = tab === 'subsparks' ? 'block' : 'none';
    
    // NEW: Show Aura Section
    const auraSection = document.getElementById('auraSection');
    if (auraSection) auraSection.style.display = tab === 'aura' ? 'block' : 'none';
    
    // Trigger loading functions
    if (tab === 'assignments') {
        loadAssignmentBuilder();
    } else if (tab === 'subsparks') {
        loadSubsparks();
    } else if (tab === 'aura') {
        loadAuraSettings(); // NEW: Load sliders when tab is clicked
    }
};

async function loadAssignmentBuilder() {
    // Load subreddits for checkboxes
    const { data: subs } = await sb.from('subreddits').select('*').order('name');
    allSubreddits = subs || [];
    
    const container = document.getElementById('subredditCheckboxes');
    container.innerHTML = '';
    
    allSubreddits.forEach(sub => {
        const label = document.createElement('label');
        label.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 6px; cursor: pointer;';
        label.innerHTML = `
            <input type="checkbox" class="sub-checkbox" value="${sub.id}" style="cursor: pointer;">
            <span>r/${sub.name}</span>
        `;
        container.appendChild(label);
    });
    
    // Load previous assignments
    loadPreviousAssignments();
}

window.toggleLimit = function(type) {
    const checkbox = document.getElementById(`noLimit${type}`);
    const input = type === 'Votes' ? document.getElementById('maxVotes') :
                  type === 'Comments' ? document.getElementById('maxComments') :
                  type === 'Age' ? document.getElementById('daysAgo') :
                  document.getElementById('postCount');
    
    if (checkbox.checked) {
        input.disabled = true;
        input.style.opacity = '0.5';
        input.value = '';
    } else {
        input.disabled = false;
        input.style.opacity = '1';
    }
};

window.previewAssignment = async function() {
    const config = getAssignmentConfig();
    
    if (!config.valid) {
        alert(config.error);
        return;
    }
    
    // Count matching posts
    const count = await countMatchingPosts(config);
    
    const previewBox = document.getElementById('previewBox');
    const previewContent = document.getElementById('previewContent');
    
    const subNames = config.subreddit_ids.map(id => {
        const sub = allSubreddits.find(s => s.id === id);
        return sub ? sub.name : id;
    }).join(', ');
    
    let warnings = [];
    if (count === 0) {
        warnings.push('⚠️ No posts match these criteria!');
    } else if (count > 100 && !config.post_count) {
        warnings.push(`⚠️ ${count} posts match - students will see ALL of them!`);
    } else if (config.random_per_student && count > (config.post_count || count) * 3) {
        warnings.push(`ℹ️ With random order enabled, distribution may be uneven across ${count} eligible posts.`);
    }
    
    previewContent.innerHTML = `
        <div style="font-size: 0.95rem; line-height: 1.6;">
            <strong>Sub-Sparks:</strong> ${subNames}<br>
            <strong>Matching Posts:</strong> ${count}<br>
            <strong>Students will see:</strong> ${config.post_count || count} posts<br>
            <strong>Random per student:</strong> ${config.random_per_student ? 'Yes' : 'No'}<br>
            ${warnings.length > 0 ? '<div style="margin-top: 10px; padding: 10px; background: #fff3cd; border-radius: 4px;">' + warnings.join('<br>') + '</div>' : ''}
        </div>
    `;
    
    previewBox.style.display = 'block';
};

window.generateAssignment = async function() {
    const config = getAssignmentConfig();
    
    if (!config.valid) {
        alert(config.error);
        return;
    }
    
    // Generate short ID
    const assignmentId = generateShortId();
    
    // Save to database
    const { error } = await sb.from('assignments').insert([{
        id: assignmentId,
        created_by: currentUser.id,
        subreddit_ids: config.subreddit_ids,
        min_votes: config.min_votes,
        max_votes: config.max_votes,
        min_comments: config.min_comments,
        max_comments: config.max_comments,
        days_ago: config.days_ago,
        post_count: config.post_count,
        random_per_student: config.random_per_student,
        exclude_own_posts: config.exclude_own_posts,
        name: config.name
    }]);
    
    if (error) {
        alert('Error creating assignment: ' + error.message);
        return;
    }
    
    // Generate URL with correct path
    const baseUrl = window.location.origin + window.location.pathname.replace('admin.html', '');
    const url = `${baseUrl}review.html?a=${assignmentId}`;
    
    // Show link
    document.getElementById('generatedLink').textContent = url;
    document.getElementById('generatedLinkBox').style.display = 'block';
    
    // Reload list
    loadPreviousAssignments();
};

window.copyAssignmentLink = function() {
    const link = document.getElementById('generatedLink').textContent;
    navigator.clipboard.writeText(link).then(() => {
        alert('Link copied to clipboard!');
    });
};

function getAssignmentConfig() {
    const checkedSubs = Array.from(document.querySelectorAll('.sub-checkbox:checked')).map(cb => cb.value);
    
    if (checkedSubs.length === 0) {
        return { valid: false, error: 'Please select at least one Sub-Spark' };
    }
    
    const minVotes = parseInt(document.getElementById('minVotes').value) || 0;
    const maxVotes = document.getElementById('noLimitVotes').checked ? null : parseInt(document.getElementById('maxVotes').value) || null;
    const minComments = parseInt(document.getElementById('minComments').value) || 0;
    const maxComments = document.getElementById('noLimitComments').checked ? null : parseInt(document.getElementById('maxComments').value) || null;
    const daysAgo = document.getElementById('noLimitAge').checked ? null : parseInt(document.getElementById('daysAgo').value) || null;
    const postCount = document.getElementById('noLimitCount').checked ? null : parseInt(document.getElementById('postCount').value) || null;
    
    return {
        valid: true,
        subreddit_ids: checkedSubs,
        min_votes: minVotes,
        max_votes: maxVotes,
        min_comments: minComments,
        max_comments: maxComments,
        days_ago: daysAgo,
        post_count: postCount,
        random_per_student: document.getElementById('randomPerStudent').checked,
        exclude_own_posts: document.getElementById('excludeOwn').checked,
        name: document.getElementById('assignmentName').value || null
    };
}

async function countMatchingPosts(config) {
    let query = sb.from('posts').select('id', { count: 'exact', head: true });
    
    query = query.in('subreddit_id', config.subreddit_ids);
    
    if (config.min_votes) query = query.gte('vote_count', config.min_votes);
    if (config.max_votes) query = query.lte('vote_count', config.max_votes);
    if (config.min_comments) query = query.gte('comment_count', config.min_comments);
    if (config.max_comments) query = query.lte('comment_count', config.max_comments);
    
    if (config.days_ago) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - config.days_ago);
        query = query.gte('created_at', cutoff.toISOString());
    }
    
    const { count } = await query;
    return count || 0;
}

async function loadPreviousAssignments() {
    const { data: assignments } = await sb
        .from('assignments')
        .select('*')
        .eq('created_by', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(10);
    
    const container = document.getElementById('assignmentsList');
    
    if (!assignments || assignments.length === 0) {
        container.innerHTML = '<div style="color: #999; font-style: italic;">No assignments yet</div>';
        return;
    }
    
    // Get correct base URL
    const baseUrl = window.location.origin + window.location.pathname.replace('admin.html', '');
    
    container.innerHTML = '';
    assignments.forEach(a => {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 12px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px;';
        
        const url = `${baseUrl}review.html?a=${a.id}`;
        
        div.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 5px;">${a.name || 'Unnamed Assignment'}</div>
            <div style="font-size: 0.85rem; color: #666;">Created: ${new Date(a.created_at).toLocaleDateString()}</div>
            <div style="margin-top: 8px;">
                <a href="${url}" target="_blank" style="font-size: 0.85rem; color: #0079D3;">🔗 Open</a>
                <button onclick="copyToClipboard('${url}')" style="margin-left: 10px; padding: 4px 8px; font-size: 0.8rem; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; cursor: pointer;">Copy Link</button>
            </div>
        `;
        container.appendChild(div);
    });
}

window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Link copied!');
    });
};

function generateShortId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ========================================
// NAME MASKING & SUB-SPARK CONTROLS
// ========================================

// 1. Global Override Toggle
window.toggleGlobalNames = async function(isMasked) {
    const statusText = document.getElementById('globalOverrideStatus');
    if (statusText) {
        statusText.innerText = isMasked ? 'Override ON (All Names Masked)' : 'Override OFF (Deferring to Sub-Sparks)';
        statusText.style.color = isMasked ? '#c62828' : '#666';
    }

    const { error } = await sb.from('teacher_settings')
        .upsert({ setting_key: 'mask_all_names', setting_value: isMasked }, { onConflict: 'setting_key' });
        
    if (error) alert("Error updating global setting: " + error.message);
};

// 2. Individual Sub-Spark Name Toggle
window.toggleSubredditNames = async function(subId, showReal) {
    const { error } = await sb.from('subreddits').update({ show_real_names: showReal }).eq('id', subId);
    if (error) alert("Error updating name settings: " + error.message);
    loadSubsparks(); // Refresh UI instantly
};

// 3. Sub-Spark Lock/Unlock Toggle
window.toggleSubredditLock = async function(subId, isOpen) {
    const isLocked = !isOpen; // If switch is ON (Open), locked is false.
    const { error } = await sb.from('subreddits').update({ is_locked: isLocked }).eq('id', subId);
    if (error) alert("Error updating lock status: " + error.message);
    loadSubsparks(); // Refresh UI instantly
};



// ================= SUB-SPARKS MANAGEMENT =================

async function loadSubsparks() {
    const container = document.getElementById('subsparksList');
    container.innerHTML = '<div style="text-align:center; padding: 20px; color: #666;">Loading communities...</div>';
    
    // Fetch Global Override
    const { data: globalData } = await sb.from('teacher_settings')
        .select('setting_value')
        .eq('setting_key', 'mask_all_names')
        .single();
    
    const globalMaskAll = globalData ? (globalData.setting_value === 'true' || globalData.setting_value === true) : false;
    
    const globalToggle = document.getElementById('globalNameToggle');
    if (globalToggle) {
        globalToggle.checked = globalMaskAll;
        const statusText = document.getElementById('globalOverrideStatus');
        if (statusText) {
            statusText.innerText = globalMaskAll ? 'Override ON (All Names Masked)' : 'Override OFF (Deferring to Sub-Sparks)';
            statusText.style.color = globalMaskAll ? '#c62828' : '#666';
        }
    }

    // Fetch all sub-sparks
    const { data: subs, error } = await sb.from('subreddits').select('*').order('name');
    if (error) {
        container.innerHTML = `<div style="color:red; padding: 20px;">Error: ${error.message}</div>`;
        return;
    }
    
    if (!subs || subs.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 20px; border: 1px solid #eee; border-radius: 8px; background: white;">No sub-sparks created yet.</div>';
        return;
    }
    
    let html = `
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 15px; background: #f0f7ff; padding: 15px 20px; border-radius: 8px 8px 0 0; border: 1px solid #ccc; border-bottom: none; font-weight: 700; color: #333; align-items: center;">
            <div>Community Name</div>
            <div style="text-align: center;">Allow New Posts</div>
            <div style="text-align: center;">Name Display</div>
        </div>
        <div style="border: 1px solid #ccc; border-radius: 0 0 8px 8px; background: white; overflow: hidden;">
    `;
    
    subs.forEach((sub, index) => {
        // Individual toggle logic
        const effectiveSetting = sub.show_real_names !== null ? sub.show_real_names : false;
        const isLocked = sub.is_locked || false; 
        const borderBottom = index < subs.length - 1 ? 'border-bottom: 1px solid #eee;' : '';
        
        html += `
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 15px; padding: 15px 20px; align-items: center; ${borderBottom} transition: background 0.2s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                <div style="font-weight: 600; font-size: 1.1rem; color: #0079D3;">r/${escapeHtml(sub.name)}</div>
                
                <div style="display: flex; justify-content: center; align-items: center; gap: 12px;">
                    <label class="toggle-switch" title="Toggle posting permissions">
                        <input type="checkbox" ${!isLocked ? 'checked' : ''} onchange="toggleSubredditLock('${sub.id}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                    <span style="font-size: 0.9rem; font-weight: 600; width: 50px; color: ${!isLocked ? '#2e7d32' : '#c62828'};">${!isLocked ? 'Open' : 'Closed'}</span>
                </div>
                
                <div style="display: flex; justify-content: center; align-items: center; gap: 12px;">
                    <label class="toggle-switch" title="Toggle real names vs pseudonyms">
                        <input type="checkbox" ${effectiveSetting ? 'checked' : ''} onchange="toggleSubredditNames('${sub.id}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                    <span style="font-size: 0.9rem; font-weight: 600; width: 50px; color: ${effectiveSetting ? '#2e7d32' : '#666'};">${effectiveSetting ? 'Real' : 'Anon'}</span>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
}

// Function to handle "Open/Closed" toggle
window.toggleSubredditLock = async function(subId, isOpen) {
    const isLocked = !isOpen; // If switch is ON (isOpen), locked is false.
    const { error } = await sb.from('subreddits').update({ is_locked: isLocked }).eq('id', subId);
    if (error) alert("Error updating lock status: " + error.message);
    loadSubsparks(); // Refresh UI instantly
}

// Function to handle "Real/Anon" toggle
window.toggleSubredditNames = async function(subId, showReal) {
    const { error } = await sb.from('subreddits').update({ show_real_names: showReal }).eq('id', subId);
    if (error) alert("Error updating name settings: " + error.message);
    loadSubsparks(); // Refresh UI instantly
}

// Helper for escaping HTML safely
function escapeHtml(unsafe) {
    return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}


// ========================================
// AURA GAMIFICATION SETTINGS
// ========================================

async function loadAuraSettings() {
    if (!currentUser) return;
    
    // Fetch settings from Supabase
    const { data, error } = await sb.from('aura_settings').select('*').eq('teacher_id', currentUser.id).single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 just means no rows exist yet, which is fine!
        console.error('Error loading Aura settings:', error);
        return;
    }

    if (data) {
        // Set Positive Factors
        setSliderValue('aura_post', 'val_post', data.points_per_post, '+');
        setSliderValue('aura_comment', 'val_comment', data.points_per_comment, '+');
        setSliderValue('aura_vote_cast', 'val_vote_cast', data.points_per_vote_cast, '+');
        setSliderValue('aura_upvote_rec', 'val_upvote_rec', data.points_per_upvote_received, '+');
        setSliderValue('aura_flag_upheld', 'val_flag_upheld', data.points_for_flag_upheld, '+');
        
        // Set Negative Factors
        setSliderValue('aura_downvote_rec', 'val_downvote_rec', data.points_per_downvote_received, '');
        setSliderValue('aura_flagged', 'val_flagged', data.points_for_flagged_content, '');
        setSliderValue('aura_false_flag', 'val_false_flag', data.points_for_false_flag, '');
        
        // Set Inactivity Mechanics
        document.getElementById('aura_inactivity_days').value = data.inactivity_days_threshold || 7;
        setSliderValue('aura_inactivity_pen', 'val_inactivity_pen', data.points_inactivity_penalty, '');
        document.getElementById('aura_max_penalty').value = data.max_inactivity_penalty || -50;
    }
}

// Helper to update slider UI
function setSliderValue(sliderId, textId, value, prefix) {
    if (value === undefined || value === null) return;
    const slider = document.getElementById(sliderId);
    const text = document.getElementById(textId);
    if (slider && text) {
        slider.value = value;
        text.innerText = prefix + value;
    }
}

window.saveAuraSettings = async function() {
    if (!currentUser) return;
    
    const btn = document.getElementById('saveAuraBtn');
    const status = document.getElementById('auraSaveStatus');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    // Gather all values
    const payload = {
        teacher_id: currentUser.id,
        points_per_post: parseInt(document.getElementById('aura_post').value),
        points_per_comment: parseInt(document.getElementById('aura_comment').value),
        points_per_vote_cast: parseInt(document.getElementById('aura_vote_cast').value),
        points_per_upvote_received: parseInt(document.getElementById('aura_upvote_rec').value),
        points_for_flag_upheld: parseInt(document.getElementById('aura_flag_upheld').value),
        
        points_per_downvote_received: parseInt(document.getElementById('aura_downvote_rec').value),
        points_for_flagged_content: parseInt(document.getElementById('aura_flagged').value),
        points_for_false_flag: parseInt(document.getElementById('aura_false_flag').value),
        
        inactivity_days_threshold: parseInt(document.getElementById('aura_inactivity_days').value),
        points_inactivity_penalty: parseInt(document.getElementById('aura_inactivity_pen').value),
        max_inactivity_penalty: parseInt(document.getElementById('aura_max_penalty').value)
    };

    // Upsert means "Update if it exists, Insert if it doesn't"
    const { error } = await sb.from('aura_settings').upsert(payload, { onConflict: 'teacher_id' });

    btn.textContent = 'Save Aura Settings';
    btn.disabled = false;

    if (error) {
        alert('Error saving settings: ' + error.message);
    } else {
        status.style.display = 'inline';
        setTimeout(() => { status.style.display = 'none'; }, 3000); // Hide success message after 3 seconds
    }
};


// ========================================
// AURA LOG VIEWER
// ========================================

// Load all students for aura log dropdown
async function loadAuraLogStudents() {
    const select = document.getElementById('auraLogStudentSelect');
    if (!select) return;
    
    // Get all students who have user_stats
    const { data: students } = await sb
        .from('user_stats')
        .select('id, profiles!inner(email)')
        .order('profiles(email)');
    
    select.innerHTML = '<option value="">-- Select a Student --</option>';
    
    if (students) {
        students.forEach(s => {
            const option = document.createElement('option');
            option.value = s.id;
            option.textContent = s.profiles.email.split('@')[0];
            select.appendChild(option);
        });
    }
}

// Load selected student's aura log
window.loadStudentAuraLog = async function() {
    const studentId = document.getElementById('auraLogStudentSelect').value;
    const container = document.getElementById('auraLogList');
    const totalDisplay = document.getElementById('auraTotalPoints');
    
    if (!studentId) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">Select a student to view their aura history</p>';
        totalDisplay.textContent = '0';
        return;
    }
    
    container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Loading...</p>';
    
    // Get aura log for this student
    const { data: logs, error } = await sb
        .from('aura_log')
        .select('*')
        .eq('user_id', studentId)
        .order('created_at', { ascending: false });
    
    if (error) {
        container.innerHTML = '<p style="color: red; text-align: center;">Error loading log: ' + error.message + '</p>';
        console.error(error);
        return;
    }
    
    if (!logs || logs.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No actions recorded yet</p>';
        totalDisplay.textContent = '0';
        return;
    }
    
    // Calculate total
    const total = logs.reduce((sum, log) => sum + (log.points_awarded || 0), 0);
    totalDisplay.textContent = total;
    
    // Render log entries
    container.innerHTML = '';
    logs.forEach(log => {
        const div = document.createElement('div');
        const pointsColor = log.points_awarded > 0 ? '#4caf50' : '#f44336';
        const pointsPrefix = log.points_awarded > 0 ? '+' : '';
        const borderColor = log.points_awarded > 0 ? '#4caf50' : '#f44336';
        
        div.style.cssText = `padding: 15px; margin-bottom: 10px; background: #f8f9fa; border-left: 4px solid ${borderColor}; border-radius: 4px;`;
        
        const actionLabel = formatActionType(log.action_type);
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                    <strong style="font-size: 1.05rem; color: #333;">${actionLabel}</strong>
                    <div style="font-size: 0.85rem; color: #666; margin-top: 3px;">
                        ${new Date(log.created_at).toLocaleString()}
                    </div>
                    ${log.notes ? `<div style="margin-top: 5px; font-size: 0.9rem; color: #555; font-style: italic;">${log.notes}</div>` : ''}
                </div>
                <div style="font-size: 1.4rem; font-weight: 700; color: ${pointsColor}; margin-left: 20px;">
                    ${pointsPrefix}${log.points_awarded}
                </div>
            </div>
        `;
        container.appendChild(div);
    });
};

function formatActionType(type) {
    const labels = {
        'post_created': '📝 Created a Post',
        'comment_created': '💬 Posted a Comment',
        'vote_cast': '👍 Cast a Vote',
        'upvote_received': '⬆️ Received an Upvote',
        'downvote_received': '⬇️ Received a Downvote',
        'flag_upheld': '🏆 Flag Upheld',
        'flagged_content': '⚠️ Content Flagged',
        'false_flag': '❌ False Flag Penalty'
    };
    return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

