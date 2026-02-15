// Global variables
let supabase;
let currentUser = null;
let currentSubreddit = null;
let currentSort = 'hot';
let subreddits = [];

// Initialize everything when page loads
window.addEventListener('load', async function() {
    console.log('Page loaded, starting initialization...');
    
    // Give Supabase library time to load
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Initialize Supabase
    if (window.supabase && window.supabase.createClient) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase initialized');
        
        // Set up Google sign-in button
        setupGoogleSignIn();
        
        // Check if user is already logged in
        await checkAuth();
        
        // Load content
        await loadSubreddits();
        await loadPosts();
        
        // Set up event listeners
        setupEventListeners();
    } else {
        console.error('❌ Supabase library not loaded');
        alert('Error loading page. Please refresh.');
    }
});

// Set up the Google sign-in button
function setupGoogleSignIn() {
    const btn = document.getElementById('googleSignInBtn');
    if (btn) {
        btn.onclick = async function() {
            console.log('🔐 Sign in button clicked');
            
            try {
                const { data, error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: window.location.origin
                    }
                });
                
                if (error) {
                    console.error('Sign in error:', error);
                    alert('Sign in failed: ' + error.message);
                } else {
                    console.log('Sign in initiated');
                }
            } catch (err) {
                console.error('Unexpected error:', err);
                alert('Error: ' + err.message);
            }
        };
        console.log('✅ Sign-in button configured');
    } else {
        console.error('❌ Sign-in button not found');
    }
}

// Check authentication status
async function checkAuth() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
            console.log('✅ User logged in:', session.user.email);
            await loadUserProfile(session.user);
        } else {
            console.log('ℹ️  No active session');
        }
        
        // Listen for auth changes
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth changed:', event);
            
            if (event === 'SIGNED_IN') {
                await loadUserProfile(session.user);
                await loadSubreddits();
                await loadPosts();
            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                location.reload();
            }
        });
    } catch (err) {
        console.error('Auth check error:', err);
    }
}

// Load user profile
async function loadUserProfile(user) {
    try {
        // Wait a moment for trigger to create profile
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        
        if (profile) {
            currentUser = profile;
            console.log('✅ Profile loaded:', profile.username, profile.role);
            updateAuthUI();
        } else {
            console.error('Profile not found:', error);
            // Try again in 2 seconds
            setTimeout(() => loadUserProfile(user), 2000);
        }
    } catch (err) {
        console.error('Profile load error:', err);
    }
}

// Update the auth section UI
function updateAuthUI() {
    const authSection = document.getElementById('authSection');
    if (!authSection) return;
    
    if (currentUser) {
        const initial = currentUser.username ? currentUser.username[0].toUpperCase() : 'U';
        authSection.innerHTML = `
            <div class="user-info">
                <div class="user-avatar">${initial}</div>
                <div>
                    <div class="user-name">Logged in as ${currentUser.username}</div>
                    <div class="user-role">${currentUser.role.toUpperCase()}</div>
                </div>
            </div>
            <button class="btn btn-secondary" id="signOutBtn">Sign Out</button>
        `;
        
        // Set up sign out button
        document.getElementById('signOutBtn').onclick = async function() {
            await supabase.auth.signOut();
        };
        
        // Show create post button
        document.getElementById('createPostBtn').style.display = 'block';
        
        // Show create subreddit button for teachers
        if (currentUser.role === 'teacher') {
            document.getElementById('createSubredditBtn').style.display = 'block';
        }
    }
}

// Load subreddits
async function loadSubreddits() {
    try {
        const { data, error } = await supabase
            .from('subreddits')
            .select('*')
            .order('name');
        
        if (data) {
            subreddits = data;
            console.log('✅ Loaded', data.length, 'communities');
            renderSubreddits();
        }
    } catch (err) {
        console.error('Error loading subreddits:', err);
    }
}

// Render subreddits list
function renderSubreddits() {
    const list = document.getElementById('subredditsList');
    if (!list) return;
    
    if (subreddits.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">No communities yet</p>';
        return;
    }
    
    list.innerHTML = `
        <div class="subreddit-item ${!currentSubreddit ? 'active' : ''}" onclick="window.filterBySubreddit(null)">
            All Posts
        </div>
        ${subreddits.map(sub => `
            <div class="subreddit-item ${currentSubreddit?.id === sub.id ? 'active' : ''}" 
                 onclick="window.filterBySubreddit('${sub.id}')">
                ${sub.name}
            </div>
        `).join('')}
    `;
    
    // Update post form dropdown
    const select = document.getElementById('postSubreddit');
    if (select) {
        select.innerHTML = subreddits.map(sub => 
            `<option value="${sub.id}">${sub.name}</option>`
        ).join('');
    }
}

// Filter posts by subreddit
window.filterBySubreddit = function(subredditId) {
    if (subredditId) {
        currentSubreddit = subreddits.find(s => s.id === subredditId);
        document.getElementById('feedTitle').textContent = currentSubreddit.name;
    } else {
        currentSubreddit = null;
        document.getElementById('feedTitle').textContent = 'All Posts';
    }
    loadPosts();
    renderSubreddits();
};

// Load posts
async function loadPosts() {
    try {
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
        
        // Sort
        if (currentSort === 'new') {
            query = query.order('created_at', { ascending: false });
        } else {
            query = query.order('vote_count', { ascending: false });
        }
        
        const { data, error } = await query;
        
        if (data) {
            console.log('✅ Loaded', data.length, 'posts');
            renderPosts(data);
        }
    } catch (err) {
        console.error('Error loading posts:', err);
    }
}

// Render posts
function renderPosts(posts) {
    const container = document.getElementById('postsContainer');
    if (!container) return;
    
    if (posts.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No posts yet</h3><p>Be the first to post!</p></div>';
        return;
    }
    
    container.innerHTML = posts.map(post => createPostCard(post)).join('');
}

// Create post card HTML
function createPostCard(post) {
    const timeAgo = getTimeAgo(post.created_at);
    const canDelete = currentUser && (currentUser.id === post.user_id || currentUser.role === 'teacher');
    
    let contentHtml = '';
    if (post.post_type === 'text' && post.content) {
        const preview = post.content.length > 300 ? post.content.substring(0, 300) + '...' : post.content;
        contentHtml = `<p class="post-text">${escapeHtml(preview)}</p>`;
    } else if (post.post_type === 'link' && post.url) {
        contentHtml = `<div class="post-link"><a href="${escapeHtml(post.url)}" target="_blank">🔗 ${escapeHtml(post.url)}</a></div>`;
    } else if (post.post_type === 'image' && post.url) {
        contentHtml = `<div class="post-image"><img src="${escapeHtml(post.url)}" alt="${escapeHtml(post.title)}"></div>`;
    }
    
    return `
        <div class="post-card">
            <div class="vote-section">
                <button class="vote-btn" onclick="window.vote('${post.id}', 1)" ${!currentUser ? 'disabled' : ''}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 4L3 15h6v5h6v-5h6z"/>
                    </svg>
                </button>
                <div class="vote-count">${post.vote_count || 0}</div>
                <button class="vote-btn" onclick="window.vote('${post.id}', -1)" ${!currentUser ? 'disabled' : ''}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 20L3 9h6V4h6v5h6z"/>
                    </svg>
                </button>
            </div>
            <div class="post-content">
                <div class="post-header">
                    <span class="subreddit-badge" onclick="window.filterBySubreddit('${post.subreddit_id}')">${post.subreddits.name}</span>
                    <span class="post-meta">Posted by ${post.profiles.username} • ${timeAgo}</span>
                </div>
                <h3 class="post-title" onclick="window.openPost('${post.id}')">${escapeHtml(post.title)}</h3>
                ${contentHtml}
                <div class="post-actions">
                    <button class="action-btn" onclick="window.openPost('${post.id}')">💬 ${post.comment_count || 0} Comments</button>
                    ${canDelete ? `<button class="action-btn" onclick="window.deletePost('${post.id}')">🗑️ Delete</button>` : ''}
                </div>
            </div>
        </div>
    `;
}

// Vote on post
window.vote = async function(postId, voteType) {
    if (!currentUser) {
        alert('Please sign in to vote');
        return;
    }
    
    try {
        const { data: existingVote } = await supabase
            .from('votes')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('post_id', postId)
            .single();
        
        if (existingVote) {
            if (existingVote.vote_type === voteType) {
                // Remove vote
                await supabase.from('votes').delete().eq('id', existingVote.id);
            } else {
                // Change vote
                await supabase.from('votes').update({ vote_type: voteType }).eq('id', existingVote.id);
            }
        } else {
            // New vote
            await supabase.from('votes').insert([{
                user_id: currentUser.id,
                post_id: postId,
                vote_type: voteType
            }]);
        }
        
        await loadPosts();
    } catch (err) {
        console.error('Vote error:', err);
    }
};

// Delete post
window.deletePost = async function(postId) {
    if (!confirm('Delete this post?')) return;
    
    try {
        await supabase.from('posts').delete().eq('id', postId);
        await loadPosts();
    } catch (err) {
        console.error('Delete error:', err);
    }
};

// Open post detail
window.openPost = async function(postId) {
    try {
        const { data: post } = await supabase
            .from('posts')
            .select(`*, profiles:user_id (username, role), subreddits:subreddit_id (name)`)
            .eq('id', postId)
            .single();
        
        const { data: comments } = await supabase
            .from('comments')
            .select(`*, profiles:user_id (username, role)`)
            .eq('post_id', postId)
            .order('created_at');
        
        document.getElementById('postDetailContent').innerHTML = renderPostDetail(post, comments || []);
        document.getElementById('postDetailModal').classList.add('active');
    } catch (err) {
        console.error('Error opening post:', err);
    }
};

// Render post detail
function renderPostDetail(post, comments) {
    const canDelete = currentUser && (currentUser.id === post.user_id || currentUser.role === 'teacher');
    
    let contentHtml = '';
    if (post.post_type === 'text' && post.content) {
        contentHtml = `<p class="post-text">${escapeHtml(post.content)}</p>`;
    } else if (post.post_type === 'link' && post.url) {
        contentHtml = `<div class="post-link"><a href="${escapeHtml(post.url)}" target="_blank">🔗 ${escapeHtml(post.url)}</a></div>`;
    } else if (post.post_type === 'image' && post.url) {
        contentHtml = `<div class="post-image"><img src="${escapeHtml(post.url)}"></div>`;
    }
    
    return `
        <div class="post-detail">
            <div class="post-header">
                <span class="subreddit-badge">${post.subreddits.name}</span>
                <span class="post-meta">Posted by ${post.profiles.username}</span>
            </div>
            <h2 class="post-title">${escapeHtml(post.title)}</h2>
            ${contentHtml}
            ${canDelete ? `<button class="action-btn" onclick="window.deletePost('${post.id}'); window.closeModal('postDetailModal')">🗑️ Delete</button>` : ''}
            
            <div class="comments-section">
                <h3 style="margin: 2rem 0 1rem;">Comments</h3>
                ${currentUser ? `
                    <div class="comment-form">
                        <textarea class="comment-input" id="newComment" placeholder="What are your thoughts?"></textarea>
                        <button class="btn btn-primary" onclick="window.addComment('${post.id}', null)" style="margin-top: 0.5rem;">Comment</button>
                    </div>
                ` : '<p style="color: var(--text-muted);">Sign in to comment</p>'}
                <div class="comments-list">
                    ${renderComments(comments.filter(c => !c.parent_comment_id), comments, post.id)}
                </div>
            </div>
        </div>
    `;
}

// Render comments
function renderComments(comments, allComments, postId) {
    if (comments.length === 0) {
        return '<p style="color: var(--text-muted); padding: 2rem 0;">No comments yet</p>';
    }
    
    return comments.map(c => {
        const replies = allComments.filter(r => r.parent_comment_id === c.id);
        const canDelete = currentUser && (currentUser.id === c.user_id || currentUser.role === 'teacher');
        
        return `
            <div class="comment">
                <div class="comment-header">
                    <span class="comment-author">${c.profiles.username}</span>
                    <span class="comment-time">${getTimeAgo(c.created_at)}</span>
                </div>
                <div class="comment-text">${escapeHtml(c.content)}</div>
                <div class="comment-actions">
                    ${currentUser ? `<button class="action-btn" onclick="window.showReplyForm('${c.id}')">💬 Reply</button>` : ''}
                    ${canDelete ? `<button class="action-btn" onclick="window.deleteComment('${c.id}', '${postId}')">🗑️ Delete</button>` : ''}
                </div>
                <div id="reply-${c.id}" style="display:none; margin-top:1rem;">
                    <textarea class="comment-input" id="reply-text-${c.id}" placeholder="Write a reply..."></textarea>
                    <button class="btn btn-primary" onclick="window.addComment('${postId}', '${c.id}')" style="margin-top:0.5rem;">Reply</button>
                </div>
                ${replies.length > 0 ? `<div class="nested-comments">${renderComments(replies, allComments, postId)}</div>` : ''}
            </div>
        `;
    }).join('');
}

// Add comment
window.addComment = async function(postId, parentId) {
    if (!currentUser) return;
    
    const textId = parentId ? `reply-text-${parentId}` : 'newComment';
    const text = document.getElementById(textId)?.value?.trim();
    
    if (!text) return;
    
    try {
        await supabase.from('comments').insert([{
            post_id: postId,
            parent_comment_id: parentId,
            user_id: currentUser.id,
            content: text
        }]);
        
        window.openPost(postId);
    } catch (err) {
        console.error('Comment error:', err);
    }
};

// Delete comment
window.deleteComment = async function(commentId, postId) {
    if (!confirm('Delete this comment?')) return;
    
    try {
        await supabase.from('comments').delete().eq('id', commentId);
        window.openPost(postId);
    } catch (err) {
        console.error('Delete error:', err);
    }
};

// Show reply form
window.showReplyForm = function(commentId) {
    const form = document.getElementById(`reply-${commentId}`);
    if (form) {
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }
};

// Close modal
window.closeModal = function(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
};

// Set up event listeners
function setupEventListeners() {
    // Create subreddit button
    document.getElementById('createSubredditBtn')?.addEventListener('click', () => {
        document.getElementById('createSubredditModal').classList.add('active');
    });
    
    // Create subreddit form
    document.getElementById('createSubredditForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!currentUser || currentUser.role !== 'teacher') return;
        
        const name = document.getElementById('subredditName').value.trim();
        const description = document.getElementById('subredditDescription').value.trim();
        
        try {
            await supabase.from('subreddits').insert([{
                name: name.toLowerCase(),
                description,
                created_by: currentUser.id
            }]);
            
            await loadSubreddits();
            window.closeModal('createSubredditModal');
            e.target.reset();
        } catch (err) {
            console.error('Create subreddit error:', err);
        }
    });
    
    // Create post button
    document.getElementById('createPostBtn')?.addEventListener('click', () => {
        document.getElementById('createPostModal').classList.add('active');
    });
    
    // Post type tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const type = btn.dataset.type;
            document.querySelectorAll('.post-content-section').forEach(s => s.style.display = 'none');
            document.getElementById(`${type}PostContent`).style.display = 'block';
        });
    });
    
    // Create post form
    document.getElementById('createPostForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!currentUser) return;
        
        const subredditId = document.getElementById('postSubreddit').value;
        const title = document.getElementById('postTitle').value.trim();
        const activeType = document.querySelector('.tab-btn.active').dataset.type;
        
        let content = '';
        let url = '';
        
        if (activeType === 'text') {
            content = document.getElementById('postContent').value.trim();
        } else if (activeType === 'link') {
            url = document.getElementById('postUrl').value.trim();
        } else if (activeType === 'image') {
            url = document.getElementById('postImageUrl').value.trim();
        }
        
        try {
            await supabase.from('posts').insert([{
                subreddit_id: subredditId,
                user_id: currentUser.id,
                title,
                content: activeType === 'text' ? content : null,
                post_type: activeType,
                url: activeType !== 'text' ? url : null
            }]);
            
            await loadPosts();
            window.closeModal('createPostModal');
            e.target.reset();
        } catch (err) {
            console.error('Create post error:', err);
        }
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
    
    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    console.log('✅ Event listeners configured');
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    const intervals = { year: 31536000, month: 2592000, week: 604800, day: 86400, hour: 3600, minute: 60 };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
    
    return 'just now';
}
