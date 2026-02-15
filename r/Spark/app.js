// Global variables - using var to avoid conflicts
var supabaseClient;
var currentUser = null;
var currentSubreddit = null;
var currentSort = 'hot';
var subreddits = [];

// Initialize everything when page loads
window.addEventListener('load', async function() {
    console.log('===============================================');
    console.log('🚀 PAGE LOADED - Starting initialization...');
    console.log('===============================================');
    console.log('Current URL:', window.location.href);
    console.log('Supabase URL from config:', SUPABASE_URL);
    console.log('Supabase key exists:', !!SUPABASE_ANON_KEY);
    
    // Give Supabase library time to load
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('Window.supabase exists:', !!window.supabase);
    console.log('Window.supabase.createClient exists:', !!(window.supabase && window.supabase.createClient));
    
    // Initialize Supabase
    if (window.supabase && window.supabase.createClient) {
        try {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('✅ Supabase client created');
            console.log('Supabase client object:', supabaseClient);
            console.log('Supabase.auth exists:', !!supabaseClient.auth);
            
            // Set up Google sign-in button
            setupGoogleSignIn();
            
            // Check if user is already logged in
            await checkAuth();
            
            // Load content
            await loadSubreddits();
            await loadPosts();
            
            // Set up event listeners
            setupEventListeners();
            
            console.log('✅ Initialization complete');
        } catch (err) {
            console.error('❌ Error during initialization:', err);
            alert('Initialization error: ' + err.message);
        }
    } else {
        console.error('❌ Supabase library not loaded');
        console.error('window.supabase:', window.supabase);
        alert('Error: Supabase library failed to load. Please refresh the page.');
    }
});

// Set up the Google sign-in button
function setupGoogleSignIn() {
    var btn = document.getElementById('googleSignInBtn');
    console.log('Setting up sign-in button, found:', btn);
    
    if (btn) {
        btn.onclick = async function(e) {
            console.log('🔐 SIGN IN BUTTON CLICKED!');
            console.log('Event:', e);
            console.log('Supabase client exists:', !!supabaseClient);
            console.log('Supabase auth exists:', !!supabaseClient?.auth);
            
            // Test alert to confirm button works
            alert('Button clicked! Check console for details.');
            
            try {
                console.log('Attempting OAuth sign-in...');
                var result = await supabaseClient.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: window.location.origin,
                        queryParams: {
                            access_type: 'offline',
                            prompt: 'consent',
                        }
                    }
                });
                
                console.log('OAuth response - data:', result.data, 'error:', result.error);
                
                if (result.error) {
                    console.error('❌ Sign in error:', result.error);
                    alert('Sign in failed: ' + result.error.message);
                } else {
                    console.log('✅ Sign in initiated, data:', result.data);
                }
            } catch (err) {
                console.error('❌ Unexpected error:', err);
                alert('Unexpected error: ' + err.message);
            }
        };
        
        console.log('✅ Sign-in button configured');
    } else {
        console.error('❌ Sign-in button not found in DOM');
        alert('ERROR: Sign-in button element not found!');
    }
}

// Check authentication status
async function checkAuth() {
    try {
        var result = await supabaseClient.auth.getSession();
        var session = result.data.session;
        
        if (session) {
            console.log('✅ User logged in:', session.user.email);
            await loadUserProfile(session.user);
        } else {
            console.log('ℹ️  No active session');
        }
        
        // Listen for auth changes
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
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
        
        var result = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        
        if (result.data) {
            currentUser = result.data;
            console.log('✅ Profile loaded:', result.data.username, result.data.role);
            updateAuthUI();
        } else {
            console.error('Profile not found:', result.error);
            // Try again in 2 seconds
            setTimeout(() => loadUserProfile(user), 2000);
        }
    } catch (err) {
        console.error('Profile load error:', err);
    }
}

// Update the auth section UI
function updateAuthUI() {
    var authSection = document.getElementById('authSection');
    if (!authSection) return;
    
    if (currentUser) {
        var initial = currentUser.username ? currentUser.username[0].toUpperCase() : 'U';
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
            await supabaseClient.auth.signOut();
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
        var result = await supabaseClient
            .from('subreddits')
            .select('*')
            .order('name');
        
        if (result.data) {
            subreddits = result.data;
            console.log('✅ Loaded', result.data.length, 'communities');
            renderSubreddits();
        }
    } catch (err) {
        console.error('Error loading subreddits:', err);
    }
}

// Render subreddits list
function renderSubreddits() {
    var list = document.getElementById('subredditsList');
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
    var select = document.getElementById('postSubreddit');
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
        var query = supabaseClient
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
        
        var result = await query;
        
        if (result.data) {
            console.log('✅ Loaded', result.data.length, 'posts');
            renderPosts(result.data);
        }
    } catch (err) {
        console.error('Error loading posts:', err);
    }
}

// Render posts
function renderPosts(posts) {
    var container = document.getElementById('postsContainer');
    if (!container) return;
    
    if (posts.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No posts yet</h3><p>Be the first to post!</p></div>';
        return;
    }
    
    container.innerHTML = posts.map(post => createPostCard(post)).join('');
}

// Create post card HTML
function createPostCard(post) {
    var timeAgo = getTimeAgo(post.created_at);
    var canDelete = currentUser && (currentUser.id === post.user_id || currentUser.role === 'teacher');
    
    var contentHtml = '';
    if (post.post_type === 'text' && post.content) {
        var preview = post.content.length > 300 ? post.content.substring(0, 300) + '...' : post.content;
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
        var result = await supabaseClient
            .from('votes')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('post_id', postId)
            .single();
        
        var existingVote = result.data;
        
        if (existingVote) {
            if (existingVote.vote_type === voteType) {
                // Remove vote
                await supabaseClient.from('votes').delete().eq('id', existingVote.id);
            } else {
                // Change vote
                await supabaseClient.from('votes').update({ vote_type: voteType }).eq('id', existingVote.id);
            }
        } else {
            // New vote
            await supabaseClient.from('votes').insert([{
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
        await supabaseClient.from('posts').delete().eq('id', postId);
        await loadPosts();
    } catch (err) {
        console.error('Delete error:', err);
    }
};

// Open post detail
window.openPost = async function(postId) {
    try {
        var postResult = await supabaseClient
            .from('posts')
            .select(`*, profiles:user_id (username, role), subreddits:subreddit_id (name)`)
            .eq('id', postId)
            .single();
        
        var commentsResult = await supabaseClient
            .from('comments')
            .select(`*, profiles:user_id (username, role)`)
            .eq('post_id', postId)
            .order('created_at');
        
        document.getElementById('postDetailContent').innerHTML = renderPostDetail(postResult.data, commentsResult.data || []);
        document.getElementById('postDetailModal').classList.add('active');
    } catch (err) {
        console.error('Error opening post:', err);
    }
};

// Render post detail
function renderPostDetail(post, comments) {
    var canDelete = currentUser && (currentUser.id === post.user_id || currentUser.role === 'teacher');
    
    var contentHtml = '';
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
        var replies = allComments.filter(r => r.parent_comment_id === c.id);
        var canDelete = currentUser && (currentUser.id === c.user_id || currentUser.role === 'teacher');
        
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
    
    var textId = parentId ? `reply-text-${parentId}` : 'newComment';
    var textElement = document.getElementById(textId);
    var text = textElement?.value?.trim();
    
    if (!text) return;
    
    try {
        await supabaseClient.from('comments').insert([{
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
        await supabaseClient.from('comments').delete().eq('id', commentId);
        window.openPost(postId);
    } catch (err) {
        console.error('Delete error:', err);
    }
};

// Show reply form
window.showReplyForm = function(commentId) {
    var form = document.getElementById(`reply-${commentId}`);
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
    var createSubBtn = document.getElementById('createSubredditBtn');
    if (createSubBtn) {
        createSubBtn.addEventListener('click', function() {
            document.getElementById('createSubredditModal').classList.add('active');
        });
    }
    
    // Create subreddit form
    var createSubForm = document.getElementById('createSubredditForm');
    if (createSubForm) {
        createSubForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!currentUser || currentUser.role !== 'teacher') return;
            
            var name = document.getElementById('subredditName').value.trim();
            var description = document.getElementById('subredditDescription').value.trim();
            
            try {
                await supabaseClient.from('subreddits').insert([{
                    name: name.toLowerCase(),
                    description: description,
                    created_by: currentUser.id
                }]);
                
                await loadSubreddits();
                window.closeModal('createSubredditModal');
                e.target.reset();
            } catch (err) {
                console.error('Create subreddit error:', err);
            }
        });
    }
    
    // Create post button
    var createPostBtn = document.getElementById('createPostBtn');
    if (createPostBtn) {
        createPostBtn.addEventListener('click', function() {
            document.getElementById('createPostModal').classList.add('active');
        });
    }
    
    // Post type tabs
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            
            var type = btn.dataset.type;
            document.querySelectorAll('.post-content-section').forEach(function(s) {
                s.style.display = 'none';
            });
            var contentSection = document.getElementById(type + 'PostContent');
            if (contentSection) {
                contentSection.style.display = 'block';
            }
        });
    });
    
    // Create post form
    var createPostForm = document.getElementById('createPostForm');
    if (createPostForm) {
        createPostForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!currentUser) return;
            
            var subredditId = document.getElementById('postSubreddit').value;
            var title = document.getElementById('postTitle').value.trim();
            var activeTab = document.querySelector('.tab-btn.active');
            var activeType = activeTab.dataset.type;
            
            var content = '';
            var url = '';
            
            if (activeType === 'text') {
                content = document.getElementById('postContent').value.trim();
            } else if (activeType === 'link') {
                url = document.getElementById('postUrl').value.trim();
            } else if (activeType === 'image') {
                url = document.getElementById('postImageUrl').value.trim();
            }
            
            try {
                await supabaseClient.from('posts').insert([{
                    subreddit_id: subredditId,
                    user_id: currentUser.id,
                    title: title,
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
    }
    
    // Sort buttons
    document.querySelectorAll('.sort-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.sort-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            currentSort = btn.dataset.sort;
            loadPosts();
        });
    });
    
    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(function(modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    console.log('✅ Event listeners configured');
}

// Utility functions
function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimeAgo(timestamp) {
    var seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    var intervals = { year: 31536000, month: 2592000, week: 604800, day: 86400, hour: 3600, minute: 60 };
    
    for (var unit in intervals) {
        var secondsInUnit = intervals[unit];
        var interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return interval + ' ' + unit + (interval > 1 ? 's' : '') + ' ago';
        }
    }
    
    return 'just now';
}
