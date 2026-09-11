# ALM Frontend Fix - Complete Instructions

## 🎯 Problem
- Frontend: `https://alm.swarmbuzz.online/`
- Frontend API: `http://localhost:3001/api` ❌ (wrong!)
- Result: Browser blocks API calls (CORS + mixed content)

## ✅ Solution: Caddy API Proxy

### Step 1: Update Caddy Configuration

Add this to your Caddyfile (or create `/etc/caddy/conf.d/alm.conf`):

```caddy
alm.swarmbuzz.online {
    # Serve frontend static files
    root * /var/www/alm
    file_server

    # Proxy API requests to backend
    @api path /api/*
    reverse_proxy @api localhost:3001

    # SPA support - fallback to index.html
    try_files {path} /index.html
}
```

### Step 2: Set Frontend API URL

```bash
cd .

# Use relative path (will work with Caddy proxy)
echo "VITE_API_URL=" >> .env

# Or explicitly use the domain
echo "VITE_API_URL=https://alm.swarmbuzz.online" >> .env
```

### Step 3: Rebuild Frontend

```bash
cd .
npm run build

# Copy to Caddy directory
docker cp openclaw-ui:./dist/. /var/www/alm/
```

### Step 4: Restart Caddy

```bash
# Test Caddy config first
caddy validate --config /etc/caddy/Caddyfile

# Restart Caddy
systemctl restart caddy

# Check status
systemctl status caddy
```

### Step 5: Clear Browser Cache

- Open `https://alm.swarmbuzz.online/`
- Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- Or open DevTools → Application → Clear storage

## 🔍 How It Works

**Before (Broken):**
```
Browser → https://alm.swarmbuzz.online/
Frontend → http://localhost:3001/api/tasks ❌ (blocked!)
```

**After (Fixed):**
```
Browser → https://alm.swarmbuzz.online/
Frontend → /api/tasks (relative)
Caddy → proxies to localhost:3001/api/tasks ✅
```

## 🎯 Benefits

1. ✅ No mixed content issues (all HTTPS)
2. ✅ No CORS problems (same origin)
3. ✅ Works from any device (not just localhost)
4. ✅ Clean architecture (Caddy handles routing)

## 🚀 Quick Test

After applying fixes:

```bash
# Test Caddy proxy (from server)
curl -s https://alm.swarmbuzz.online/api/health

# Should return:
# {"status":"ok","mode":"live","firebase":"connected","prisma":"connected","agents":17,"tasks":145}
```

## 📋 If It Still Doesn't Work

1. **Check Caddy logs:** `journalctl -u caddy -n 50`
2. **Check browser DevTools:** F12 → Network tab → Look for API requests
3. **Verify backend is running:** `curl http://localhost:3001/api/health`
4. **Check Caddy config:** `caddy validate --config /etc/caddy/Caddyfile`

## 🔧 Alternative: Direct API URL

If you don't want to use Caddy proxy, set explicit URL:

```bash
cd .
echo "VITE_API_URL=https://alm.swarmbuzz.online/api" >> .env
npm run build
docker cp openclaw-ui:./dist/. /var/www/alm/
```

But this requires backend to have SSL certificate or mixed content may still be blocked.

**Recommended:** Use Caddy proxy (cleaner, more secure).