# 🚨 CRITICAL ISSUE: Caddy Not Proxying API Requests

## 🔴 PROBLEM CONFIRMED

```bash
# Expected: JSON response
# Actual: HTML response (the frontend index.html)
curl https://alm.swarmbuzz.online/api/health

# Returns HTML instead of: {"status":"ok",...}
```

**What's happening:**
- Caddy is serving the frontend HTML for ALL requests
- API requests are NOT being proxied to `localhost:3001`
- Frontend receives HTML when it expects JSON

## 🔧 ROOT CAUSE: Caddy Config Conflict

Your Caddyfile has duplicate/conflicting configurations that prevent the API proxy from working.

## ✅ THE FIX

### Step 1: Update Caddyfile (Remove Conflicts)

Replace the ALM sections with this **clean configuration**:

```caddy
# Remove the old swarmbuzz.online section completely
# Remove the old alm.swarmbuzz.online section completely
# Add these two instead:

swarmbuzz.online {
    handle_path /api/* {
        reverse_proxy localhost:3001
    }
    handle {
        root * /var/www/alm
        try_files {path} /index.html
        file_server
    }
}

alm.swarmbuzz.online {
    handle_path /api/* {
        reverse_proxy localhost:3001
    }
    handle {
        root * /var/www/alm
        try_files {path} /index.html
        file_server
    }
}

# Keep the ERP section as-is
erp.swarmbuzz.online {
    handle /api/* {
        reverse_proxy localhost:3002
    }
    handle {
        root * /var/www/erp
        try_files {path} /index.html
        file_server
    }
}
```

### Step 2: Validate & Restart Caddy

```bash
# Test configuration
caddy validate --config /etc/caddy/Caddyfile

# If validation passes, restart
systemctl restart caddy

# Check status
systemctl status caddy
```

### Step 3: Test API Proxy

```bash
# Test from server (should return JSON, not HTML)
curl -s https://alm.swarmbuzz.online/api/health

# Expected output:
# {"status":"ok","mode":"live","firebase":"connected","prisma":"connected","agents":17,"tasks":145}

# If it still returns HTML, check Caddy logs:
journalctl -u caddy -n 50 --no-pager
```

### Step 4: Clear Browser Cache

After Caddy is fixed:
1. Open `https://alm.swarmbuzz.online/`
2. Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
3. Or open DevTools → Application → Clear storage

## 🔍 Why This Happens

**Old Config (Broken):**
```caddy
swarmbuzz.online {
    root * /var/www/alm
    file_server
    try_files {path} /index.html
}

alm.swarmbuzz.online {
    @api path /api/*
    reverse_proxy @api localhost:3001  # Never executed!
    root * /var/www/alm
    file_server
    try_files {path} /index.html
}
```

The `file_server` directive handles ALL requests before the `@api` matcher can work.

**New Config (Fixed):**
```caddy
alm.swarmbuzz.online {
    handle_path /api/* {               # API FIRST
        reverse_proxy localhost:3001
    }
    handle {                           # Static files SECOND
        root * /var/www/alm
        try_files {path} /index.html
        file_server
    }
}
```

The `handle` directive ensures API requests are matched and proxied BEFORE static files are served.

## 🎯 Key Differences

| Old Config | New Config |
|------------|------------|
| `@api path /api/*` (after file_server) | `handle_path /api/*` (before static) |
| Conflicting domain configs | Clean `handle` blocks |
| Try_files intercepts API requests | Handle separation prevents this |

## 📋 If It Still Doesn't Work

1. **Check Caddy is using the right config:**
   ```bash
   caddy list-modules
   caddy validate --config /etc/caddy/Caddyfile
   ```

2. **Check backend is running:**
   ```bash
   curl http://localhost:3001/api/health
   ```

3. **Check Caddy logs:**
   ```bash
   journalctl -u caddy -f
   ```

4. **Test with verbose curl:**
   ```bash
   curl -v https://alm.swarmbuzz.online/api/health
   ```

## 🚀 Quick Reference: `handle_path` vs `@api`

- **`@api path /api/*` + `reverse_proxy @api`**: Old syntax, order-sensitive
- **`handle_path /api/*`**: New syntax, executes first, strips `/api` prefix automatically
- **`handle` blocks**: Execute in order, first match wins

**Recommendation:** Always use `handle_path` for API proxies in Caddy v2.5+.