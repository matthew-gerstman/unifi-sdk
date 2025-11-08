import { UniFiLocalAPI } from './client.js';
import { LocalClient, LocalDevice } from '../types/index.js';

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
    devices: ['Hue', 'Ecobee', 'Nest', 'HomeKit', 'AC controllers', 'Smart plugs'],
  },
  {
    name: 'IoT - Appliances',
    range: '10.0.3.1 - 10.0.3.100',
    description: 'Smart appliances',
    devices: ['Smart washers', 'Smart dryers', 'Smart fridges', 'Sleep Number'],
  },
  {
    name: 'Security & Cameras',
    range: '10.0.4.1 - 10.0.4.100',
    description: 'Security equipment',
    devices: ['Ring cameras', 'Ring doorbells', 'Security cameras', 'MyQ garage'],
  },
  {
    name: 'Guest Devices',
    range: '10.0.5.1 - 10.0.5.254',
    description: 'Visitor devices',
    devices: ['Guest phones', 'Guest laptops'],
  },
  {
    name: 'DHCP Pool',
    range: '10.0.10.1 - 10.0.20.254',
    description: 'Auto-assigned for new/temporary devices',
    devices: ['Unknown devices', 'New devices before classification'],
  },
];

interface DeviceInfo {
  client: LocalClient;
  classification: { type: string; priority: number } | null;
  assignedIp?: string;
  parentDevice?: string;
  connectionType: 'Wired' | 'WiFi';
  signalStrength?: number;
  likelyIdentity?: string;
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

  private identifyUnknownDevice(client: LocalClient): string {
    const mac = client.mac.toLowerCase();
    const name = (client.name || client.hostname || '').toLowerCase();

    // OUI (MAC prefix) based identification
    const ouiDatabase: Record<string, string> = {
      '5c:47:5e': 'Possibly Xiaomi/Mi device (smart home)',
      'ac:9f:c3': 'Ring device (camera/doorbell)',
      '04:99:b9': 'Eight Sleep Pod (sleep tracker)',
      '18:b4:30': 'Nest device (thermostat/camera)',
      '1c:39:29': 'LG Electronics (appliance)',
      '5a:6c:0b': 'Randomized MAC (privacy-enabled device)',
      'b0:09:da': 'TP-Link device (smart plug/switch)',
      '80:7d:3a': 'Ecobee thermostat',
      '0c:95:05': 'Chamberlain/MyQ (garage door)',
      'cc:6a:10': 'Generic IoT device',
      'd8:bf:c0': 'Ecobee thermostat',
      'ac:bc:b5': 'Ecobee thermostat',
      'e0:2b:96': 'Ecobee thermostat',
      'd4:90:9c': 'Ecobee thermostat',
      'c4:29:96': 'Philips Hue device',
      'c8:dd:6a': 'LG Electronics (appliance)',
      '64:db:a0': 'Sleep Number bed',
      '20:f8:3b': 'Raspberry Pi (likely Home Assistant)',
      '56:de:ac': 'Randomized MAC (Apple device in private mode)',
      'b2:c1:dd': 'Randomized MAC (likely Apple Watch)',
    };

    // Check OUI database
    const prefix = mac.substring(0, 8);
    if (ouiDatabase[prefix]) {
      return ouiDatabase[prefix];
    }

    // Pattern-based identification
    if (name.includes('ring')) return 'Ring security device';
    if (name.includes('ac-controller')) return 'Ecobee or similar smart thermostat';
    if (name.includes('bedroom') || name.includes('office') || name.includes('garage')) {
      return 'Room-based smart home controller (likely Ecobee)';
    }
    if (name.includes('lg_smart')) return 'LG smart appliance';
    if (name.includes('sleep')) return 'Sleep tracking device';
    if (name.includes('myq')) return 'MyQ garage door opener';
    if (name.includes('lwip')) return 'Embedded device with lightweight IP stack';
    if (name.includes('pillow')) return 'Sleep tracking sensor (Eight Sleep or similar)';

    // Connection type hints
    if (client.is_wired) {
      return 'Wired device - likely stationary (computer, TV, appliance, or infrastructure)';
    } else {
      if (client.signal && client.signal > -50) {
        return 'Strong WiFi signal - likely stationary device near AP';
      } else if (client.signal && client.signal < -70) {
        return 'Weak WiFi signal - may need better placement or is mobile';
      }
    }

    return 'Unknown - review MAC prefix and connection details';
  }

  private getParentDevice(client: LocalClient, devices: LocalDevice[]): string {
    if (client.is_wired) {
      // Find the switch this device is connected to
      const connectedSwitch = devices.find(d => {
        // Check if this device has port information showing this MAC
        return d.port_table?.some(port => 
          port.up && (port as any).mac === client.mac
        );
      });

      if (connectedSwitch) {
        return `${connectedSwitch.name || connectedSwitch.model} (wired)`;
      }
      return 'Wired (switch unknown)';
    } else {
      // Find the AP this device is connected to
      const essid = client.essid || 'Unknown SSID';
      const ap = devices.find(d => 
        d.type === 'uap' && d.name && client.ap_mac === d.mac
      );

      if (ap) {
        return `${ap.name} (${essid})`;
      }
      return `WiFi (${essid})`;
    }
  }

  async organizeDevicesByType(
    clients: LocalClient[],
    dryRun: boolean = true
  ): Promise<{
    organized: Array<{ 
      mac: string; 
      currentIp: string; 
      assignedIp: string; 
      type: string;
      name: string;
      parentDevice: string;
      connectionType: string;
      signalStrength?: number;
    }>;
    unclassified: Array<{
      client: LocalClient;
      parentDevice: string;
      likelyIdentity: string;
      connectionType: string;
      signalStrength?: number;
    }>;
  }> {
    const organized: Array<{
      mac: string;
      currentIp: string;
      assignedIp: string;
      type: string;
      name: string;
      parentDevice: string;
      connectionType: string;
      signalStrength?: number;
    }> = [];
    
    const unclassified: Array<{
      client: LocalClient;
      parentDevice: string;
      likelyIdentity: string;
      connectionType: string;
      signalStrength?: number;
    }> = [];

    // Get all devices for parent lookup
    const devices = await this.getCurrentDevices();

    // IP counters for each category
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
      const parentDevice = this.getParentDevice(client, devices);
      const connectionType = client.is_wired ? 'Wired' : 'WiFi';

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

        organized.push({
          mac: client.mac,
          currentIp: client.ip,
          assignedIp,
          type,
          name: client.name || client.hostname || 'Unnamed Device',
          parentDevice,
          connectionType,
          signalStrength: client.signal,
        });

        if (!dryRun) {
          console.log(`[APPLY] ${client.name || client.hostname}: ${assignedIp}`);
          await this.createDHCPReservation(
            client.mac,
            assignedIp,
            client.name || client.hostname
          );
        }
      } else {
        unclassified.push({
          client,
          parentDevice,
          likelyIdentity: this.identifyUnknownDevice(client),
          connectionType,
          signalStrength: client.signal,
        });
      }
    }

    return { organized, unclassified };
  }

  private classifyDevice(client: LocalClient): { type: string; priority: number } | null {
    const name = (client.name || client.hostname || '').toLowerCase();
    const mac = client.mac.toLowerCase();

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
      mac.startsWith('b2:c1:dd') || // Randomized MAC (likely Apple Watch)
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
      name.includes('shield')
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
      mac.startsWith('ac:9f:c3') || // Ring devices
      mac.startsWith('0c:95:05') // MyQ
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
      mac.startsWith('c4:29:96') // Philips Hue
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
      mac.startsWith('1c:39:29') || // LG
      mac.startsWith('c8:dd:6a') || // LG
      mac.startsWith('64:db:a0') // Sleep Number
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

  private identifyUnknownDevice(client: LocalClient): string {
    const mac = client.mac.toLowerCase();
    const name = (client.name || client.hostname || '').toLowerCase();

    const ouiDatabase: Record<string, string> = {
      '5c:47:5e': 'Xiaomi/Mi smart home device',
      'ac:9f:c3': 'Ring camera or doorbell',
      '04:99:b9': 'Eight Sleep Pod (mattress sleep tracker)',
      '18:b4:30': 'Nest thermostat or camera',
      '1c:39:29': 'LG smart appliance (washer/dryer/fridge)',
      '5a:6c:0b': 'Device using MAC randomization (likely iOS/Android)',
      'b0:09:da': 'TP-Link smart plug or switch',
      '80:7d:3a': 'Ecobee smart thermostat',
      '0c:95:05': 'Chamberlain MyQ garage door opener',
      'cc:6a:10': 'Generic IoT device (check manufacturer)',
      'd8:bf:c0': 'Ecobee smart thermostat',
      'ac:bc:b5': 'Ecobee smart thermostat',
      'e0:2b:96': 'Ecobee smart thermostat',
      'd4:90:9c': 'Ecobee smart thermostat',
      'c4:29:96': 'Philips Hue bridge or accessory',
      'c8:dd:6a': 'LG smart appliance',
      '64:db:a0': 'Sleep Number smart bed',
      '20:f8:3b': 'Raspberry Pi (check if running Home Assistant)',
      '56:de:ac': 'Apple device with private WiFi address enabled',
      'b2:c1:dd': 'Apple device with private WiFi (likely Watch)',
    };

    const prefix = mac.substring(0, 8);
    if (ouiDatabase[prefix]) {
      return ouiDatabase[prefix];
    }

    // Hostname-based hints
    if (name) {
      if (name.match(/^\d+[a-f0-9]+$/)) return 'Device using serial number as hostname';
      if (name.includes('controller')) return 'Smart home controller or hub';
      if (name.length < 5) return 'Generic/default hostname - likely IoT device';
    }

    return 'Unknown device - check physical location and recent additions';
  }

  async generateOrganizationPlan(
    clients: LocalClient[]
  ): Promise<string> {
    const { organized, unclassified } = await this.organizeDevicesByType(clients, true);

    let report = '# IP Organization Plan\n\n';
    report += `**Generated:** ${new Date().toLocaleString()}\n`;
    report += `**Network:** Syracuse (10.0.0.0/16)\n\n`;
    report += `---\n\n`;
    report += `## Summary\n\n`;
    report += `- **Total Devices:** ${clients.length}\n`;
    report += `- **Auto-classified:** ${organized.length}\n`;
    report += `- **Needs Manual Review:** ${unclassified.length}\n\n`;

    // Group by type
    const byType = organized.reduce((acc, item) => {
      if (!acc[item.type]) acc[item.type] = [];
      acc[item.type].push(item);
      return acc;
    }, {} as Record<string, typeof organized>);

    report += '---\n\n';
    report += '## Auto-Classified Devices\n\n';
    
    Object.entries(byType).forEach(([type, devices]) => {
      report += `### ${type} (${devices.length} devices)\n\n`;
      report += '| Device Name | MAC Address | Current IP | New IP | Connection | Signal |\n';
      report += '|-------------|-------------|------------|--------|------------|--------|\n';
      
      devices.forEach(d => {
        const signal = d.signalStrength 
          ? `${d.signalStrength} dBm` 
          : (d.connectionType === 'Wired' ? 'N/A' : 'Unknown');
        
        report += `| ${d.name} | \`${d.mac}\` | ${d.currentIp} | **${d.assignedIp}** | ${d.parentDevice} | ${signal} |\n`;
      });
      report += '\n';
    });

    if (unclassified.length > 0) {
      report += '---\n\n';
      report += '## Unclassified Devices - Manual Review Required\n\n';
      report += `**${unclassified.length} devices need classification**\n\n`;
      
      unclassified.forEach((item, idx) => {
        const c = item.client;
        const displayName = c.name || c.hostname || 'Unnamed Device';
        
        report += `### ${idx + 1}. ${displayName}\n\n`;
        report += `| Property | Value |\n`;
        report += `|----------|-------|\n`;
        report += `| **MAC Address** | \`${c.mac}\` |\n`;
        report += `| **Current IP** | ${c.ip} |\n`;
        report += `| **Connection** | ${item.connectionType} via ${item.parentDevice} |\n`;
        
        if (item.signalStrength) {
          const quality = item.signalStrength > -50 ? 'Excellent' :
                         item.signalStrength > -60 ? 'Good' :
                         item.signalStrength > -70 ? 'Fair' : 'Weak';
          report += `| **WiFi Signal** | ${item.signalStrength} dBm (${quality}) |\n`;
        }
        
        if (c.essid) {
          report += `| **WiFi Network** | ${c.essid} |\n`;
        }
        
        report += `| **Likely Identity** | ${item.likelyIdentity} |\n`;
        report += `| **Uptime** | ${Math.floor((c.uptime || 0) / 3600)}h ${Math.floor(((c.uptime || 0) % 3600) / 60)}m |\n`;
        
        if (c.tx_bytes && c.rx_bytes) {
          const totalMB = ((c.tx_bytes + c.rx_bytes) / (1024 * 1024)).toFixed(1);
          report += `| **Data Transferred** | ${totalMB} MB |\n`;
        }
        
        report += `| **Manufacturer** | ${this.lookupManufacturer(c.mac)} |\n`;
        report += '\n';
        
        // Suggest classification
        const suggestion = this.suggestClassification(displayName, item.likelyIdentity);
        report += `**💡 Suggested Classification:** ${suggestion}\n\n`;
        report += '---\n\n';
      });

      report += '### How to Classify Unknown Devices\n\n';
      report += '1. **Check physical location** - walk around and see what devices are near the listed AP/switch\n';
      report += '2. **Check recent purchases** - new smart home devices?\n';
      report += '3. **Review uptime** - recently connected = recently added\n';
      report += '4. **Check data usage** - high usage = streaming/computer, low = sensor\n';
      report += '5. **WiFi signal strength** - strong = stationary near AP, weak = far away or mobile\n\n';
      
      report += 'Once identified, add patterns to `src/local/ip-organization.ts`:\n\n';
      report += '```typescript\n';
      report += '// In classifyDevice() method:\n';
      report += 'if (name.includes(\'your-device-name\') || mac.startsWith(\'aa:bb:cc\')) {\n';
      report += '  return { type: \'IoT - Smart Home\', priority: 60 };\n';
      report += '}\n';
      report += '```\n';
    }

    return report;
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
      '20:f8:3b': 'Raspberry Pi Foundation',
      '70:a7:41': 'Ubiquiti Networks',
      '5a:6c:0b': 'Locally Administered (Randomized)',
      '56:de:ac': 'Locally Administered (Apple Private)',
      'b2:c1:dd': 'Locally Administered (Apple Private)',
    };

    return manufacturers[prefix] || 'Unknown (lookup at macvendors.com)';
  }

  private suggestClassification(name: string, identity: string): string {
    const lower = name.toLowerCase();
    
    if (identity.includes('Ring')) return '**Security & Cameras** (10.0.4.x)';
    if (identity.includes('Ecobee') || lower.includes('controller')) return '**IoT - Smart Home** (10.0.2.x)';
    if (identity.includes('LG') || identity.includes('Sleep Number')) return '**IoT - Appliances** (10.0.3.x)';
    if (identity.includes('MyQ')) return '**Security & Cameras** (10.0.4.x) - garage door';
    if (identity.includes('Eight Sleep') || lower.includes('pillow')) return '**Phones & Watches** (10.0.0.201+) - sleep tracker';
    if (identity.includes('Raspberry Pi')) return '**Servers** (10.0.0.51+) - check if running services';
    if (identity.includes('Apple') && identity.includes('private')) return '**Phones & Watches** (10.0.0.201+) - iOS device';
    if (identity.includes('Xiaomi') || identity.includes('TP-Link')) return '**IoT - Smart Home** (10.0.2.x)';
    if (identity.includes('stationary')) return '**Media Devices** (10.0.1.x) or **IoT - Smart Home** (10.0.2.x)';
    
    return 'Review device type and choose appropriate category';
  }
}
