#!/usr/bin/env node
import { config } from 'dotenv';
import { UniFiSDK } from './index.js';
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
    console.log(`   Location: ${site.meta.desc}`);
    console.log(`   Devices: ${site.statistics.counts.totalDevice} (${site.statistics.counts.offlineDevice} offline)`);
    console.log(`   Clients: ${site.statistics.counts.wifiClient + site.statistics.counts.wiredClient}`);
    console.log(`   WiFi TX Retry: ${site.statistics.percentages.txRetry.toFixed(2)}%`);
    console.log(`   IPS Status: ${site.statistics.gateway.ipsMode}`);
    console.log();
  }

  if (overview.hosts.length > 0) {
    console.log('📡 Hosts:');
    for (const host of overview.hosts) {
      console.log(`   ${host.reportedState?.hostname || host.type}`);
      console.log(`   Firmware: ${host.reportedState?.version}`);
      console.log(`   Last Backup: ${host.latestBackupTime}`);
      console.log();
    }
  }

  // Save data
  writeFileSync('network-data.json', JSON.stringify(overview, null, 2));
  console.log('✓ Data saved to network-data.json\n');
}

async function optimize() {
  console.log('🔍 Analyzing network for optimization opportunities...\n');

  const analysis = await sdk.analyzeNetwork();

  console.log('=== Network Health ===\n');
  console.log(`Health Score: ${analysis.summary.healthScore}/100`);
  console.log(`Devices: ${analysis.summary.onlineDevices}/${analysis.summary.totalDevices} online`);
  console.log(`Clients: ${analysis.summary.totalClients} (${analysis.summary.wifiClients} WiFi, ${analysis.summary.wiredClients} wired)`);
  console.log();

  if (analysis.recommendations.length === 0) {
    console.log('✅ No issues found - network is optimized!\n');
    return;
  }

  const critical = analysis.recommendations.filter(r => r.severity === 'critical');
  const high = analysis.recommendations.filter(r => r.severity === 'high');
  const medium = analysis.recommendations.filter(r => r.severity === 'medium');
  const low = analysis.recommendations.filter(r => r.severity === 'low');

  if (critical.length > 0) {
    console.log('🔴 CRITICAL ISSUES:\n');
    critical.forEach(rec => {
      console.log(`   ${rec.title}`);
      console.log(`   ${rec.description}`);
      console.log(`   Current: ${rec.currentState}`);
      console.log(`   Recommended: ${rec.recommendedState}`);
      console.log(`   Automated: ${rec.automated ? '✓ Yes' : '✗ Manual'}`);
      console.log();
    });
  }

  if (high.length > 0) {
    console.log('🟠 HIGH PRIORITY:\n');
    high.forEach(rec => {
      console.log(`   ${rec.title}`);
      console.log(`   ${rec.description}`);
      console.log(`   Current: ${rec.currentState} → Recommended: ${rec.recommendedState}`);
      console.log(`   Automated: ${rec.automated ? '✓ Yes' : '✗ Manual'}`);
      console.log();
    });
  }

  if (medium.length > 0) {
    console.log('🟡 MEDIUM PRIORITY:\n');
    medium.forEach(rec => {
      console.log(`   ${rec.title}: ${rec.currentState} → ${rec.recommendedState}`);
      console.log(`   Automated: ${rec.automated ? '✓' : '✗'}`);
    });
    console.log();
  }

  if (low.length > 0) {
    console.log('🟢 LOW PRIORITY:\n');
    low.forEach(rec => {
      console.log(`   ${rec.title}`);
    });
    console.log();
  }

  // Save analysis
  writeFileSync('analysis.json', JSON.stringify(analysis, null, 2));
  console.log('✓ Analysis saved to analysis.json\n');

  const automatable = analysis.recommendations.filter(r => r.automated);
  if (automatable.length > 0) {
    console.log(`💡 ${automatable.length} optimization(s) can be automated`);
    console.log('   Run: npm run apply -- --dry-run (to preview)');
    console.log('   Run: npm run apply (to apply changes)');
  }
}

async function apply() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(dryRun ? '🧪 DRY RUN MODE\n' : '⚡ APPLYING OPTIMIZATIONS\n');

  const analysis = await sdk.analyzeNetwork();
  const results = await sdk.applyOptimizations(analysis.recommendations, { dryRun });

  if (dryRun) {
    console.log('\n✓ Dry run complete - no changes made');
    return;
  }

  console.log('\n=== Application Results ===\n');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✓ Successful: ${successful.length}`);
  console.log(`✗ Failed: ${failed.length}`);
  console.log();

  if (failed.length > 0) {
    console.log('Failed changes:');
    failed.forEach(r => {
      console.log(`   ✗ ${r.change.description}: ${r.error}`);
    });
  }

  if (successful.length > 0) {
    console.log('\n✓ Optimizations applied successfully!');
    console.log('   Run: npm run monitor (to verify changes)');
  }
}

async function testConnection() {
  console.log('🔌 Testing API connections...\n');

  const result = await sdk.testConnection();

  console.log(`Cloud API: ${result.cloud ? '✓ Connected' : '✗ Not configured or failed'}`);
  console.log(`Local API: ${result.local ? '✓ Connected' : '✗ Not configured or failed'}`);
  console.log();

  if (result.errors.length > 0) {
    console.log('Errors:');
    result.errors.forEach(err => console.log(`   ${err}`));
  }

  if (!result.cloud && !result.local) {
    console.log('\n⚠️  No API configured. Check your .env file.');
  }
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
  case 'test':
    testConnection().catch(console.error);
    break;
  default:
    console.log('UniFi Network Management SDK\n');
    console.log('Commands:');
    console.log('  npm run monitor   - View network status');
    console.log('  npm run optimize  - Analyze and get recommendations');
    console.log('  npm run apply     - Apply automated optimizations');
    console.log('  npm run dev test  - Test API connections');
}
