# MTPS Forum - Reddit Clone

A full-featured Reddit-style forum for MTPS students and teachers, built with vanilla JavaScript and Supabase.

## Features

✅ **Authentication**
- Google OAuth login restricted to @mtps.us domain
- Automatic role assignment (student/teacher)
- Profile management

✅ **Communities (Subreddits)**
- Teachers can create communities
- Browse all communities
- Filter posts by community

✅ **Posts**
- Create text, link, or image posts
- Upvote/downvote system
- Comment on posts
- Nested replies
- Sort by Hot, New, or Top

✅ **Moderation**
- Teachers can delete any post/comment
- Users can delete their own content
- Teacher-only community creation

## Setup Instructions

### 1. Database Setup

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the entire contents of `database-schema.sql`
4. Click "Run" to execute the SQL
5. This will create all necessary tables, policies, triggers, and indexes

### 2. Configure Google OAuth

1. In your Supabase dashboard, go to **Authentication → Providers**
2. Enable **Google** provider
3. Add your OAuth credentials:
   - Get credentials from [Google Cloud Console](https://console.cloud.google.com/)
   - Create OAuth 2.0 credentials
   - Add authorized redirect URI: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
4. **Important**: Configure domain restriction in Google Cloud Console to only allow @mtps.us emails

### 3. Update Configuration File

1. Open `config.js`
2. **✅ ALREADY CONFIGURED** - Your credentials are already set:

```javascript
const SUPABASE_URL = 'https://dfmugytablgldpkadfrl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

Your teacher email (wwilson@mtps.us) is also already configured in the database schema.

### 4. Deploy to GitHub Pages

1. Create a new repository on GitHub
2. Upload all files:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `config.js`
3. Go to repository Settings → Pages
4. Select "Deploy from a branch"
5. Choose `main` branch and `/root` folder
6. Click Save

Your site will be available at: `https://yourusername.github.io/repository-name/`

### 5. Update OAuth Redirect

After deploying, add your GitHub Pages URL to Google OAuth:
1. Go to Google Cloud Console
2. Add to Authorized redirect URIs:
   - `https://yourusername.github.io/repository-name/`
3. Also add it to Supabase:
   - Dashboard → Authentication → URL Configuration
   - Add to "Redirect URLs"

## File Structure

```
├── index.html           # Main HTML structure
├── styles.css           # All styling and animations
├── app.js              # Core functionality
├── config.js           # Supabase configuration
├── database-schema.sql # Complete database setup
└── README.md           # This file
```

## Usage

### For Students
1. Sign in with your @mtps.us Google account
2. Browse communities and posts
3. Create posts (text, links, or images)
4. Comment and vote on content
5. Delete your own posts/comments

### For Teachers
All student features, plus:
- Create new communities
- Delete any post or comment (moderation)
- Special "TEACHER" badge displayed

## Customization

### Colors
Edit CSS variables in `styles.css` (lines 1-15):
```css
:root {
    --primary: #FF6B35;      /* Main accent color */
    --secondary: #004E89;    /* Secondary color */
    --accent: #F7B801;       /* Highlight color */
    /* ... more colors */
}
```

### Fonts
Change fonts in the `<head>` of `index.html` and update CSS font-family declarations.

### Sort Algorithms
Modify the sorting logic in `app.js` in the `loadPosts()` function.

## Database Tables

- **profiles** - User information and roles
- **subreddits** - Communities
- **posts** - All posts with vote counts
- **comments** - Comments with nested replies
- **votes** - Upvotes/downvotes tracking

## Security Features

- Row Level Security (RLS) on all tables
- Domain-restricted authentication (@mtps.us only)
- Role-based permissions
- XSS protection with HTML escaping
- Secure server-side triggers

## Troubleshooting

**"Only @mtps.us email addresses are allowed"**
- Your Google account is not from the MTPS domain
- Check Google OAuth configuration

**Google Sign-In not working**
- Verify OAuth credentials are correct
- Check redirect URIs match exactly
- Ensure Google provider is enabled in Supabase

**Can't create communities**
- Only accounts with teacher role can create communities
- Check your role in the database (profiles table)
- Update the teacher email in database-schema.sql

**Posts not loading**
- Check browser console for errors
- Verify config.js has correct credentials
- Ensure database schema was executed successfully

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

This project is created for educational purposes for MTPS.

## Support

For issues or questions, create an issue in your GitHub repository.
