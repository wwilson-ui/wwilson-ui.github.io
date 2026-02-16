// app.js

let sb = null;
let currentUser = null;
let isTeacher = false;

// Random names for anonymity
const ADJECTIVES = ['Happy', 'Brave', 'Calm', 'Swift', 'Wise', 'Bright', 'Clever', 'Kind', 'Bold'];
const ANIMALS = ['Badger', 'Fox', 'Owl', 'Eagle', 'Bear', 'Dolphin', 'Wolf', 'Hawk', 'Tiger'];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Supabase safely
    if (typeof window.supabase !== 'undefined') {
        sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        console.log('✅ Supabase initialized');
    } else {
        alert('Error: Supabase library failed to load.');
        return;
    }

    // 2. Check Auth
    await checkUser();

    // 3. Load Data
    loadSubreddits();
    loadPosts();

    // 4. Setup Listeners
    setupFormListeners();
});

// ================= AUTHENTICATION =================
async function checkUser() {
    // 1. Get the session safely
    const { data: { session } } = await sb.auth.getSession();
    const authSection = document.getElementById('authSection');
    const actionBar = document.getElementById('actionBar');

    if (session) {
        // --- LOGGED IN STATE ---
        // Fetch user profile to check role
        const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
        
        // Fallback if profile is missing (creates a temporary user object)
        currentUser = profile || { role: 'student', email: session.user.email, id: session.user.id };
        
        // Safety Override for Teacher
        if (currentUser.email === 'wwilson@mtps.us') {
            currentUser.role = 'teacher';
        }
        isTeacher = currentUser.role === 'teacher';

        // Render the User Badge
        authSection.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center;">
                <div style="display:flex; flex-direction:column; align-items:flex-end; line-height:1.2;">
                    <span style="font-weight:bold; font-size:0.9rem;">${currentUser.email.split('@')[0]}</span>
                    <span style="font-size:0.75rem; color:${isTeacher ? '#0079D3' : '#00D9A5'}; font-weight:bold; text-transform:uppercase;">
                        ${isTeacher ? 'Teacher' : 'Student'}
                    </span>
                </div>
                <button class="google-btn" onclick="signOut()" style="padding: 5px 12px; font-size: 0.8rem;">Sign Out</button>
            </div>
        `;
        
        // Show the "Create Post" bar
        if (actionBar) actionBar.style.display = 'flex';
        
        // Show "Create Subreddit" button ONLY if teacher
        const createSubBtn = document.getElementById('createSubBtn');
        if (createSubBtn && isTeacher) createSubBtn.style.display = 'block';

    } else {
        // --- LOGGED OUT STATE ---
        // This is the fixed button with the working logo
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
    const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: 'https://wwilson-ui.github.io/r/Spark/',
            queryParams: { hd: 'mtps.us', prompt: 'select_account' }
        }
    });
    if (error) alert(error.message);
}

async function signOut() {
    await sb.auth.signOut();
    window.location.reload();
}

// ================= DATA LOADING =================
async function loadPosts() {
    const feed = document.getElementById('postsFeed');
    const subFilter = document.getElementById('subredditFilter').value;
    
    let query = sb.from('posts').select(`*, subreddits(name), profiles(email, role)`)
                  .order('created_at', { ascending: false });

    if (subFilter !== 'all') {
        query = query.eq('subreddit_id', subFilter);
    }

    const { data: posts, error } = await query;
    if (error) {
        console.error(error);
        return;
    }

    feed.innerHTML = '';
    for (const post of posts) {
        feed.appendChild(createPostElement(post));
    }
}

async function loadSubreddits() {
    const { data: subs } = await sb.from('subreddits').select('*');
    const filter = document.getElementById('subredditFilter');
    const selector = document.getElementById('postSubreddit');
    
    // Clear current options (except 'all' in filter)
    filter.innerHTML = '<option value="all">All Classrooms</option>';
    selector.innerHTML = '';

    subs.forEach(sub => {
        // Add to Filter
        const opt1 = document.createElement('option');
        opt1.value = sub.id; opt1.textContent = "r/" + sub.name;
        filter.appendChild(opt1);

        // Add to Post Creator
        const opt2 = document.createElement('option');
        opt2.value = sub.id; opt2.textContent = sub.name;
        selector.appendChild(opt2);
    });

    filter.onchange = loadPosts;
}

// ================= UI GENERATION =================

// Generate a deterministic random name based on User ID
function getAnonName(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    const adj = ADJECTIVES[Math.abs(hash) % ADJECTIVES.length];
    const ani = ANIMALS[Math.abs(hash) % ANIMALS.length];
    return `${adj} ${ani}`;
}

function createPostElement(post) {
    const div = document.createElement('div');
    div.className = 'post-card';
    
    // Anonymity Logic
    const isAuthor = currentUser && currentUser.id === post.user_id;
    const authorName = getAnonName(post.user_id);
    const realIdentity = (isTeacher || isAuthor) ? `(${post.profiles.email})` : '';

    // Delete Logic
    const deleteBtn = isTeacher ? `<button class="delete-btn" onclick="deletePost('${post.id}')">🗑 Delete Post</button>` : '';

    div.innerHTML = `
        <div class="post-header">
            <strong>r/${post.subreddits ? post.subreddits.name : 'general'}</strong>
            <span>•</span>
            <span class="anon-badge">${authorName}</span>
            <span class="teacher-view-name">${realIdentity}</span>
            <span style="flex-grow:1"></span>
            ${deleteBtn}
        </div>
        <div class="post-body">
            <h3 class="post-title">${escapeHtml(post.title)}</h3>
            ${post.content ? `<div class="post-text">${escapeHtml(post.content)}</div>` : ''}
            ${post.url ? `<a href="${post.url}" target="_blank" class="post-link">🔗 ${post.url}</a>` : ''}
            ${post.image_url ? `<img src="${post.image_url}" class="post-image" loading="lazy">` : ''}
        </div>
        <div class="post-footer">
            <button class="vote-btn up" onclick="vote('${post.id}', 1)">⬆</button>
            <span id="score-${post.id}">0</span>
            <button class="vote-btn down" onclick="vote('${post.id}', -1)">⬇</button>
            <button class="vote-btn" onclick="toggleComments('${post.id}')">💬 Comments</button>
        </div>
        <div id="comments-${post.id}" class="comments-section">
            <div style="display:flex; gap:10px; margin-bottom:15px;">
                <input type="text" id="input-${post.id}" placeholder="Write a comment..." style="flex-grow:1; padding:5px;">
                <button onclick="submitComment('${post.id}')" style="padding:5px 10px;">Reply</button>
            </div>
            <div id="comments-list-${post.id}"></div>
        </div>
    `;
    return div;
}

// ================= COMMENTS & NESTING =================
async function toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    const list = document.getElementById(`comments-list-${postId}`);
    
    if (section.classList.contains('open')) {
        section.classList.remove('open');
        return;
    }
    
    section.classList.add('open');
    list.innerHTML = 'Loading...';

    const { data: comments } = await sb.from('comments')
        .select(`*, profiles(email)`)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

    // Organize flat comments into a tree (nesting)
    const commentTree = buildCommentTree(comments);
    renderComments(commentTree, list);
}

function buildCommentTree(comments) {
    const map = {};
    const roots = [];
    
    // Initialize map
    comments.forEach(c => {
        c.children = [];
        map[c.id] = c;
    });

    // Link children to parents
    comments.forEach(c => {
        // Assuming your comment table has a 'parent_id' column. 
        // If it doesn't, they will all just appear at the top level.
        if (c.parent_id && map[c.parent_id]) {
            map[c.parent_id].children.push(c);
        } else {
            roots.push(c);
        }
    });
    return roots;
}

function renderComments(comments, container) {
    container.innerHTML = '';
    if (comments.length === 0) {
        container.innerHTML = '<div style="color:#999">No comments yet.</div>';
        return;
    }

    comments.forEach(c => {
        const div = document.createElement('div');
        div.className = 'comment';
        
        const authorName = getAnonName(c.user_id);
        const realIdentity = (isTeacher || (currentUser && currentUser.id === c.user_id)) ? `(${c.profiles.email})` : '';
        const deleteBtn = isTeacher ? `<button class="delete-btn" onclick="deleteComment('${c.id}')">delete</button>` : '';

        div.innerHTML = `
            <div class="comment-header">
                <span>${authorName} <span class="teacher-view-name">${realIdentity}</span></span>
                ${deleteBtn}
            </div>
            <div>${escapeHtml(c.content)}</div>
            <div style="margin-top:5px;">
                <button onclick="replyTo('${c.post_id}', '${c.id}', '${authorName}')" style="font-size:0.7rem; cursor:pointer; border:none; background:none; color:#888;">Reply</button>
            </div>
            <div id="replies-${c.id}" class="nested-comment"></div>
        `;
        
        container.appendChild(div);
        
        if (c.children.length > 0) {
            renderComments(c.children, div.querySelector(`#replies-${c.id}`));
        }
    });
}

async function submitComment(postId, parentId = null) {
    if (!currentUser) return alert('Please sign in');
    
    const input = document.getElementById(`input-${postId}`);
    const content = input.value.trim();
    if (!content) return;

    // Note: If your DB doesn't have parent_id, remove that field from this object
    const payload = {
        post_id: postId,
        user_id: currentUser.id,
        content: content,
        parent_id: parentId 
    };

    const { error } = await sb.from('comments').insert([payload]);
    if (error) alert(error.message);
    else {
        input.value = '';
        input.placeholder = "Write a comment...";
        // Close and reopen to refresh
        document.getElementById(`comments-${postId}`).classList.remove('open');
        toggleComments(postId);
    }
}

// Helper to switch the main input to "Reply mode"
function replyTo(postId, commentId, authorName) {
    const input = document.getElementById(`input-${postId}`);
    input.focus();
    input.placeholder = `Replying to ${authorName}...`;
    
    // We hack the submit button to know it's a reply
    // In a real app we'd use state, but this works for vanilla JS
    const btn = input.nextElementSibling;
    btn.onclick = () => submitComment(postId, commentId);
}

// ================= HELPERS & MODALS =================
function setupFormListeners() {
    document.getElementById('createPostForm').onsubmit = async (e) => {
        e.preventDefault();
        if (!currentUser) return;
        
        const title = document.getElementById('postTitle').value;
        const content = document.getElementById('postContent').value;
        const url = document.getElementById('postLink').value;
        const img = document.getElementById('postImage').value;
        const subId = document.getElementById('postSubreddit').value;

        const { error } = await sb.from('posts').insert([{
            title, content, url, image_url: img, subreddit_id: subId, user_id: currentUser.id
        }]);

        if (error) alert(error.message);
        else {
            closeModal('createPostModal');
            loadPosts();
        }
    };
    
    document.getElementById('createSubForm').onsubmit = async (e) => {
        e.preventDefault();
        if (!currentUser) {
            alert('You must be signed in');
            return;
        }
        const name = document.getElementById('subName').value.trim().toLowerCase();
        const { error } = await sb.from('subreddits').insert([{ 
            name: name,
            created_by: currentUser.id 
        }]);
        if (error) {
            console.error('Subreddit creation error:', error);
            alert('Error: ' + error.message);
        } else {
            closeModal('createSubModal');
            document.getElementById('subName').value = '';
            loadSubreddits();
        }
    };
}

async function deletePost(id) {
    if(confirm('Teacher Action: Delete this post?')) {
        await sb.from('posts').delete().eq('id', id);
        loadPosts();
    }
}

async function deleteComment(id) {
    if(confirm('Teacher Action: Delete this comment?')) {
        await sb.from('comments').delete().eq('id', id);
        alert('Deleted. Refreshing comments...');
        // In a full app we'd refresh just the thread, but simple for now:
        const btn = document.querySelector('.comments-section.open').previousElementSibling.querySelector('button:last-child');
        btn.click(); btn.click(); // toggle close then open
    }
}

function openCreateModal() { document.getElementById('createPostModal').classList.add('active'); }
function openSubModal() { document.getElementById('createSubModal').classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
