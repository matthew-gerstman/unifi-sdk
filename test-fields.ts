import { UniFiLocalAPI } from './src/local/client.js';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';

config();

const api = new UniFiLocalAPI({
  host: process.env.UNIFI_LOCAL_HOST!,
  username: process.env.UNIFI_LOCAL_USERNAME!,
  password: process.env.UNIFI_LOCAL_PASSWORD!,
  debug: false,
});

async function main() {
  const clients = await api.getClients();
  const devices = await api.getDevices();
  
  console.log('=== SAMPLE CLIENT (Wired) ===\n');
  const wired = clients.find(c => c.is_wired);
  if (wired) {
    console.log(JSON.stringify(wired, null, 2));
  }

  console.log('\n\n=== SAMPLE CLIENT (Wireless) ===\n');
  const wireless = clients.find(c => !c.is_wired);
  if (wireless) {
    console.log(JSON.stringify(wireless, null, 2));
  }

  console.log('\n\n=== ALL UNIQUE CLIENT FIELDS ===\n');
  const fields = new Set<string>();
  clients.forEach(c => Object.keys(c).forEach(k => fields.add(k)));
  console.log(Array.from(fields).sort());

  console.log('\n\n=== ALL UNIQUE DEVICE FIELDS ===\n');
  const deviceFields = new Set<string>();
  devices.forEach(d => Object.keys(d).forEach(k => deviceFields.add(k)));
  console.log(Array.from(deviceFields).sort());

  writeFileSync('full-client-data.json', JSON.stringify({ clients, devices }, null, 2));
  console.log('\n✓ Saved to full-client-data.json');
}

main().catch(console.error);
