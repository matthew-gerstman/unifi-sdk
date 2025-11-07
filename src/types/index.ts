// ============================================================================
// Cloud API Types (api.ui.com)
// ============================================================================

export interface CloudHost {
  id: string;
  hardwareId: string;
  type: string;
  ipAddress: string;
  owner: boolean;
  isBlocked: boolean;
  registrationTime: string;
  lastConnectionStateChange: string;
  latestBackupTime?: string;
  userData?: {
    email: string;
    fullName: string;
    role: string;
    controllers: string[];
    features: Record<string, any>;
  };
  reportedState?: {
    hostname: string;
    mac: string;
    version: string;
    hardware: {
      name: string;
      shortname: string;
      firmwareVersion: string;
      serialno: string;
    };
    wans?: WanInterface[];
    features?: Record<string, any>;
  };
}

export interface WanInterface {
  enabled: boolean;
  interface: string;
  ipv4: string;
  ipv6?: string;
  mac: string;
  plugged: boolean;
  port: number;
  type: string;
}

export interface CloudSite {
  siteId: string;
  hostId: string;
  meta: {
    name: string;
    desc: string;
    gatewayMac: string;
    timezone: string;
  };
  statistics: {
    counts: {
      totalDevice: number;
      offlineDevice: number;
      wifiDevice: number;
      wiredDevice: number;
      wifiClient: number;
      wiredClient: number;
      guestClient: number;
      criticalNotification: number;
    };
    gateway: {
      shortname: string;
      inspectionState: string;
      ipsMode: string;
    };
    percentages: {
      txRetry: number;
      wanUptime: number;
    };
    wans: Record<string, WanStatus>;
  };
  permission: string;
  isOwner: boolean;
}

export interface WanStatus {
  externalIp: string;
  ispInfo: {
    name: string;
    organization: string;
  };
  wanUptime: number;
  wanIssues?: WanIssue[];
}

export interface WanIssue {
  index: number;
  highLatency?: boolean;
  latencyAvgMs?: number;
  latencyMaxMs?: number;
  packetLoss?: boolean;
}

export interface CloudDevice {
  id: string;
  mac: string;
  model: string;
  name: string;
  type: string;
  adopted: boolean;
  state: number; // 1 = online, other = offline
  ip?: string;
  version?: string;
  uptime?: number;
}

// ============================================================================
// Local Controller API Types (https://192.168.x.x:8443)
// ============================================================================

export interface LocalDevice {
  _id: string;
  mac: string;
  model: string;
  name: string;
  type: string;
  adopted: boolean;
  state: number;
  ip: string;
  version: string;
  uptime: number;
  
  // Radio config (for APs)
  radio_table?: RadioConfig[];
  radio_table_stats?: RadioStats[];
  
  // Ethernet config (for switches)
  port_table?: PortConfig[];
  
  // Device stats
  'system-stats'?: {
    cpu: number;
    mem: number;
    uptime: number;
  };
  
  // Uplink info
  uplink?: {
    uplink_mac: string;
    uplink_remote_port: number;
    name: string;
    speed: number;
  };
}

export interface RadioConfig {
  name: string;
  radio: string;
  channel: number;
  ht: string; // Channel width: 20, 40, 80, 160
  tx_power_mode: string;
  tx_power: number;
  min_rssi_enabled: boolean;
  min_rssi: number;
  hard_noise_floor_enabled: boolean;
  sens_level_enabled: boolean;
  antenna_gain: number;
}

export interface RadioStats {
  name: string;
  channel: number;
  radio: string;
  ast_txto: number;
  ast_cst: number;
  ast_be_xmit: number;
  cu_total: number;
  cu_self_rx: number;
  cu_self_tx: number;
  extchannel: number;
  gain: number;
  guest_num_sta: number;
  num_sta: number;
  radio: string;
  satisfaction: number;
  state: string;
  tx_packets: number;
  tx_power: number;
  tx_retries: number;
  user_num_sta: number;
}

export interface PortConfig {
  port_idx: number;
  name: string;
  up: boolean;
  enable: boolean;
  poe_enable?: boolean;
  poe_mode?: string;
  speed: number;
  full_duplex: boolean;
  rx_bytes: number;
  tx_bytes: number;
  rx_packets: number;
  tx_packets: number;
}

export interface LocalClient {
  _id: string;
  mac: string;
  name?: string;
  hostname?: string;
  ip: string;
  is_wired: boolean;
  is_guest: boolean;
  essid?: string;
  channel?: number;
  radio?: string;
  signal?: number;
  noise?: number;
  rssi?: number;
  tx_bytes: number;
  rx_bytes: number;
  tx_packets: number;
  rx_packets: number;
  tx_rate: number;
  rx_rate: number;
  uptime: number;
  last_seen: number;
  satisfaction?: number;
  anomalies?: number;
}

export interface SiteSettings {
  _id: string;
  key: string;
  site_id: string;
  
  // IPS/IDS Settings
  ips?: {
    enabled: boolean;
    mode: 'disabled' | 'detection' | 'prevention';
    signature_auto_update: boolean;
  };
  
  // WLAN settings
  wlanconf?: WlanConfig;
  
  // Firewall settings
  firewall?: FirewallConfig;
}

export interface WlanConfig {
  _id: string;
  name: string;
  enabled: boolean;
  security: string;
  wpa_enc: string;
  wpa_mode: string;
  x_passphrase: string;
  usergroup_id: string;
  dtim_mode: string;
  dtim_na: number;
  dtim_ng: number;
  minrate_na_enabled: boolean;
  minrate_ng_enabled: boolean;
  mac_filter_enabled: boolean;
  mac_filter_policy: string;
  schedule_enabled: boolean;
  band_steering_mode?: string;
  fast_roaming_enabled?: boolean;
  pmf_mode?: string;
  wpa3_support?: boolean;
  wpa3_transition?: boolean;
}

export interface FirewallConfig {
  _id: string;
  name: string;
  enabled: boolean;
  action: 'accept' | 'drop' | 'reject';
  protocol: string;
  src_address?: string;
  dst_address?: string;
  src_port?: string;
  dst_port?: string;
  logging: boolean;
}

// ============================================================================
// Optimization Types
// ============================================================================

export interface OptimizationRecommendation {
  id: string;
  category: 'security' | 'performance' | 'reliability' | 'configuration';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  currentState: string;
  recommendedState: string;
  impact: string;
  automated: boolean;
  action?: () => Promise<void>;
}

export interface NetworkAnalysis {
  timestamp: string;
  summary: {
    totalDevices: number;
    onlineDevices: number;
    totalClients: number;
    wifiClients: number;
    wiredClients: number;
    healthScore: number;
  };
  recommendations: OptimizationRecommendation[];
}

// ============================================================================
// Configuration Change Types
// ============================================================================

export interface ConfigurationChange {
  type: 'ips' | 'wlan' | 'device' | 'firewall' | 'system';
  action: 'enable' | 'disable' | 'update' | 'create' | 'delete';
  target: string;
  payload: Record<string, any>;
  description: string;
  reversible: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ApplyResult {
  success: boolean;
  change: ConfigurationChange;
  error?: string;
  rollback?: () => Promise<void>;
}
