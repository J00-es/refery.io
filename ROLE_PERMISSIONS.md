# Role-Based Permissions System

## Authentication Flow

1. **User Login** → `/auth/login`
   - Calls `/api/auth/check-status` API (uses admin client, bypasses RLS)
   - If status = 'active': Redirects to `/dashboard`
   - If status = 'pending' AND not super_admin: Redirects to `/auth/pending-approval`
   - Super admin emails (hardcoded) always have access

2. **Pending Approval Page** → `/auth/pending-approval`
   - Calls `/api/auth/check-status` API on load and when "Check My Status" clicked
   - If status becomes 'active': Redirects to `/dashboard`
   - Super admins bypass this page entirely

3. **Dashboard Layout** → `app/(dashboard)/layout.tsx`
   - Checks user status via admin client (bypasses RLS)
   - Syncs `user_id` to users_admin table for RLS policy `users_can_read_own_record`
   - Redirects to pending-approval if not active (unless super admin)
   - Passes user role to DashboardNav for conditional rendering

## Role Definitions

### Super Admin (`lily@10kventures.co`)
**Access:** Everything
- ✅ Dashboard page
- ✅ Jobs (all jobs, create/edit/delete)
- ✅ Candidates (all candidates, create/edit/delete)
- ✅ Companies (all companies, create/edit/delete)
- ✅ Recruiters page
- ✅ Talents page
- ✅ Admin > Users (view/add/edit roles/status/delete)
- ✅ Admin > Analytics

**How it works:**
- Email checked in SUPER_ADMIN_EMAILS constant first (instant access)
- Uses `createAdminClient()` for all database queries (bypasses RLS)
- Never redirected to pending-approval regardless of status

### Admin
**Access:** Restricted to management functions
- ✅ Dashboard page
- ✅ Jobs (all jobs, create/edit/delete)
- ✅ Candidates (all candidates, create/edit/delete)
- ✅ Companies (all companies, create/edit/delete)
- ✅ Recruiters page (view/manage prospects)
- ✅ Talents page (view/manage prospects)
- ❌ Admin > Users (access denied - super admin only)
- ❌ Admin > Analytics (access denied - super admin only)

**How it works:**
- Role = 'admin' in users_admin table
- Status must be 'active'
- Uses regular `createClient()` for queries (RLS applies)
- Can see all data because RLS policies allow admins access

### Recruiter
**Access:** Own data only
- ✅ Dashboard page
- ✅ Jobs (all jobs, read-only)
- ✅ Candidates (all candidates, read-only)
- ✅ Companies (all companies, read-only)
- ❌ Recruiters page (access denied)
- ❌ Talents page (access denied)
- ❌ Admin sections (access denied)

**How it works:**
- Role = 'recruiter' in users_admin table
- Status must be 'active'
- Uses regular `createClient()` for queries (RLS applies)
- RLS policies restrict to own data only

### Scout
**Access:** Limited visibility
- ✅ Dashboard page
- ✅ Jobs (all jobs, read-only)
- ✅ Candidates (all candidates, read-only)
- ✅ Companies (all companies, read-only)
- ❌ Recruiters page (access denied)
- ❌ Talents page (access denied)
- ❌ Admin sections (access denied)

**How it works:**
- Role = 'scout' in users_admin table
- Status must be 'active'
- Uses regular `createClient()` for queries (RLS applies)
- RLS policies restrict to own data only

### Hiring Manager
**Access:** Limited visibility
- ✅ Dashboard page
- ✅ Jobs (associated jobs only)
- ✅ Candidates (matched candidates only)
- ✅ Companies (associated companies only)
- ❌ Recruiters page (access denied)
- ❌ Talents page (access denied)
- ❌ Admin sections (access denied)

**How it works:**
- Role = 'hiring_manager' in users_admin table
- Status must be 'active'
- Uses regular `createClient()` for queries (RLS applies)

### Viewer
**Access:** Read-only, limited data
- ✅ Dashboard page (limited metrics only)
- ✅ Jobs (read-only)
- ✅ Candidates (read-only)
- ✅ Companies (read-only)
- ❌ Recruiters page (access denied)
- ❌ Talents page (access denied)
- ❌ Admin sections (access denied)

**How it works:**
- Default role if not assigned
- Status must be 'active'
- Uses regular `createClient()` for queries (RLS applies)

## API Endpoints

### `/api/auth/check-status` (Public)
- **Used by:** Login page, Pending Approval page
- **Bypasses:** RLS (uses admin client)
- **Returns:** { status, role, email, isSuperAdmin, fullName }
- **On success:** Syncs user_id if not set

### `/api/admin/check-access` (Protected)
- **Used by:** Admin layout to verify access
- **Bypasses:** RLS (uses admin client)
- **Returns:** { role } (super_admin or admin)
- **Access:** Super admins + admins only

### `/api/admin/users` (Protected)
- **GET:** Fetch all users
- **POST:** Create new user (super_admin only)
- **Bypasses:** RLS (uses admin client)
- **Access:** Super admins + admins (GET), super_admin only (POST)

### `/api/admin/users/[id]` (Protected)
- **GET:** Fetch user details + related jobs/candidates
- **PATCH:** Update user (super_admin only)
- **DELETE:** Delete user (super_admin only)
- **Bypasses:** RLS (uses admin client)
- **Access:** Super admins + admins (GET), super_admin only (PATCH/DELETE)

### `/api/admin/analytics` (Protected)
- **Used by:** Admin dashboard
- **Bypasses:** RLS (uses admin client)
- **Returns:** { totalJobs, openJobs, totalCandidates, ... }
- **Access:** Super admins + admins only

## Status Transitions

- **pending** → **active** (by super admin in User Management)
  - User immediately gets dashboard access on next login
  - No hanging on pending-approval page
  - Full role-based permissions apply

- **active** → **inactive** (by super admin in User Management)
  - User loses access immediately
  - Redirected to pending-approval on next login attempt
  - Cannot access any dashboard pages

## Database Synchronization

### On First Login:
1. User logs in with email
2. `/api/auth/check-status` checks users_admin by email
3. If user_id not set in users_admin, syncs auth.uid() to user_id
4. User is now linked between auth.users and users_admin

### On Role Change:
1. Super admin changes role in User Management page
2. PATCH `/api/admin/users/[id]` updates role and status
3. Updated on next page load or navigation
4. RLS policies take effect based on new role

## Pages and Their Access Control

| Page | Location | Status Check | Role Check | Query Method |
|------|----------|--------------|-----------|--------------|
| Dashboard | `(dashboard)/layout.tsx` | ✅ Admin client | ✅ Super admin bypass | Admin client |
| Dashboard page | `(dashboard)/dashboard/page.tsx` | ✅ Inherited | ✅ Passed from layout | Admin/Regular client |
| Jobs | `(dashboard)/jobs/page.tsx` | ✅ Inherited | ✅ By email via admin client | Admin client for admins |
| Candidates | `(dashboard)/candidates/page.tsx` | ✅ Inherited | ✅ By email via admin client | Admin client for admins |
| Companies | `(dashboard)/companies/page.tsx` | ✅ Inherited | ✅ By email via admin client | Admin client for admins |
| Recruiters | `(dashboard)/recruiters/page.tsx` | ✅ By email | ✅ Admin only | Admin client for admins |
| Talents | `(dashboard)/talents/page.tsx` | ✅ By email | ✅ Admin only | Admin client for admins |
| Admin > Users | `(dashboard)/admin/layout.tsx` | ✅ Inherited | ✅ Super admin only | API endpoint |
| Pending Approval | `auth/pending-approval/page.tsx` | ✅ API call | N/A | API endpoint |
| Login | `auth/login/page.tsx` | ✅ API call | N/A | API endpoint |

## Critical Implementation Details

1. **Super Admin Bypass:** Email check happens FIRST before any DB queries
2. **Admin Client Usage:** Used for super admins in all pages to bypass RLS
3. **Email-based Queries:** All pages query by email (more reliable than user_id)
4. **Automatic user_id Sync:** Dashboard layout syncs auth.uid() on every load
5. **Status Check at Login:** `/api/auth/check-status` prevents pending users from accessing dashboard
6. **API Endpoints Bypass RLS:** All admin APIs use createAdminClient() to bypass RLS
