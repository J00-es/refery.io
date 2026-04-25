# Authentication & Authorization Verification Checklist

## For Super Admin (lily@10kventures.co)

- [ ] Login at `/auth/login` with lily@10kventures.co
- [ ] Should NOT see pending-approval page
- [ ] Should redirect directly to `/dashboard`
- [ ] Can access all pages: Jobs, Candidates, Companies, Recruiters, Talents, Admin > Users
- [ ] Admin > Users page shows all users
- [ ] Can change user status from "Pending" to "Active"
- [ ] Can change user roles (Recruiter, Scout, Admin, etc.)
- [ ] Can delete users
- [ ] Can add new users
- [ ] Admin > Analytics shows all metrics

## For Recruiter (After Status = Active)

### Prerequisites:
1. Super admin adds recruiter user with email: `recruiter@example.com`
2. Sets role = "recruiter"
3. Sets status = "pending" initially
4. Super admin changes status to "active"

### Verification:
- [ ] Recruiter logs in at `/auth/login` with recruiter@example.com
- [ ] Should NOT see pending-approval page (status is active)
- [ ] Should redirect directly to `/dashboard`
- [ ] Can see: Dashboard, Jobs (read-only), Candidates (read-only), Companies (read-only)
- [ ] CANNOT see: Recruiters tab, Talents tab, Admin menu
- [ ] Can view all jobs/candidates
- [ ] Cannot access `/recruiters` page (forbidden)
- [ ] Cannot access `/admin/users` page (forbidden)

## For Scout (After Status = Active)

### Prerequisites:
1. Super admin adds scout user with email: `scout@example.com`
2. Sets role = "scout"
3. Sets status = "pending" initially
4. Super admin changes status to "active"

### Verification:
- [ ] Scout logs in at `/auth/login` with scout@example.com
- [ ] Should NOT see pending-approval page (status is active)
- [ ] Should redirect directly to `/dashboard`
- [ ] Can see: Dashboard, Jobs (read-only), Candidates (read-only), Companies (read-only)
- [ ] CANNOT see: Recruiters tab, Talents tab, Admin menu
- [ ] Cannot access `/recruiters` page (forbidden)
- [ ] Cannot access `/admin/users` page (forbidden)

## For Pending User (Status = Pending)

### Prerequisites:
1. Super admin adds user with email: `pending@example.com`
2. Sets role = "recruiter"
3. Sets status = "pending"

### Verification:
- [ ] Pending user logs in at `/auth/login` with pending@example.com
- [ ] SHOULD see pending-approval page
- [ ] Message says: "Your application is being reviewed by our team..."
- [ ] Can click "Check My Status" button
- [ ] Page refreshes, still shows pending (if status not changed)
- [ ] Once super admin changes status to "active":
  - [ ] User clicks "Check My Status" again
  - [ ] Should redirect to `/dashboard` (no longer pending)
  - [ ] Has full recruiter access

## Status Change Workflow

### Step 1: Create User as Pending
- [ ] Go to Admin > Users page
- [ ] Click "+ Add User"
- [ ] Enter email: `testuser@example.com`
- [ ] Select role: "Recruiter"
- [ ] Select status: "Pending"
- [ ] Click "Add User"
- [ ] User appears in list with "Pending" status

### Step 2: Activate User
- [ ] In Admin > Users page, find the user
- [ ] Click status dropdown ("Pending")
- [ ] Change to "Active"
- [ ] Confirm change

### Step 3: Verify User Can Now Login
- [ ] New user logs in with their email
- [ ] Should go directly to `/dashboard` (no pending page)
- [ ] User_id should be synced in users_admin table
- [ ] Can access all recruiter-level pages
- [ ] Role badge shows "Recruiter"

## Edge Cases

### Edge Case 1: User Created But Never Logged In
- [ ] Create user with email, set to "active"
- [ ] User has never logged in
- [ ] When user first logs in:
  - [ ] Should redirect to `/dashboard` (because status = active)
  - [ ] user_id should be synced in users_admin
  - [ ] Can access dashboard and other pages

### Edge Case 2: User Status Changed to Inactive
- [ ] Create active user and they log in successfully
- [ ] Super admin changes status to "inactive" in User Management
- [ ] User refreshes dashboard or navigates
- [ ] Should redirect to `/auth/pending-approval`
- [ ] User clicks "Check My Status"
- [ ] Still sees pending message

### Edge Case 3: User Deleted
- [ ] Active user is logged in
- [ ] Super admin deletes user from Admin > Users
- [ ] User session still valid (browser hasn't refreshed)
- [ ] User refreshes page
- [ ] Should redirect to `/auth/login` (user not found)

### Edge Case 4: Role Changed While User Logged In
- [ ] Recruiter is viewing `/candidates` page
- [ ] Super admin changes their role to "scout"
- [ ] Recruiter refreshes page
- [ ] Role-based access should update
- [ ] Should still see candidates (both roles have access)

### Edge Case 5: Super Admin Email Not Set Yet
- [ ] User email accidentally not in SUPER_ADMIN_EMAILS
- [ ] User record has role = "super_admin", status = "active"
- [ ] User logs in
- [ ] WILL see pending-approval page (email check happens first)
- [ ] Fix: Add email to SUPER_ADMIN_EMAILS constant

## Database Verification

### Check users_admin table:
```sql
SELECT id, email, role, status, user_id, created_at 
FROM public.users_admin 
ORDER BY created_at DESC;
```

Should show:
- lily@10kventures.co with role = super_admin, status = active, user_id = [auth_uid]
- Other users with appropriate roles and statuses
- user_id synced for all logged-in users

### Check RLS policies:
```sql
SELECT policyname, cmd FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'users_admin';
```

Should show:
- users_can_read_own_record (SELECT)
- admins_can_read_all_users (SELECT)
- super_admins_can_manage_users (ALL)

## API Testing

### Test /api/auth/check-status
```bash
# Get auth token first, then:
curl -X GET http://localhost:3000/api/auth/check-status \
  -H "Cookie: auth-token=YOUR_TOKEN"
```

Should return:
- For super admin: { status: 'active', role: 'super_admin', isSuperAdmin: true }
- For recruiter (active): { status: 'active', role: 'recruiter', isSuperAdmin: false }
- For pending user: { status: 'pending', role: 'recruiter', isSuperAdmin: false }

### Test /api/admin/check-access
```bash
curl -X GET http://localhost:3000/api/admin/check-access \
  -H "Cookie: auth-token=YOUR_TOKEN"
```

Should return:
- For super admin: { role: 'super_admin' }
- For admin: { role: 'admin' }
- For other roles: 403 Forbidden
