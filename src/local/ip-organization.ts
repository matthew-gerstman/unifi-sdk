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
    devices: ['NAS', 'Plex', 'Home Assistant', 'Pi-hole'],
  },
  {
    name: 'Computers',
    range: '10.0.0.101 - 10.0.0.150',
    description: 'Desktop computers and workstations',
    devices: ['Desktop PCs', 'Mac Studios', 'Linux boxes'],
  },
  {
    name: 'Laptops & Tablets',
    range: '10.0.0.151 - 10.0.0.200',
    description: 'Mobile computing devices',
    devices: ['MacBooks', 'iPads', 'Windows laptops'],
  },
  {
    name: 'Phones',
    range: '10.0.0.201 - 10.0.0.250',
    description: 'Smartphones',
    devices: ['iPhones', 'Android phones'],
  },
  {
    name: 'Media Devices',
    range: '10.0.1.1 - 10.0.1.100',
    description: 'Streaming and entertainment',
    devices: ['Apple TV', 'Roku', 'Smart TVs', 'Gaming consoles', 'Sonos'],
  },
  {
    name: 'IoT - Trusted',
    range: '10.0.2.1 - 10.0.2.100',
    description: 'Smart home devices (trusted brands)',
    devices: ['Hue', 'Ecobee', 'Nest', 'HomeKit devices'],
  },
  {
    name: 'IoT - Untrusted',
    range: '10.0.3.1 - 10.0.3.100',
    description: 'Cheap IoT devices (Chinese brands, etc)',
    devices: ['Random smart plugs', 'Cheap cameras', 'Unknown devices'],
  },
  {
    name: 'Security Cameras',
    range: '10.0.4.1 - 10.0.4.100',
    description: 'Surveillance equipment',
    devices: ['UniFi Protect cameras', 'Doorbell cameras', 'NVR'],
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
    // This creates a fixed IP assignment for a device
    // Device still uses DHCP but always gets the same IP
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
  ): Promise<{
    organized: Array<{ mac: string; currentIp: string; assignedIp: string; type: string }>;
    unclassified: LocalClient[];
  }> {
    const organized: Array<{
      mac: string;
      currentIp: string;
      assignedIp: string;
      type: string;
    }> = [];
    const unclassified: LocalClient[] = [];

    // Device classification logic
    for (const client of clients) {
      const name = (client.name || client.hostname || '').toLowerCase();
      const mac = client.mac.toLowerCase();
      
      let assignedIp: string | null = null;
      let type: string | null = null;

      // Classify by hostname/name patterns
      if (name.includes('switch') || name.includes('ap-')) {
        type = 'Infrastructure';
        assignedIp = this.getNextAvailableIP('10.0.0.1', '10.0.0.50', organized);
      } else if (name.includes('nas') || name.includes('server') || name.includes('plex')) {
        type = 'Servers';
        assignedIp = this.getNextAvailableIP('10.0.0.51', '10.0.0.100', organized);
      } else if (name.includes('desktop') || name.includes('pc-') || name.includes('imac')) {
        type = 'Computers';
        assignedIp = this.getNextAvailableIP('10.0.0.101', '10.0.0.150', organized);
      } else if (name.includes('macbook') || name.includes('laptop') || name.includes('ipad')) {
        type = 'Laptops & Tablets';
        assignedIp = this.getNextAvailableIP('10.0.0.151', '10.0.0.200', organized);
      } else if (name.includes('iphone') || name.includes('phone') || name.includes('android')) {
        type = 'Phones';
        assignedIp = this.getNextAvailableIP('10.0.0.201', '10.0.0.250', organized);
      } else if (
        name.includes('appletv') ||
        name.includes('roku') ||
        name.includes('tv') ||
        name.includes('sonos') ||
        name.includes('playstation') ||
        name.includes('xbox')
      ) {
        type = 'Media Devices';
        assignedIp = this.getNextAvailableIP('10.0.1.1', '10.0.1.100', organized);
      } else if (
        name.includes('hue') ||
        name.includes('nest') ||
        name.includes('ecobee') ||
        name.includes('homekit')
      ) {
        type = 'IoT - Trusted';
        assignedIp = this.getNextAvailableIP('10.0.2.1', '10.0.2.100', organized);
      } else if (name.includes('camera') || name.includes('doorbell')) {
        type = 'Security Cameras';
        assignedIp = this.getNextAvailableIP('10.0.4.1', '10.0.4.100', organized);
      }

      if (assignedIp && type) {
        organized.push({
          mac: client.mac,
          currentIp: client.ip,
          assignedIp,
          type,
        });

        if (!dryRun) {
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

  private getNextAvailableIP(
    rangeStart: string,
    rangeEnd: string,
    existing: Array<{ assignedIp: string }>
  ): string {
    const startParts = rangeStart.split('.').map(Number);
    const endParts = rangeEnd.split('.').map(Number);
    const assigned = new Set(existing.map(e => e.assignedIp));

    const startNum = (startParts[0] << 24) + (startParts[1] << 16) + 
                     (startParts[2] << 8) + startParts[3];
    const endNum = (endParts[0] << 24) + (endParts[1] << 16) + 
                   (endParts[2] << 8) + endParts[3];

    for (let num = startNum; num <= endNum; num++) {
      const ip = [
        (num >>> 24) & 0xff,
        (num >>> 16) & 0xff,
        (num >>> 8) & 0xff,
        num & 0xff,
      ].join('.');

      if (!assigned.has(ip)) {
        return ip;
      }
    }

    throw new Error(`No available IPs in range ${rangeStart} - ${rangeEnd}`);
  }

  async generateOrganizationPlan(
    clients: LocalClient[]
  ): Promise<string> {
    const { organized, unclassified } = await this.organizeDevicesByType(clients, true);

    let report = '# IP Organization Plan\n\n';
    report += `Total Devices: ${clients.length}\n`;
    report += `Auto-classified: ${organized.length}\n`;
    report += `Needs Manual Classification: ${unclassified.length}\n\n`;

    // Group by type
    const byType = organized.reduce((acc, item) => {
      if (!acc[item.type]) acc[item.type] = [];
      acc[item.type].push(item);
      return acc;
    }, {} as Record<string, typeof organized>);

    report += '## Organized Devices\n\n';
    Object.entries(byType).forEach(([type, devices]) => {
      report += `### ${type} (${devices.length} devices)\n\n`;
      devices.forEach(d => {
        report += `- ${d.mac}: ${d.currentIp} → ${d.assignedIp}\n`;
      });
      report += '\n';
    });

    if (unclassified.length > 0) {
      report += '## Unclassified Devices (Manual Review Required)\n\n';
      unclassified.forEach(c => {
        report += `- ${c.mac} (${c.name || c.hostname || 'Unknown'}): ${c.ip}\n`;
      });
    }

    return report;
  }
}
