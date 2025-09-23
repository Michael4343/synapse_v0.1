# Stage 1: Foundation & Infrastructure

## Goal
Establish working Next.js + Supabase environment with basic deployment pipeline.

## Deliverables

### 1.1 Project Setup
- [ ] Initialize Next.js 14 project with TypeScript and App Router
- [ ] Configure Tailwind CSS and install shadcn/ui
- [ ] Set up ESLint, Prettier, and TypeScript strict mode
- [ ] Create basic folder structure following Next.js 14 conventions

### 1.2 Supabase Configuration
- [ ] Create new Supabase project
- [ ] Set up environment variables (.env.local and .env.example)
- [ ] Install and configure Supabase client
- [ ] Test database connection

### 1.3 Basic Authentication
- [ ] Set up Supabase Auth with email/password
- [ ] Create basic login/signup pages
- [ ] Implement auth state management
- [ ] Add protected route middleware

### 1.4 Database Schema
- [ ] Create initial database tables:
  ```sql
  -- saved_searches table
  CREATE TABLE saved_searches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    query text NOT NULL,
    filters jsonb DEFAULT '{}',
    update_frequency text CHECK (update_frequency IN ('daily', 'weekly')),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
  );

  -- search_results_cache table
  CREATE TABLE search_results_cache (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    query_hash text UNIQUE NOT NULL,
    results jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
  );
  ```

### 1.5 Deployment Pipeline
- [ ] Deploy to Vercel with automatic deployments
- [ ] Configure Supabase environment variables in Vercel
- [ ] Test production deployment
- [ ] Set up basic monitoring/error tracking

## Acceptance Criteria

### ✅ Must Pass Before Stage 2
1. **Homepage loads successfully** in both development and production
2. **Database connection works** - can query Supabase from the app
3. **Authentication flow works** - users can register, login, and logout
4. **Environment variables** are properly configured and secure
5. **TypeScript compiles** without errors
6. **Deployment pipeline** works - push to main triggers successful deploy

### 🧪 Testing Checklist
- [ ] `npm run dev` starts without errors
- [ ] `npm run build` completes successfully
- [ ] `npm run type-check` passes
- [ ] Register new user via UI
- [ ] Login with created user
- [ ] Logout functionality works
- [ ] Protected routes redirect to login when not authenticated
- [ ] Production site loads and auth works

## Implementation Notes

### Folder Structure
```
/src
  /app
    /(auth)
      /login
      /signup
    /dashboard
    /globals.css
    /layout.tsx
    /page.tsx
  /components
    /ui          # shadcn/ui components
    /auth        # auth-related components
  /lib
    /supabase.ts
    /auth.ts
  /types
    /database.ts
```

### Key Dependencies
- `@supabase/supabase-js`
- `@supabase/auth-helpers-nextjs`
- `tailwindcss`
- `@shadcn/ui` components

### Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Risk Mitigation
- **Supabase limits**: Use free tier initially, monitor usage
- **Auth complexity**: Start with email/password only, add social later
- **TypeScript strictness**: Configure gradually, fix errors incrementally