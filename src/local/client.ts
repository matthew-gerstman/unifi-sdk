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
  private debug: boolean;

  // Disable SSL verification for self-signed certs
  private agent = new https.Agent({ rejectUnauthorized: false });

  constructor(config: {
    host: string;
    username: string;
    password: string;
    site?: string;
    port?: number;
    debug?: boolean;
  }) {
    this.baseUrl = `https://${config.host}:${config.port || 443}`;
    this.username = config.username;
    this.password = config.password;
    this.site = config.site || 'default';
    this.debug = config.debug ?? true;

    if (this.debug) {
      console.log('[DEBUG] UniFi Local API initialized');
      console.log(`[DEBUG] Base URL: ${this.baseUrl}`);
      console.log(`[DEBUG] Username: ${this.username}`);
      console.log(`[DEBUG] Site: ${this.site}`);
    }
  }

  private log(message: string, data?: any) {
    if (this.debug) {
      console.log(`[DEBUG] ${message}`);
      if (data) {
        console.log('[DEBUG]', JSON.stringify(data, null, 2));
      }
    }
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    if (!this.cookie) {
      this.log('No cookie found, logging in...');
      await this.login();
    }

    const url = `${this.baseUrl}${endpoint}`;
    this.log(`Request: ${options?.method || 'GET'} ${url}`);
    
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

    this.log(`Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      if (response.status === 401) {
        this.log('Got 401, session expired - retrying login...');
        await this.login();
        return this.request(endpoint, options);
      }
      
      const error = await response.text();
      this.log('Error response:', error);
      throw new Error(
        `Local API Error [${response.status}]: ${error || response.statusText}`
      );
    }

    const data = await response.json() as any;
    this.log('Response data keys:', Object.keys(data));
    return data;
  }

  async login(): Promise<void> {
    this.log('Attempting login...');
    this.log(`URL: ${this.baseUrl}/api/auth/login`);
    this.log(`Username: ${this.username}`);

    try {
      const response = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        agent: this.agent,
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          username: this.username,
          password: this.password,
        }),
      });

      this.log(`Login response: ${response.status} ${response.statusText}`);

      // Log response headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      this.log('Response headers:', headers);

      if (!response.ok) {
        const errorText = await response.text();
        this.log('Login error body:', errorText);
        
        // Try to parse error
        try {
          const errorJson = JSON.parse(errorText);
          this.log('Parsed error:', errorJson);
        } catch (e) {
          // Not JSON, just text error
        }

        throw new Error(`Login failed: ${response.status} ${response.statusText}\n${errorText}`);
      }

      // Extract cookie
      const cookies = response.headers.get('set-cookie');
      this.log('Set-Cookie header:', cookies);
      
      if (cookies) {
        this.cookie = cookies.split(';')[0];
        this.log('Extracted cookie:', this.cookie);
      } else {
        this.log('WARNING: No set-cookie header received');
      }

      // Extract CSRF token from response body
      const data = await response.json() as any;
      this.log('Login response data:', data);

      if (data.data && data.data.csrf_token) {
        this.csrfToken = data.data.csrf_token;
        this.log('CSRF token extracted:', this.csrfToken);
      } else {
        this.log('WARNING: No CSRF token in response');
      }

      this.log('Login successful!');
    } catch (error) {
      this.log('Login exception:', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    this.log('Logging out...');
    await this.request('/api/auth/logout', { method: 'POST' });
    this.cookie = undefined;
    this.csrfToken = undefined;
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  async getDevices(): Promise<LocalDevice[]> {
    this.log('Fetching devices...');
    const data = await this.request<{ data: LocalDevice[] }>(
      `/proxy/network/api/s/${this.site}/stat/device`
    );
    this.log(`Found ${data.data?.length || 0} devices`);
    return data.data || [];
  }

  async getClients(): Promise<LocalClient[]> {
    this.log('Fetching clients...');
    const data = await this.request<{ data: LocalClient[] }>(
      `/proxy/network/api/s/${this.site}/stat/sta`
    );
    this.log(`Found ${data.data?.length || 0} clients`);
    return data.data || [];
  }

  async getSiteSettings(): Promise<SiteSettings[]> {
    this.log('Fetching site settings...');
    const data = await this.request<{ data: SiteSettings[] }>(
      `/proxy/network/api/s/${this.site}/rest/setting`
    );
    return data.data || [];
  }

  async getWlanConfig(): Promise<any[]> {
    this.log('Fetching WLAN config...');
    const data = await this.request<{ data: any[] }>(
      `/proxy/network/api/s/${this.site}/rest/wlanconf`
    );
    return data.data || [];
  }

  async getFirewallRules(): Promise<any[]> {
    this.log('Fetching firewall rules...');
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
      this.log(`Enabling IPS in ${mode} mode...`);
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
      this.log('Enable IPS failed:', error);
      return {
        success: false,
        change,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async disableIPS(): Promise<void> {
    this.log('Disabling IPS...');
    await this.request(`/proxy/network/api/s/${this.site}/rest/setting/ips`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: false }),
    });
  }

  async updateDeviceRadioSettings(
    deviceId: string,
    radio: 'ng' | 'na',
    settings: {
      txPower?: number;
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
      this.log(`Updating device ${deviceId} radio ${radio}...`, settings);
      
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
      this.log('Update radio settings failed:', error);
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
      this.log(`Enabling band steering for WLAN ${wlanId}...`);
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
      this.log('Enable band steering failed:', error);
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
      this.log(`Enabling fast roaming for WLAN ${wlanId}...`);
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
      this.log('Enable fast roaming failed:', error);
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
      this.log('Creating VLAN...', config);
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
      this.log('Create VLAN failed:', error);
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
      this.log(`Rebooting device ${deviceId}...`);
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
      this.log('Reboot device failed:', error);
      return {
        success: false,
        change,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
