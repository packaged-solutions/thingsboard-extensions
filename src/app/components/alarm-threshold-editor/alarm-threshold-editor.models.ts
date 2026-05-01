import { EntityId } from '@shared/models/id/entity-id';

export type AlarmSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'WARNING' | 'INDETERMINATE';
export type ThresholdOperation = 'GREATER' | 'LESS' | 'GREATER_OR_EQUAL' | 'LESS_OR_EQUAL' | 'EQUAL' | 'NOT_EQUAL';
export type DelayUnit = 'SECONDS' | 'MINUTES' | 'HOURS';

export interface AlarmDelay {
  value: number;
  unit: DelayUnit;
}

export interface ThresholdConfig {
  key: string;
  label: string;
  telemetryKey: string;
  operation: ThresholdOperation;
  severity: AlarmSeverity;
  alarmName: string;
  unit?: string;
  details?: string;
}

export type DigitalValueType = 'BOOLEAN' | 'NUMERIC';

export interface DigitalConfig {
  key: string;
  label: string;
  statusTelemetryKey: string;
  enabledAttributeKey: string;
  conditionAttributeKey: string;
  severity: AlarmSeverity;
  alarmName: string;
  statusValueType: DigitalValueType;
  details?: string;
}

export interface ProfileAlarmConfig {
  thresholds: ThresholdConfig[];
  digitals?: DigitalConfig[];
}

export interface AlarmConfigMap {
  [profileName: string]: ProfileAlarmConfig;
}

export interface DeviceThresholdRow {
  deviceId: string;
  entityId: EntityId;
  deviceName: string;
  deviceProfileName: string;
  customerId: string | null;
  customerName: string;
  selected: boolean;
  alarmNotificationsEnabled: boolean | null;
  attributes: { [key: string]: number | string | boolean | null };
  alarmEmailList: string[];
  alarmSmsList: string[];
  cfAlarmKeys: Set<string>;
}

export interface ProfileGroup {
  profileId: string;
  profileName: string;
  config: ProfileAlarmConfig;
  devices: DeviceThresholdRow[];
}
