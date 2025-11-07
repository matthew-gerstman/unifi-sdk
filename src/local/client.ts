import fetch from 'node-fetch';
import https from 'https';
import { LocalDevice, LocalClient, SiteSettings, ConfigurationChange, ApplyResult } from '../types/index.js';

export class UniFiLocalAPI {
  private baseUrl: string;
  private username: string;
  private password: string;
  private site: string;
  private cookie?: string;
  private csrfToken?: string;

  // Disable SSL verification for self-signed certs
  private agent = new https.Agent({ rejectUnauthorized: false });

  constructor(config: {
    host: string;
    username: string;
    password: string;
    site?: string;
    port?: number;
  }) {
    this.baseUrl = `https://${config.host}:${config.port || 443}`;
    this.username = config.username;
    this.password = config.password;
    this.site = config.site || 'default';
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    if (!this.cookie) {
      await this.login();
    }

    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      agent: this.agent,
      headers: {
        'Cookie': this.cookie!,
        'Content-Type': 'application/json',
        ...(this.csrfToken && { 'X-CSRF-Token': this.csrfToken }),
        ...options?.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Session expired, retry once
        await this.login();
        return this.request(endpoint, options);
      }
      
      const error = await response.text();
      throw new Error(
        `Local API Error [${response.status}]: ${error || response.statusText}`
      );
    }

    const data = await response.json() as any;
    return data;
  }

  async login(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      agent: this.agent,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: this.username,
        password: this.password,
      }),
    });

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status} ${response.statusText}`);
    }

    // Extract cookie and CSRF token
    const cookies = response.headers.get('set-cookie');
    if (cookies) {
      this.cookie = cookies.split(';')[0];
    }

    const data = await response.json() as any;
    if (data.data && data.data.csrf_token) {
      this.csrfToken = data.data.csrf_token;
    }
  }

  async logout(): Promise<void> {
    await this.request('/api/auth/logout', { method: 'POST' });
    this.cookie = undefined;
    this.csrfToken = undefined;
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  async getDevices(): Promise<LocalDevice[]> {
    const data = await this.request<{ data: LocalDevice[] }>(
      `/proxy/network/api/s/${this.site}/stat/device`
    );
    return data.data || [];
  }

  async getClients(): Promise<LocalClient[]> {
    const data = await this.request<{ data: LocalClient[] }>(
      `/proxy/network/api/s/${this.site}/stat/sta`
    );
    return data.data || [];
  }

  async getSiteSettings(): Promise<SiteSettings[]> {
    const data = await this.request<{ data: SiteSettings[] }>(
      `/proxy/network/api/s/${this.site}/rest/setting`
    );
    return data.data || [];
  }

  async getWlanConfig(): Promise<any[]> {
    const data = await this.request<{ data: any[] }>(
      `/proxy/network/api/s/${this.site}/rest/wlanconf`
    );
    return data.data || [];
  }

  async getFirewallRules(): Promise<any[]> {
    const data = await this.request<{ data: any[] }>(
      `/proxy/network/api/s/${this.site}/rest/firewallrule`
    );
    return data.data || [];
  }

  // ============================================================================
  // Write Operations (Configuration Changes)
  // ============================================================================

  async enableIPS(mode: 'detection' | 'prevention' = 'detection'): Promise<ApplyResult> {
    const change: ConfigurationChange = {
      type: 'system',
      action: 'enable',
      target: 'IPS',
      payload: { ips_enabled: true, ips_mode: mode },
      description: `Enable IPS in ${mode} mode`,
      reversible: true,
      riskLevel: 'low',
    };

    try {
      await this.request(`/proxy/network/api/s/${this.site}/rest/setting/ips`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled: true,
          mode: mode,
          signature_auto_update: true,
        }),
      });

      return {
        success: true,
        change,
        rollback: async () => {
          await this.disableIPS();
        },
      };
    } catch (error) {
      return {
        success: false,
        change,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async disableIPS(): Promise<void> {
    await this.request(`/proxy/network/api/s/${this.site}/rest/setting/ips`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: false }),
    });
  }

  async updateDeviceRadioSettings(
    deviceId: string,
    radio: 'ng' | 'na', // ng = 2.4GHz, na = 5GHz
    settings: {
      txPower?: number; // 0-100 percentage
      channel?: number;
      channelWidth?: 20 | 40 | 80 | 160;
    }
  ): Promise<ApplyResult> {
    const change: ConfigurationChange = {
      type: 'device',
      action: 'update',
      target: `Device ${deviceId} radio ${radio}`,
      payload: settings,
      description: `Update radio settings for ${radio === 'ng' ? '2.4GHz' : '5GHz'}`,
      reversible: true,
      riskLevel: 'medium',
    };

    try {
      const payload: any = {};
      
      if (settings.txPower !== undefined) {
        payload.tx_power_mode = 'custom';
        payload.tx_power = settings.txPower;
      }
      
      if (settings.channel !== undefined) {
        payload.channel = settings.channel;
      }
      
      if (settings.channelWidth !== undefined) {
        payload.ht = settings.channelWidth.toString();
      }

      await this.request(
        `/proxy/network/api/s/${this.site}/rest/device/${deviceId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            [`radio_table_${radio}`]: payload,
          }),
        }
      );

      return { success: true, change };
    } catch (error) {
      return {
        success: false,
        change,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async enableBandSteering(wlanId: string): Promise<ApplyResult> {
    const change: ConfigurationChange = {
      type: 'wlan',
      action: 'update',
      target: `WLAN ${wlanId}`,
      payload: { band_steering_mode: 'prefer_5g' },
      description: 'Enable band steering to 5GHz',
      reversible: true,
      riskLevel: 'low',
    };

    try {
      await this.request(
        `/proxy/network/api/s/${this.site}/rest/wlanconf/${wlanId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            band_steering_mode: 'prefer_5g',
          }),
        }
      );

      return { success: true, change };
    } catch (error) {
      return {
        success: false,
        change,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async enableFastRoaming(wlanId: string): Promise<ApplyResult> {
    const change: ConfigurationChange = {
      type: 'wlan',
      action: 'update',
      target: `WLAN ${wlanId}`,
      payload: { fast_roaming_enabled: true },
      description: 'Enable 802.11r fast roaming',
      reversible: true,
      riskLevel: 'medium',
    };

    try {
      await this.request(
        `/proxy/network/api/s/${this.site}/rest/wlanconf/${wlanId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            fast_roaming_enabled: true,
          }),
        }
      );

      return { success: true, change };
    } catch (error) {
      return {
        success: false,
        change,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async createVLAN(config: {
    name: string;
    vlan: number;
    subnet: string;
    dhcpEnabled?: boolean;
  }): Promise<ApplyResult> {
    const change: ConfigurationChange = {
      type: 'configuration',
      action: 'create',
      target: `VLAN ${config.vlan}`,
      payload: config,
      description: `Create VLAN ${config.vlan} (${config.name})`,
      reversible: true,
      riskLevel: 'high',
    };

    try {
      await this.request(
        `/proxy/network/api/s/${this.site}/rest/networkconf`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: config.name,
            vlan_enabled: true,
            vlan: config.vlan,
            ip_subnet: config.subnet,
            dhcpd_enabled: config.dhcpEnabled ?? true,
            purpose: 'corporate',
          }),
        }
      );

      return { success: true, change };
    } catch (error) {
      return {
        success: false,
        change,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async rebootDevice(deviceId: string): Promise<ApplyResult> {
    const change: ConfigurationChange = {
      type: 'device',
      action: 'update',
      target: `Device ${deviceId}`,
      payload: {},
      description: 'Reboot device',
      reversible: false,
      riskLevel: 'medium',
    };

    try {
      await this.request(
        `/proxy/network/api/s/${this.site}/cmd/devmgr`,
        {
          method: 'POST',
          body: JSON.stringify({
            cmd: 'restart',
            mac: deviceId,
          }),
        }
      );

      return { success: true, change };
    } catch (error) {
      return {
        success: false,
        change,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
