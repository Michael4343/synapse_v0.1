# Stage 4: User Features & Saved Searches

## Goal
Implement user authentication, dashboard, and saved search functionality.

## Deliverables

### 4.1 User Dashboard
- [ ] Personal dashboard with saved searches overview
- [ ] Recent search history
- [ ] Account settings and preferences
- [ ] Usage statistics and insights
- [ ] Quick search shortcuts

### 4.2 Save Search Functionality
- [ ] "Save Search" button on results pages
- [ ] Custom naming for saved searches
- [ ] Edit saved search parameters
- [ ] Delete saved searches
- [ ] Search organization (tags, folders)

### 4.3 User Preferences
- [ ] Default search filters
- [ ] Preferred sources selection
- [ ] Result display preferences (grid/list)
- [ ] Notification preferences
- [ ] Export format preferences

### 4.4 Enhanced Authentication
- [ ] Email verification flow
- [ ] Password reset functionality
- [ ] Account deletion
- [ ] Profile management
- [ ] Optional social login (Google, GitHub)

### 4.5 Search Management Features
- [ ] Duplicate search detection
- [ ] Search sharing (public links)
- [ ] Search templates/presets
- [ ] Bulk operations (delete multiple)
- [ ] Search performance analytics

## Acceptance Criteria

### ✅ Must Pass Before Stage 5
1. **User registration/login works** - complete auth flow including verification
2. **Save search works** - users can save searches with custom names
3. **Dashboard displays data** - shows saved searches and recent activity
4. **Edit saved searches** - users can modify search parameters
5. **Delete functionality** - users can remove saved searches
6. **Preferences persist** - user settings saved and applied
7. **Account management** - password reset and profile updates work

### 🧪 Testing Checklist
- [ ] Register new account with email verification
- [ ] Login and access dashboard
- [ ] Save a search with custom name
- [ ] Edit saved search parameters
- [ ] Delete a saved search
- [ ] Set default preferences and verify they persist
- [ ] Reset password flow works
- [ ] Update profile information
- [ ] Share a saved search via public link
- [ ] Logout and ensure session cleanup

## Database Schema Updates

### Enhanced Tables
```sql
-- Update saved_searches table
ALTER TABLE saved_searches ADD COLUMN name text;
ALTER TABLE saved_searches ADD COLUMN description text;
ALTER TABLE saved_searches ADD COLUMN tags text[];
ALTER TABLE saved_searches ADD COLUMN is_public boolean DEFAULT false;
ALTER TABLE saved_searches ADD COLUMN share_token uuid DEFAULT gen_random_uuid();

-- User preferences table
CREATE TABLE user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  default_filters jsonb DEFAULT '{}',
  preferred_sources text[] DEFAULT ARRAY['arxiv'],
  display_mode text DEFAULT 'grid' CHECK (display_mode IN ('grid', 'list')),
  results_per_page integer DEFAULT 20,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Search analytics table
CREATE TABLE search_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  search_id uuid REFERENCES saved_searches(id) ON DELETE CASCADE,
  action text NOT NULL, -- 'create', 'execute', 'edit', 'delete'
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now()
);
```

## User Dashboard Layout

### Dashboard Sections
1. **Quick Stats**
   - Total saved searches
   - Searches this week
   - Most used sources
   - New results available

2. **Saved Searches Grid**
   - Search name and description
   - Last run date
   - Result count badge
   - Quick actions (run, edit, delete)

3. **Recent Activity**
   - Search history
   - New result notifications
   - Account activity

4. **Quick Actions**
   - Create new search
   - Import search from URL
   - Export all searches
   - Account settings

## Implementation Notes

### User State Management
- Implement user context provider
- Persist authentication state
- Handle token refresh automatically
- Graceful degradation for anonymous users

### Search Management
- Real-time search execution from dashboard
- Background updates for saved searches
- Conflict resolution for concurrent edits
- Version history for search modifications

### Security Considerations
- Validate all user inputs
- Sanitize search parameters
- Rate limit search creation
- Secure sharing tokens (UUID v4)

### Performance Optimizations
- Lazy load dashboard components
- Paginate saved searches list
- Cache user preferences
- Optimize database queries with indexes

## Risk Mitigation
- **Data loss**: Implement soft deletes for saved searches
- **Performance**: Add pagination for users with many saved searches
- **Privacy**: Ensure sharing tokens are secure and can be revoked
- **Scalability**: Design for users with 100+ saved searches