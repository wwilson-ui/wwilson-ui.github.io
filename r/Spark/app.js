let sb, user, subs = [], sort = 'hot', current = null;

window.addEventListener('load', async () => {
    await new Promise(r => setTimeout(r, 800));
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    document.getElementById('signInBtn').onclick = () => {
        sb.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: 'https://wwilson-ui.github.io/r/Spark/' }
        });
    };
    
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
            user = profile;
            const displayName = user.role === 'teacher' ? user.username + ' (Teacher)' : user.display_name;
            document.getElementById('authSection').innerHTML = `
                <div class="user-badge">
                    <div class="user-info">
                        <div class="user-avatar">${displayName[0].toUpperCase()}</div>
                        <div>
                            <div style="font-weight:600">${displayName}</div>
                            <div style="font-size:0.8rem;color:var(--text-muted)">${user.role}</div>
                        </div>
                    </div>
                    <button class="btn-logout" onclick="sb.auth.signOut()">Sign Out</button>
                </div>
            `;
            document.getElementById('createPostBtn').style.display = 'block';
            if (user.role === 'teacher') document.getElementById('createSubredditBtn').style.display = 'block';
        }
    }
    
    sb.auth.onAuthStateChange((e) => { if (e === 'SIGNED_OUT') location.reload(); });
    
    await loadSubs();
    await loadPosts();
    setup();
});

async function loadSubs() {
    const { data } = await sb.from('subreddits').select('*').order('name');
    subs = data || [];
    const list = document.getElementById('subredditsList');
    list.innerHTML = `
        <div class="subreddit-item ${!current ? 'active' : ''}" onclick="filter(null)">All Posts</div>
        ${subs.map(s => `<div class="subreddit-item ${current?.id === s.id ? 'active' : ''}" onclick="filter('${s.id}')">${s.name}</div>`).join('')}
    `;
    document.getElementById('postSubreddit').innerHTML = subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

window.filter = (id) => {
    current = id ? subs.find(s => s.id === id) : null;
    document.getElementById('feedTitle').textContent = current ? current.name : 'All Posts';
    loadPosts();
    loadSubs();
};

async function loadPosts() {
    let q = sb.from('posts').select('*, profiles!posts_user_id_fkey(username, display_name, role), subreddits(name)');
    if (current) q = q.eq('subreddit_id', current.id);
    q = sort === 'new' ? q.order('created_at', { ascending: false }) : q.order('vote_count', { ascending: false });
    const { data: posts } = await q;
    
    const container = document.getElementById('postsContainer');
    if (!posts || posts.length === 0) {
        container.innerHTML = '<div class="empty"><h3>No posts yet</h3></div>';
        return;
    }
    
    // Render each post with comments inline
    for (const p of posts) {
        const { data: votes } = await sb.from('votes').select('vote_type').eq('post_id', p.id).eq('user_id', user?.id);
        const v = votes?.[0]?.vote_type || 0;
        const del = user && (user.role === 'teacher' || user.id === p.user_id);
        
        // Get comments for this post
        const { data: comments } = await sb.from('comments').select('*, profiles!comments_user_id_fkey(username, display_name, role)').eq('post_id', p.id).order('created_at');
        
        const displayName = user?.role === 'teacher' ? p.profiles.username : p.profiles.display_name;
        const showRealName = user?.role === 'teacher' ? `<span class="comment-real-name">(${p.profiles.username})</span>` : '';
        
        container.innerHTML += `
            <div class="post-card" id="post-${p.id}">
                <div class="vote-section">
                    <button class="vote-btn ${v === 1 ? 'upvoted' : ''}" onclick="vote('${p.id}', 1, 'post')" ${!user ? 'disabled' : ''}>▲</button>
                    <div class="vote-count">${p.vote_count || 0}</div>
                    <button class="vote-btn ${v === -1 ? 'downvoted' : ''}" onclick="vote('${p.id}', -1, 'post')" ${!user ? 'disabled' : ''}>▼</button>
                </div>
                <div class="post-content">
                    <div class="post-meta">${p.subreddits.name} • ${displayName} ${showRealName} • ${ago(p.created_at)}</div>
                    <h3 class="post-title">${esc(p.title)}</h3>
                    ${p.content ? `<div class="post-text">${esc(p.content)}</div>` : ''}
                    ${p.url ? `<div class="post-text"><a href="${p.url}" target="_blank">${p.url}</a></div>` : ''}
                    <div class="post-actions">
                        <button class="action-btn" onclick="toggleComments('${p.id}')">💬 ${p.comment_count || 0} Comments</button>
                        ${del ? `<button class="action-btn" onclick="del('post','${p.id}')">🗑️ Delete</button>` : ''}
                    </div>
                    <div class="comments-section" id="comments-${p.id}" style="display:none">
                        ${user ? `
                            <textarea class="comment-input" id="new-comment-${p.id}" placeholder="Add a comment"></textarea>
                            <button class="btn-primary" onclick="addComment('${p.id}', null)" style="margin-top:0.5rem">Comment</button>
                        ` : '<p style="color:var(--text-muted);margin-top:1rem">Sign in to comment</p>'}
                        <div style="margin-top:1rem">${renderComments(comments?.filter(c => !c.parent_comment_id) || [], comments || [], p.id)}</div>
                    </div>
                </div>
            </div>
        `;
    }
}

window.toggleComments = (postId) => {
    const section = document.getElementById(`comments-${postId}`);
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
};

window.toggleCollapse = (commentId) => {
    const body = document.getElementById(`body-${commentId}`);
    const nested = document.getElementById(`nested-${commentId}`);
    const btn = document.getElementById(`collapse-${commentId}`);
    
    if (body.classList.contains('collapsed')) {
        body.classList.remove('collapsed');
        if (nested) nested.style.display = 'block';
        btn.textContent = '[-]';
    } else {
        body.classList.add('collapsed');
        if (nested) nested.style.display = 'none';
        btn.textContent = '[+]';
    }
};

function renderComments(comments, all, postId) {
    if (comments.length === 0) return '<p style="color:var(--text-muted);margin-top:1rem">No comments yet</p>';
    return comments.map(c => {
        const replies = all.filter(r => r.parent_comment_id === c.id);
        const del = user && (user.role === 'teacher' || user.id === c.user_id);
        const displayName = user?.role === 'teacher' ? c.profiles.username : c.profiles.display_name;
        const showRealName = user?.role === 'teacher' ? `<span class="comment-real-name">(${c.profiles.username})</span>` : '';
        
        return `
            <div class="comment">
                <div class="comment-header">
                    <button class="collapse-btn" id="collapse-${c.id}" onclick="toggleCollapse('${c.id}')">[-]</button>
                    <span class="comment-author">${displayName}</span>
                    ${showRealName}
                    <span class="comment-time">${ago(c.created_at)}</span>
                </div>
                <div class="comment-body" id="body-${c.id}">
                    <div>${esc(c.content)}</div>
                    <div class="comment-actions">
                        ${user ? `<button class="action-btn" onclick="toggleReply('${c.id}')">Reply</button>` : ''}
                        ${del ? `<button class="action-btn" onclick="del('comment','${c.id}','${postId}')">Delete</button>` : ''}
                    </div>
                    <div class="reply-form" id="reply-${c.id}">
                        <textarea class="comment-input" id="text-${c.id}" placeholder="Write a reply"></textarea>
                        <button class="btn-primary" onclick="addComment('${postId}','${c.id}')" style="margin-top:0.5rem">Reply</button>
                    </div>
                </div>
                ${replies.length > 0 ? `<div class="nested-comments" id="nested-${c.id}">${renderComments(replies, all, postId)}</div>` : ''}
            </div>
        `;
    }).join('');
}

window.vote = async (id, type, target) => {
    if (!user) return alert('Sign in to vote');
    const col = target === 'post' ? 'post_id' : 'comment_id';
    const { data: existing } = await sb.from('votes').select('*').eq('user_id', user.id).eq(col, id).single();
    if (existing) {
        if (existing.vote_type === type) {
            await sb.from('votes').delete().eq('id', existing.id);
        } else {
            await sb.from('votes').update({ vote_type: type }).eq('id', existing.id);
        }
    } else {
        await sb.from('votes').insert([{ user_id: user.id, [col]: id, vote_type: type }]);
    }
    document.getElementById('postsContainer').innerHTML = '';
    loadPosts();
};

window.del = async (type, id, postId) => {
    if (!confirm('Delete this ' + type + '?')) return;
    await sb.from(type === 'post' ? 'posts' : 'comments').delete().eq('id', id);
    document.getElementById('postsContainer').innerHTML = '';
    loadPosts();
};

window.addComment = async (postId, parentId) => {
    const textId = parentId ? `text-${parentId}` : `new-comment-${postId}`;
    const text = document.getElementById(textId).value.trim();
    if (!text) return;
    await sb.from('comments').insert([{ post_id: postId, parent_comment_id: parentId, user_id: user.id, content: text }]);
    document.getElementById('postsContainer').innerHTML = '';
    loadPosts();
    setTimeout(() => {
        document.getElementById(`comments-${postId}`).style.display = 'block';
    }, 100);
};

window.toggleReply = (id) => {
    const form = document.getElementById(`reply-${id}`);
    form.classList.toggle('active');
};

function setup() {
    document.getElementById('createSubredditBtn').onclick = () => document.getElementById('subredditModal').classList.add('active');
    document.getElementById('subredditForm').onsubmit = async (e) => {
        e.preventDefault();
        await sb.from('subreddits').insert([{
            name: document.getElementById('subredditName').value.trim().toLowerCase(),
            description: document.getElementById('subredditDesc').value.trim(),
            created_by: user.id
        }]);
        closeModal('subredditModal');
        e.target.reset();
        loadSubs();
    };
    
    document.getElementById('createPostBtn').onclick = () => document.getElementById('postModal').classList.add('active');
    
    document.getElementById('postForm').onsubmit = async (e) => {
        e.preventDefault();
        const content = document.getElementById('postContent').value.trim();
        const url = document.getElementById('postUrl').value.trim();
        
        await sb.from('posts').insert([{
            subreddit_id: document.getElementById('postSubreddit').value,
            user_id: user.id,
            title: document.getElementById('postTitle').value.trim(),
            content: content || null,
            post_type: url ? 'link' : 'text',
            url: url || null
        }]);
        closeModal('postModal');
        e.target.reset();
        document.getElementById('postsContainer').innerHTML = '';
        loadPosts();
    };
    
    document.querySelectorAll('.sort-btn').forEach(b => b.onclick = () => {
        document.querySelectorAll('.sort-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        sort = b.dataset.sort;
        document.getElementById('postsContainer').innerHTML = '';
        loadPosts();
    });
    
    document.querySelectorAll('.modal').forEach(m => m.onclick = (e) => {
        if (e.target === m) m.classList.remove('active');
    });
}

window.closeModal = (id) => document.getElementById(id).classList.remove('active');

function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function ago(t) {
    const s = Math.floor((new Date() - new Date(t)) / 1000);
    const i = { year: 31536000, month: 2592000, week: 604800, day: 86400, hour: 3600, minute: 60 };
    for (const [u, v] of Object.entries(i)) {
        const n = Math.floor(s / v);
        if (n >= 1) return `${n} ${u}${n > 1 ? 's' : ''} ago`;
    }
    return 'just now';
}
