import fetch from 'node-fetch';
import { CloudHost, CloudSite, CloudDevice } from '../types/index.js';

export class UniFiCloudAPI {
  private apiKey: string;
  private baseUrl = 'https://api.ui.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-API-KEY': this.apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Cloud API Error [${response.status}]: ${error || response.statusText}`
      );
    }

    return response.json() as Promise<T>;
  }

  async getHosts(): Promise<CloudHost[]> {
    const data = await this.request<{ data: CloudHost[] }>('/hosts');
    return data.data || [];
  }

  async getHostById(hostId: string): Promise<CloudHost> {
    const data = await this.request<{ data: CloudHost }>(`/hosts/${hostId}`);
    return data.data;
  }

  async getSites(): Promise<CloudSite[]> {
    const data = await this.request<{ data: CloudSite[] }>('/sites');
    return data.data || [];
  }

  async getDevices(): Promise<CloudDevice[]> {
    const data = await this.request<{ data: CloudDevice[] }>('/devices');
    return data.data || [];
  }

  async getISPMetrics(type: '5m' | '1h', duration?: string): Promise<any> {
    const params = duration ? `?duration=${duration}` : '';
    return this.request(`/ea/isp-metrics/${type}${params}`);
  }
}
