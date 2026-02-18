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
