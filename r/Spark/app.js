let sb, user, subs = [], sort = 'hot', current = null;

window.addEventListener('load', async () => {
    await new Promise(r => setTimeout(r, 1000));
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const signInBtn = document.getElementById('signInBtn');
    signInBtn.onclick = async () => {
        await sb.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: 'https://wwilson-ui.github.io/r/Spark/' }
        });
    };
    
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
            user = profile;
            const initial = user.display_name[0];
            document.getElementById('authSection').innerHTML = `
                <div class="user-badge">
                    <div class="user-info">
                        <div class="user-avatar">${initial}</div>
                        <div>
                            <div style="font-weight:600">${user.display_name}</div>
                            ${user.role === 'teacher' ? '<span class="teacher-badge">Teacher</span>' : ''}
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
    let q = sb.from('posts').select('*, profiles!posts_user_id_fkey(username, display_name), subreddits(name)');
    if (current) q = q.eq('subreddit_id', current.id);
    q = sort === 'new' ? q.order('created_at', { ascending: false }) : q.order('vote_count', { ascending: false });
    const { data } = await q;
    
    const container = document.getElementById('postsContainer');
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty"><h3>No posts yet</h3></div>';
        return;
    }
    
    container.innerHTML = await Promise.all(data.map(async p => {
        const { data: votes } = await sb.from('votes').select('vote_type').eq('post_id', p.id).eq('user_id', user?.id || '');
        const v = votes?.[0]?.vote_type || 0;
        const canDelete = user && (user.id === p.user_id || user.role === 'teacher');
        const authorDisplay = user?.role === 'teacher' ? `${p.profiles.display_name} (${p.profiles.username})` : p.profiles.display_name;
        
        return `
            <div class="post-card">
                <div class="post-header">
                    <div class="vote-section">
                        <button class="vote-btn ${v === 1 ? 'upvoted' : ''}" onclick="vote('${p.id}', 1, 'post')" ${!user ? 'disabled' : ''}>▲</button>
                        <div class="vote-count">${p.vote_count || 0}</div>
                        <button class="vote-btn ${v === -1 ? 'downvoted' : ''}" onclick="vote('${p.id}', -1, 'post')" ${!user ? 'disabled' : ''}>▼</button>
                    </div>
                    <div class="post-content">
                        <div class="post-meta">${p.subreddits.name} • ${authorDisplay} • ${ago(p.created_at)}</div>
                        <h3 class="post-title">${esc(p.title)}</h3>
                        ${p.content ? `<div class="post-text">${esc(p.content)}</div>` : ''}
                        ${p.link_url ? `<div class="post-link"><a href="${esc(p.link_url)}" target="_blank" rel="noopener">🔗 ${esc(p.link_url)}</a></div>` : ''}
                        ${p.image_url ? `<div class="post-image"><img src="${esc(p.image_url)}" alt="Post image" loading="lazy"></div>` : ''}
                        <div class="post-actions">
                            <button class="comments-toggle" onclick="toggleComments('${p.id}')" data-post-id="${p.id}">
                                💬 ${p.comment_count || 0} Comments
                            </button>
                            ${canDelete ? `<button class="action-btn danger" onclick="deletePost('${p.id}')">🗑️ Delete</button>` : ''}
                        </div>
                        <div id="comments-${p.id}" class="comments-container"></div>
                    </div>
                </div>
            </div>
        `;
    })).then(html => html.join(''));
}

window.toggleComments = async (postId) => {
    const container = document.getElementById(`comments-${postId}`);
    const btn = document.querySelector(`[data-post-id="${postId}"]`);
    
    if (container.classList.contains('visible')) {
        container.classList.remove('visible');
        btn.classList.remove('expanded');
    } else {
        const { data: comments } = await sb.from('comments').select('*, profiles!comments_user_id_fkey(username, display_name)').eq('post_id', postId).order('created_at');
        container.innerHTML = `
            ${user ? `
                <div style="margin: 1rem 0">
                    <textarea class="comment-input" id="newComment-${postId}" placeholder="Share your thoughts"></textarea>
                    <button class="btn-primary" onclick="addComment('${postId}', null)" style="margin-top:0.5rem">Comment</button>
                </div>
            ` : '<p style="color:var(--text-muted);margin:1rem 0">Sign in to comment</p>'}
            ${renderComments(comments?.filter(c => !c.parent_comment_id) || [], comments || [], postId)}
        `;
        container.classList.add('visible');
        btn.classList.add('expanded');
    }
};

function renderComments(comments, all, postId) {
    if (comments.length === 0) return '<p style="color:var(--text-muted);margin:1rem 0">No comments yet</p>';
    return comments.map(c => {
        const replies = all.filter(r => r.parent_comment_id === c.id);
        const canDelete = user && (user.id === c.user_id || user.role === 'teacher');
        const authorDisplay = user?.role === 'teacher' 
            ? `${c.profiles.display_name} <span class="comment-real-name">(${c.profiles.username})</span>` 
            : c.profiles.display_name;
        
        return `
            <div class="comment">
                <div class="comment-header">
                    <span class="comment-author">${authorDisplay}</span>
                    <span class="comment-time">${ago(c.created_at)}</span>
                </div>
                <div class="comment-text">${esc(c.content)}</div>
                <div class="comment-actions">
                    ${user ? `<button class="action-btn" onclick="showReply('${c.id}')">Reply</button>` : ''}
                    ${canDelete ? `<button class="action-btn danger" onclick="deleteComment('${c.id}', '${postId}')">Delete</button>` : ''}
                </div>
                <div id="reply-${c.id}" class="reply-form">
                    <textarea class="comment-input" id="text-${c.id}" placeholder="Write a reply"></textarea>
                    <button class="btn-primary" onclick="addComment('${postId}','${c.id}')" style="margin-top:0.5rem">Reply</button>
                </div>
                ${replies.length > 0 ? `<div class="nested-comments">${renderComments(replies, all, postId)}</div>` : ''}
            </div>
        `;
    }).join('');
}

window.showReply = (id) => {
    document.getElementById(`reply-${id}`).classList.toggle('visible');
};

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

window.deletePost = async (id) => {
    if (!confirm('Delete this post?')) return;
    await sb.from('posts').delete().eq('id', id);
    loadPosts();
};

window.deleteComment = async (id, postId) => {
    if (!confirm('Delete this comment?')) return;
    await sb.from('comments').delete().eq('id', id);
    toggleComments(postId);
    toggleComments(postId);
};

window.addComment = async (postId, parentId) => {
    const text = document.getElementById(parentId ? `text-${parentId}` : `newComment-${postId}`).value.trim();
    if (!text) return;
    await sb.from('comments').insert([{ post_id: postId, parent_comment_id: parentId, user_id: user.id, content: text }]);
    toggleComments(postId);
    toggleComments(postId);
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
    document.getElementById('postForm').onsubmit = async (e) => {
        e.preventDefault();
        const content = document.getElementById('postContent').value.trim();
        const link = document.getElementById('postLink').value.trim();
        const image = document.getElementById('postImage').value.trim();
        
        if (!content && !link && !image) {
            alert('Please add some content, a link, or an image');
            return;
        }
        
        await sb.from('posts').insert([{
            subreddit_id: document.getElementById('postSubreddit').value,
            user_id: user.id,
            title: document.getElementById('postTitle').value.trim(),
            content: content || null,
            link_url: link || null,
            image_url: image || null
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

function esc(t) { 
    if (!t) return '';
    const d = document.createElement('div'); 
    d.textContent = t; 
    return d.innerHTML; 
}

function ago(t) {
    const s = Math.floor((new Date() - new Date(t)) / 1000);
    const i = { year: 31536000, month: 2592000, week: 604800, day: 86400, hour: 3600, minute: 60 };
    for (const [u, v] of Object.entries(i)) {
        const n = Math.floor(s / v);
        if (n >= 1) return `${n} ${u}${n > 1 ? 's' : ''} ago`;
    }
    return 'just now';
}
