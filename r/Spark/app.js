// ============================================
// GLOBAL STATE
// ============================================
let currentUser = null;
let currentSubreddit = null;
let currentSort = 'hot';
let subreddits = [];
let supabase;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Supabase client
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase client initialized');
    } else {
        console.error('Supabase library not loaded');
        return;
    }
    
    await checkAuth();
    await loadSubreddits();
    await loadPosts();
    setupEventListeners();
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
            console.error('Error getting session:', error);
            renderAuthButtons();
            return;
        }
        
        if (session) {
            console.log('User is signed in:', session.user.email);
            await loadUserProfile(session.user);
        } else {
            console.log('No active session, showing sign in button');
            renderAuthButtons();
        }
        
        // Listen for auth changes
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth state changed:', event);
            if (event === 'SIGNED_IN' && session) {
                await loadUserProfile(session.user);
                location.reload();
            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                renderAuthButtons();
                location.reload();
            }
        });
    } catch (err) {
        console.error('Error in checkAuth:', err);
        renderAuthButtons();
    }
}

async function loadUserProfile(user) {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
    
    if (profile) {
        currentUser = profile;
        renderUserInfo();
        
        // Show create post button for ALL users
        const createPostBtn = document.getElementById('createPostBtn');
        if (createPostBtn) {
            createPostBtn.style.display = 'block';
        }
        
        // Show create subreddit button only for teachers
        if (profile.role === 'teacher') {
            const createSubredditBtn = document.getElementById('createSubredditBtn');
            if (createSubredditBtn) {
                createSubredditBtn.style.display = 'block';
            }
        }
    } else {
        console.error('Error loading profile:', error);
    }
}

function renderAuthButtons() {
    const authSection = document.getElementById('authSection');
    if (!authSection) {
        console.error('authSection element not found!');
        return;
    }
    
    console.log('Rendering auth buttons (sign in)');
    authSection.innerHTML = `
        <button class="btn btn-primary" onclick="signInWithGoogle()">
            Sign in with Google
        </button>
    `;
}

function renderUserInfo() {
    const authSection = document.getElementById('authSection');
    if (!authSection) {
        console.error('authSection element not found!');
        return;
    }
    
    console.log('Rendering user info for:', currentUser.username);
    const initial = currentUser.username ? currentUser.username[0].toUpperCase() : 'U';
    
    authSection.innerHTML = `
        <div class="user-info">
            <div class="user-avatar">${initial}</div>
            <div>
                <div class="user-name">${currentUser.username}</div>
                <div class="user-role">${currentUser.role}</div>
            </div>
        </div>
        <button class="btn btn-secondary" onclick="signOut()">Sign Out</button>
    `;
}

async function signInWithGoogle() {
    console.log('Attempting to sign in with Google...');
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        
        if (error) {
            console.error('Error signing in:', error);
            alert('Error signing in: ' + error.message);
        } else {
            console.log('Sign in initiated successfully');
        }
    } catch (err) {
        console.error('Unexpected error during sign in:', err);
        alert('Unexpected error: ' + err.message);
    }
}

async function signOut() {
    await supabase.auth.signOut();
}

// ============================================
// SUBREDDITS
// ============================================
async function loadSubreddits() {
    const { data, error } = await supabase
        .from('subreddits')
        .select('*')
        .order('name');
    
    if (data) {
        subreddits = data;
        renderSubreddits();
    }
}

function renderSubreddits() {
    const list = document.getElementById('subredditsList');
    const select = document.getElementById('postSubreddit');
    
    if (subreddits.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">No communities yet</p>';
    } else {
        list.innerHTML = `
            <div class="subreddit-item ${!currentSubreddit ? 'active' : ''}" onclick="filterBySubreddit(null)">
                All Posts
            </div>
            ${subreddits.map(sub => `
                <div class="subreddit-item ${currentSubreddit?.id === sub.id ? 'active' : ''}" 
                     onclick="filterBySubreddit('${sub.id}')">
                    ${sub.name}
                </div>
            `).join('')}
        `;
    }
    
    // Update select dropdown
    if (select) {
        select.innerHTML = subreddits.map(sub => 
            `<option value="${sub.id}">${sub.name}</option>`
        ).join('');
    }
}

function filterBySubreddit(subredditId) {
    if (subredditId) {
        currentSubreddit = subreddits.find(s => s.id === subredditId);
        document.getElementById('feedTitle').textContent = currentSubreddit.name;
    } else {
        currentSubreddit = null;
        document.getElementById('feedTitle').textContent = 'All Posts';
    }
    loadPosts();
    renderSubreddits();
}

async function createSubreddit(name, description) {
    if (!currentUser || currentUser.role !== 'teacher') {
        alert('Only teachers can create communities');
        return;
    }
    
    const { data, error } = await supabase
        .from('subreddits')
        .insert([{
            name: name.toLowerCase(),
            description,
            created_by: currentUser.id
        }])
        .select()
        .single();
    
    if (error) {
        alert('Error creating community: ' + error.message);
    } else {
        await loadSubreddits();
        closeModal('createSubredditModal');
        document.getElementById('createSubredditForm').reset();
    }
}

// ============================================
// POSTS
// ============================================
async function loadPosts() {
    showLoading();
    
    let query = supabase
        .from('posts')
        .select(`
            *,
            profiles:user_id (username, role),
            subreddits:subreddit_id (name)
        `);
    
    if (currentSubreddit) {
        query = query.eq('subreddit_id', currentSubreddit.id);
    }
    
    // Apply sorting
    if (currentSort === 'hot') {
        query = query.order('vote_count', { ascending: false });
    } else if (currentSort === 'new') {
        query = query.order('created_at', { ascending: false });
    } else if (currentSort === 'top') {
        query = query.order('vote_count', { ascending: false });
    }
    
    const { data, error } = await query;
    
    hideLoading();
    
    if (data) {
        renderPosts(data);
    } else if (error) {
        console.error('Error loading posts:', error);
    }
}

function renderPosts(posts) {
    const container = document.getElementById('postsContainer');
    
    if (posts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No posts yet</h3>
                <p>Be the first to post!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = posts.map(post => {
        const userVote = null; // We'll implement this next
        return createPostCard(post, userVote);
    }).join('');
}

function createPostCard(post, userVote) {
    const upvoteClass = userVote === 1 ? 'upvoted' : '';
    const downvoteClass = userVote === -1 ? 'downvoted' : '';
    const timeAgo = getTimeAgo(post.created_at);
    
    let contentHtml = '';
    if (post.post_type === 'text' && post.content) {
        const preview = post.content.length > 300 ? post.content.substring(0, 300) + '...' : post.content;
        contentHtml = `<p class="post-text">${escapeHtml(preview)}</p>`;
    } else if (post.post_type === 'link' && post.url) {
        contentHtml = `
            <div class="post-link">
                <a href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">
                    🔗 ${escapeHtml(post.url)}
                </a>
            </div>
        `;
    } else if (post.post_type === 'image' && post.url) {
        contentHtml = `
            <div class="post-image">
                <img src="${escapeHtml(post.url)}" alt="${escapeHtml(post.title)}" loading="lazy">
            </div>
        `;
    }
    
    const canDelete = currentUser && (currentUser.id === post.user_id || currentUser.role === 'teacher');
    
    return `
        <div class="post-card" data-post-id="${post.id}">
            <div class="vote-section">
                <button class="vote-btn ${upvoteClass}" onclick="vote('${post.id}', 1, 'post')" ${!currentUser ? 'disabled' : ''}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 4L3 15h6v5h6v-5h6z"/>
                    </svg>
                </button>
                <div class="vote-count">${post.vote_count || 0}</div>
                <button class="vote-btn ${downvoteClass}" onclick="vote('${post.id}', -1, 'post')" ${!currentUser ? 'disabled' : ''}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 20L3 9h6V4h6v5h6z"/>
                    </svg>
                </button>
            </div>
            <div class="post-content">
                <div class="post-header">
                    <span class="subreddit-badge" onclick="filterBySubreddit('${post.subreddit_id}')">${post.subreddits.name}</span>
                    <span class="post-meta">Posted by ${post.profiles.username} • ${timeAgo}</span>
                </div>
                <h3 class="post-title" onclick="openPost('${post.id}')">${escapeHtml(post.title)}</h3>
                ${contentHtml}
                <div class="post-actions">
                    <button class="action-btn" onclick="openPost('${post.id}')">
                        💬 ${post.comment_count || 0} Comments
                    </button>
                    ${canDelete ? `<button class="action-btn" onclick="deletePost('${post.id}')">🗑️ Delete</button>` : ''}
                </div>
            </div>
        </div>
    `;
}

async function createPost(subredditId, title, content, postType, url) {
    if (!currentUser) {
        alert('Please sign in to post');
        return;
    }
    
    const { data, error } = await supabase
        .from('posts')
        .insert([{
            subreddit_id: subredditId,
            user_id: currentUser.id,
            title,
            content: postType === 'text' ? content : null,
            post_type: postType,
            url: postType !== 'text' ? url : null
        }])
        .select()
        .single();
    
    if (error) {
        alert('Error creating post: ' + error.message);
    } else {
        await loadPosts();
        closeModal('createPostModal');
        document.getElementById('createPostForm').reset();
    }
}

async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post?')) return;
    
    const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);
    
    if (error) {
        alert('Error deleting post: ' + error.message);
    } else {
        await loadPosts();
    }
}

async function openPost(postId) {
    showLoading();
    
    const { data: post, error } = await supabase
        .from('posts')
        .select(`
            *,
            profiles:user_id (username, role),
            subreddits:subreddit_id (name)
        `)
        .eq('id', postId)
        .single();
    
    if (error) {
        hideLoading();
        alert('Error loading post');
        return;
    }
    
    const { data: comments, error: commentsError } = await supabase
        .from('comments')
        .select(`
            *,
            profiles:user_id (username, role)
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
    
    hideLoading();
    
    const modal = document.getElementById('postDetailModal');
    const content = document.getElementById('postDetailContent');
    
    content.innerHTML = renderPostDetail(post, comments || []);
    modal.classList.add('active');
}

function renderPostDetail(post, comments) {
    const timeAgo = getTimeAgo(post.created_at);
    const canDelete = currentUser && (currentUser.id === post.user_id || currentUser.role === 'teacher');
    
    let contentHtml = '';
    if (post.post_type === 'text' && post.content) {
        contentHtml = `<p class="post-text">${escapeHtml(post.content)}</p>`;
    } else if (post.post_type === 'link' && post.url) {
        contentHtml = `
            <div class="post-link">
                <a href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">
                    🔗 ${escapeHtml(post.url)}
                </a>
            </div>
        `;
    } else if (post.post_type === 'image' && post.url) {
        contentHtml = `
            <div class="post-image">
                <img src="${escapeHtml(post.url)}" alt="${escapeHtml(post.title)}">
            </div>
        `;
    }
    
    return `
        <div class="post-detail">
            <div class="post-header">
                <span class="subreddit-badge">${post.subreddits.name}</span>
                <span class="post-meta">Posted by ${post.profiles.username} • ${timeAgo}</span>
            </div>
            <h2 class="post-title">${escapeHtml(post.title)}</h2>
            ${contentHtml}
            ${canDelete ? `<button class="action-btn" onclick="deletePost('${post.id}'); closeModal('postDetailModal');">🗑️ Delete Post</button>` : ''}
            
            <div class="comments-section">
                <h3 style="margin-bottom: 1rem; font-size: 1.2rem;">Comments</h3>
                
                ${currentUser ? `
                    <div class="comment-form">
                        <textarea class="comment-input" id="newCommentText" placeholder="What are your thoughts?"></textarea>
                        <button class="btn btn-primary" onclick="addComment('${post.id}', null)" style="margin-top: 0.75rem;">
                            Comment
                        </button>
                    </div>
                ` : '<p style="color: var(--text-muted);">Sign in to comment</p>'}
                
                <div class="comments-list">
                    ${renderComments(comments.filter(c => !c.parent_comment_id), comments, post.id)}
                </div>
            </div>
        </div>
    `;
}

function renderComments(comments, allComments, postId) {
    if (comments.length === 0) {
        return '<p style="color: var(--text-muted); padding: 2rem 0;">No comments yet. Be the first!</p>';
    }
    
    return comments.map(comment => {
        const replies = allComments.filter(c => c.parent_comment_id === comment.id);
        const timeAgo = getTimeAgo(comment.created_at);
        const canDelete = currentUser && (currentUser.id === comment.user_id || currentUser.role === 'teacher');
        
        return `
            <div class="comment">
                <div class="comment-header">
                    <span class="comment-author">${comment.profiles.username}</span>
                    <span class="comment-time">${timeAgo}</span>
                </div>
                <div class="comment-text">${escapeHtml(comment.content)}</div>
                <div class="comment-actions">
                    ${currentUser ? `
                        <button class="action-btn" onclick="showReplyForm('${comment.id}')">💬 Reply</button>
                    ` : ''}
                    ${canDelete ? `<button class="action-btn" onclick="deleteComment('${comment.id}', '${postId}')">🗑️ Delete</button>` : ''}
                </div>
                <div id="reply-form-${comment.id}" style="display: none; margin-top: 1rem;">
                    <textarea class="comment-input" id="reply-text-${comment.id}" placeholder="Write a reply..."></textarea>
                    <button class="btn btn-primary" onclick="addComment('${postId}', '${comment.id}')" style="margin-top: 0.5rem;">
                        Reply
                    </button>
                </div>
                ${replies.length > 0 ? `
                    <div class="nested-comments">
                        ${renderComments(replies, allComments, postId)}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

async function addComment(postId, parentCommentId) {
    if (!currentUser) {
        alert('Please sign in to comment');
        return;
    }
    
    const textId = parentCommentId ? `reply-text-${parentCommentId}` : 'newCommentText';
    const text = document.getElementById(textId).value.trim();
    
    if (!text) {
        alert('Please enter a comment');
        return;
    }
    
    const { error } = await supabase
        .from('comments')
        .insert([{
            post_id: postId,
            parent_comment_id: parentCommentId,
            user_id: currentUser.id,
            content: text
        }]);
    
    if (error) {
        alert('Error adding comment: ' + error.message);
    } else {
        openPost(postId); // Reload post with comments
    }
}

async function deleteComment(commentId, postId) {
    if (!confirm('Are you sure you want to delete this comment?')) return;
    
    const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);
    
    if (error) {
        alert('Error deleting comment: ' + error.message);
    } else {
        openPost(postId); // Reload post
    }
}

function showReplyForm(commentId) {
    const form = document.getElementById(`reply-form-${commentId}`);
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

// ============================================
// VOTING
// ============================================
async function vote(targetId, voteType, type) {
    if (!currentUser) {
        alert('Please sign in to vote');
        return;
    }
    
    const voteData = {
        user_id: currentUser.id,
        vote_type: voteType
    };
    
    if (type === 'post') {
        voteData.post_id = targetId;
    } else {
        voteData.comment_id = targetId;
    }
    
    // Check if user already voted
    const { data: existingVote } = await supabase
        .from('votes')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq(type === 'post' ? 'post_id' : 'comment_id', targetId)
        .single();
    
    if (existingVote) {
        if (existingVote.vote_type === voteType) {
            // Remove vote
            await supabase
                .from('votes')
                .delete()
                .eq('id', existingVote.id);
        } else {
            // Change vote
            await supabase
                .from('votes')
                .update({ vote_type: voteType })
                .eq('id', existingVote.id);
        }
    } else {
        // New vote
        await supabase
            .from('votes')
            .insert([voteData]);
    }
    
    await loadPosts();
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Create Subreddit
    document.getElementById('createSubredditBtn').addEventListener('click', () => {
        document.getElementById('createSubredditModal').classList.add('active');
    });
    
    document.getElementById('createSubredditForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('subredditName').value.trim();
        const description = document.getElementById('subredditDescription').value.trim();
        createSubreddit(name, description);
    });
    
    // Create Post
    document.getElementById('createPostBtn').addEventListener('click', () => {
        document.getElementById('createPostModal').classList.add('active');
    });
    
    // Post type tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const type = btn.dataset.type;
            document.querySelectorAll('.post-content-section').forEach(section => {
                section.style.display = 'none';
            });
            document.getElementById(`${type}PostContent`).style.display = 'block';
        });
    });
    
    document.getElementById('createPostForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const subredditId = document.getElementById('postSubreddit').value;
        const title = document.getElementById('postTitle').value.trim();
        const activeTab = document.querySelector('.tab-btn.active').dataset.type;
        
        let content = '';
        let url = '';
        
        if (activeTab === 'text') {
            content = document.getElementById('postContent').value.trim();
        } else if (activeTab === 'link') {
            url = document.getElementById('postUrl').value.trim();
        } else if (activeTab === 'image') {
            url = document.getElementById('postImageUrl').value.trim();
        }
        
        createPost(subredditId, title, content, activeTab, url);
    });
    
    // Sort buttons
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSort = btn.dataset.sort;
            loadPosts();
        });
    });
    
    // Search (basic implementation)
    document.getElementById('searchInput').addEventListener('input', (e) => {
        // You can implement search functionality here
        console.log('Search:', e.target.value);
    });
}

// ============================================
// MODAL FUNCTIONS
// ============================================
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Close modal when clicking outside
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// ============================================
// UTILITY FUNCTIONS
// ============================================
function showLoading() {
    document.getElementById('loadingSpinner').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingSpinner').style.display = 'none';
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function getTimeAgo(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const seconds = Math.floor((now - then) / 1000);
    
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
        }
    }
    
    return 'just now';
}
