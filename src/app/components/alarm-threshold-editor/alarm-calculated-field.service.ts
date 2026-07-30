import { Observable, catchError, of, switchMap } from 'rxjs';
import {
  AlarmDelay,
  DelayUnit,
  DigitalConfig,
  ThresholdConfig,
  ThresholdOperation
} from './alarm-threshold-editor.models';

interface PageData<T> {
  data: T[];
  totalPages: number;
  totalElements: number;
  hasNext: boolean;
}

export interface HttpLike {
  get<T>(url: string): Observable<T>;
  post<T>(url: string, body: any): Observable<T>;
}

export type AlarmCfsByDevice = Map<string, Map<string, any>>;

export class AlarmCalculatedFieldService {
  constructor(private http: HttpLike) {}

  getForDevices(deviceIds: string[]): Observable<AlarmCfsByDevice> {
    if (deviceIds.length === 0) return of(new Map());
    const url = `/api/calculatedFields?pageSize=1000&page=0&types=ALARM&entityType=DEVICE&entities=${deviceIds.join(',')}`;
    return this.http.get<PageData<any>>(url).pipe(
      switchMap(res => {
        const items = res?.data || [];
        const byDevice: AlarmCfsByDevice = new Map();
        items.forEach(cf => {
          const did = cf.entityId?.id;
          if (!did) return;
          if (!byDevice.has(did)) byDevice.set(did, new Map());
          byDevice.get(did)!.set(cf.name, cf);
        });
        // console.log(`[AlarmCF] Loaded ${items.length} existing ALARM CFs across ${byDevice.size} devices`);
        return of(byDevice);
      }),
      catchError(err => {
        console.warn(`[AlarmCF] GET ${url} failed; treating as empty:`, err);
        return of(new Map() as AlarmCfsByDevice);
      })
    );
  }

  buildThresholdPayload(
    deviceId: string,
    threshold: ThresholdConfig,
    value: number,
    delay: AlarmDelay | null,
    hysteresis?: number | null
  ): any {
    const argName = threshold.telemetryKey;
    const cfArgName = this.cfKey(threshold);
    const cfClearArgName = this.cfClearKey(threshold);
    const clearOp = this.inverseOperation(threshold.operation);
    const isHigh = threshold.operation === 'GREATER' || threshold.operation === 'GREATER_OR_EQUAL';
    const clearValue = hysteresis != null && isFinite(hysteresis) && hysteresis > 0
      ? (isHigh ? value - hysteresis : value + hysteresis)
      : value;
    const telemetryArgDef = {
      refEntityKey: { key: argName, type: 'TS_LATEST' },
      defaultValue: ''
    };
    // Both rules read their threshold dynamically from a server-scope attribute
    // so a later attribute update re-targets create AND clear together. The
    // defaultValue is a snapshot at save time (used if the attr is missing).
    const cfArgDef = {
      refEntityKey: { key: cfArgName, type: 'ATTRIBUTE', scope: 'SERVER_SCOPE' },
      defaultValue: String(value)
    };
    const cfClearArgDef = {
      refEntityKey: { key: cfClearArgName, type: 'ATTRIBUTE', scope: 'SERVER_SCOPE' },
      defaultValue: String(clearValue)
    };
    const createFilter = {
      argument: argName,
      valueType: 'NUMERIC',
      operation: 'AND',
      predicates: [{
        type: 'NUMERIC',
        operation: threshold.operation,
        value: { staticValue: null, dynamicValueArgument: cfArgName }
      }]
    };
    const clearFilter = {
      argument: argName,
      valueType: 'NUMERIC',
      operation: 'AND',
      predicates: [{
        type: 'NUMERIC',
        operation: clearOp,
        value: { staticValue: null, dynamicValueArgument: cfClearArgName }
      }]
    };
    const details = this.thresholdAlarmDetails(threshold);
    // The delay only applies to raising the alarm; the clear rule fires
    // immediately so an in-range reading clears the alarm without waiting.
    const wrapCondition = (filter: any, includeDetails: boolean, applyDelay: boolean) => {
      const expression = { type: 'SIMPLE', filters: [filter], operation: 'AND' };
      const condition: any = delay && applyDelay
        ? {
            type: 'DURATION',
            expression,
            schedule: null,
            unit: delay.unit,
            value: { staticValue: delay.value, dynamicValueArgument: null }
          }
        : {
            type: 'SIMPLE',
            expression,
            schedule: null
          };
      return {
        condition,
        alarmDetails: includeDetails ? details : null,
        dashboardId: null
      };
    };

    return {
      type: 'ALARM',
      name: threshold.alarmName,
      entityId: { entityType: 'DEVICE', id: deviceId },
      debugSettings: { failuresEnabled: true, allEnabled: false, allEnabledUntil: 0 },
      configurationVersion: 0,
      configuration: {
        type: 'ALARM',
        arguments: { [argName]: telemetryArgDef, [cfArgName]: cfArgDef, [cfClearArgName]: cfClearArgDef },
        createRules: { [threshold.severity]: wrapCondition(createFilter, true, true) },
        clearRule: wrapCondition(clearFilter, false, false),
        propagate: true,
        propagateToOwner: true,
        propagateToOwnerHierarchy: true,
        propagateToTenant: false,
        propagateRelationTypes: null,
        output: null
      }
    };
  }

  buildDigitalPayload(deviceId: string, digital: DigitalConfig, delay: AlarmDelay | null): any {
    const statusArg = digital.statusTelemetryKey;
    const conditionArg = digital.conditionAttributeKey;
    const predicateType = digital.statusValueType === 'BOOLEAN' ? 'BOOLEAN' : 'NUMERIC';
    const details = this.digitalAlarmDetails(digital);
    const statusFilter = (op: 'EQUAL' | 'NOT_EQUAL') => ({
      argument: statusArg,
      valueType: predicateType,
      operation: 'AND',
      predicates: [{
        type: predicateType,
        operation: op,
        value: { staticValue: null, dynamicValueArgument: conditionArg }
      }]
    });
    // Mirror the threshold delay semantics: when a delay is set, the status must
    // hold the matching value for the duration before the alarm fires. The clear
    // rule fires immediately so a status change clears the alarm without waiting.
    const wrapCondition = (op: 'EQUAL' | 'NOT_EQUAL', includeDetails: boolean, applyDelay: boolean) => {
      const expression = { type: 'SIMPLE', filters: [statusFilter(op)], operation: 'AND' };
      const condition: any = delay && applyDelay
        ? {
            type: 'DURATION',
            expression,
            schedule: null,
            unit: delay.unit,
            value: { staticValue: delay.value, dynamicValueArgument: null }
          }
        : {
            type: 'SIMPLE',
            expression,
            schedule: null
          };
      return {
        condition,
        alarmDetails: includeDetails ? details : null,
        dashboardId: null
      };
    };

    return {
      type: 'ALARM',
      name: digital.alarmName,
      entityId: { entityType: 'DEVICE', id: deviceId },
      debugSettings: { failuresEnabled: true, allEnabled: false, allEnabledUntil: 0 },
      configurationVersion: 0,
      configuration: {
        type: 'ALARM',
        arguments: {
          [conditionArg]: {
            refEntityKey: { key: conditionArg, type: 'ATTRIBUTE', scope: 'SERVER_SCOPE' },
            defaultValue: ''
          },
          [statusArg]: {
            refEntityKey: { key: statusArg, type: 'TS_LATEST' },
            defaultValue: ''
          }
        },
        createRules: { [digital.severity]: wrapCondition('EQUAL', true, true) },
        clearRule: wrapCondition('NOT_EQUAL', false, false),
        propagate: true,
        propagateToOwner: true,
        propagateToOwnerHierarchy: true,
        propagateToTenant: false,
        propagateRelationTypes: null,
        output: null
      }
    };
  }

  extractThresholdValue(cf: any, threshold: ThresholdConfig): number | null {
    if (!cf) return null;
    try {
      const predicate = cf.configuration?.createRules?.[threshold.severity]
        ?.condition?.expression?.filters?.[0]?.predicates?.[0];
      const staticV = predicate?.value?.staticValue;
      if (staticV != null) return Number(staticV);
      // Dynamic predicate: fall back to the bound argument's defaultValue snapshot.
      const argName = predicate?.value?.dynamicValueArgument;
      const argDefault = argName ? cf.configuration?.arguments?.[argName]?.defaultValue : null;
      return argDefault != null && argDefault !== '' ? Number(argDefault) : null;
    } catch {
      return null;
    }
  }

  extractHysteresis(cf: any, threshold: ThresholdConfig, thresholdValueOverride?: number | null): number | null {
    if (!cf) return null;
    try {
      const clearPredicate = cf.configuration?.clearRule
        ?.condition?.expression?.filters?.[0]?.predicates?.[0];
      let clearV = clearPredicate?.value?.staticValue;
      // New CFs reference the clear value via a dynamic argument; resolve it
      // through the argument's defaultValue snapshot.
      if (clearV == null) {
        const clearArgName = clearPredicate?.value?.dynamicValueArgument;
        const clearArgDefault = clearArgName ? cf.configuration?.arguments?.[clearArgName]?.defaultValue : null;
        if (clearArgDefault != null && clearArgDefault !== '') clearV = clearArgDefault;
      }
      if (clearV == null) return null;
      const createV = cf.configuration?.createRules?.[threshold.severity]
        ?.condition?.expression?.filters?.[0]?.predicates?.[0]?.value?.staticValue;
      // Prefer create's staticValue (legacy CFs); fall back to override / extracted threshold (new dynamic CFs).
      const referenceThreshold = createV != null
        ? Number(createV)
        : (thresholdValueOverride != null ? thresholdValueOverride : this.extractThresholdValue(cf, threshold));
      if (referenceThreshold == null) return null;
      const isHigh = threshold.operation === 'GREATER' || threshold.operation === 'GREATER_OR_EQUAL';
      const diff = isHigh ? referenceThreshold - Number(clearV) : Number(clearV) - referenceThreshold;
      return diff > 0 ? diff : null;
    } catch {
      return null;
    }
  }

  hysteresisKey(threshold: ThresholdConfig): string {
    return threshold.key.replace(/Threshold(\d*)$/, 'Hysteresis$1');
  }

  cfKey(threshold: ThresholdConfig): string {
    return 'cf' + threshold.key.charAt(0).toUpperCase() + threshold.key.slice(1);
  }

  cfClearKey(threshold: ThresholdConfig): string {
    return this.cfKey(threshold) + 'Clear';
  }

  extractDelay(deviceCfs: Map<string, any>, thresholds: ThresholdConfig[]): AlarmDelay | null {
    for (const t of thresholds) {
      const cf = deviceCfs.get(t.alarmName);
      const rule = cf?.configuration?.createRules?.[t.severity];
      const cond = rule?.condition;
      if (cond?.type === 'DURATION' && cond?.value?.staticValue != null) {
        const unit = String(cond.unit || 'MINUTES').toUpperCase() as DelayUnit;
        return { value: Number(cond.value.staticValue), unit };
      }
    }
    return null;
  }

  extractDigitalDelay(deviceCfs: Map<string, any>, digitals: DigitalConfig[]): AlarmDelay | null {
    for (const d of digitals) {
      const cf = deviceCfs.get(d.alarmName);
      const cond = cf?.configuration?.createRules?.[d.severity]?.condition;
      if (cond?.type === 'DURATION' && cond?.value?.staticValue != null) {
        const unit = String(cond.unit || 'MINUTES').toUpperCase() as DelayUnit;
        return { value: Number(cond.value.staticValue), unit };
      }
    }
    return null;
  }

  formatDelayLabel(delay: AlarmDelay | null): string | null {
    if (!delay) return null;
    return `${delay.value} ${delay.unit.toLowerCase()}`;
  }

  private thresholdAlarmDetails(t: ThresholdConfig): string {
    if (t.details) return t.details;
    return `${t.label} alarm - ($\{${t.telemetryKey}}${t.unit ?? ''})`;
  }

  private digitalAlarmDetails(d: DigitalConfig): string {
    if (d.details) return d.details;
    return `${d.label} alarm - $\{${d.statusTelemetryKey}}`;
  }

  private inverseOperation(op: ThresholdOperation): ThresholdOperation {
    switch (op) {
      case 'GREATER': return 'LESS_OR_EQUAL';
      case 'LESS': return 'GREATER_OR_EQUAL';
      case 'GREATER_OR_EQUAL': return 'LESS';
      case 'LESS_OR_EQUAL': return 'GREATER';
      case 'EQUAL': return 'NOT_EQUAL';
      case 'NOT_EQUAL': return 'EQUAL';
    }
  }
}
