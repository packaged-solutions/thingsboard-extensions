import { AlarmConfigMap } from './alarm-threshold-editor.models';

/**
 * Alarm configuration for all device profiles.
 *
 * Optional `details` override
 * ---------------------------
 * Every ThresholdConfig and DigitalConfig accepts an optional `details: string`
 * field. When the widget POSTs a calculated field, that string is written into
 * the create rule's `alarmDetails` (visible as "Additional info" on the alarm).
 *
 * - If `details` is omitted, the widget auto-generates a generic line that
 *   appends the configured `unit` (when set):
 *     `<Label> alarm - ${<telemetryKey>}<unit>`
 *   e.g. `High Temperature alarm - ${temperature}°C`.
 *
 * - To match PRD wording (lowercase phrasing, units, etc.), set `details`
 *   explicitly. ThingsBoard supports `${telemetryKey}` substitutions, so:
 *     details: 'High temperature alarm - ${temperature}°C'
 *     details: 'High humidity alarm - ${humidity}%RH'
 *     details: 'Low battery alarm - ${battery}%'
 *     details: 'High current alarm (Phase 1) - ${current1}A'
 *
 * The clear rule's `alarmDetails` is always set to null — only the create rule
 * carries the description.
 */
export const ALARM_CONFIG: AlarmConfigMap = {

  // --- MIS-EM300-TH (Temperature & Humidity sensor) ---
  'MIS-EM300-TH': {
    thresholds: [
      { key: 'highTemperatureAlarmThreshold', label: 'High Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Temperature Alarm' },
      { key: 'lowTemperatureAlarmThreshold', label: 'Low Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Temperature Alarm' },
      { key: 'highHumidityAlarmThreshold', label: 'High Humidity', telemetryKey: 'humidity', unit: '%', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Humidity Alarm' },
      { key: 'lowHumidityAlarmThreshold', label: 'Low Humidity', telemetryKey: 'humidity', unit: '%', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Humidity Alarm' },
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ]
  },

  // --- EAS-SDM230 (Single-phase energy meter) ---
  'EAS-SDM230': {
    thresholds: [
      { key: 'highCurrentAlarmThreshold', label: 'High Current', telemetryKey: 'current', unit: 'A', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Current Alarm' }
    ]
  },

  // --- MIS-EM300-DI (Temperature + Humidity + Digital input) ---
  'MIS-EM300-DI': {
    thresholds: [
      { key: 'highTemperatureAlarmThreshold', label: 'High Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Temperature Alarm' },
      { key: 'lowTemperatureAlarmThreshold', label: 'Low Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Temperature Alarm' },
      { key: 'highHumidityAlarmThreshold', label: 'High Humidity', telemetryKey: 'humidity', unit: '%', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Humidity Alarm' },
      { key: 'lowHumidityAlarmThreshold', label: 'Low Humidity', telemetryKey: 'humidity', unit: '%', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Humidity Alarm' },
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ],
    digitals: [
      { key: 'digital', label: 'Digital', statusTelemetryKey: 'status', enabledAttributeKey: 'digitalAlarmEnabled', conditionAttributeKey: 'digitalAlarmCondition', severity: 'MAJOR', alarmName: 'Digital Alarm', statusValueType: 'BOOLEAN' }
    ]
  },

  // --- MIS-EM300-MCS (Temperature + Humidity + Digital magnetic contact sensor) ---
  'MIS-EM300-MCS': {
    thresholds: [
      { key: 'highTemperatureAlarmThreshold', label: 'High Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Temperature Alarm' },
      { key: 'lowTemperatureAlarmThreshold', label: 'Low Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Temperature Alarm' },
      { key: 'highHumidityAlarmThreshold', label: 'High Humidity', telemetryKey: 'humidity', unit: '%', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Humidity Alarm' },
      { key: 'lowHumidityAlarmThreshold', label: 'Low Humidity', telemetryKey: 'humidity', unit: '%', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Humidity Alarm' },
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS_OR_EQUAL', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ],
    digitals: [
      { key: 'digital', label: 'Digital', statusTelemetryKey: 'status', enabledAttributeKey: 'digitalAlarmEnabled', conditionAttributeKey: 'digitalAlarmCondition', severity: 'MAJOR', alarmName: 'Digital Alarm', statusValueType: 'BOOLEAN' }
    ]
  },

  // --- MIS-EM300-ZLD (Temperature + Humidity + Digital zone leak detector) ---
  'MIS-EM300-ZLD': {
    thresholds: [
      { key: 'highTemperatureAlarmThreshold', label: 'High Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Temperature Alarm' },
      { key: 'lowTemperatureAlarmThreshold', label: 'Low Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Temperature Alarm' },
      { key: 'highHumidityAlarmThreshold', label: 'High Humidity', telemetryKey: 'humidity', unit: '%', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Humidity Alarm' },
      { key: 'lowHumidityAlarmThreshold', label: 'Low Humidity', telemetryKey: 'humidity', unit: '%', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Humidity Alarm' },
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS_OR_EQUAL', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ],
    digitals: [
      { key: 'digital', label: 'Digital', statusTelemetryKey: 'status', enabledAttributeKey: 'digitalAlarmEnabled', conditionAttributeKey: 'digitalAlarmCondition', severity: 'MAJOR', alarmName: 'Digital Alarm', statusValueType: 'BOOLEAN' }
    ]
  },

  // --- MIS-EM320-TH (Outdoor temperature & humidity sensor) ---
  'MIS-EM320-TH': {
    thresholds: [
      { key: 'highTemperatureAlarmThreshold', label: 'High Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Temperature Alarm' },
      { key: 'lowTemperatureAlarmThreshold', label: 'Low Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Temperature Alarm' },
      { key: 'highHumidityAlarmThreshold', label: 'High Humidity', telemetryKey: 'humidity', unit: '%', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Humidity Alarm' },
      { key: 'lowHumidityAlarmThreshold', label: 'Low Humidity', telemetryKey: 'humidity', unit: '%', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Humidity Alarm' },
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS_OR_EQUAL', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ]
  },

  // --- MIS-EM500-CO2 (CO2 / air quality sensor) ---
  'MIS-EM500-CO2': {
    thresholds: [
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS_OR_EQUAL', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ]
  },

  // --- MIS-EM500-PP (Pipe pressure sensor) ---
  'MIS-EM500-PP': {
    thresholds: [
      { key: 'highPressureAlarmThreshold', label: 'High Pressure', telemetryKey: 'pressure', unit: 'bar', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Pressure Alarm' },
      { key: 'lowPressureAlarmThreshold', label: 'Low Pressure', telemetryKey: 'pressure', unit: 'bar', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Pressure Alarm' },
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS_OR_EQUAL', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ]
  },

  // --- MIS-EM500-SWL (Submersible water level sensor) ---
  'MIS-EM500-SWL': {
    thresholds: [
      { key: 'highWaterLevelAlarmThreshold', label: 'High Water Level', telemetryKey: 'waterLevel', unit: 'm', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Water Level Alarm' },
      { key: 'lowWaterLevelAlarmThreshold', label: 'Low Water Level', telemetryKey: 'waterLevel', unit: 'm', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Water Level Alarm' },
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS_OR_EQUAL', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ]
  },

  // --- MIS-TS302 (Dual-probe temperature sensor with digital inputs) ---
  'MIS-TS302': {
    thresholds: [
      { key: 'highTemperatureAlarmThreshold1', label: 'High Temperature 1', telemetryKey: 'temperature1', unit: '°C', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Temperature 1 Alarm' },
      { key: 'lowTemperatureAlarmThreshold1', label: 'Low Temperature 1', telemetryKey: 'temperature1', unit: '°C', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Temperature 1 Alarm' },
      { key: 'highTemperatureAlarmThreshold2', label: 'High Temperature 2', telemetryKey: 'temperature2', unit: '°C', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Temperature 2 Alarm' },
      { key: 'lowTemperatureAlarmThreshold2', label: 'Low Temperature 2', telemetryKey: 'temperature2', unit: '°C', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Temperature 2 Alarm' },
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS_OR_EQUAL', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ],
    digitals: [
      { key: 'digital1', label: 'Digital 1', statusTelemetryKey: 'status1', enabledAttributeKey: 'digitalAlarmEnabled1', conditionAttributeKey: 'digitalAlarmCondition1', severity: 'MAJOR', alarmName: 'Digital 1 Alarm', statusValueType: 'BOOLEAN' },
      { key: 'digital2', label: 'Digital 2', statusTelemetryKey: 'status2', enabledAttributeKey: 'digitalAlarmEnabled2', conditionAttributeKey: 'digitalAlarmCondition2', severity: 'MAJOR', alarmName: 'Digital 2 Alarm', statusValueType: 'BOOLEAN' }
    ]
  },

  // --- MIS-WS302 (Water leak detector) ---
  'MIS-WS302': {
    thresholds: [
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS_OR_EQUAL', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ]
  },

  // --- MIS-WS523 (Current sensing clamp) ---
  'MIS-WS523': {
    thresholds: [
      { key: 'highCurrentAlarmThreshold', label: 'High Current', telemetryKey: 'current', unit: 'A', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Current Alarm' }
    ]
  },

  // --- MON-3-Phase-Current (Three-phase current monitor) ---
  'MON-3-Phase-Current': {
    thresholds: [
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS_OR_EQUAL', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ]
  },

  // --- MON-Current (Single-phase current monitor) ---
  'MON-Current': {
    thresholds: [
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS_OR_EQUAL', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ]
  },

  // --- MON-Digital (Digital input monitor) ---
  // NOTE: PRD's Low Battery has clearRule: null, but our CF builder always
  //   generates an inverse clear rule. Devices migrated via this widget will
  //   get a clear rule they don't currently have.
  'MON-Digital': {
    thresholds: [
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS_OR_EQUAL', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ],
    digitals: [
      { key: 'digital', label: 'Digital', statusTelemetryKey: 'status', enabledAttributeKey: 'digitalAlarmEnabled', conditionAttributeKey: 'digitalAlarmCondition', severity: 'MAJOR', alarmName: 'Digital Alarm', statusValueType: 'BOOLEAN' }
    ]
  },

  // --- MON-Temperature (Temperature monitor) ---
  // NOTE: PRD only defines Low Battery — no temperature alarms are configured
  //   on this profile. If temperature alarms are expected here, add them to PRD.
  // I have made these the same as TH from above so at least the widget is aware of them
  'MON-Temperature': {
    thresholds: [
      { key: 'highTemperatureAlarmThreshold', label: 'High Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Temperature Alarm' },
      { key: 'lowTemperatureAlarmThreshold', label: 'Low Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Temperature Alarm' },
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS_OR_EQUAL', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ]
  },

  // --- PFE-BSF-Trailer-Mk2 (Trailer profile, rev 2) ---
  'PFE-BSF-Trailer-Mk2': {
    thresholds: [
      { key: 'highTemperatureAlarmThreshold', label: 'High Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Temperature Alarm' },
      { key: 'lowTemperatureAlarmThreshold', label: 'Low Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Temperature Alarm' }
    ]
  },

  // --- WEI-COM (Weightron Compactor) ---
  'WEI-COM': {
    thresholds: [
      { key: 'highPercentageFullAlarmThreshold', label: 'High Percentage Full', telemetryKey: 'percentageFull', unit: '%', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Percentage Full Alarm' }
    ]
  },

  // --- MIS-CT101-100 (100A current transformer) ---
  'MIS-CT101-100': {
    thresholds: [
      { key: 'highCurrentAlarmThreshold', label: 'High Current', telemetryKey: 'current', unit: 'A', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Current Alarm' }
    ]
  },

  // --- ADE-CURRENT-50A (Single-channel 50A current sensor) ---
  'ADE-CURRENT-50A': {
    thresholds: [
      { key: 'highCurrentAlarmThreshold', label: 'High Current', telemetryKey: 'current', unit: 'A', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Current Alarm' }
    ]
  },

  // --- ADE-ANALOG (Dual analog outputs) ---
  // TODO: revisit — device profile uses separate create/clear attributes
  //   (highOutput*AlarmThreshold* for fire, highOutput*ClearThreshold* for clear),
  //   i.e. a dead-band. Our CF builder currently mirrors the fire value with the
  //   inverse operator for the clear rule, so the separate clear thresholds are lost.
  //   Different use case — do not mass-apply via this widget until resolved.
  'ADE-ANALOG': {
    thresholds: [
      { key: 'highOutputAlarmThreshold1', label: 'High Output 1', telemetryKey: 'output1', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Output 1 Alarm' },
      { key: 'lowOutputAlarmThreshold1', label: 'Low Output 1', telemetryKey: 'output1', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Output 1 Alarm' },
      { key: 'highOutputAlarmThreshold2', label: 'High Output 2', telemetryKey: 'output2', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Output 2 Alarm' },
      { key: 'lowOutputAlarmThreshold2', label: 'Low Output 2', telemetryKey: 'output2', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Output 2 Alarm' }
    ]
  },

  // --- EAS-SDM630 (Three-phase energy meter) ---
  'EAS-SDM630': {
    thresholds: [
      { key: 'highCurrentAlarmThreshold1', label: 'High Current 1', telemetryKey: 'current1', unit: 'A', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Current 1 Alarm' },
      { key: 'highCurrentAlarmThreshold2', label: 'High Current 2', telemetryKey: 'current2', unit: 'A', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Current 2 Alarm' },
      { key: 'highCurrentAlarmThreshold3', label: 'High Current 3', telemetryKey: 'current3', unit: 'A', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Current 3 Alarm' }
    ]
  },

  // --- Default profile (dual temperature with delay) ---
  'default': {
    thresholds: [
      { key: 'highTemperatureAlarmThreshold', label: 'High Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'GREATER', severity: 'MAJOR', alarmName: 'High Temperature Alarm' },
      { key: 'lowTemperatureAlarmThreshold', label: 'Low Temperature', telemetryKey: 'temperature', unit: '°C', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Temperature  Alarm' },
      { key: 'lowBatteryThreshold', label: 'Low Battery', telemetryKey: 'battery', unit: '%', operation: 'LESS', severity: 'MAJOR', alarmName: 'Low Battery Alarm' }
    ]
  }

};
