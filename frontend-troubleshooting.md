# ALM Frontend Troubleshooting Checklist

## 🔍 Issue: Frontend Not Showing Data

### ✅ Verified Working
- Backend server is running (PID: 35795)
- Backend API returns data via X-Agent-Key auth
- PostgreSQL database has 145 tasks, 17 agents
- Frontend build was created (dist/ exists)

### 🔴 Likely Issues to Check

#### 1. API Endpoint Configuration
**Problem:** Frontend defaults to `http://localhost:3001/api` but may need proper server URL

**Check:**
```bash
# What is the frontend trying to connect to?
grep -r "VITE_API_URL" ./.env*
```

**Fix Options:**
- Option A: Set `VITE_API_URL` to point to correct server
- Option B: Use relative paths if frontend and backend are on same domain
- Option C: Configure CORS properly

#### 2. Authentication Flow
**Problem:** Frontend may not be sending proper auth headers

**Check:**
```bash
# Look at server logs for authentication errors
tail -f /tmp/alm-server.log
```

**Expected Flow:**
1. Frontend stores token in localStorage (`accessToken`, `refreshToken`)
2. Frontend sends `Authorization: Bearer <token>` header
3. Server validates token and returns data

#### 3. Browser Network Tab
**Check in Browser:**
1. Open Developer Tools (F12)
2. Go to Network tab
3. Refresh page
4. Look for API calls to `/api/tasks`, `/api/agents`

**What to look for:**
- ❌ Failed requests (red)
- ❌ CORS errors
- ❌ 401/403 errors
- ✅ Successful requests (green)

#### 4. Frontend Build Verification
**Problem:** Old build might still be cached

**Check:**
```bash
# Verify build was updated
ls -la ./dist/
stat ./dist/index.html
```

**Fix:**
```bash
# Clear browser cache
# Force refresh with Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)

# Or rebuild and redeploy
cd .
npm run build
docker cp openclaw-ui:./dist/. /var/www/alm/
```

#### 5. Caddy Configuration
**Problem:** Caddy might not be serving the updated files

**Check:**
```bash
# Check Caddy configuration
cat /etc/caddy/Caddyfile | grep -A 10 "alm"

# Restart Caddy if needed
systemctl restart caddy
```

### 🎯 Next Steps

1. **Immediate:** Check browser DevTools Network tab for API errors
2. **Configure API URL:** Set proper `VITE_API_URL` in build environment
3. **Test Authentication:** Verify token flow is working
4. **Check CORS:** Ensure frontend domain is allowed

### 📋 Debug Commands

```bash
# Test API directly (works)
curl -H "X-Agent-Key: [REDACTED]" http://127.0.0.1:3001/api/tasks

# Test without auth (should fail)
curl http://127.0.0.1:3001/api/tasks

# Check server logs
tail -50 /tmp/alm-server.log

# Check what frontend is trying to connect to
cd .
grep -r "VITE_API_URL" .env*
cat vite.config.ts | grep -i proxy
```

### 🔧 Most Likely Fix

The frontend needs to know the correct API URL. Set in `.env`:

```bash
VITE_API_URL="http://your-server-domain:3001"
# OR if serving from same domain
VITE_API_URL=""
```

Then rebuild and redeploy.