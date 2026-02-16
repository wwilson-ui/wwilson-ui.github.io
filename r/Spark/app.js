// app.js

let sb = null;
let currentUser = null;
let isTeacher = false;
let currentSubFilter = 'all'; // Default to seeing everything

// Random Anonymity names
const ADJECTIVES = ['Happy', 'Brave', 'Calm', 'Swift', 'Wise', 'Bright', 'Clever', 'Kind', 'Bold'];
const ANIMALS = ['Badger', 'Fox', 'Owl', 'Eagle', 'Bear', 'Dolphin', 'Wolf', 'Hawk', 'Tiger'];

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.supabase !== 'undefined') {
        sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } else {
        alert('Supabase not loaded'); return;
    }

    // Modal Close Logic (ESC key)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal('createPostModal');
            closeModal('createSubModal');
        }
    });

    await checkUser();
    
    // Initial Load
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
        // Logged In
        const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = profile || { role: 'student', email: session.user.email, id: session.user.id };
        
        // Teacher Check
        if (currentUser.email === 'wwilson@mtps.us') currentUser.role = 'teacher';
        isTeacher = currentUser.role === 'teacher';

        // Render Top Bar User Info
        authSection.innerHTML = `
            <div style="display:flex; gap:10px; align-items:center;">
                <span style="font-size:0.9rem; font-weight:bold;">${currentUser.email.split('@')[0]}</span>
                <span style="font-size:0.75rem; color:${isTeacher ? '#0079D3' : '#00D9A5'}; font-weight:bold; text-transform:uppercase;">
                    ${isTeacher ? 'TEACHER' : 'STUDENT'}
                </span>
                <button class="google-btn" onclick="signOut()" style="padding: 4px 10px; font-size: 0.8rem;">Sign Out</button>
            </div>
        `;
        
        if (actionBar) actionBar.style.display = 'flex';

        // SHOW TEACHER BUTTONS (The Sidebar Plus)
        const sidebarAddBtn = document.getElementById('sidebarAddBtn');
        if (sidebarAddBtn) {
            sidebarAddBtn.style.display = isTeacher ? 'flex' : 'none';
        }

    } else {
        // Logged Out
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

// ================= SIDEBAR & SUBREDDITS =================
async function loadSubreddits() {
    const list = document.getElementById('subredditList');
    const postSelect = document.getElementById('postSubreddit');
    
    // Fetch from DB
    const { data: subs, error } = await sb.from('subreddits').select('*').order('name');
    
    if (error) { console.error(error); return; }

    list.innerHTML = '';
    postSelect.innerHTML = '';

    // 1. Add "All Communities" default option
    const allItem = document.createElement('li');
    allItem.className = `sub-item ${currentSubFilter === 'all' ? 'active' : ''}`;
    allItem.innerHTML = `<span>r/All</span>`;
    allItem.onclick = () => filterPosts('all');
    list.appendChild(allItem);

    // 2. Add each real subreddit
    subs.forEach(sub => {
        // A. Add to Sidebar
        const li = document.createElement('li');
        li.className = `sub-item ${currentSubFilter === sub.id ? 'active' : ''}`;
        
        // HTML for the list item
        let html = `<span onclick="filterPosts('${sub.id}')">r/${sub.name}</span>`;
        
        // If Teacher, add the X button
        if (isTeacher) {
            html += `<span class="delete-sub-x" onclick="deleteSubreddit('${sub.id}', '${sub.name}')">✕</span>`;
        }
        
        li.innerHTML = html;
        list.appendChild(li);

        // B. Add to "Create Post" dropdown
        const opt = document.createElement('option');
        opt.value = sub.id;
        opt.textContent = sub.name;
        postSelect.appendChild(opt);
    });
}

function filterPosts(subId) {
    currentSubFilter = subId;
    loadSubreddits(); // Re-render sidebar to update the 'active' blue highlight
    loadPosts();      // Reload feed
}

async function deleteSubreddit(id, name) {
    if (confirm(`Are you sure you want to delete r/${name}? This deletes all posts inside it.`)) {
        const { error } = await sb.from('subreddits').delete().eq('id', id);
        if (error) alert(error.message);
        else {
            currentSubFilter = 'all';
            loadSubreddits();
            loadPosts();
        }
    }
}

// ================= POSTS & FEED =================
async function loadPosts() {
    const feed = document.getElementById('postsFeed');
    feed.innerHTML = '<div style="padding:20px; text-align:center;">Loading...</div>';
    
    let query = sb.from('posts').select(`*, subreddits(name), profiles(email)`).order('created_at', { ascending: false });

    // Apply Filter if not "All"
    if (currentSubFilter !== 'all') {
        query = query.eq('subreddit_id', currentSubFilter);
    }

    const { data: posts, error } = await query;
    if (error) { feed.innerHTML = 'Error loading posts'; return; }

    feed.innerHTML = '';
    if (posts.length === 0) {
        feed.innerHTML = '<div style="padding:40px; text-align:center; color:#777;">No posts yet. Be the first!</div>';
        return;
    }

    for (const post of posts) {
        feed.appendChild(createPostElement(post));
    }
}

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
    
    const isAuthor = currentUser && currentUser.id === post.user_id;
    const authorName = getAnonName(post.user_id);
    const realIdentity = (isTeacher || isAuthor) ? ` (${post.profiles?.email || 'me'})` : '';

    // Delete Button (Teacher only)
    const deleteBtn = isTeacher ? `<button style="color:red; background:none; border:none; cursor:pointer;" onclick="deletePost('${post.id}')">🗑</button>` : '';

    div.innerHTML = `
        <div class="post-header">
            <strong>r/${post.subreddits ? post.subreddits.name : 'Unknown'}</strong>
            <span>•</span>
            <span>Posted by ${authorName} <span style="color:#ff4500; font-size:0.8em;">${realIdentity}</span></span>
            <span style="flex-grow:1"></span>
            ${deleteBtn}
        </div>
        <div class="post-title">${escapeHtml(post.title)}</div>
        ${post.content ? `<div style="margin-bottom:10px;">${escapeHtml(post.content)}</div>` : ''}
        ${post.image_url ? `<img src="${post.image_url}" class="post-image" loading="lazy">` : ''}
        ${post.url ? `<a href="${post.url}" target="_blank" style="color:#0079D3; display:block; margin-top:5px; text-decoration:none;">🔗 ${post.url}</a>` : ''}
        
        <div class="post-footer">
            <button class="vote-btn" onclick="vote('${post.id}', 1)">⬆</button>
            <span>${(post.up_votes || 0) - (post.down_votes || 0)}</span>
            <button class="vote-btn" onclick="vote('${post.id}', -1)">⬇</button>
        </div>
    `;
    return div;
}

// ================= FORMS & HELPERS =================
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
            name: document.getElementById('subName').value,
            created_by: currentUser.id
        }]);
        if (!error) { closeModal('createSubModal'); loadSubreddits(); }
    };
}

async function deletePost(id) {
    if(confirm('Delete this post?')) {
        await sb.from('posts').delete().eq('id', id);
        loadPosts();
    }
}

// Global Modal Functions
window.openCreateModal = () => document.getElementById('createPostModal').classList.add('active');
window.openSubModal = () => document.getElementById('createSubModal').classList.add('active');
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
