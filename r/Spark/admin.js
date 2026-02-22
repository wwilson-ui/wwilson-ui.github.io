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
    
    if (tab === 'assignments') {
        loadAssignmentBuilder();
    } else if (tab === 'subsparks') {
        loadSubsparks();
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
// NAME MASKING CONTROLS
// ========================================

window.toggleGlobalNames = async function(showReal) {
    const { error } = await sb.from('teacher_scoring_config').upsert({
        teacher_id: currentUser.id,
        global_show_real_names: showReal
    }, { onConflict: 'teacher_id' });
    
    if (error) {
        alert('Error: ' + error.message);
        return;
    }
    
    document.getElementById('globalNameStatusText').textContent = showReal ? 'Real names visible' : 'Anonymous names';
    alert('✅ Setting updated! Students will see changes within 5 seconds.');
};

window.toggleSubredditNames = async function(subredditId, showReal) {
    const { error } = await sb.from('subreddits').update({ show_real_names: showReal }).eq('id', subredditId);
    if (error) {
        alert('Error: ' + error.message);
        return;
    }
    alert('✅ Updated!');
    loadSubsparks();
};

async function loadSubsparks() {
    const container = document.getElementById('subsparksList');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align:center; padding:40px;">Loading...</div>';
    
    const { data: config } = await sb.from('teacher_scoring_config').select('global_show_real_names').eq('teacher_id', currentUser.id).single();
    const globalSetting = config?.global_show_real_names || false;
    
    const globalToggle = document.getElementById('globalNameToggle');
    if (globalToggle) globalToggle.checked = globalSetting;
    const statusText = document.getElementById('globalNameStatusText');
    if (statusText) statusText.textContent = globalSetting ? 'Real names visible' : 'Anonymous names';
    
    const { data: subs, error } = await sb.from('subreddits').select('*').eq('teacher_id', currentUser.id).order('name');
    
    if (error) {
        container.innerHTML = '<div style="color:red;">Error loading</div>';
        return;
    }
    
    if (!subs || subs.length === 0) {
        container.innerHTML = '<div style="color:#999; padding:40px; text-align:center;">No sub-sparks yet</div>';
        return;
    }
    
    container.innerHTML = '';
    subs.forEach(sub => {
        const card = document.createElement('div');
        card.style.cssText = 'background: white; padding: 20px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #ccc;';
        
        const subSetting = sub.show_real_names;
        const effectiveSetting = subSetting !== null ? subSetting : globalSetting;
        const isOverridden = subSetting !== null;
        
        card.innerHTML = `
            <h3 style="margin-bottom: 10px;">r/${sub.name}</h3>
            <div style="border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px;">
                <h4 style="font-size: 0.95rem; margin-bottom: 10px;">🎭 Name Display</h4>
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                    <input type="checkbox" ${effectiveSetting ? 'checked' : ''} onchange="toggleSubredditNames('${sub.id}', this.checked)" style="width: 18px; height: 18px; cursor: pointer;">
                    <span>Show real names</span>
                </label>
                <div style="margin-top: 8px; font-size: 0.85em; color: #666;">
                    ${isOverridden ? '<span style="color: #ff8800; font-weight: 600;">⚠️ Overriding global</span>' : `<span>Using global (${globalSetting ? 'real' : 'anon'})</span>`}
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}
