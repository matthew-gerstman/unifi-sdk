# UniFi Network Management SDK

Comprehensive TypeScript SDK for managing UniFi networks with both Cloud API (monitoring) and Local Controller API (configuration).

## Features

### Monitoring (Cloud API)
- ✅ Zero setup - works remotely via cloud
- 📊 Network health metrics
- 📈 ISP performance tracking
- 🔍 Device and client statistics
- ⚡ 10,000 req/min rate limit

### Configuration (Local API)
- 🔧 Enable/disable IPS
- 📡 Optimize WiFi settings (transmit power, channels, band steering)
- 🌐 Create VLANs
- 🔥 Manage firewall rules
- 🔄 Reboot devices
- ⚙️ Full network configuration control

### Automation
- 🤖 Automated optimization recommendations
- ✅ One-command network optimization
- 🧪 Dry-run mode for safe testing
- 📋 Detailed change tracking with rollback support

## Installation

```bash
git clone https://github.com/matthew-gerstman/unifi-sdk.git
cd unifi-sdk
npm install
```

## Configuration

Create `.env` file:

```env
# Cloud API (for remote monitoring)
UNIFI_CLOUD_API_KEY=your_cloud_api_key

# Local API (for configuration changes - when on same network)
UNIFI_LOCAL_HOST=192.168.1.1
UNIFI_LOCAL_USERNAME=admin
UNIFI_LOCAL_PASSWORD=your_password
UNIFI_LOCAL_SITE=default
UNIFI_LOCAL_PORT=443
```

### Getting Credentials

**Cloud API Key:**
1. Go to https://unifi.ui.com
2. Navigate to API section
3. Create API Key
4. Copy and paste into `.env`

**Local API Credentials:**
- Use your UDM Pro SE admin username/password
- Must be a local account (not UI.com SSO)
- Create dedicated API user in Settings → System → Admins

## Usage

### 1. Monitor Network (Read-Only)

```bash
npm run monitor
```

Displays:
- Network health overview
- Device status
- Client connections
- WiFi performance metrics
- ISP status

Uses Cloud API - works from anywhere.

### 2. Analyze & Get Recommendations

```bash
npm run optimize
```

Analyzes your network and provides:
- Health score (0-100)
- Prioritized recommendations
- Automated vs manual fixes
- Impact analysis

### 3. Apply Automated Optimizations

**Dry run first (safe):**
```bash
npm run apply -- --dry-run
```

**Apply changes:**
```bash
npm run apply
```

Automatically fixes:
- ✅ Enable IPS in detection mode
- ✅ Optimize AP transmit power
- ✅ Enable band steering
- ✅ Enable fast roaming (802.11r)

**Note:** Requires local API access (must run on same network as UDM or via VPN).

### 4. Test Connection

```bash
npm run dev test
```

Verifies both Cloud and Local API connectivity.

## Example Workflow

### From Anywhere (Cloud API Only)

```bash
# Monitor your network remotely
npm run monitor

# Get optimization recommendations
npm run optimize
```

### From Home Network (Full Access)

```bash
# Configure both APIs in .env
# Then run full workflow:

npm run monitor     # Check current status
npm run optimize    # Get recommendations
npm run apply --dry-run  # Preview changes
npm run apply       # Apply optimizations
npm run monitor     # Verify improvements
```

## Programmatic Usage

```typescript
import { UniFiSDK } from '@mattgerstman/unifi-sdk';

const sdk = new UniFiSDK({
  cloudApiKey: process.env.UNIFI_CLOUD_API_KEY,
  localHost: '192.168.1.1',
  localUsername: 'admin',
  localPassword: 'password',
});

// Monitor network
const overview = await sdk.getNetworkOverview();
console.log(`Devices: ${overview.sites[0].statistics.counts.totalDevice}`);

// Analyze and get recommendations
const analysis = await sdk.analyzeNetwork();
console.log(`Health Score: ${analysis.summary.healthScore}/100`);

// Apply automated fixes
const results = await sdk.applyOptimizations(analysis.recommendations);
console.log(`Applied ${results.filter(r => r.success).length} optimizations`);
```

## Available Optimizations

### Automated (One-Click)

| Optimization | Risk | Reversible | Impact |
|--------------|------|------------|--------|
| Enable IPS (Detection) | Low | Yes | High security improvement |
| Enable IPS (Prevention) | Medium | Yes | Active threat blocking |
| Reduce AP Transmit Power | Low | Yes | Better roaming, less interference |
| Enable Band Steering | Low | Yes | Better 5GHz utilization |
| Enable Fast Roaming | Medium | Yes | Faster client transitions |

### Manual (Guidance Provided)

- Fix offline devices (hardware dependent)
- Investigate WAN latency (ISP dependent)
- Move clients to wired (physical changes)
- Create VLAN segmentation (requires planning)
- Configure guest network (requires decisions)

## Safety Features

- **Dry-run mode:** Preview all changes before applying
- **Rollback support:** Automated changes can be reversed
- **Risk levels:** Each change labeled with risk assessment
- **Change tracking:** Full audit log of modifications
- **Validation:** Pre-flight checks before applying changes

## Architecture

```
UniFiSDK
├── Cloud API (api.ui.com)
│   ├── Read-only monitoring
│   ├── Works remotely
│   └── No VPN required
│
└── Local API (192.168.x.x:443)
    ├── Full read/write access
    ├── Requires network access
    └── Configuration changes
```

## API Endpoints Used

### Cloud API (Read-Only)
- `GET /v1/hosts` - Controller information
- `GET /v1/sites` - Site statistics
- `GET /v1/devices` - Device list
- `GET /ea/isp-metrics/{type}` - ISP performance

### Local API (Read/Write)
- `POST /api/auth/login` - Authentication
- `GET /proxy/network/api/s/{site}/stat/device` - Device details
- `GET /proxy/network/api/s/{site}/stat/sta` - Client details
- `PUT /proxy/network/api/s/{site}/rest/setting/ips` - IPS configuration
- `PUT /proxy/network/api/s/{site}/rest/device/{id}` - Device configuration
- `PUT /proxy/network/api/s/{site}/rest/wlanconf/{id}` - WiFi configuration
- `POST /proxy/network/api/s/{site}/rest/networkconf` - Network/VLAN creation

## Security Considerations

**Cloud API:**
- Read-only access
- API key stored in environment variable
- Rate limited by Ubiquiti

**Local API:**
- Full admin access - use with caution
- Credentials stored in environment (never committed)
- Use dedicated API user with minimal permissions if possible
- All changes logged and reversible

**Best Practices:**
- Always run `--dry-run` first
- Test changes in maintenance window
- Keep backups current (automatic on UDM)
- Review change logs regularly

## Extending the SDK

### Add New Optimization

```typescript
// In src/index.ts, add to analyzeNetwork():

recommendations.push({
  id: 'my-optimization',
  category: 'performance',
  severity: 'medium',
  title: 'My Custom Optimization',
  description: 'Description of what this fixes',
  currentState: 'Current value',
  recommendedState: 'Target value',
  impact: 'What improves',
  automated: true,
});

// Then implement in applyOptimizations():

case 'my-optimization':
  result = await this.local.myCustomMethod();
  break;
```

### Add New API Method

```typescript
// In src/local/client.ts:

async myCustomMethod(): Promise<ApplyResult> {
  const change: ConfigurationChange = {
    type: 'system',
    action: 'update',
    target: 'My Target',
    payload: { ... },
    description: 'What this does',
    reversible: true,
    riskLevel: 'low',
  };

  try {
    await this.request('/proxy/network/api/s/default/...', {
      method: 'PUT',
      body: JSON.stringify({ ... }),
    });

    return { success: true, change };
  } catch (error) {
    return {
      success: false,
      change,
      error: error instanceof Error ? error.message : 'Unknown',
    };
  }
}
```

## Troubleshooting

**Cloud API Issues:**
- Verify API key is correct
- Check cloud access is enabled in UDM settings
- Ensure you're the owner or admin of the site

**Local API Issues:**
- Verify you're on the same network as UDM (or connected via VPN)
- Check username/password are correct
- Ensure using local account (not UI.com SSO)
- Verify UDM IP address is correct
- Check firewall isn't blocking port 443

**Connection Test:**
```bash
npm run dev test
```

## Roadmap

- [ ] WebSocket support for real-time events
- [ ] Advanced WiFi optimization (channel selection, power tuning)
- [ ] Automated VLAN creation workflow
- [ ] Firewall rule management
- [ ] Client blocking/limiting
- [ ] Traffic shaping configuration
- [ ] Scheduled optimization runs
- [ ] Slack/Discord notifications
- [ ] Grafana dashboard integration

## License

MIT

## Author

Matthew Gerstman

## IP Address Organization (Zero Overhead)

### Automatic Device Classification & IP Assignment

The SDK can automatically organize your devices into logical IP ranges using DHCP reservations - **zero performance overhead**.

#### Why This Approach

- **Maximum Performance:** All devices on same subnet = Layer 2 switching = line rate (10Gbps)
- **Zero Overhead:** DHCP reservations have no runtime cost
- **Easy Management:** Organized IPs make troubleshooting simple
- **Flexible:** Can add VLANs later if you want security isolation

#### IP Scheme

| Range | Category | Example Devices |
|-------|----------|-----------------|
| 10.0.0.1-50 | Infrastructure | Router, switches, APs |
| 10.0.0.51-100 | Servers | NAS, Plex, servers |
| 10.0.0.101-150 | Computers | Desktops, workstations |
| 10.0.0.151-200 | Laptops & Tablets | MacBooks, iPads |
| 10.0.0.201-250 | Phones | iPhones, Android |
| 10.0.1.1-100 | Media | Apple TV, Roku, consoles |
| 10.0.2.1-100 | IoT - Trusted | Hue, Nest, Ecobee |
| 10.0.3.1-100 | IoT - Untrusted | Cheap IoT devices |
| 10.0.4.1-100 | Cameras | Security cameras, doorbells |
| 10.0.5.1-254 | Guest | Visitor devices |
| 10.0.10.0-20.254 | DHCP Pool | Unclassified devices |

#### Usage

**Preview organization:**
```bash
npm run organize -- --dry-run
```

**Apply DHCP reservations:**
```bash
npm run organize
```

**What it does:**
1. Scans all connected clients
2. Classifies by hostname pattern (iPhone → Phones, Apple-TV → Media, etc.)
3. Assigns IP in appropriate range
4. Creates DHCP reservation (device always gets this IP)
5. Generates detailed report

#### Classification Rules

The SDK auto-detects device types:

- **Infrastructure:** hostname contains "switch", "ap-", "udm"
- **Servers:** "nas", "server", "plex", "homeassistant"
- **Computers:** "desktop", "pc-", "imac", "workstation"
- **Laptops:** "macbook", "laptop", "surface"
- **Phones:** "iphone", "android", "phone"
- **Media:** "appletv", "roku", "tv", "sonos", "playstation", "xbox"
- **IoT Trusted:** "hue", "nest", "ecobee", "homekit"
- **Cameras:** "camera", "doorbell", "nvr"

Devices that don't match get flagged for manual classification.

#### Performance Impact

**Zero.** Seriously.

- DHCP reservations = same DHCP protocol
- All devices on same subnet = Layer 2 switching
- Hardware-accelerated switching in UDM Pro SE
- 10Gbps line rate between any devices
- <1ms latency

#### Manual Classification

For unclassified devices, edit the plan and re-run:

```bash
# Review unclassified devices
cat ip-organization-plan.md

# Add custom rules in src/local/ip-organization.ts
# Then re-run
npm run organize
```

## Performance vs Security Trade-offs

### Option 1: Flat Network (Maximum Speed) ⚡

**What you get:**
- 10Gbps wired throughput
- <1ms latency
- Zero routing overhead
- Organized by IP ranges

**What you sacrifice:**
- No network isolation
- IoT can theoretically access everything
- Security depends on device-level controls

**Recommended for:** Home networks prioritizing speed over security

### Option 2: VLAN Segmentation (Balanced) 🔒

**What you get:**
- Network isolation (IoT can't reach computers)
- Firewall rules between segments
- Contained breach radius
- Still 9+ Gbps throughput

**What you sacrifice:**
- ~5-10% overhead for cross-VLAN traffic
- Slightly more complex management
- Need firewall rules for device communication

**Recommended for:** Home networks with untrusted IoT devices

### Recommendation

**Start with Option 1 (flat + organized IPs).** You can add VLANs later if needed. The performance difference is negligible for home use, but flat is simpler and faster.

