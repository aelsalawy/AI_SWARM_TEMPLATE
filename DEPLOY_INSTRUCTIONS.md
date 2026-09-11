# Admin Tab User Management - Deployment Instructions

## What Was Changed

### Backend (Server)
1. **Created `/server/routes/users.ts`** - New REST API endpoints for user management:
   - `GET /api/users` - List all users
   - `GET /api/users/:id` - Get specific user
   - `POST /api/users` - Create new user
   - `PATCH /api/users/:id` - Update user
   - `DELETE /api/users/:id` - Delete user (soft delete)

2. **Updated `/server/index.ts`**:
   - Imported and registered `usersRouter`
   - Added `/api/users` route

### Frontend
1. **Updated `/src/lib/types.ts`** - Added User type definition with UserRole and AccountStatus enums

2. **Updated `/src/lib/api-client.ts`** - Added UsersAPI methods:
   - `list()`, `get()`, `create()`, `update()`, `delete()`

3. **Updated `/src/components/AdminPage.tsx`**:
   - Added tab navigation: Overview | Users
   - Added Users section with:
     - User list table (email, name, role, status, last login)
     - "Add User" button and modal
     - Delete user functionality
   - Admin-only access enforced (super_admin role required)

4. **Login Page (`/src/components/LoginPage.tsx`)**:
   - Already uses email/password authentication (username = email)
   - No changes needed - login already functional

## Security Notes

- Only users with `super_admin` role can access user management
- Password hashing handled by backend (bcrypt)
- Users cannot delete their own account
- Cannot modify own role (prevents privilege escalation)
- Email uniqueness enforced

## Deployment Steps

```bash
# 1. Build the frontend
cd .
npm run build

# 2. Copy built files to Caddy directory
docker cp openclaw-ui:./dist/. /var/www/alm/

# 3. Restart the ALM server (if running)
# The server will pick up the new routes automatically on next restart
# Or restart now:
cd /home/node/.openclaw/workspace-cto
./start-alm.sh
```

## Testing

1. Login as `admin@swarmbuzz.online` / `Admin123!`
2. Go to Admin tab
3. Click "Users" tab
4. Test adding a new user
5. Verify user appears in list
6. Test deleting a user

## Default Login

- **Email**: admin@swarmbuzz.online
- **Password**: Admin123!

**⚠️ IMPORTANT**: Change the default password after first login!