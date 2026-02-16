let sb, user, subs = [], sort = 'hot', current = null;

window.addEventListener('load', async () => {
    await new Promise(r => setTimeout(r, 800));
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Sign in button
    document.getElementById('signInBtn').onclick = () => {
        sb.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: 'https://wwilson-ui.github.io/r/Spark/' }
        });
    };
    
    // Check session
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
            user = profile;
            document.getElementById('authSection').innerHTML = `
                <div class="user-badge">
                    <div class="user-info">
                        <div class="user-avatar">${user.username[0].toUpperCase()}</div>
                        <div>
                            <div style="font-weight:600">${user.username}</div>
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
    let q = sb.from('posts').select('*, profiles!posts_user_id_fkey(username), subreddits(name)');
    if (current) q = q.eq('subreddit_id', current.id);
    q = sort === 'new' ? q.order('created_at', { ascending: false }) : q.order('vote_count', { ascending: false });
    const { data } = await q;
    
    const container = document.getElementById('postsContainer');
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty"><h3>No posts yet</h3></div>';
        return;
    }
    
    container.innerHTML = data.map(p => {
        const { data: votes } = sb.from('votes').select('vote_type').eq('post_id', p.id).eq('user_id', user?.id);
        const v = votes?.[0]?.vote_type || 0;
        const del = user && (user.id === p.user_id || user.role === 'teacher');
        return `
            <div class="post-card">
                <div class="vote-section">
                    <button class="vote-btn ${v === 1 ? 'upvoted' : ''}" onclick="vote('${p.id}', 1, 'post')" ${!user ? 'disabled' : ''}>▲</button>
                    <div class="vote-count">${p.vote_count || 0}</div>
                    <button class="vote-btn ${v === -1 ? 'downvoted' : ''}" onclick="vote('${p.id}', -1, 'post')" ${!user ? 'disabled' : ''}>▼</button>
                </div>
                <div class="post-content">
                    <div class="post-meta">${p.subreddits.name} • ${p.profiles.username} • ${ago(p.created_at)}</div>
                    <h3 class="post-title" onclick="openPost('${p.id}')">${esc(p.title)}</h3>
                    ${p.content ? `<div class="post-text">${esc(p.content.substring(0, 300))}${p.content.length > 300 ? '...' : ''}</div>` : ''}
                    ${p.url ? `<div class="post-text"><a href="${p.url}" target="_blank">${p.url}</a></div>` : ''}
                    <div class="post-actions">
                        <button class="action-btn" onclick="openPost('${p.id}')">💬 ${p.comment_count || 0}</button>
                        ${del ? `<button class="action-btn" onclick="del('post','${p.id}')">🗑️</button>` : ''}
                    </div>
                </div>
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
    loadPosts();
};

window.del = async (type, id) => {
    if (!confirm('Delete?')) return;
    await sb.from(type === 'post' ? 'posts' : 'comments').delete().eq('id', id);
    if (type === 'post') loadPosts(); else openPost(document.querySelector('.modal.active').dataset.postId);
};

window.openPost = async (id) => {
    const { data: post } = await sb.from('posts').select('*, profiles!posts_user_id_fkey(username), subreddits(name)').eq('id', id).single();
    const { data: comments } = await sb.from('comments').select('*, profiles!comments_user_id_fkey(username)').eq('post_id', id).order('created_at');
    
    const modal = document.getElementById('commentModal');
    modal.dataset.postId = id;
    const del = user && (user.id === post.user_id || user.role === 'teacher');
    
    document.getElementById('postDetail').innerHTML = `
        <div class="post-meta">${post.subreddits.name} • ${post.profiles.username} • ${ago(post.created_at)}</div>
        <h2 class="post-title">${esc(post.title)}</h2>
        ${post.content ? `<div class="post-text">${esc(post.content)}</div>` : ''}
        ${post.url ? `<div class="post-text"><a href="${post.url}" target="_blank">${post.url}</a></div>` : ''}
        ${del ? `<button class="action-btn" onclick="del('post','${post.id}');closeModal('commentModal')">🗑️ Delete</button>` : ''}
        <h3 style="margin:2rem 0 1rem">Comments</h3>
        ${user ? `
            <textarea class="comment-input" id="newComment" placeholder="Share your thoughts"></textarea>
            <button class="btn-primary" onclick="addComment('${id}', null)" style="margin-top:0.5rem">Comment</button>
        ` : '<p style="color:var(--text-muted)">Sign in to comment</p>'}
        <div style="margin-top:1.5rem">${renderComments(comments?.filter(c => !c.parent_comment_id) || [], comments || [], id)}</div>
    `;
    modal.classList.add('active');
};

function renderComments(comments, all, postId) {
    if (comments.length === 0) return '<p style="color:var(--text-muted)">No comments yet</p>';
    return comments.map(c => {
        const replies = all.filter(r => r.parent_comment_id === c.id);
        const del = user && (user.id === c.user_id || user.role === 'teacher');
        return `
            <div class="comment">
                <div class="comment-header">
                    <span class="comment-author">${c.profiles.username}</span>
                    <span class="comment-time">${ago(c.created_at)}</span>
                </div>
                <div>${esc(c.content)}</div>
                <div class="comment-actions">
                    ${user ? `<button class="action-btn" onclick="reply('${c.id}')">Reply</button>` : ''}
                    ${del ? `<button class="action-btn" onclick="del('comment','${c.id}')">Delete</button>` : ''}
                </div>
                <div id="reply-${c.id}" style="display:none;margin-top:0.5rem">
                    <textarea class="comment-input" id="text-${c.id}"></textarea>
                    <button class="btn-primary" onclick="addComment('${postId}','${c.id}')" style="margin-top:0.5rem">Reply</button>
                </div>
                ${replies.length > 0 ? `<div class="nested-comments">${renderComments(replies, all, postId)}</div>` : ''}
            </div>
        `;
    }).join('');
}

window.addComment = async (postId, parentId) => {
    const text = document.getElementById(parentId ? `text-${parentId}` : 'newComment').value.trim();
    if (!text) return;
    await sb.from('comments').insert([{ post_id: postId, parent_comment_id: parentId, user_id: user.id, content: text }]);
    openPost(postId);
};

window.reply = (id) => {
    const el = document.getElementById(`reply-${id}`);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.closeModal = (id) => document.getElementById(id).classList.remove('active');

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
    document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const type = t.dataset.type;
        document.getElementById('postContent').style.display = type === 'text' ? 'block' : 'none';
        document.getElementById('postUrl').style.display = type !== 'text' ? 'block' : 'none';
    });
    
    document.getElementById('postForm').onsubmit = async (e) => {
        e.preventDefault();
        const type = document.querySelector('.tab.active').dataset.type;
        await sb.from('posts').insert([{
            subreddit_id: document.getElementById('postSubreddit').value,
            user_id: user.id,
            title: document.getElementById('postTitle').value.trim(),
            content: type === 'text' ? document.getElementById('postContent').value.trim() : null,
            post_type: type,
            url: type !== 'text' ? document.getElementById('postUrl').value.trim() : null
        }]);
        closeModal('postModal');
        e.target.reset();
        loadPosts();
    };
    
    document.querySelectorAll('.sort-btn').forEach(b => b.onclick = () => {
        document.querySelectorAll('.sort-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        sort = b.dataset.sort;
        loadPosts();
    });
    
    document.querySelectorAll('.modal').forEach(m => m.onclick = (e) => {
        if (e.target === m) m.classList.remove('active');
    });
}

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
