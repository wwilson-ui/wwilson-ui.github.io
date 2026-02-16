// app.js

let sb = null;
let currentUser = null;
let isTeacher = false;
let currentSubFilter = 'all';
let currentOpenPostId = null; // Tracks which post is open in the modal

const ADJECTIVES = ['Happy', 'Brave', 'Calm', 'Swift', 'Wise', 'Bright', 'Clever', 'Kind', 'Bold'];
const ANIMALS = ['Badger', 'Fox', 'Owl', 'Eagle', 'Bear', 'Dolphin', 'Wolf', 'Hawk', 'Tiger'];

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.supabase !== 'undefined') {
        sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } else {
        alert('Supabase not loaded'); return;
    }

    // Modal Close Logic
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal('createPostModal');
            closeModal('createSubModal');
            closeModal('viewPostModal');
        }
    });

    await checkUser();
    loadSubreddits();
    loadPosts(); 
    setupFormListeners();
});

// ================= AUTH =================
async function checkUser() {
    const { data: { session } } = await sb.auth.getSession();
    const authSection = document.getElementById('authSection');
    const actionBar = document.getElementById('actionBar');

    if (session) {
        const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = profile || { role: 'student', email: session.user.email, id: session.user.id };
        
        if (currentUser.email === 'wwilson@mtps.us') currentUser.role = 'teacher';
        isTeacher = currentUser.role === 'teacher';

        authSection.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center;">
                <div style="text-align:right; line-height:1.2;">
                    <div style="font-weight:bold; font-size:0.9rem;">${currentUser.email.split('@')[0]}</div>
                    <div style="font-size:0.75rem; color:${isTeacher ? '#0079D3' : '#00D9A5'}; font-weight:bold; text-transform:uppercase;">${isTeacher ? 'TEACHER' : 'STUDENT'}</div>
                </div>
                <button class="google-btn" onclick="signOut()" style="padding: 4px 10px; font-size: 0.8rem;">Sign Out</button>
            </div>
        `;
        
        if (actionBar) actionBar.style.display = 'flex';
        const sidebarAddBtn = document.getElementById('sidebarAddBtn');
        if (sidebarAddBtn) sidebarAddBtn.style.display = isTeacher ? 'flex' : 'none';

    } else {
        authSection.innerHTML = `
            <button class="google-btn" onclick="signIn()">
                <img src="https://fonts.gstatic.com/s/i/productlogos/googleg/v6/24px.svg" alt="G" style="width:18px; height:18px;">
                Sign in with Google
            </button>
        `;
        if (actionBar) actionBar.style.display = 'none';
    }
}

async function signIn() {
    await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'https://wwilson-ui.github.io/r/Spark/', queryParams: { hd: 'mtps.us' } }
    });
}

async function signOut() {
    await sb.auth.signOut();
    window.location.reload();
}

// ================= POSTS & FEED =================
async function loadPosts() {
    const feed = document.getElementById('postsFeed');
    feed.innerHTML = '<div style="padding:20px; text-align:center;">Loading...</div>';
    
    let query = sb.from('posts').select(`*, subreddits(name), profiles(email)`).order('created_at', { ascending: false });
    if (currentSubFilter !== 'all') query = query.eq('subreddit_id', currentSubFilter);

    const { data: posts, error } = await query;
    if (error) { feed.innerHTML = 'Error loading posts'; return; }

    feed.innerHTML = '';
    if (posts.length === 0) {
        feed.innerHTML = '<div style="padding:40px; text-align:center; color:#777;">No posts yet. Be the first!</div>';
        return;
    }

    posts.forEach(post => feed.appendChild(createPostElement(post)));
}

function createPostElement(post) {
    const div = document.createElement('div');
    div.className = 'post-card clickable-card'; // Added clickable class
    
    // Anonymity Logic
    const isAuthor = currentUser && currentUser.id === post.user_id;
    const authorName = getAnonName(post.user_id);
    const realIdentity = (isTeacher || isAuthor) ? ` (${post.profiles?.email || 'me'})` : '';

    // We store the full post data on the element so we can open it later
    div.onclick = (e) => {
        // Don't open if they clicked the vote buttons or delete button
        if (e.target.closest('button')) return;
        openPostModal(post, authorName, realIdentity);
    };

    // Teacher Delete Button
    const deleteBtn = isTeacher ? `<button class="delete-icon" onclick="deletePost('${post.id}')">🗑</button>` : '';

    // Feed View: Only Title, Subreddit, Author, Score
    div.innerHTML = `
        <div class="post-header">
            <strong>r/${post.subreddits ? post.subreddits.name : 'Unknown'}</strong>
            <span>•</span>
            <span>Posted by ${authorName} <span style="color:#ff4500; font-size:0.8em;">${realIdentity}</span></span>
            <span style="flex-grow:1"></span>
            ${deleteBtn}
        </div>
        <div class="post-title" style="font-size: 1.1rem; margin-bottom: 5px;">${escapeHtml(post.title)}</div>
        
        <div class="post-footer">
            <button class="vote-btn" onclick="vote('${post.id}', 1)">⬆</button>
            <span>${(post.up_votes || 0) - (post.down_votes || 0)}</span>
            <button class="vote-btn" onclick="vote('${post.id}', -1)">⬇</button>
            <span style="font-weight:normal; font-size:0.8rem; margin-left:10px;">Click to view comments</span>
        </div>
    `;
    return div;
}

// ================= VIEW POST MODAL =================
async function openPostModal(post, authorName, realIdentity) {
    currentOpenPostId = post.id;
    
    // 1. Populate Modal Content
    document.getElementById('viewPostSub').textContent = `r/${post.subreddits ? post.subreddits.name : 'Unknown'}`;
    document.getElementById('viewPostAuthor').innerHTML = `${authorName} <span style="color:#ff4500;">${realIdentity}</span>`;
    document.getElementById('viewPostTitle').textContent = post.title;
    
    const contentDiv = document.getElementById('viewPostContent');
    contentDiv.innerHTML = post.content ? escapeHtml(post.content).replace(/\n/g, '<br>') : '';
    
    const imgEl = document.getElementById('viewPostImage');
    if (post.image_url) { imgEl.src = post.image_url; imgEl.style.display = 'block'; }
    else { imgEl.style.display = 'none'; }
    
    const linkEl = document.getElementById('viewPostLink');
    if (post.url) { linkEl.href = post.url; linkEl.textContent = `🔗 ${post.url}`; linkEl.style.display = 'block'; }
    else { linkEl.style.display = 'none'; }

    // 2. Show Comment Input if logged in
    document.getElementById('commentInputArea').style.display = currentUser ? 'block' : 'none';

    // 3. Load Comments
    loadModalComments(post.id);

    // 4. Open Modal
    document.getElementById('viewPostModal').classList.add('active');
}

async function loadModalComments(postId) {
    const list = document.getElementById('modalCommentsList');
    list.innerHTML = 'Loading comments...';
    
    const { data: comments } = await sb.from('comments')
        .select(`*, profiles(email)`)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

    const tree = buildCommentTree(comments || []);
    renderComments(tree, list);
}

async function submitNewComment() {
    const txt = document.getElementById('newCommentText');
    const content = txt.value.trim();
    if (!content) return;

    const { error } = await sb.from('comments').insert([{
        post_id: currentOpenPostId,
        user_id: currentUser.id,
        content: content
    }]);

    if (error) alert(error.message);
    else {
        txt.value = '';
        loadModalComments(currentOpenPostId); // Refresh comments
    }
}

// ================= HELPERS (Same as before) =================
function buildCommentTree(comments) {
    const map = {}; const roots = [];
    comments.forEach(c => { c.children = []; map[c.id] = c; });
    comments.forEach(c => {
        if (c.parent_id && map[c.parent_id]) map[c.parent_id].children.push(c);
        else roots.push(c);
    });
    return roots;
}

function renderComments(comments, container) {
    container.innerHTML = '';
    if (comments.length === 0) { container.innerHTML = '<div style="color:#999; font-style:italic;">No comments yet.</div>'; return; }

    comments.forEach(c => {
        const div = document.createElement('div');
        div.className = 'comment';
        const authorName = getAnonName(c.user_id);
        const realIdentity = (isTeacher || (currentUser && currentUser.id === c.user_id)) ? `(${c.profiles?.email || 'me'})` : '';
        const deleteBtn = isTeacher ? `<button class="delete-sub-x" onclick="deleteComment('${c.id}')">✕</button>` : '';

        div.innerHTML = `
            <div class="comment-header">
                <strong>${authorName}</strong> <span style="font-size:0.8em; color:#ff4500;">${realIdentity}</span>
                ${deleteBtn}
            </div>
            <div style="margin-top:2px;">${escapeHtml(c.content)}</div>
            <div style="margin-top:5px; font-size:0.8rem; color:#888; cursor:pointer;" onclick="replyToComment('${c.id}', '${authorName}')">Reply</div>
            <div id="reply-box-${c.id}" style="display:none; margin-top:5px;">
                <input type="text" id="reply-input-${c.id}" placeholder="Reply to ${authorName}..." style="width:100%; padding:5px;">
                <button onclick="submitReply('${c.id}')" style="margin-top:5px; padding:2px 8px;">Send</button>
            </div>
            <div id="children-${c.id}" style="margin-left:15px; border-left:2px solid #eee; padding-left:10px;"></div>
        `;
        container.appendChild(div);
        if (c.children.length) renderComments(c.children, div.querySelector(`#children-${c.id}`));
    });
}

function replyToComment(commentId, name) {
    // Only show reply box if logged in
    if (!currentUser) return alert("Please sign in to reply");
    const box = document.getElementById(`reply-box-${commentId}`);
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

async function submitReply(parentId) {
    const input = document.getElementById(`reply-input-${parentId}`);
    const content = input.value.trim();
    if (!content) return;

    const { error } = await sb.from('comments').insert([{
        post_id: currentOpenPostId,
        user_id: currentUser.id,
        content: content,
        parent_id: parentId
    }]);

    if (!error) loadModalComments(currentOpenPostId);
}

// Sidebars & Deletion
async function loadSubreddits() {
    const list = document.getElementById('subredditList');
    const postSelect = document.getElementById('postSubreddit');
    const { data: subs } = await sb.from('subreddits').select('*').order('name');
    
    list.innerHTML = ''; postSelect.innerHTML = '';
    
    // All
    const allLi = document.createElement('li');
    allLi.className = `sub-item ${currentSubFilter === 'all' ? 'active' : ''}`;
    allLi.innerHTML = `<span>r/All</span>`;
    allLi.onclick = () => { currentSubFilter = 'all'; loadSubreddits(); loadPosts(); };
    list.appendChild(allLi);

    if (subs) subs.forEach(sub => {
        // Sidebar
        const li = document.createElement('li');
        li.className = `sub-item ${currentSubFilter === sub.id ? 'active' : ''}`;
        let html = `<span onclick="selectSub('${sub.id}')">r/${sub.name}</span>`;
        if (isTeacher) html += `<span class="delete-sub-x" onclick="deleteSub('${sub.id}', '${sub.name}')">✕</span>`;
        li.innerHTML = html;
        list.appendChild(li);

        // Dropdown
        const opt = document.createElement('option');
        opt.value = sub.id; opt.textContent = sub.name;
        postSelect.appendChild(opt);
    });
}

function selectSub(id) { currentSubFilter = id; loadSubreddits(); loadPosts(); }

// Deletion
async function deletePost(id) { if(confirm('Delete post?')) { await sb.from('posts').delete().eq('id', id); loadPosts(); } }
async function deleteSub(id, name) { if(confirm(`Delete r/${name}?`)) { await sb.from('subreddits').delete().eq('id', id); loadSubreddits(); loadPosts(); } }
async function deleteComment(id) { if(confirm('Delete comment?')) { await sb.from('comments').delete().eq('id', id); loadModalComments(currentOpenPostId); } }

// Utils
function getAnonName(id) {
    let hash = 0; for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    const adj = ADJECTIVES[Math.abs(hash) % ADJECTIVES.length];
    const ani = ANIMALS[Math.abs(hash) % ANIMALS.length];
    return `${adj} ${ani}`;
}
function setupFormListeners() {
    document.getElementById('createPostForm').onsubmit = async (e) => {
        e.preventDefault();
        const { error } = await sb.from('posts').insert([{
            title: document.getElementById('postTitle').value,
            content: document.getElementById('postContent').value,
            url: document.getElementById('postLink').value,
            image_url: document.getElementById('postImage').value,
            subreddit_id: document.getElementById('postSubreddit').value,
            user_id: currentUser.id
        }]);
        if (!error) { closeModal('createPostModal'); loadPosts(); }
    };
    document.getElementById('createSubForm').onsubmit = async (e) => {
        e.preventDefault();
        const { error } = await sb.from('subreddits').insert([{
            name: document.getElementById('subName').value, created_by: currentUser.id
        }]);
        if (!error) { closeModal('createSubModal'); loadSubreddits(); }
    };
}
window.openCreateModal = () => document.getElementById('createPostModal').classList.add('active');
window.openSubModal = () => document.getElementById('createSubModal').classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');
function escapeHtml(t) { return t ? t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : ''; }
