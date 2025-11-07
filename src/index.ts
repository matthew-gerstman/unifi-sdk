import { UniFiCloudAPI } from './cloud/client.js';
import { UniFiLocalAPI } from './local/client.js';
import {
  CloudHost,
  CloudSite,
  CloudDevice,
  LocalDevice,
  LocalClient,
  NetworkAnalysis,
  OptimizationRecommendation,
  ApplyResult,
  ConfigurationChange,
} from './types/index.js';

export interface UniFiSDKConfig {
  // Cloud API (monitoring only)
  cloudApiKey?: string;
  
  // Local API (full read/write)
  localHost?: string;
  localUsername?: string;
  localPassword?: string;
  localSite?: string;
  localPort?: number;
}

export class UniFiSDK {
  private cloud?: UniFiCloudAPI;
  private local?: UniFiLocalAPI;

  constructor(config: UniFiSDKConfig) {
    if (config.cloudApiKey) {
      this.cloud = new UniFiCloudAPI(config.cloudApiKey);
    }

    if (config.localHost && config.localUsername && config.localPassword) {
      this.local = new UniFiLocalAPI({
        host: config.localHost,
        username: config.localUsername,
        password: config.localPassword,
        site: config.localSite,
        port: config.localPort,
      });
    }
  }

  // ============================================================================
  // Monitoring (uses Cloud API if available, falls back to Local)
  // ============================================================================

  async getNetworkOverview(): Promise<{
    hosts: CloudHost[];
    sites: CloudSite[];
    devices: CloudDevice[] | LocalDevice[];
    clients?: LocalClient[];
  }> {
    if (this.cloud) {
      const [hosts, sites, devices] = await Promise.all([
        this.cloud.getHosts(),
        this.cloud.getSites(),
        this.cloud.getDevices(),
      ]);

      return { hosts, sites, devices };
    }

    if (this.local) {
      const [devices, clients] = await Promise.all([
        this.local.getDevices(),
        this.local.getClients(),
      ]);

      return {
        hosts: [],
        sites: [],
        devices,
        clients,
      };
    }

    throw new Error('No API configured');
  }

  async analyzeNetwork(): Promise<NetworkAnalysis> {
    const overview = await this.getNetworkOverview();
    const recommendations: OptimizationRecommendation[] = [];

    // Analyze using cloud data
    if (overview.sites.length > 0) {
      const site = overview.sites[0];
      const stats = site.statistics;

      // Check IPS status
      if (stats.gateway.ipsMode === 'disabled') {
        recommendations.push({
          id: 'ips-disabled',
          category: 'security',
          severity: 'critical',
          title: 'Intrusion Prevention System Disabled',
          description: 'IPS is disabled, leaving network vulnerable to known exploits',
          currentState: 'Disabled',
          recommendedState: 'Enabled (Detection mode)',
          impact: 'High security risk - network exposed to threats',
          automated: this.local !== undefined,
        });
      }

      // Check offline devices
      if (stats.counts.offlineDevice > 0) {
        recommendations.push({
          id: 'offline-devices',
          category: 'reliability',
          severity: 'high',
          title: `${stats.counts.offlineDevice} Device(s) Offline`,
          description: 'Offline devices may indicate hardware failure or connectivity issues',
          currentState: `${stats.counts.offlineDevice} offline`,
          recommendedState: 'All devices online',
          impact: 'Network coverage gaps, reduced redundancy',
          automated: false,
        });
      }

      // Check WiFi retry rate
      if (stats.percentages.txRetry > 5) {
        recommendations.push({
          id: 'high-retry-rate',
          category: 'performance',
          severity: 'medium',
          title: 'High WiFi Retry Rate',
          description: `TX retry rate at ${stats.percentages.txRetry.toFixed(2)}% (should be <5%)`,
          currentState: `${stats.percentages.txRetry.toFixed(2)}%`,
          recommendedState: '<5%',
          impact: 'Reduced WiFi performance, slower speeds',
          automated: this.local !== undefined,
        });
      }

      // Check WAN issues
      Object.entries(stats.wans).forEach(([wanName, wanStatus]) => {
        if (wanStatus.wanIssues && wanStatus.wanIssues.length > 0) {
          const latencyIssues = wanStatus.wanIssues.filter(i => i.highLatency);
          if (latencyIssues.length > 0) {
            const avgLatency = latencyIssues[0].latencyAvgMs;
            recommendations.push({
              id: `wan-latency-${wanName}`,
              category: 'performance',
              severity: 'medium',
              title: `${wanName} High Latency`,
              description: `${wanName} (${wanStatus.ispInfo.name}) experiencing high latency`,
              currentState: `${avgLatency}ms average`,
              recommendedState: '<20ms',
              impact: 'Slower internet performance on this connection',
              automated: false,
            });
          }
        }
      });

      // Check client distribution
      const wifiRatio = stats.counts.wifiClient / (stats.counts.wiredClient || 1);
      if (wifiRatio > 2.5) {
        recommendations.push({
          id: 'client-distribution',
          category: 'performance',
          severity: 'low',
          title: 'High Wireless-to-Wired Ratio',
          description: 'Many devices on WiFi that could benefit from wired connections',
          currentState: `${stats.counts.wifiClient} wireless, ${stats.counts.wiredClient} wired`,
          recommendedState: 'Move stationary devices to wired',
          impact: 'WiFi congestion, reduced performance',
          automated: false,
        });
      }
    }

    // Calculate health score
    const criticalCount = recommendations.filter(r => r.severity === 'critical').length;
    const highCount = recommendations.filter(r => r.severity === 'high').length;
    const mediumCount = recommendations.filter(r => r.severity === 'medium').length;
    
    const healthScore = Math.max(
      0,
      100 - (criticalCount * 30) - (highCount * 15) - (mediumCount * 5)
    );

    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalDevices: overview.sites[0]?.statistics.counts.totalDevice || 0,
        onlineDevices: (overview.sites[0]?.statistics.counts.totalDevice || 0) - 
                       (overview.sites[0]?.statistics.counts.offlineDevice || 0),
        totalClients: (overview.sites[0]?.statistics.counts.wifiClient || 0) +
                      (overview.sites[0]?.statistics.counts.wiredClient || 0),
        wifiClients: overview.sites[0]?.statistics.counts.wifiClient || 0,
        wiredClients: overview.sites[0]?.statistics.counts.wiredClient || 0,
        healthScore,
      },
      recommendations,
    };
  }

  // ============================================================================
  // Automated Optimization
  // ============================================================================

  async applyOptimizations(
    recommendations: OptimizationRecommendation[],
    options: {
      dryRun?: boolean;
      interactive?: boolean;
    } = {}
  ): Promise<ApplyResult[]> {
    if (!this.local) {
      throw new Error('Local API required for configuration changes');
    }

    const results: ApplyResult[] = [];
    const automated = recommendations.filter(r => r.automated);

    for (const rec of automated) {
      if (options.dryRun) {
        console.log(`[DRY RUN] Would apply: ${rec.title}`);
        continue;
      }

      console.log(`Applying: ${rec.title}...`);

      let result: ApplyResult;

      switch (rec.id) {
        case 'ips-disabled':
          result = await this.local.enableIPS('detection');
          break;

        case 'high-retry-rate':
          // This would require getting all APs and reducing their power
          result = {
            success: false,
            change: {
              type: 'device',
              action: 'update',
              target: 'All APs',
              payload: {},
              description: 'Reduce AP transmit power',
              reversible: true,
              riskLevel: 'medium',
            },
            error: 'Requires device-specific implementation',
          };
          break;

        default:
          continue;
      }

      results.push(result);
    }

    return results;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  async testConnection(): Promise<{
    cloud: boolean;
    local: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    let cloudOk = false;
    let localOk = false;

    if (this.cloud) {
      try {
        await this.cloud.getHosts();
        cloudOk = true;
      } catch (error) {
        errors.push(`Cloud API: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (this.local) {
      try {
        await this.local.getDevices();
        localOk = true;
      } catch (error) {
        errors.push(`Local API: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { cloud: cloudOk, local: localOk, errors };
  }
}

// Export all types and clients
export * from './types/index.js';
export { UniFiCloudAPI } from './cloud/client.js';
export { UniFiLocalAPI } from './local/client.js';
