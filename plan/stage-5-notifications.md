# Stage 5: Notifications & Email Updates

## Goal
Implement email notification system for saved searches with daily/weekly update schedules.

## Deliverables

### 5.1 Email Infrastructure
- [ ] Set up email service (Resend or similar)
- [ ] Create email templates for notifications
- [ ] Implement email queue and delivery system
- [ ] Add unsubscribe and preference management
- [ ] Email bounce and failure handling

### 5.2 Notification Scheduling
- [ ] Supabase Edge Function for scheduled tasks
- [ ] Daily and weekly notification jobs
- [ ] User timezone handling
- [ ] Notification frequency preferences
- [ ] Pause/resume notifications

### 5.3 Email Content Generation
- [ ] New results summary email template
- [ ] Digest format with highlights
- [ ] Personalized content based on user preferences
- [ ] HTML and plain text versions
- [ ] Mobile-responsive email design

### 5.4 Notification Management
- [ ] Notification history and tracking
- [ ] Delivery status monitoring
- [ ] User notification preferences dashboard
- [ ] Bulk notification operations
- [ ] A/B testing framework for email content

### 5.5 Advanced Features
- [ ] Real-time notifications for urgent updates
- [ ] Smart digest (ML-based result ranking)
- [ ] Custom notification triggers
- [ ] Integration with calendar apps
- [ ] Notification analytics and metrics

## Acceptance Criteria

### ✅ Must Pass Before Stage 6
1. **Email delivery works** - users receive scheduled notifications
2. **Unsubscribe works** - users can opt out via email link
3. **Scheduling works** - daily/weekly frequencies respected
4. **Content is relevant** - emails contain new results since last notification
5. **Preferences persist** - user notification settings are saved
6. **Delivery tracking** - system monitors bounce rates and failures
7. **Performance** - notification system handles 100+ users efficiently

### 🧪 Testing Checklist
- [ ] User receives daily notification for saved search
- [ ] Weekly notification contains results from past week
- [ ] Unsubscribe link works and stops notifications
- [ ] User can change notification frequency in dashboard
- [ ] Email displays correctly in major email clients
- [ ] Bounce handling works for invalid email addresses
- [ ] Notification queue processes efficiently
- [ ] User can pause/resume notifications
- [ ] Notification history is tracked and viewable

## Database Schema Updates

### Notification Tables
```sql
-- User notification settings
CREATE TABLE notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email_enabled boolean DEFAULT true,
  frequency text DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly', 'disabled')),
  timezone text DEFAULT 'UTC',
  digest_format text DEFAULT 'summary' CHECK (digest_format IN ('summary', 'detailed')),
  last_sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Notification queue
CREATE TABLE notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  search_id uuid REFERENCES saved_searches(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  scheduled_for timestamp with time zone NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  content jsonb,
  error_message text,
  attempts integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Notification history
CREATE TABLE notification_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address text NOT NULL,
  subject text NOT NULL,
  content_preview text,
  status text NOT NULL CHECK (status IN ('delivered', 'bounced', 'complained', 'opened', 'clicked')),
  provider_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now()
);
```

## Email Service Implementation

### Resend Integration
- **API Key**: Secure environment variable storage
- **Domain Setup**: Configure sending domain and SPF/DKIM
- **Templates**: HTML and text versions for all email types
- **Webhooks**: Handle delivery status updates

### Email Templates
1. **Daily Digest**
   - Subject: "New research results - [Search Name]"
   - Content: Summary of new papers with abstracts
   - CTA: View full results, adjust frequency

2. **Weekly Summary**
   - Subject: "Weekly research digest - [X] new papers"
   - Content: Categorized results with highlights
   - CTA: Most relevant papers, trending topics

3. **System Notifications**
   - Account verification
   - Password reset
   - Service updates

## Supabase Edge Functions

### Notification Scheduler
```typescript
// Daily notification job
export async function dailyNotifications() {
  // Query users with daily frequency
  // Generate and queue notifications
  // Update last_sent_at timestamps
}

// Weekly notification job
export async function weeklyNotifications() {
  // Query users with weekly frequency
  // Aggregate results from past week
  // Generate digest emails
}
```

### Scheduling Setup
- **Cron Jobs**: Use Supabase cron extensions
- **Daily**: Run at 9 AM user local time
- **Weekly**: Run Monday mornings
- **Retry Logic**: 3 attempts with exponential backoff

## Implementation Notes

### Email Content Strategy
- **Personalization**: Use user's name and search preferences
- **Relevance Scoring**: Rank results by user engagement patterns
- **Length Optimization**: 5-10 results per email maximum
- **Mobile Optimization**: Responsive design for mobile email clients

### Performance Considerations
- **Batch Processing**: Group notifications by time zones
- **Rate Limiting**: Respect email service provider limits
- **Database Optimization**: Index on user_id and scheduled_for
- **Caching**: Cache user preferences and search results

### Privacy & Compliance
- **GDPR Compliance**: Easy unsubscribe and data deletion
- **CAN-SPAM**: Include physical address and clear sender info
- **Data Retention**: Automatic cleanup of old notification history
- **Security**: Encrypt email content in database

## Risk Mitigation
- **Email Deliverability**: Monitor bounce rates and sender reputation
- **Volume Scaling**: Use email service with high volume limits
- **User Experience**: Clear unsubscribe process to prevent spam reports
- **System Reliability**: Implement dead letter queues for failed notifications