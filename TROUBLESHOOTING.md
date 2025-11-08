# Troubleshooting Guide

## 403 Forbidden on Login

This is the most common issue. Here's why it happens and how to fix it:

### Cause 1: Using UI.com Cloud Account

**Problem:** The local controller API doesn't accept UI.com (cloud) accounts for authentication.

**Solution:** Create a local-only admin account:

1. Log into your UDM Pro SE web interface
2. Go to Settings → System → Admins
3. Click "Add Admin"
4. **Important:** Choose "Local Access Only" (not "UniFi Account")
5. Set username and password
6. Assign "Super Administrator" role
7. Use these credentials in your .env file

### Cause 2: Wrong API Endpoint

**Problem:** UDM Pro SE uses different endpoints than older controllers.

**Try these endpoints in order:**

1. `/api/auth/login` (UniFi OS - UDM Pro SE, Cloud Key Gen2+)
2. `/api/login` (Legacy controllers)

**Fix:** Update the login URL in `src/local/client.ts`:

```typescript
// Try UniFi OS endpoint first
const response = await fetch(`${this.baseUrl}/api/auth/login`, {
  // ...
});

// If that fails, try legacy endpoint
// const response = await fetch(`${this.baseUrl}/api/login`, {
```

### Cause 3: Incorrect Host/Port

**Problem:** Wrong IP address or port.

**Verify:**
```bash
# Test if you can reach the controller
curl -k https://192.168.1.1:443

# Or try port 8443 (older controllers)
curl -k https://192.168.1.1:8443
```

**Common configurations:**
- UDM Pro SE: `https://192.168.1.1:443` (default)
- Cloud Key: `https://192.168.1.x:8443`
- Self-hosted: `https://localhost:8443`

### Cause 4: SSL Certificate Issues

**Problem:** SSL verification failing.

**Current fix:** We already disable SSL verification:
```typescript
private agent = new https.Agent({ rejectUnauthorized: false });
```

This should work with self-signed certs.

### Cause 5: Two-Factor Authentication Enabled

**Problem:** Account has 2FA enabled.

**Solution:** 
- Create a separate local admin account WITHOUT 2FA
- Use that account for API access
- Keep your main account with 2FA for web UI access

---

## Debug Steps

### 1. Enable Debug Logging

Debug logging is ON by default. You should see:

```
[DEBUG] UniFi Local API initialized
[DEBUG] Base URL: https://192.168.1.1:443
[DEBUG] Username: your_username
[DEBUG] Site: default
[DEBUG] Attempting login...
[DEBUG] URL: https://192.168.1.1:443/api/auth/login
```

### 2. Test Connection Manually

```bash
# Test if controller is reachable
curl -k https://YOUR_UDM_IP:443

# Test login endpoint
curl -k -X POST https://YOUR_UDM_IP:443/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"your_username","password":"your_password"}'
```

### 3. Check Your .env File

```bash
cat .env
```

Should look like:
```env
UNIFI_LOCAL_HOST=192.168.1.1
UNIFI_LOCAL_USERNAME=api-admin
UNIFI_LOCAL_PASSWORD=your_password
UNIFI_LOCAL_SITE=default
UNIFI_LOCAL_PORT=443
```

### 4. Verify Network Access

```bash
# Make sure you're on the same network as your UDM
ping 192.168.1.1

# Or connected via VPN/Tailscale
```

---

## Common Error Messages

### "Login failed: 403 Forbidden"

**Most likely:** Using UI.com account instead of local account  
**Fix:** Create local-only admin account (see Cause 1 above)

### "Login failed: 401 Unauthorized"

**Most likely:** Wrong username or password  
**Fix:** Double-check credentials, try logging into web UI with same credentials

### "ECONNREFUSED" or "ETIMEDOUT"

**Most likely:** Not on same network as UDM  
**Fix:** Connect to home network or VPN

### "self signed certificate"

**Should be handled:** We disable SSL verification  
**If still failing:** Check Node.js version (needs 18+)

---

## Still Not Working?

Run with full debug output:

```bash
DEBUG=* npm run organize -- --dry-run 2>&1 | tee debug.log
```

Share the `debug.log` output (redact passwords!) and I can help diagnose.

---

## Alternative: Use Cloud API Only

If local API continues to fail, you can still use cloud API for monitoring:

```env
# Just set this
UNIFI_CLOUD_API_KEY=your_cloud_key

# Leave local variables commented out
# UNIFI_LOCAL_HOST=...
```

Then run:
```bash
npm run monitor  # Works with cloud API only
npm run optimize # Works with cloud API only
```

You won't be able to apply automated changes, but you'll get monitoring and recommendations.
