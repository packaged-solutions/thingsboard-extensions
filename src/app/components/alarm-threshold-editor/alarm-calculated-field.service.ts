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
    const clearOp = this.inverseOperation(threshold.operation);
    const isHigh = threshold.operation === 'GREATER' || threshold.operation === 'GREATER_OR_EQUAL';
    const clearValue = hysteresis != null && isFinite(hysteresis) && hysteresis > 0
      ? (isHigh ? value - hysteresis : value + hysteresis)
      : value;
    const argDef = {
      refEntityKey: { key: argName, type: 'TS_LATEST' },
      defaultValue: ''
    };
    const filterFor = (op: ThresholdOperation, predicateValue: number) => ({
      argument: argName,
      valueType: 'NUMERIC',
      operation: 'AND',
      predicates: [{
        type: 'NUMERIC',
        operation: op,
        value: { staticValue: predicateValue, dynamicValueArgument: null }
      }]
    });
    const details = this.thresholdAlarmDetails(threshold);
    const conditionFor = (op: ThresholdOperation, predicateValue: number, includeDetails: boolean) => {
      const expression = {
        type: 'SIMPLE',
        filters: [filterFor(op, predicateValue)],
        operation: 'AND'
      };
      const condition: any = delay
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
        arguments: { [argName]: argDef },
        createRules: { [threshold.severity]: conditionFor(threshold.operation, value, true) },
        clearRule: conditionFor(clearOp, clearValue, false),
        propagate: true,
        propagateToOwner: true,
        propagateToOwnerHierarchy: true,
        propagateToTenant: false,
        propagateRelationTypes: null,
        output: null
      }
    };
  }

  buildDigitalPayload(deviceId: string, digital: DigitalConfig): any {
    const statusArg = digital.statusTelemetryKey;
    const enabledArg = digital.enabledAttributeKey;
    const conditionArg = digital.conditionAttributeKey;
    const predicateType = digital.statusValueType === 'BOOLEAN' ? 'BOOLEAN' : 'NUMERIC';
    const details = this.digitalAlarmDetails(digital);

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
          [enabledArg]: {
            refEntityKey: { key: enabledArg, type: 'ATTRIBUTE', scope: 'SERVER_SCOPE' },
            defaultValue: 'false'
          },
          [statusArg]: {
            refEntityKey: { key: statusArg, type: 'TS_LATEST' },
            defaultValue: ''
          }
        },
        createRules: {
          [digital.severity]: {
            condition: {
              type: 'SIMPLE',
              expression: {
                type: 'SIMPLE',
                filters: [
                  {
                    argument: enabledArg,
                    valueType: 'BOOLEAN',
                    operation: 'AND',
                    predicates: [{
                      type: 'BOOLEAN',
                      operation: 'EQUAL',
                      value: { staticValue: true, dynamicValueArgument: null }
                    }]
                  },
                  {
                    argument: statusArg,
                    valueType: predicateType,
                    operation: 'AND',
                    predicates: [{
                      type: predicateType,
                      operation: 'EQUAL',
                      value: { staticValue: null, dynamicValueArgument: conditionArg }
                    }]
                  }
                ],
                operation: 'AND'
              },
              schedule: null
            },
            alarmDetails: details,
            dashboardId: null
          }
        },
        clearRule: {
          condition: {
            type: 'SIMPLE',
            expression: {
              type: 'SIMPLE',
              filters: [{
                argument: statusArg,
                valueType: predicateType,
                operation: 'AND',
                predicates: [{
                  type: predicateType,
                  operation: 'NOT_EQUAL',
                  value: { staticValue: null, dynamicValueArgument: conditionArg }
                }]
              }],
              operation: 'AND'
            },
            schedule: null
          },
          alarmDetails: null,
          dashboardId: null
        },
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
      const rule = cf.configuration?.createRules?.[threshold.severity];
      const predicate = rule?.condition?.expression?.filters?.[0]?.predicates?.[0];
      const v = predicate?.value?.staticValue;
      return v == null ? null : Number(v);
    } catch {
      return null;
    }
  }

  extractHysteresis(cf: any, threshold: ThresholdConfig): number | null {
    if (!cf) return null;
    try {
      const createV = cf.configuration?.createRules?.[threshold.severity]
        ?.condition?.expression?.filters?.[0]?.predicates?.[0]?.value?.staticValue;
      const clearV = cf.configuration?.clearRule
        ?.condition?.expression?.filters?.[0]?.predicates?.[0]?.value?.staticValue;
      if (createV == null || clearV == null) return null;
      const isHigh = threshold.operation === 'GREATER' || threshold.operation === 'GREATER_OR_EQUAL';
      const diff = isHigh ? Number(createV) - Number(clearV) : Number(clearV) - Number(createV);
      return diff > 0 ? diff : null;
    } catch {
      return null;
    }
  }

  hysteresisKey(threshold: ThresholdConfig): string {
    return threshold.key.replace(/Threshold(\d*)$/, 'Hysteresis$1');
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

  formatDelayLabel(delay: AlarmDelay | null): string | null {
    if (!delay) return null;
    return `${delay.value} ${delay.unit.toLowerCase()}`;
  }

  private thresholdAlarmDetails(t: ThresholdConfig): string {
    if (t.details) return t.details;
    return `${t.label} alarm - $\{${t.telemetryKey}}`;
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
