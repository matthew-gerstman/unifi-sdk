import { UniFiLocalAPI } from './client.js';
import { LocalClient, LocalDevice } from '../types/index.js';
import { writeFileSync } from 'fs';

export interface IPScheme {
  name: string;
  range: string;
  description: string;
  devices: string[];
}

export const PERFORMANCE_OPTIMIZED_SCHEME: IPScheme[] = [
  {
    name: 'Infrastructure',
    range: '10.0.0.1 - 10.0.0.50',
    description: 'Network equipment (router, switches, APs)',
    devices: ['UDM', 'switches', 'access points'],
  },
  {
    name: 'Servers',
    range: '10.0.0.51 - 10.0.0.100',
    description: 'Always-on servers and NAS',
    devices: ['NAS', 'TrueNAS', 'Plex', 'Home Assistant', 'Pi-hole'],
  },
  {
    name: 'Computers',
    range: '10.0.0.101 - 10.0.0.150',
    description: 'Desktop computers and workstations',
    devices: ['Desktop PCs', 'iMac', 'Mac Studio', 'Linux boxes'],
  },
  {
    name: 'Laptops & Tablets',
    range: '10.0.0.151 - 10.0.0.200',
    description: 'Mobile computing devices',
    devices: ['MacBooks', 'iPads', 'Windows laptops'],
  },
  {
    name: 'Phones & Watches',
    range: '10.0.0.201 - 10.0.0.250',
    description: 'Smartphones and wearables',
    devices: ['iPhones', 'Android phones', 'Apple Watch'],
  },
  {
    name: 'Media Devices',
    range: '10.0.1.1 - 10.0.1.100',
    description: 'Streaming and entertainment',
    devices: ['Apple TV', 'Roku', 'Smart TVs', 'Sonos', 'Gaming consoles'],
  },
  {
    name: 'IoT - Smart Home',
    range: '10.0.2.1 - 10.0.2.100',
    description: 'Smart home automation devices',
    devices: ['Hue', 'Ecobee', 'Nest', 'HomeKit', 'AC controllers'],
  },
  {
    name: 'IoT - Appliances',
    range: '10.0.3.1 - 10.0.3.100',
    description: 'Smart appliances',
    devices: ['Smart washers', 'Smart dryers', 'Sleep Number'],
  },
  {
    name: 'Security & Cameras',
    range: '10.0.4.1 - 10.0.4.100',
    description: 'Security equipment',
    devices: ['Ring cameras', 'Ring doorbells', 'MyQ garage'],
  },
  {
    name: 'Guest Devices',
    range: '10.0.5.1 - 10.0.5.254',
    description: 'Visitor devices',
    devices: ['Guest phones', 'Guest laptops'],
  },
];

export interface EnhancedDeviceInfo {
  // Core Identity
  mac: string;
  name: string;
  hostname: string;
  currentIp: string;
  assignedIp?: string;
  
  // Classification
  classification: string | null;
  classificationPriority: number;
  likelyIdentity: string;
  manufacturer: string;
  
  // Connection Details
  connectionType: 'Wired' | 'WiFi';
  parentDevice: string;
  parentDeviceName: string;
  switchPort?: number;
  wifiNetwork?: string;
  
  // WiFi Metrics (if wireless)
  signalStrength?: number;
  signalQuality?: string;
  noiseFloor?: number;
  channel?: number;
  radioType?: string;
  wifiProtocol?: string;
  wifiGeneration?: string;
  
  // Device Capabilities
  osName?: string;
  osClass?: number;
  deviceType?: string;
  deviceFamily?: number;
  vendorId?: number;
  
  // Performance Metrics
  txRate?: number;
  rxRate?: number;
  satisfaction?: number;
  satisfactionQuality?: string;
  
  // Usage Statistics
  txBytes: number;
  rxBytes: number;
  totalDataGB: number;
  txPackets: number;
  rxPackets: number;
  
  // Timing
  uptime: number;
  uptimeFormatted: string;
  lastSeen: number;
  firstSeen?: number;
  firstSeenDate?: string;
  
  // Status
  isGuest: boolean;
  isBlocked: boolean;
  hasFixedIP: boolean;
  anomalies: number;
}

export interface OrganizationReport {
  metadata: {
    generated: string;
    totalDevices: number;
    autoClassified: number;
    needsReview: number;
    network: string;
  };
  organized: {
    [category: string]: EnhancedDeviceInfo[];
  };
  unclassified: EnhancedDeviceInfo[];
  summary: {
    byCategory: { [category: string]: number };
    byConnectionType: { wired: number; wifi: number };
    byManufacturer: { [manufacturer: string]: number };
  };
}

export class IPOrganizer {
  private devices: LocalDevice[] = [];

  constructor(private api: UniFiLocalAPI) {}

  async getCurrentClients(): Promise<LocalClient[]> {
    return this.api.getClients();
  }

  async getCurrentDevices(): Promise<LocalDevice[]> {
    if (this.devices.length === 0) {
      this.devices = await this.api.getDevices();
    }
    return this.devices;
  }

  private getWifiGeneration(proto?: string): string {
    if (!proto) return 'Unknown';
    if (proto.includes('ax')) return 'WiFi 6/6E';
    if (proto.includes('ac')) return 'WiFi 5';
    if (proto.includes('n')) return 'WiFi 4';
    if (proto.includes('g')) return 'WiFi 3';
    return proto;
  }

  private getSignalQuality(signal?: number): string {
    if (!signal) return 'Unknown';
    if (signal > -50) return 'Excellent';
    if (signal > -60) return 'Good';
    if (signal > -70) return 'Fair';
    return 'Weak';
  }

  private getSatisfactionQuality(score?: number): string {
    if (!score) return 'Unknown';
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Fair';
    return 'Poor';
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  private getParentDevice(client: LocalClient, devices: LocalDevice[]): { name: string; device: string } {
    if (client.is_wired) {
      // Find switch by MAC
      const connectedSwitch = devices.find(d => d.mac === (client as any).sw_mac);
      
      if (connectedSwitch) {
        const port = (client as any).sw_port;
        const portInfo = port ? ` port ${port}` : '';
        return {
          name: connectedSwitch.name || connectedSwitch.model,
          device: `${connectedSwitch.name || connectedSwitch.model}${portInfo}`,
        };
      }
      return { name: 'Unknown Switch', device: 'Wired (switch unknown)' };
    } else {
      // Find AP by MAC
      const ap = devices.find(d => d.mac === (client as any).ap_mac);
      const essid = (client as any).essid || 'Unknown SSID';
      
      if (ap) {
        return {
          name: ap.name || ap.model,
          device: `${ap.name || ap.model} (${essid})`,
        };
      }
      return { name: 'Unknown AP', device: `WiFi (${essid})` };
    }
  }

  private lookupManufacturer(mac: string): string {
    const prefix = mac.substring(0, 8).toLowerCase();
    
    const manufacturers: Record<string, string> = {
      '5c:47:5e': 'Xiaomi',
      'ac:9f:c3': 'Ring (Amazon)',
      '04:99:b9': 'Eight Sleep',
      '18:b4:30': 'Google Nest',
      '1c:39:29': 'LG Electronics',
      'b0:09:da': 'TP-Link',
      '80:7d:3a': 'Ecobee',
      '0c:95:05': 'Chamberlain (MyQ)',
      'd8:bf:c0': 'Ecobee',
      'ac:bc:b5': 'Ecobee',
      'e0:2b:96': 'Ecobee',
      'd4:90:9c': 'Ecobee',
      'c4:29:96': 'Philips (Hue)',
      'c8:dd:6a': 'LG Electronics',
      '64:db:a0': 'Sleep Number',
      '20:f8:3b': 'Raspberry Pi',
      '70:a7:41': 'Ubiquiti',
      '5a:6c:0b': 'Private MAC',
      '56:de:ac': 'Apple (Private)',
      'b2:c1:dd': 'Apple (Private)',
      'cc:6a:10': 'Generic IoT',
      '00:11:32': 'Synology',
      '90:09:d0': 'Sonos',
    };

    return manufacturers[prefix] || 'Unknown';
  }

  private identifyUnknownDevice(client: LocalClient, parent: string): string {
    const mac = client.mac.toLowerCase();
    const name = (client.name || client.hostname || '').toLowerCase();
    const osName = (client as any).os_name || '';
    const deviceName = (client as any).device_name || '';

    // OS-based identification (most reliable)
    if (osName) {
      if (osName.includes('iOS')) {
        if (deviceName.includes('iPad')) return 'iPad (iOS tablet)';
        if (deviceName.includes('iPhone')) return `${deviceName} (smartphone)`;
        return 'iOS device (iPhone or iPad)';
      }
      if (osName.includes('macOS')) {
        if (deviceName.includes('MacBook')) return `${deviceName} (laptop)`;
        if (deviceName.includes('iMac')) return `${deviceName} (desktop)`;
        return 'Mac computer';
      }
      if (osName.includes('Android')) {
        return deviceName || 'Android smartphone or tablet';
      }
      if (osName.includes('Windows')) {
        return 'Windows PC';
      }
      if (osName.includes('Linux')) {
        return 'Linux device (server, Raspberry Pi, or IoT)';
      }
    }

    // UniFi device name detection
    if (deviceName) {
      return deviceName;
    }

    // MAC-based identification
    const manufacturer = this.lookupManufacturer(mac);
    if (manufacturer !== 'Unknown') {
      const hints: Record<string, string> = {
        'Ring (Amazon)': 'Ring security camera or doorbell',
        'Eight Sleep': 'Eight Sleep Pod (mattress tracker)',
        'Google Nest': 'Nest thermostat or camera',
        'LG Electronics': 'LG smart appliance (check laundry room, kitchen)',
        'TP-Link': 'TP-Link smart plug or switch',
        'Ecobee': 'Ecobee smart thermostat',
        'Chamberlain (MyQ)': 'MyQ garage door opener',
        'Philips (Hue)': 'Philips Hue bridge or light',
        'Sleep Number': 'Sleep Number smart bed',
        'Raspberry Pi': 'Raspberry Pi (check if running Home Assistant, Pi-hole)',
        'Sonos': 'Sonos speaker',
      };
      return hints[manufacturer] || `${manufacturer} device`;
    }

    // Usage pattern hints
    const totalGB = ((client.tx_bytes || 0) + (client.rx_bytes || 0)) / (1024**3);
    if (totalGB > 50) return 'High bandwidth device (computer, NAS, or streaming device)';
    if (totalGB < 0.1) return 'Low bandwidth device (sensor, smart plug, or rarely used)';

    // Uptime hints
    if (client.uptime && client.uptime > 86400 * 30) {
      return 'Always-on device (server, infrastructure, or appliance)';
    }

    // Connection hints
    if (client.is_wired) {
      return `Wired device on ${parent} (computer, TV, appliance, or infrastructure)`;
    }

    // WiFi signal hints
    if ((client as any).signal) {
      const signal = (client as any).signal;
      if (signal > -50) {
        return 'Strong WiFi signal - stationary device near AP (smart home hub, TV, appliance)';
      }
    }

    return 'Unknown - check physical location and manufacturer';
  }

  private classifyDevice(client: LocalClient): { type: string; priority: number } | null {
    const name = (client.name || client.hostname || '').toLowerCase();
    const mac = client.mac.toLowerCase();
    const osName = ((client as any).os_name || '').toLowerCase();
    const deviceName = ((client as any).device_name || '').toLowerCase();

    // OS-based classification (highest priority when available)
    if (osName.includes('ios')) {
      if (deviceName.includes('ipad')) {
        return { type: 'Laptops & Tablets', priority: 95 };
      }
      return { type: 'Phones & Watches', priority: 95 };
    }
    if (osName.includes('macos')) {
      if (deviceName.includes('macbook')) {
        return { type: 'Laptops & Tablets', priority: 95 };
      }
      return { type: 'Computers', priority: 95 };
    }
    if (osName.includes('android')) {
      return { type: 'Phones & Watches', priority: 95 };
    }

    // Infrastructure (Priority 100)
    if (
      name.includes('switch') ||
      name.includes('ap-') ||
      name.includes('udm') ||
      name.includes('unifi')
    ) {
      return { type: 'Infrastructure', priority: 100 };
    }

    // Servers (Priority 90)
    if (
      name.includes('nas') ||
      name.includes('truenas') ||
      name.includes('server') ||
      name.includes('plex') ||
      name.includes('home assistant') ||
      name.includes('homeassistant') ||
      name.includes('pihole') ||
      name.includes('pi-hole') ||
      mac.startsWith('20:f8:3b') // Raspberry Pi
    ) {
      return { type: 'Servers', priority: 90 };
    }

    // Computers (Priority 80)
    if (
      name.includes('desktop') ||
      name.includes('pc-') ||
      name.includes('imac') ||
      name.includes('mac-pro') ||
      name.includes('workstation') ||
      name === 'mac'
    ) {
      return { type: 'Computers', priority: 80 };
    }

    // Laptops & Tablets (Priority 75)
    if (
      name.includes('macbook') ||
      name.includes('laptop') ||
      name.includes('ipad') ||
      name.includes('surface') ||
      name.includes('chromebook')
    ) {
      return { type: 'Laptops & Tablets', priority: 75 };
    }

    // Phones & Watches (Priority 70)
    if (
      name.includes('iphone') ||
      name.includes('phone') ||
      name.includes('android') ||
      name.includes('watch') ||
      name.includes('pillow') ||
      mac.startsWith('b2:c1:dd') ||
      mac.startsWith('04:99:b9') // Eight Sleep
    ) {
      return { type: 'Phones & Watches', priority: 70 };
    }

    // Media Devices (Priority 65)
    if (
      name.includes('appletv') ||
      name.includes('apple-tv') ||
      name.includes('roku') ||
      name.includes('tv') ||
      name.includes('sonos') ||
      name.includes('playstation') ||
      name.includes('xbox') ||
      name.includes('chromecast') ||
      name.includes('shield') ||
      mac.startsWith('90:09:d0') // Sonos
    ) {
      return { type: 'Media Devices', priority: 65 };
    }

    // Security & Cameras (Priority 85)
    if (
      name.includes('ring') ||
      name.includes('camera') ||
      name.includes('doorbell') ||
      name.includes('nvr') ||
      name.includes('myq') ||
      name.includes('spotlight') ||
      mac.startsWith('ac:9f:c3') ||
      mac.startsWith('0c:95:05')
    ) {
      return { type: 'Security & Cameras', priority: 85 };
    }

    // IoT - Smart Home (Priority 60)
    if (
      name.includes('hue') ||
      name.includes('nest') ||
      name.includes('ecobee') ||
      name.includes('homekit') ||
      name.includes('ac-controller') ||
      name.includes('bedroom') ||
      name.includes('office') ||
      name.includes('garage') ||
      name.includes('master-bathroom') ||
      name.includes('living') ||
      mac.startsWith('d8:bf:c0') ||
      mac.startsWith('80:7d:3a') ||
      mac.startsWith('e0:2b:96') ||
      mac.startsWith('d4:90:9c') ||
      mac.startsWith('ac:bc:b5') ||
      mac.startsWith('c4:29:96') ||
      mac.startsWith('18:b4:30') // Nest
    ) {
      return { type: 'IoT - Smart Home', priority: 60 };
    }

    // IoT - Appliances (Priority 55)
    if (
      name.includes('washer') ||
      name.includes('dryer') ||
      name.includes('laundry') ||
      name.includes('fridge') ||
      name.includes('lg_smart') ||
      name.includes('sleep number') ||
      name.includes('sleepnumber') ||
      mac.startsWith('1c:39:29') ||
      mac.startsWith('c8:dd:6a') ||
      mac.startsWith('64:db:a0')
    ) {
      return { type: 'IoT - Appliances', priority: 55 };
    }

    // Generic IoT (Priority 50)
    if (
      name.includes('lwip') ||
      mac.startsWith('5c:47:5e') ||
      mac.startsWith('b0:09:da') ||
      mac.startsWith('5a:6c:0b') ||
      mac.startsWith('cc:6a:10')
    ) {
      return { type: 'IoT - Smart Home', priority: 50 };
    }

    return null;
  }

  private buildEnhancedDeviceInfo(
    client: LocalClient,
    devices: LocalDevice[],
    assignedIp?: string,
    classification?: string
  ): EnhancedDeviceInfo {
    const parent = this.getParentDevice(client, devices);
    const totalBytes = (client.tx_bytes || 0) + (client.rx_bytes || 0);
    const totalGB = totalBytes / (1024**3);
    
    const clientAny = client as any;
    
    return {
      // Core Identity
      mac: client.mac,
      name: client.name || 'Unnamed',
      hostname: client.hostname || 'Unknown',
      currentIp: client.ip,
      assignedIp,
      
      // Classification
      classification,
      classificationPriority: classification ? 1 : 0,
      likelyIdentity: this.identifyUnknownDevice(client, parent.device),
      manufacturer: this.lookupManufacturer(client.mac),
      
      // Connection
      connectionType: client.is_wired ? 'Wired' : 'WiFi',
      parentDevice: parent.device,
      parentDeviceName: parent.name,
      switchPort: clientAny.sw_port,
      wifiNetwork: clientAny.essid,
      
      // WiFi Metrics
      signalStrength: clientAny.signal,
      signalQuality: this.getSignalQuality(clientAny.signal),
      noiseFloor: clientAny.noise,
      channel: clientAny.channel,
      radioType: clientAny.radio,
      wifiProtocol: clientAny.radio_proto,
      wifiGeneration: this.getWifiGeneration(clientAny.radio_proto),
      
      // Device Capabilities
      osName: clientAny.os_name,
      osClass: clientAny.os_class,
      deviceType: clientAny.device_name,
      deviceFamily: clientAny.dev_family,
      vendorId: clientAny.dev_vendor,
      
      // Performance
      txRate: clientAny.tx_rate,
      rxRate: clientAny.rx_rate,
      satisfaction: clientAny.satisfaction,
      satisfactionQuality: this.getSatisfactionQuality(clientAny.satisfaction),
      
      // Usage
      txBytes: client.tx_bytes || 0,
      rxBytes: client.rx_bytes || 0,
      totalDataGB: parseFloat(totalGB.toFixed(2)),
      txPackets: client.tx_packets || 0,
      rxPackets: client.rx_packets || 0,
      
      // Timing
      uptime: client.uptime || 0,
      uptimeFormatted: this.formatUptime(client.uptime || 0),
      lastSeen: client.last_seen || 0,
      firstSeen: clientAny.first_seen,
      firstSeenDate: clientAny.first_seen 
        ? new Date(clientAny.first_seen * 1000).toLocaleString()
        : undefined,
      
      // Status
      isGuest: client.is_guest || false,
      isBlocked: clientAny.blocked || false,
      hasFixedIP: clientAny.use_fixedip || false,
      anomalies: clientAny.anomalies || 0,
    };
  }

  async createDHCPReservation(
    mac: string,
    ip: string,
    hostname?: string
  ): Promise<void> {
    await (this.api as any).request(
      `/proxy/network/api/s/default/rest/user/${mac}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          fixed_ip: ip,
          name: hostname,
          use_fixedip: true,
        }),
      }
    );
  }

  async organizeDevicesByType(
    clients: LocalClient[],
    dryRun: boolean = true
  ): Promise<OrganizationReport> {
    const devices = await this.getCurrentDevices();
    
    const organized: { [category: string]: EnhancedDeviceInfo[] } = {};
    const unclassified: EnhancedDeviceInfo[] = [];

    // IP counters
    const ipCounters: Record<string, number> = {
      'Infrastructure': 1,
      'Servers': 51,
      'Computers': 101,
      'Laptops & Tablets': 151,
      'Phones & Watches': 201,
      'Media Devices': 1,
      'IoT - Smart Home': 1,
      'IoT - Appliances': 1,
      'Security & Cameras': 1,
    };

    for (const client of clients) {
      const classification = this.classifyDevice(client);

      if (classification) {
        const { type } = classification;
        let assignedIp: string;

        switch (type) {
          case 'Infrastructure':
          case 'Servers':
          case 'Computers':
          case 'Laptops & Tablets':
          case 'Phones & Watches':
            assignedIp = `10.0.0.${ipCounters[type]++}`;
            break;
          case 'Media Devices':
            assignedIp = `10.0.1.${ipCounters[type]++}`;
            break;
          case 'IoT - Smart Home':
            assignedIp = `10.0.2.${ipCounters[type]++}`;
            break;
          case 'IoT - Appliances':
            assignedIp = `10.0.3.${ipCounters[type]++}`;
            break;
          case 'Security & Cameras':
            assignedIp = `10.0.4.${ipCounters[type]++}`;
            break;
          default:
            continue;
        }

        const deviceInfo = this.buildEnhancedDeviceInfo(client, devices, assignedIp, type);

        if (!organized[type]) {
          organized[type] = [];
        }
        organized[type].push(deviceInfo);

        if (!dryRun) {
          console.log(`[APPLY] ${deviceInfo.name}: ${assignedIp}`);
          await this.createDHCPReservation(
            client.mac,
            assignedIp,
            client.name || client.hostname
          );
        }
      } else {
        const deviceInfo = this.buildEnhancedDeviceInfo(client, devices);
        unclassified.push(deviceInfo);
      }
    }

    // Calculate summary stats
    const byCategory: { [category: string]: number } = {};
    Object.entries(organized).forEach(([cat, devs]) => {
      byCategory[cat] = devs.length;
    });

    const allDevices = [...Object.values(organized).flat(), ...unclassified];
    const byConnectionType = {
      wired: allDevices.filter(d => d.connectionType === 'Wired').length,
      wifi: allDevices.filter(d => d.connectionType === 'WiFi').length,
    };

    const byManufacturer: { [manufacturer: string]: number } = {};
    allDevices.forEach(d => {
      byManufacturer[d.manufacturer] = (byManufacturer[d.manufacturer] || 0) + 1;
    });

    const totalClassified = Object.values(organized).reduce((sum, arr) => sum + arr.length, 0);

    return {
      metadata: {
        generated: new Date().toISOString(),
        totalDevices: clients.length,
        autoClassified: totalClassified,
        needsReview: unclassified.length,
        network: '10.0.0.0/16 (Flat network, maximum performance)',
      },
      organized,
      unclassified,
      summary: {
        byCategory,
        byConnectionType,
        byManufacturer,
      },
    };
  }

  async generateOrganizationPlan(
    clients: LocalClient[]
  ): Promise<{ json: OrganizationReport; markdown: string }> {
    const report = await this.organizeDevicesByType(clients, true);

    // Save JSON
    writeFileSync('ip-organization.json', JSON.stringify(report, null, 2));

    // Generate Markdown
    let md = '# IP Organization Plan\n\n';
    md += `**Generated:** ${new Date(report.metadata.generated).toLocaleString()}\n`;
    md += `**Network:** ${report.metadata.network}\n\n`;
    md += '---\n\n';
    
    md += '## Summary\n\n';
    md += `- **Total Devices:** ${report.metadata.totalDevices}\n`;
    md += `- **Auto-Classified:** ${report.metadata.autoClassified}\n`;
    md += `- **Needs Review:** ${report.metadata.needsReview}\n`;
    md += `- **Wired:** ${report.summary.byConnectionType.wired}\n`;
    md += `- **WiFi:** ${report.summary.byConnectionType.wifi}\n\n`;

    md += '### Devices by Category\n\n';
    Object.entries(report.summary.byCategory).forEach(([cat, count]) => {
      md += `- **${cat}:** ${count}\n`;
    });
    md += '\n';

    md += '### Top Manufacturers\n\n';
    const topManufacturers = Object.entries(report.summary.byManufacturer)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    topManufacturers.forEach(([mfr, count]) => {
      md += `- **${mfr}:** ${count} devices\n`;
    });
    md += '\n---\n\n';

    // Organized devices
    md += '## Auto-Classified Devices\n\n';
    Object.entries(report.organized).forEach(([category, devices]) => {
      md += `### ${category} (${devices.length} devices)\n\n`;
      
      devices.forEach(d => {
        md += `#### ${d.name}\n\n`;
        md += '| Property | Value |\n';
        md += '|----------|-------|\n';
        md += `| **MAC** | \`${d.mac}\` |\n`;
        md += `| **Current IP** | ${d.currentIp} |\n`;
        md += `| **Assigned IP** | **${d.assignedIp}** |\n`;
        md += `| **Manufacturer** | ${d.manufacturer} |\n`;
        
        if (d.osName) md += `| **OS** | ${d.osName} |\n`;
        if (d.deviceType) md += `| **Device Type** | ${d.deviceType} |\n`;
        
        md += `| **Connection** | ${d.connectionType} via ${d.parentDevice} |\n`;
        
        if (d.switchPort) md += `| **Switch Port** | ${d.switchPort} |\n`;
        if (d.wifiNetwork) md += `| **WiFi Network** | ${d.wifiNetwork} |\n`;
        if (d.signalStrength) md += `| **Signal** | ${d.signalStrength} dBm (${d.signalQuality}) |\n`;
        if (d.wifiGeneration) md += `| **WiFi** | ${d.wifiGeneration} |\n`;
        
        md += `| **Data Usage** | ${d.totalDataGB} GB (↑${(d.txBytes / (1024**3)).toFixed(2)} GB ↓${(d.rxBytes / (1024**3)).toFixed(2)} GB) |\n`;
        md += `| **Uptime** | ${d.uptimeFormatted} |\n`;
        
        if (d.firstSeenDate) md += `| **First Seen** | ${d.firstSeenDate} |\n`;
        if (d.satisfaction) md += `| **Quality** | ${d.satisfaction}/100 (${d.satisfactionQuality}) |\n`;
        if (d.hasFixedIP) md += `| **Has Reservation** | ✓ Already configured |\n`;
        
        md += '\n';
      });
    });

    // Unclassified devices
    if (report.unclassified.length > 0) {
      md += '---\n\n';
      md += `## Unclassified Devices (${report.unclassified.length} devices)\n\n`;
      md += '**These devices need manual classification**\n\n';
      
      report.unclassified.forEach((d, idx) => {
        md += `### ${idx + 1}. ${d.name}\n\n`;
        md += '| Property | Value |\n';
        md += '|----------|-------|\n';
        md += `| **MAC** | \`${d.mac}\` |\n`;
        md += `| **Hostname** | ${d.hostname} |\n`;
        md += `| **Current IP** | ${d.currentIp} |\n`;
        md += `| **Manufacturer** | ${d.manufacturer} |\n`;
        md += `| **💡 Likely Identity** | **${d.likelyIdentity}** |\n`;
        
        if (d.osName) md += `| **OS** | ${d.osName} |\n`;
        if (d.deviceType) md += `| **Device Type** | ${d.deviceType} |\n`;
        
        md += `| **Connection** | ${d.connectionType} via ${d.parentDevice} |\n`;
        
        if (d.switchPort) md += `| **Switch Port** | Port ${d.switchPort} |\n`;
        if (d.wifiNetwork) md += `| **WiFi Network** | ${d.wifiNetwork} |\n`;
        if (d.signalStrength) md += `| **Signal** | ${d.signalStrength} dBm (${d.signalQuality}) |\n`;
        if (d.wifiGeneration) md += `| **WiFi** | ${d.wifiGeneration} |\n`;
        
        md += `| **Data Usage** | ${d.totalDataGB} GB total |\n`;
        md += `| **Uptime** | ${d.uptimeFormatted} |\n`;
        
        if (d.firstSeenDate) md += `| **First Connected** | ${d.firstSeenDate} |\n`;
        if (d.satisfaction) md += `| **Quality Score** | ${d.satisfaction}/100 (${d.satisfactionQuality}) |\n`;
        if (d.txRate && d.rxRate) md += `| **Link Speed** | ↑${d.txRate} Mbps ↓${d.rxRate} Mbps |\n`;
        if (d.hasFixedIP) md += `| **Has Reservation** | ✓ Yes |\n`;
        if (d.anomalies > 0) md += `| **⚠️ Anomalies** | ${d.anomalies} detected |\n`;
        
        md += '\n';
        
        // Suggest classification
        const suggestion = this.suggestDetailedClassification(d);
        md += `**💡 Suggested Classification:** ${suggestion}\n\n`;
        md += '---\n\n';
      });
    }

    return { json: report, markdown: md };
  }

  private suggestDetailedClassification(device: EnhancedDeviceInfo): string {
    // Use all available metadata for best suggestion
    
    if (device.osName) {
      if (device.osName.includes('iOS')) {
        if (device.deviceType?.includes('iPad')) {
          return '**Laptops & Tablets** (10.0.0.151+) - iPad';
        }
        return '**Phones & Watches** (10.0.0.201+) - iPhone or Apple Watch';
      }
      if (device.osName.includes('macOS')) {
        return device.deviceType?.includes('MacBook')
          ? '**Laptops & Tablets** (10.0.0.151+) - MacBook'
          : '**Computers** (10.0.0.101+) - Mac desktop';
      }
      if (device.osName.includes('Android')) {
        return '**Phones & Watches** (10.0.0.201+) - Android device';
      }
    }

    // Manufacturer-based
    if (device.manufacturer.includes('Ring')) {
      return '**Security & Cameras** (10.0.4.x) - Ring device';
    }
    if (device.manufacturer.includes('Ecobee')) {
      return `**IoT - Smart Home** (10.0.2.x) - Thermostat in ${device.name}`;
    }
    if (device.manufacturer.includes('LG') || device.manufacturer.includes('Sleep Number')) {
      return '**IoT - Appliances** (10.0.3.x) - Smart appliance';
    }
    if (device.manufacturer.includes('MyQ')) {
      return '**Security & Cameras** (10.0.4.x) - Garage door opener';
    }
    if (device.manufacturer.includes('Philips')) {
      return '**IoT - Smart Home** (10.0.2.x) - Hue device';
    }
    if (device.manufacturer.includes('Sonos')) {
      return '**Media Devices** (10.0.1.x) - Sonos speaker';
    }
    if (device.manufacturer.includes('Raspberry Pi')) {
      return '**Servers** (10.0.0.51+) - Raspberry Pi (check if running services)';
    }

    // Usage pattern based
    if (device.totalDataGB > 50 && device.connectionType === 'Wired') {
      return '**Servers** (10.0.0.51+) or **Computers** (10.0.0.101+) - High bandwidth usage';
    }
    if (device.totalDataGB > 10 && device.connectionType === 'WiFi') {
      return '**Media Devices** (10.0.1.x) or **Computers** (10.0.0.101+) - Streaming or heavy WiFi use';
    }
    if (device.totalDataGB < 0.1) {
      return '**IoT - Smart Home** (10.0.2.x) - Low bandwidth (sensor or controller)';
    }

    // Uptime based
    if (device.uptime > 86400 * 30 && device.connectionType === 'Wired') {
      return '**Infrastructure** (10.0.0.1+) or **Servers** (10.0.0.51+) - Always-on device';
    }

    // WiFi generation hint
    if (device.wifiGeneration === 'WiFi 6/6E') {
      return '**Phones & Watches** (10.0.0.201+) or **Laptops & Tablets** (10.0.0.151+) - Recent device';
    }
    if (device.wifiGeneration === 'WiFi 4') {
      return '**IoT - Smart Home** (10.0.2.x) - Older device, likely IoT';
    }

    return 'Review all metadata above and choose appropriate category';
  }
}
