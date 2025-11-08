import { UniFiLocalAPI } from './client.js';
import { LocalClient } from '../types/index.js';

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

export class IPOrganizer {
  constructor(private api: UniFiLocalAPI) {}

  async getCurrentClients(): Promise<LocalClient[]> {
    return this.api.getClients();
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

  private classifyDevice(client: LocalClient): { type: string; priority: number } | null {
    const name = (client.name || client.hostname || '').toLowerCase();
    const mac = client.mac.toLowerCase();

    // Priority determines which rule wins if multiple match
    // Higher priority = more specific classification

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
      name.includes('pi-hole')
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
      name === 'mac' // Catches standalone "Mac"
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
      name.includes('pillow') // Sleep tracking devices
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

    // Security & Cameras (Priority 85 - high priority for isolation)
    if (
      name.includes('ring') ||
      name.includes('camera') ||
      name.includes('doorbell') ||
      name.includes('nvr') ||
      name.includes('myq') || // Garage door opener
      name.includes('spotlight')
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
      name.includes('bedroom') || // Smart home room controllers
      name.includes('office') ||
      name.includes('garage') ||
      name.includes('master-bathroom') ||
      name.includes('living') ||
      mac.startsWith('d8:bf:c0') || // Common smart home controller MAC prefix
      mac.startsWith('80:7d:3a') || // Another common prefix
      mac.startsWith('e0:2b:96') ||
      mac.startsWith('d4:90:9c') ||
      mac.startsWith('ac:bc:b5') ||
      mac.startsWith('04:99:b9')
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
      mac.startsWith('1c:39:29') || // LG appliances
      mac.startsWith('c8:dd:6a') || // LG appliances
      mac.startsWith('64:db:a0') // Sleep Number
    ) {
      return { type: 'IoT - Appliances', priority: 55 };
    }

    // Catch remaining IoT-like devices
    if (
      name.includes('lwip') || // Lightweight IP stack (embedded devices)
      mac.startsWith('5c:47:5e') || // Generic IoT
      mac.startsWith('b0:09:da') || // Generic IoT
      mac.startsWith('5a:6c:0b') || // Generic IoT
      mac.startsWith('cc:6a:10') || // Generic IoT
      mac.startsWith('c4:29:96') // Generic IoT
    ) {
      return { type: 'IoT - Smart Home', priority: 50 };
    }

    return null;
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
    }>;
    unclassified: LocalClient[];
  }> {
    const organized: Array<{
      mac: string;
      currentIp: string;
      assignedIp: string;
      type: string;
      name: string;
    }> = [];
    const unclassified: LocalClient[] = [];

    // IP counters for each category
    const ipCounters: Record<string, number> = {
      'Infrastructure': 1,
      'Servers': 51,
      'Computers': 101,
      'Laptops & Tablets': 151,
      'Phones & Watches': 201,
      'Media Devices': 1, // 10.0.1.x
      'IoT - Smart Home': 1, // 10.0.2.x
      'IoT - Appliances': 1, // 10.0.3.x
      'Security & Cameras': 1, // 10.0.4.x
    };

    for (const client of clients) {
      const classification = this.classifyDevice(client);

      if (classification) {
        const { type } = classification;
        let assignedIp: string;

        // Determine subnet based on type
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
          name: client.name || client.hostname || client.mac,
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
        unclassified.push(client);
      }
    }

    return { organized, unclassified };
  }

  async generateOrganizationPlan(
    clients: LocalClient[]
  ): Promise<string> {
    const { organized, unclassified } = await this.organizeDevicesByType(clients, true);

    let report = '# IP Organization Plan\n\n';
    report += `**Generated:** ${new Date().toLocaleString()}\n\n`;
    report += `**Total Devices:** ${clients.length}\n`;
    report += `**Auto-classified:** ${organized.length}\n`;
    report += `**Needs Manual Classification:** ${unclassified.length}\n\n`;

    // Group by type
    const byType = organized.reduce((acc, item) => {
      if (!acc[item.type]) acc[item.type] = [];
      acc[item.type].push(item);
      return acc;
    }, {} as Record<string, typeof organized>);

    report += '## Organized Devices\n\n';
    Object.entries(byType).forEach(([type, devices]) => {
      report += `### ${type} (${devices.length} devices)\n\n`;
      report += '| Device | MAC | Current IP | New IP |\n';
      report += '|--------|-----|------------|--------|\n';
      devices.forEach(d => {
        report += `| ${d.name} | ${d.mac} | ${d.currentIp} | ${d.assignedIp} |\n`;
      });
      report += '\n';
    });

    if (unclassified.length > 0) {
      report += '## Unclassified Devices (Manual Review Required)\n\n';
      report += '| Device | MAC | Current IP | Suggested Classification |\n';
      report += '|--------|-----|------------|-------------------------|\n';
      
      unclassified.forEach(c => {
        const name = c.name || c.hostname || 'Unknown';
        const suggestion = this.suggestClassification(name);
        report += `| ${name} | ${c.mac} | ${c.ip} | ${suggestion} |\n`;
      });
      report += '\n';
      report += '### How to Classify\n\n';
      report += 'Add patterns to `src/local/ip-organization.ts` in the `classifyDevice()` method.\n\n';
      report += 'Example:\n';
      report += '```typescript\n';
      report += 'if (name.includes(\'your-device-pattern\')) {\n';
      report += '  return { type: \'IoT - Smart Home\', priority: 60 };\n';
      report += '}\n';
      report += '```\n';
    }

    return report;
  }

  private suggestClassification(name: string): string {
    const lower = name.toLowerCase();
    
    if (lower.includes('ring') || lower.includes('camera')) return 'Security & Cameras';
    if (lower.includes('ac-controller') || lower.includes('bedroom') || lower.includes('office')) return 'IoT - Smart Home';
    if (lower.includes('lg_smart') || lower.includes('sleep')) return 'IoT - Appliances';
    if (lower.includes('myq')) return 'Security & Cameras (garage door)';
    if (lower.includes('watch') || lower.includes('pillow')) return 'Phones & Watches';
    
    return 'Review manually';
  }
}
