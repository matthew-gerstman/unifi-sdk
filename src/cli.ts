#!/usr/bin/env node
import { config } from 'dotenv';
import { UniFiSDK } from './index.js';
import { IPOrganizer } from './local/ip-organization.js';
import { writeFileSync } from 'fs';

config();

const sdk = new UniFiSDK({
  cloudApiKey: process.env.UNIFI_CLOUD_API_KEY,
  localHost: process.env.UNIFI_LOCAL_HOST,
  localUsername: process.env.UNIFI_LOCAL_USERNAME,
  localPassword: process.env.UNIFI_LOCAL_PASSWORD,
  localSite: process.env.UNIFI_LOCAL_SITE || 'default',
  localPort: process.env.UNIFI_LOCAL_PORT 
    ? parseInt(process.env.UNIFI_LOCAL_PORT) 
    : undefined,
});

async function monitor() {
  console.log('🔍 Monitoring network...\n');
  const overview = await sdk.getNetworkOverview();

  console.log('=== Network Overview ===\n');
  
  if (overview.sites.length > 0) {
    const site = overview.sites[0];
    console.log(`📍 Site: ${site.meta.name}`);
    console.log(`   Devices: ${site.statistics.counts.totalDevice} (${site.statistics.counts.offlineDevice} offline)`);
    console.log(`   Clients: ${site.statistics.counts.wifiClient + site.statistics.counts.wiredClient}`);
    console.log(`   WiFi TX Retry: ${site.statistics.percentages.txRetry.toFixed(2)}%`);
    console.log(`   IPS: ${site.statistics.gateway.ipsMode}`);
    console.log();
  }

  writeFileSync('network-data.json', JSON.stringify(overview, null, 2));
  console.log('✓ Data saved to network-data.json\n');
}

async function optimize() {
  console.log('🔍 Analyzing network...\n');
  const analysis = await sdk.analyzeNetwork();

  console.log('=== Network Health ===\n');
  console.log(`Health Score: ${analysis.summary.healthScore}/100`);
  console.log(`Devices: ${analysis.summary.onlineDevices}/${analysis.summary.totalDevices} online`);
  console.log(`Clients: ${analysis.summary.totalClients}\n`);

  if (analysis.recommendations.length === 0) {
    console.log('✅ No issues found!\n');
    return;
  }

  ['critical', 'high', 'medium', 'low'].forEach(severity => {
    const recs = analysis.recommendations.filter(r => r.severity === severity);
    if (recs.length === 0) return;

    const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[severity];
    console.log(`${emoji} ${severity.toUpperCase()}:\n`);
    recs.forEach(rec => {
      console.log(`   ${rec.title}`);
      console.log(`   ${rec.currentState} → ${rec.recommendedState}`);
      console.log(`   Automated: ${rec.automated ? '✓' : '✗'}\n`);
    });
  });

  writeFileSync('analysis.json', JSON.stringify(analysis, null, 2));
  console.log('✓ Analysis saved\n');
}

async function apply() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? '🧪 DRY RUN\n' : '⚡ APPLYING\n');

  const analysis = await sdk.analyzeNetwork();
  const results = await sdk.applyOptimizations(analysis.recommendations, { dryRun });

  if (dryRun) {
    console.log('✓ Dry run complete\n');
    return;
  }

  const successful = results.filter(r => r.success);
  console.log(`✓ Applied ${successful.length} optimizations\n`);
}

async function organize() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(dryRun ? '🧪 DRY RUN - IP Organization Preview\n' : '📋 Organizing IP Addresses\n');

  // Need local API for this
  const localApi = (sdk as any).local;
  if (!localApi) {
    console.error('❌ Local API required for IP organization');
    console.error('Configure UNIFI_LOCAL_* variables in .env');
    process.exit(1);
  }

  const organizer = new IPOrganizer(localApi);
  const clients = await organizer.getCurrentClients();

  console.log(`Found ${clients.length} connected devices\n`);

  const { organized, unclassified } = await organizer.organizeDevicesByType(clients, dryRun);

  // Group by type for display
  const byType = organized.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {} as Record<string, typeof organized>);

  console.log('=== Auto-Classified Devices ===\n');
  Object.entries(byType).forEach(([type, devices]) => {
    console.log(`${type}: ${devices.length} devices`);
    devices.slice(0, 3).forEach(d => {
      const name = clients.find(c => c.mac === d.mac)?.name || 
                   clients.find(c => c.mac === d.mac)?.hostname || 
                   d.mac;
      console.log(`   ${name}: ${d.currentIp} → ${d.assignedIp}`);
    });
    if (devices.length > 3) {
      console.log(`   ... and ${devices.length - 3} more`);
    }
    console.log();
  });

  if (unclassified.length > 0) {
    console.log('=== Unclassified Devices (Manual Review) ===\n');
    unclassified.forEach(c => {
      console.log(`   ${c.name || c.hostname || 'Unknown'} (${c.mac}): ${c.ip}`);
    });
    console.log();
  }

  console.log(`\nSummary:`);
  console.log(`   Auto-classified: ${organized.length}`);
  console.log(`   Needs review: ${unclassified.length}`);

  if (dryRun) {
    console.log('\n💡 Run without --dry-run to apply DHCP reservations');
  } else {
    console.log('\n✅ DHCP reservations created!');
    console.log('   Devices will get new IPs on next DHCP renewal');
    console.log('   Or reboot devices to apply immediately');
  }

  // Save plan
  const plan = await organizer.generateOrganizationPlan(clients);
  writeFileSync('ip-organization-plan.md', plan);
  console.log('\n✓ Detailed plan saved to ip-organization-plan.md');
}

// Main CLI
const command = process.argv[2];

switch (command) {
  case 'monitor':
    monitor().catch(console.error);
    break;
  case 'optimize':
    optimize().catch(console.error);
    break;
  case 'apply':
    apply().catch(console.error);
    break;
  case 'organize':
    organize().catch(console.error);
    break;
  case 'test':
    sdk.testConnection().then(r => {
      console.log(`Cloud: ${r.cloud ? '✓' : '✗'}`);
      console.log(`Local: ${r.local ? '✓' : '✗'}`);
      if (r.errors.length) r.errors.forEach(e => console.log(e));
    }).catch(console.error);
    break;
  default:
    console.log('UniFi Network Management SDK\n');
    console.log('Commands:');
    console.log('  monitor   - Network status');
    console.log('  optimize  - Get recommendations');
    console.log('  apply     - Apply optimizations');
    console.log('  organize  - Organize IPs by device type');
    console.log('  test      - Test API connections');
    console.log('\nOptions:');
    console.log('  --dry-run - Preview without applying');
}
