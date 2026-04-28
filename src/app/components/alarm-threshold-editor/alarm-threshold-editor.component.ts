import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { WidgetContext } from '@home/models/widget-component.models';
import {
  AttributeData,
  Authority,
  DeviceInfo,
  EntityType
} from '@shared/public-api';
import { EntityId } from '@shared/models/id/entity-id';
import { PageEvent } from '@angular/material/paginator';
import { forkJoin, map, Observable, of, Subject, switchMap, takeUntil } from 'rxjs';
import {
  AlarmDelay,
  DelayUnit,
  DeviceThresholdRow,
  DigitalConfig,
  ProfileAlarmConfig,
  ProfileGroup,
  ThresholdConfig
} from './alarm-threshold-editor.models';
import { ALARM_CONFIG } from './alarm-config';
import { AlarmCalculatedFieldService } from './alarm-calculated-field.service';

interface PageData<T> {
  data: T[];
  totalPages: number;
  totalElements: number;
  hasNext: boolean;
}

@Component({
  selector: 'tb-alarm-threshold-editor',
  templateUrl: './alarm-threshold-editor.component.html',
  styleUrls: ['./alarm-threshold-editor.component.scss']
})
export class AlarmThresholdEditorComponent implements OnInit, OnDestroy {

  @Input() ctx: WidgetContext;

  isTenantAdmin = false;
  profileGroups: ProfileGroup[] = [];
  filteredProfileGroups: ProfileGroup[] = [];
  profileSearch: string | ProfileGroup = '';
  selectedProfileIndex = 0;
  loading = false;
  saving = false;

  bulkAttributeKey = '';
  bulkValue: number | null = null;
  bulkEmailInput = '';
  allSelected = false;

  deviceSearch = '';
  searchOpen = false;
  sortBy: string | null = null;
  sortDir: 'asc' | 'desc' = 'asc';

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  @ViewChild('templateBackdrop') set templateBackdropRef(ref: ElementRef<HTMLElement> | undefined) {
    this.teleportToBody(ref);
  }
  @ViewChild('editBackdrop') set editBackdropRef(ref: ElementRef<HTMLElement> | undefined) {
    this.teleportToBody(ref);
  }

  private teleportToBody(ref: ElementRef<HTMLElement> | undefined) {
    const el = ref?.nativeElement;
    if (!el) return;
    if (el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
  }

  editDialogOpen = false;
  editingDevice: DeviceThresholdRow | null = null;
  bulkEdit = false;
  editForm: {
    values: { [key: string]: number | boolean | null };
    emails: string;
    sms: string;
    delayValue: number | null;
    delayUnit: DelayUnit;
    digitals: { [digitalKey: string]: { enabled: boolean | null; condition: boolean | number | null } };
    original: {
      values: { [key: string]: number | boolean | null };
      delayValue: number | null;
      delayUnit: DelayUnit;
      digitals: { [digitalKey: string]: { enabled: boolean | null; condition: boolean | number | null } };
    };
  } = {
    values: {}, emails: '', sms: '', delayValue: null, delayUnit: 'MINUTES', digitals: {},
    original: { values: {}, delayValue: null, delayUnit: 'MINUTES', digitals: {} }
  };
  readonly delayUnits: DelayUnit[] = ['SECONDS', 'MINUTES', 'HOURS'];

  private readonly pageSizeStorageKey = 'alarmThresholdEditor.pageSize';
  private readonly allowedPageSizes = [10, 20, 30];
  page = 0;
  pageSize = this.readStoredPageSize();

  private destroy$ = new Subject<void>();
  private readonly defaultLowBatteryThreshold = 20;
  private cfService!: AlarmCalculatedFieldService;
  private customerNameById = new Map<string, string>();
  private allCustomerIds: string[] = [];

  private applyBatteryDefault(values: { [key: string]: number | boolean | null }): void {
    const key = 'lowBatteryThreshold';
    if (!this.currentGroup?.config.thresholds.some(t => t.key === key)) return;
    if (values[key] == null) values[key] = this.defaultLowBatteryThreshold;
  }

  get currentGroup(): ProfileGroup | null {
    return this.profileGroups[this.selectedProfileIndex] || null;
  }

  get processedDevices(): DeviceThresholdRow[] {
    if (!this.currentGroup) return [];
    const term = this.deviceSearch.trim().toLowerCase();
    let rows = this.currentGroup.devices.slice();
    if (term) rows = rows.filter(d =>
      d.deviceName.toLowerCase().includes(term)
      || (d.customerName || '').toLowerCase().includes(term)
    );
    if (this.sortBy) {
      const key = this.sortBy;
      const dirMul = this.sortDir === 'asc' ? 1 : -1;
      rows.sort((a, b) => dirMul * this.compareRows(a, b, key));
    }
    return rows;
  }

  get pagedDevices(): DeviceThresholdRow[] {
    const rows = this.processedDevices;
    const start = this.page * this.pageSize;
    return rows.slice(start, start + this.pageSize);
  }

  private compareRows(a: DeviceThresholdRow, b: DeviceThresholdRow, key: string): number {
    let av: any;
    let bv: any;
    if (key === 'device') {
      av = a.deviceName;
      bv = b.deviceName;
    } else if (key === 'customer') {
      av = a.customerName;
      bv = b.customerName;
    } else if (key === 'emails') {
      av = a.alarmEmailList.length;
      bv = b.alarmEmailList.length;
    } else if (key === 'sms') {
      av = a.alarmSmsList.length;
      bv = b.alarmSmsList.length;
    } else {
      av = a.attributes[key];
      bv = b.attributes[key];
    }
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    if (typeof av === 'boolean' && typeof bv === 'boolean') return (av ? 1 : 0) - (bv ? 1 : 0);
    return String(av).localeCompare(String(bv), undefined, { numeric: true });
  }

  sortByColumn(key: string) {
    if (this.sortBy === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = key;
      this.sortDir = 'asc';
    }
    this.page = 0;
  }

  onSearchChange() {
    this.page = 0;
  }

  openSearch() {
    this.searchOpen = true;
    this.ctx.detectChanges();
    setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
  }

  closeSearch() {
    this.searchOpen = false;
    if (this.deviceSearch) {
      this.deviceSearch = '';
      this.onSearchChange();
    }
    this.ctx.detectChanges();
  }

  ngOnInit() {
    this.ctx.$scope.alarmThresholdEditor = this;
    this.isTenantAdmin = this.ctx.currentUser.authority === Authority.TENANT_ADMIN;
    this.cfService = new AlarmCalculatedFieldService(this.ctx.http);

    this.loadCustomers();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onInit() {}
  onDestroy() {}

  // --- Profile (device type) selection ---

  onProfileAutoSelected(event: any) {
    const group: ProfileGroup = event.option.value;
    const index = this.profileGroups.findIndex(g => g.profileId === group.profileId);
    if (index >= 0) {
      this.selectProfileIndex(index);
    }
  }

  onProfileInputFocus() {
    this.filteredProfileGroups = this.profileGroups;
  }

  displayProfile = (g: ProfileGroup | string): string => {
    if (!g) return '';
    if (typeof g === 'string') return g;
    return g.profileName || '';
  }

  filterProfiles() {
    const term = typeof this.profileSearch === 'string' ? this.profileSearch.toLowerCase() : '';
    this.filteredProfileGroups = this.profileGroups.filter(g =>
      g.profileName.toLowerCase().includes(term)
    );
  }

  private selectProfileIndex(index: number) {
    this.selectedProfileIndex = index;
    this.page = 0;
    this.allSelected = false;
    this.bulkAttributeKey = '';
    this.bulkValue = null;
    this.profileSearch = this.profileGroups[index];
    this.ctx.detectChanges();
  }

  // --- Pagination ---

  onPageChange(event: PageEvent) {
    this.page = event.pageIndex;
    this.pageSize = event.pageSize;
    this.persistPageSize(event.pageSize);
    this.ctx.detectChanges();
  }

  private readStoredPageSize(): number {
    try {
      const raw = localStorage.getItem(this.pageSizeStorageKey);
      const n = raw == null ? NaN : parseInt(raw, 10);
      if (this.allowedPageSizes.includes(n)) return n;
    } catch { /* localStorage may throw in sandboxed contexts */ }
    return this.allowedPageSizes[0];
  }

  private persistPageSize(size: number): void {
    try {
      localStorage.setItem(this.pageSizeStorageKey, String(size));
    } catch { /* ignore storage errors */ }
  }

  // --- Selection ---

  toggleSelectAll(checked: boolean) {
    this.allSelected = checked;
    this.processedDevices.forEach(d => d.selected = checked);
  }

  toggleDeviceSelection(row: DeviceThresholdRow, checked: boolean) {
    row.selected = checked;
    const visible = this.processedDevices;
    this.allSelected = visible.length > 0 && visible.every(d => d.selected);
  }

  hasSelection(): boolean {
    return this.currentGroup?.devices.some(d => d.selected) ?? false;
  }

  selectedCount(): number {
    return this.currentGroup?.devices.filter(d => d.selected).length ?? 0;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidSms(sms: string): boolean {
    // Allow +, digits, spaces, dashes, parens; require at least 7 digits.
    if (!/^[+\d\s()\-]+$/.test(sms)) return false;
    return (sms.match(/\d/g) || []).length >= 7;
  }

  isEmailListValid(input: string | null | undefined): boolean {
    if (!input) return true;
    const items = input.split(',').map(e => e.trim()).filter(e => e.length > 0);
    return items.every(e => this.isValidEmail(e));
  }

  isSmsListValid(input: string | null | undefined): boolean {
    if (!input) return true;
    const items = input.split(',').map(s => s.trim()).filter(s => s.length > 0);
    return items.every(s => this.isValidSms(s));
  }

  refreshData() {
    this.page = 0;
    this.loadDevices();
  }

  // --- Edit dialog ---

  openBulkEdit() {
    const group = this.currentGroup;
    if (!group || !this.hasSelection()) return;

    const values: { [key: string]: number | boolean | null } = {};
    group.config.thresholds.forEach(t => {
      values[t.key] = null;
      values[this.cfService.hysteresisKey(t)] = null;
    });
    values['offlineAlarmEnabled'] = null;
    values['inactivityTimeout'] = null;
    values['alarmsEnabled'] = null;

    const digitals: { [k: string]: { enabled: boolean | null; condition: boolean | number | null } } = {};
    (group.config.digitals || []).forEach(dig => {
      digitals[dig.key] = { enabled: null, condition: null };
    });

    this.editingDevice = null;
    this.bulkEdit = true;
    this.editForm = {
      values,
      emails: '',
      sms: '',
      delayValue: null,
      delayUnit: 'MINUTES',
      digitals,
      original: { values: { ...values }, delayValue: null, delayUnit: 'MINUTES', digitals: {} }
    };
    this.editDialogOpen = true;
    this.ctx.detectChanges();
  }

  openEditDevice(device: DeviceThresholdRow) {
    const group = this.currentGroup;
    if (!group) return;

    // Deselect all rows so it's clear we're operating on a single device.
    if (this.currentGroup) {
      this.currentGroup.devices.forEach(d => d.selected = false);
    }
    this.allSelected = false;

    const values: { [key: string]: number | boolean | null } = {};
    group.config.thresholds.forEach(t => {
      const v = device.attributes[t.key];
      values[t.key] = v == null ? null : Number(v);
      const hKey = this.cfService.hysteresisKey(t);
      const hv = device.attributes[hKey];
      values[hKey] = hv == null ? null : Number(hv);
    });
    this.applyBatteryDefault(values);
    const offlineEnabledRaw = device.attributes['offlineAlarmEnabled'];
    values['offlineAlarmEnabled'] =
      offlineEnabledRaw === true || offlineEnabledRaw === 'true' ? true
      : offlineEnabledRaw === false || offlineEnabledRaw === 'false' ? false
      : null;
    const inactivityMs = device.attributes['inactivityTimeout'];
    values['inactivityTimeout'] = this.msToMin(inactivityMs);
    values['alarmsEnabled'] = device.alarmsEnabled !== false;

    const digitals: { [k: string]: { enabled: boolean | null; condition: boolean | number | null } } = {};
    (group.config.digitals || []).forEach(dig => {
      const enabledRaw = device.attributes[dig.enabledAttributeKey];
      const conditionRaw = device.attributes[dig.conditionAttributeKey];
      digitals[dig.key] = {
        enabled:
          enabledRaw === true || enabledRaw === 'true' ? true
          : enabledRaw === false || enabledRaw === 'false' ? false
          : null,
        condition: conditionRaw == null ? null
          : dig.statusValueType === 'BOOLEAN'
            ? (conditionRaw === true || conditionRaw === 'true')
            : Number(conditionRaw)
      };
    });

    const existingDelayValue = device.attributes['alarmDelayValue'];
    const existingDelayUnit = device.attributes['alarmDelayUnit'];

    this.editingDevice = device;
    this.bulkEdit = false;
    const initialDelayValue = existingDelayValue == null ? null : Number(existingDelayValue);
    const initialDelayUnit = (existingDelayUnit as DelayUnit) || 'MINUTES';
    this.editForm = {
      values,
      emails: device.alarmEmailList.join(', '),
      sms: device.alarmSmsList.join(', '),
      delayValue: initialDelayValue,
      delayUnit: initialDelayUnit,
      digitals,
      original: {
        values: { ...values },
        delayValue: initialDelayValue,
        delayUnit: initialDelayUnit,
        digitals: Object.keys(digitals).reduce((acc, k) => {
          acc[k] = { enabled: digitals[k].enabled, condition: digitals[k].condition };
          return acc;
        }, {} as { [k: string]: { enabled: boolean | null; condition: boolean | number | null } })
      }
    };
    this.editDialogOpen = true;
    this.ctx.detectChanges();
  }

  closeEdit() {
    this.editDialogOpen = false;
    this.editingDevice = null;
    this.bulkEdit = false;
    this.ctx.detectChanges();
  }

  ensureEditDigital(key: string): void {
    if (!this.editForm.digitals[key]) {
      this.editForm.digitals[key] = { enabled: null, condition: null };
    }
  }

  saveEditDevice() {
    const group = this.currentGroup;
    const device = this.editingDevice;
    if (!group || !device) return;

    const thresholdsToApply: ThresholdConfig[] = group.config.thresholds.filter(t => {
      const v = this.editForm.values[t.key];
      return v != null && v !== ('' as any);
    });

    const emails = this.editForm.emails.split(',').map(e => e.trim()).filter(e => this.isValidEmail(e));
    const emailsCsv = emails.join(',');
    const applyEmails = emails.length > 0 || this.editForm.emails.trim() === '';
    // ^ allow empty input to explicitly clear; if user typed garbage we still skip.

    const smsNumbers = this.editForm.sms.split(',').map(s => s.trim()).filter(s => this.isValidSms(s));
    const smsCsv = smsNumbers.join(',');
    const applySms = smsNumbers.length > 0 || this.editForm.sms.trim() === '';

    const offlineEnabledRaw = this.editForm.values['offlineAlarmEnabled'];
    const offlineTimeoutRaw = this.editForm.values['inactivityTimeout'];
    const applyOfflineEnabled = typeof offlineEnabledRaw === 'boolean';
    const offlineEnabledValue = applyOfflineEnabled ? offlineEnabledRaw as boolean : null;
    const inactivityTimeoutMs = this.minToMs(offlineTimeoutRaw as number | null);
    const applyOfflineTimeout = inactivityTimeoutMs != null;

    const alarmsEnabledForm = this.editForm.values['alarmsEnabled'];
    const alarmsEnabledValue = typeof alarmsEnabledForm === 'boolean' ? alarmsEnabledForm : true;
    const alarmsEnabledOriginal = this.editForm.original.values['alarmsEnabled'];
    const applyAlarmsEnabled = alarmsEnabledValue !== alarmsEnabledOriginal;

    const digitalsToApply = (group.config.digitals || []).filter(d => {
      const state = this.editForm.digitals[d.key];
      return state && (typeof state.enabled === 'boolean' || state.condition != null);
    });

    if (
      thresholdsToApply.length === 0 && !applyEmails && !applySms && !applyOfflineEnabled
      && !applyOfflineTimeout && !applyAlarmsEnabled && digitalsToApply.length === 0
    ) {
      this.closeEdit();
      return;
    }

    this.saving = true;

    // const existingByDevice$ = this.cfService.getForDevices([device.deviceId]);
    const existingByDevice$ = of(new Map<string, Map<string, any>>());
    const changedAlarmKeys = new Set<string>();

    existingByDevice$.pipe(
      takeUntil(this.destroy$),
      switchMap(byDevice => {
        const requests: Observable<any>[] = [];
        const delay = this.editForm.delayValue != null && Number(this.editForm.delayValue) > 0
          ? { value: Number(this.editForm.delayValue), unit: this.editForm.delayUnit }
          : null;
        const byName = byDevice.get(device.deviceId) || new Map<string, any>();

        thresholdsToApply.forEach(t => {
          const value = Number(this.editForm.values[t.key]);
          const payload = this.cfService.buildThresholdPayload(device.deviceId, t, value, delay);
          const match = byName.get(t.alarmName);
          if (match?.id) {
            payload.id = match.id;
            if (match.version != null) payload.version = match.version;
          }
          // requests.push(this.ctx.http.post('/api/calculatedField', payload));
        });
        if (applyEmails) {
          requests.push(this.saveAttribute(device.deviceId, 'alarmEmailList', emailsCsv));
        }
        if (applySms) {
          requests.push(this.saveAttribute(device.deviceId, 'alarmSmsList', smsCsv));
        }
        if (applyOfflineEnabled) {
          requests.push(this.saveAttribute(device.deviceId, 'offlineAlarmEnabled', offlineEnabledValue as boolean));
        }
        if (applyOfflineTimeout) {
          requests.push(this.saveAttribute(device.deviceId, 'inactivityTimeout', inactivityTimeoutMs as number));
        }
        if (applyAlarmsEnabled) {
          requests.push(this.saveAttribute(device.deviceId, 'alarmsEnabled', alarmsEnabledValue));
        }
        digitalsToApply.forEach(dig => {
          const state = this.editForm.digitals[dig.key];
          if (typeof state.enabled === 'boolean') {
            requests.push(this.saveAttribute(device.deviceId, dig.enabledAttributeKey, state.enabled));
          }
          if (state.condition != null) {
            requests.push(this.saveAttribute(device.deviceId, dig.conditionAttributeKey, state.condition as boolean | number));
          }
          const payload = this.cfService.buildDigitalPayload(device.deviceId, dig);
          const match = byName.get(dig.alarmName);
          if (match?.id) {
            payload.id = match.id;
            if (match.version != null) payload.version = match.version;
          }
          // requests.push(this.ctx.http.post('/api/calculatedField', payload));
        });
        const original = this.editForm.original;
        const delayChanged =
          original.delayValue !== this.editForm.delayValue ||
          original.delayUnit !== this.editForm.delayUnit;
        const hasExistingCf = (alarmKey: string) => device.cfAlarmKeys.has(alarmKey);
        const numOrNull = (v: any): number | null =>
          v == null || v === '' ? null : Number(v);
        group.config.thresholds.forEach(t => {
          const before = original.values[t.key] ?? null;
          const after = this.editForm.values[t.key] ?? null;
          const hKey = this.cfService.hysteresisKey(t);
          const beforeH = numOrNull(original.values[hKey]);
          const afterH = numOrNull(this.editForm.values[hKey]);
          const valueChanged = before !== after || (delayChanged && after != null);
          const hysteresisChanged = beforeH !== afterH;
          if (valueChanged || hysteresisChanged || (after != null && !hasExistingCf(t.key))) {
            changedAlarmKeys.add(t.key);
          }
        });
        (group.config.digitals || []).forEach(d => {
          const before = original.digitals[d.key] || { enabled: null, condition: null };
          const after = this.editForm.digitals[d.key] || { enabled: null, condition: null };
          const stateChanged = before.enabled !== after.enabled || before.condition !== after.condition;
          const hasState = typeof after.enabled === 'boolean' || after.condition != null;
          if (stateChanged || (hasState && !hasExistingCf(d.key))) {
            changedAlarmKeys.add(d.key);
          }
        });
        const alarmConfigBody = this.buildAlarmConfigBody(
          device.deviceId, group, this.editForm.values, delay, this.editForm.digitals, changedAlarmKeys
        );
        if (Object.keys(alarmConfigBody).length > 0) {
          requests.push(this.saveAttributes(device.deviceId, alarmConfigBody));
        }
        return requests.length > 0 ? forkJoin(requests) : of([]);
      })
    ).subscribe({
      next: () => {
        const appliedDelay = this.editForm.delayValue != null && Number(this.editForm.delayValue) > 0
          ? { value: Number(this.editForm.delayValue), unit: this.editForm.delayUnit }
          : null;
        const delayLabel = this.cfService.formatDelayLabel(appliedDelay);
        thresholdsToApply.forEach(t => {
          device.attributes[t.key] = Number(this.editForm.values[t.key]);
          const hKey = this.cfService.hysteresisKey(t);
          const hVal = this.editForm.values[hKey];
          device.attributes[hKey] = hVal == null || hVal === ('' as any) ? null : Number(hVal);
        });
        if (thresholdsToApply.length > 0) {
          device.attributes['alarmDelay'] = delayLabel;
          device.attributes['alarmDelayValue'] = appliedDelay?.value ?? null;
          device.attributes['alarmDelayUnit'] = appliedDelay?.unit ?? null;
        }
        if (applyEmails) {
          device.alarmEmailList = [...emails];
        }
        if (applySms) {
          device.alarmSmsList = [...smsNumbers];
        }
        if (applyOfflineEnabled) {
          device.attributes['offlineAlarmEnabled'] = offlineEnabledValue;
        }
        if (applyOfflineTimeout) {
          device.attributes['inactivityTimeout'] = inactivityTimeoutMs;
        }
        if (applyAlarmsEnabled) {
          device.alarmsEnabled = alarmsEnabledValue;
        }
        digitalsToApply.forEach(dig => {
          const state = this.editForm.digitals[dig.key];
          if (typeof state.enabled === 'boolean') {
            device.attributes[dig.enabledAttributeKey] = state.enabled;
          }
          if (state.condition != null) {
            device.attributes[dig.conditionAttributeKey] = state.condition as boolean | number;
          }
        });
        changedAlarmKeys.forEach(k => device.cfAlarmKeys.add(k));
        this.saving = false;
        this.closeEdit();
      },
      error: (err) => {
        console.error('[AlarmEditor] Failed to save device:', err);
        this.saving = false;
        this.ctx.detectChanges();
      }
    });
  }

  saveBulkEdit() {
    const group = this.currentGroup;
    if (!group) return;
    const selected = group.devices.filter(d => d.selected);
    if (selected.length === 0) return;

    const thresholdsToApply: ThresholdConfig[] = group.config.thresholds.filter(t => {
      const v = this.editForm.values[t.key];
      return v != null && v !== ('' as any);
    });

    // Bulk semantics: blank = leave alone. Only non-blank entries get written.
    const emails = this.editForm.emails.split(',').map(e => e.trim()).filter(e => this.isValidEmail(e));
    const emailsCsv = emails.join(',');
    const applyEmails = emails.length > 0;

    const smsNumbers = this.editForm.sms.split(',').map(s => s.trim()).filter(s => this.isValidSms(s));
    const smsCsv = smsNumbers.join(',');
    const applySms = smsNumbers.length > 0;

    const offlineEnabledRaw = this.editForm.values['offlineAlarmEnabled'];
    const offlineTimeoutRaw = this.editForm.values['inactivityTimeout'];
    const applyOfflineEnabled = typeof offlineEnabledRaw === 'boolean';
    const offlineEnabledValue = applyOfflineEnabled ? offlineEnabledRaw as boolean : null;
    const inactivityTimeoutMs = this.minToMs(offlineTimeoutRaw as number | null);
    const applyOfflineTimeout = inactivityTimeoutMs != null;

    const alarmsEnabledRaw = this.editForm.values['alarmsEnabled'];
    const applyAlarmsEnabled = typeof alarmsEnabledRaw === 'boolean';
    const alarmsEnabledValue = applyAlarmsEnabled ? alarmsEnabledRaw as boolean : null;

    const digitalsToApply = (group.config.digitals || []).filter(d => {
      const state = this.editForm.digitals?.[d.key];
      return state && (typeof state.enabled === 'boolean' || state.condition != null);
    });

    if (
      thresholdsToApply.length === 0 && !applyEmails && !applySms && !applyOfflineEnabled
      && !applyOfflineTimeout && !applyAlarmsEnabled && digitalsToApply.length === 0
    ) {
      this.closeEdit();
      return;
    }

    this.saving = true;

    const existingByDevice$ = of(new Map<string, Map<string, any>>());

    existingByDevice$.pipe(
      takeUntil(this.destroy$),
      switchMap(byDevice => {
        const requests: Observable<any>[] = [];
        const delay = this.formDelay();
        selected.forEach(device => {
          const byName = byDevice.get(device.deviceId) || new Map<string, any>();

          thresholdsToApply.forEach(t => {
            const value = Number(this.editForm.values[t.key]);
            const payload = this.cfService.buildThresholdPayload(device.deviceId, t, value, delay);
            const match = byName.get(t.alarmName);
            if (match?.id) {
              payload.id = match.id;
              if (match.version != null) payload.version = match.version;
            }
          });
          if (applyEmails) {
            requests.push(this.saveAttribute(device.deviceId, 'alarmEmailList', emailsCsv));
          }
          if (applySms) {
            requests.push(this.saveAttribute(device.deviceId, 'alarmSmsList', smsCsv));
          }
          if (applyOfflineEnabled) {
            requests.push(this.saveAttribute(device.deviceId, 'offlineAlarmEnabled', offlineEnabledValue as boolean));
          }
          if (applyOfflineTimeout) {
            requests.push(this.saveAttribute(device.deviceId, 'inactivityTimeout', inactivityTimeoutMs as number));
          }
          if (applyAlarmsEnabled) {
            requests.push(this.saveAttribute(device.deviceId, 'alarmsEnabled', alarmsEnabledValue as boolean));
          }
          digitalsToApply.forEach(dig => {
            const state = this.editForm.digitals[dig.key];
            if (typeof state.enabled === 'boolean') {
              requests.push(this.saveAttribute(device.deviceId, dig.enabledAttributeKey, state.enabled));
            }
            if (state.condition != null) {
              requests.push(this.saveAttribute(device.deviceId, dig.conditionAttributeKey, state.condition as boolean | number));
            }
          });
          const alarmConfigBody = this.buildAlarmConfigBody(
            device.deviceId, group, this.editForm.values, delay, this.editForm.digitals
          );
          if (Object.keys(alarmConfigBody).length > 0) {
            requests.push(this.saveAttributes(device.deviceId, alarmConfigBody));
          }
        });
        return requests.length > 0 ? forkJoin(requests) : of([]);
      })
    ).subscribe({
      next: () => {
        const appliedDelay = this.formDelay();
        const delayLabel = this.cfService.formatDelayLabel(appliedDelay);
        selected.forEach(d => {
          thresholdsToApply.forEach(t => {
            d.attributes[t.key] = Number(this.editForm.values[t.key]);
            const hKey = this.cfService.hysteresisKey(t);
            const hVal = this.editForm.values[hKey];
            d.attributes[hKey] = hVal == null || hVal === ('' as any) ? null : Number(hVal);
            d.cfAlarmKeys.add(t.key);
          });
          if (thresholdsToApply.length > 0) {
            d.attributes['alarmDelay'] = delayLabel;
            d.attributes['alarmDelayValue'] = appliedDelay?.value ?? null;
            d.attributes['alarmDelayUnit'] = appliedDelay?.unit ?? null;
          }
          if (applyEmails) {
            d.alarmEmailList = [...emails];
          }
          if (applySms) {
            d.alarmSmsList = [...smsNumbers];
          }
          if (applyOfflineEnabled) {
            d.attributes['offlineAlarmEnabled'] = offlineEnabledValue;
          }
          if (applyOfflineTimeout) {
            d.attributes['inactivityTimeout'] = inactivityTimeoutMs;
          }
          if (applyAlarmsEnabled) {
            d.alarmsEnabled = alarmsEnabledValue;
          }
          digitalsToApply.forEach(dig => {
            const state = this.editForm.digitals[dig.key];
            if (typeof state.enabled === 'boolean') {
              d.attributes[dig.enabledAttributeKey] = state.enabled;
            }
            if (state.condition != null) {
              d.attributes[dig.conditionAttributeKey] = state.condition as boolean | number;
            }
            d.cfAlarmKeys.add(dig.key);
          });
        });
        this.saving = false;
        this.closeEdit();
      },
      error: (err) => {
        console.error('[AlarmEditor] Failed to bulk-edit devices:', err);
        this.saving = false;
        this.ctx.detectChanges();
      }
    });
  }

  private formDelay(): AlarmDelay | null {
    const v = this.editForm.delayValue;
    if (v == null || Number(v) <= 0) return null;
    return { value: Number(v), unit: this.editForm.delayUnit };
  }

  isDigitalConfigured(device: DeviceThresholdRow, dig: DigitalConfig): boolean {
    const enabled = device.attributes[dig.enabledAttributeKey];
    const condition = device.attributes[dig.conditionAttributeKey];
    return enabled != null || condition != null;
  }

  hysteresisKey(t: ThresholdConfig): string {
    return this.cfService.hysteresisKey(t);
  }

  restrictToNumber(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const navKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
                     'Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (navKeys.indexOf(event.key) >= 0) return;
    if (/^[0-9.\-+eE]$/.test(event.key)) return;
    event.preventDefault();
  }

  restrictPasteToNumber(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (text === '' || isFinite(Number(text))) return;
    event.preventDefault();
  }

  alarmPreview(t: ThresholdConfig, values: { [key: string]: number | boolean | null }): string {
    const v = values[t.key];
    if (v == null || v === ('' as any) || !isFinite(Number(v))) return '';
    const threshold = Number(v);
    const hRaw = values[this.cfService.hysteresisKey(t)];
    const h = hRaw == null || hRaw === ('' as any) || !isFinite(Number(hRaw)) ? 0 : Number(hRaw);
    const isHigh = t.operation === 'GREATER' || t.operation === 'GREATER_OR_EQUAL';
    const tripVal = threshold;
    const clearVal = h > 0 ? (isHigh ? threshold - h : threshold + h) : threshold;
    const sym: { [k: string]: string } = {
      GREATER: '>', GREATER_OR_EQUAL: '≥', LESS: '<', LESS_OR_EQUAL: '≤'
    };
    const tripOp = sym[t.operation] || t.operation;
    const clearOpKey =
      t.operation === 'GREATER' ? 'LESS_OR_EQUAL'
      : t.operation === 'LESS' ? 'GREATER_OR_EQUAL'
      : t.operation === 'GREATER_OR_EQUAL' ? 'LESS'
      : 'GREATER';
    const clearOp = sym[clearOpKey];
    const unit = t.unit ? ` ${t.unit}` : '';
    return `Trips at ${tripOp} ${tripVal}${unit}, clears at ${clearOp} ${clearVal}${unit}`;
  }

  offlineEnabled(device: DeviceThresholdRow): boolean {
    const raw = device.attributes['offlineAlarmEnabled'];
    return raw === true || raw === 'true';
  }

  alarmsActive(device: DeviceThresholdRow): boolean {
    return device.alarmsEnabled !== false;
  }

  toggleDeviceAlarms(device: DeviceThresholdRow, event?: Event): void {
    event?.stopPropagation();
    const next = !this.alarmsActive(device);
    device.alarmsEnabled = next;
    this.saveAttribute(device.deviceId, 'alarmsEnabled', next)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        error: (err) => console.error('[AlarmEditor] Failed to toggle alarms:', err)
      });
    this.ctx.detectChanges();
  }

  digitalSummary(device: DeviceThresholdRow, dig: DigitalConfig): string {
    const enabledRaw = device.attributes[dig.enabledAttributeKey];
    const conditionRaw = device.attributes[dig.conditionAttributeKey];
    if (enabledRaw == null && conditionRaw == null) return '—';
    const enabled = enabledRaw === true || enabledRaw === 'true' ? 'on' : 'off';
    const condStr = conditionRaw == null ? '?' : String(conditionRaw);
    return `${enabled} · =${condStr}`;
  }

  msToMin(value: number | string | boolean | null | undefined): number | null {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!isFinite(n)) return null;
    return Math.round(n / 60000);
  }

  minToMs(minutes: number | string | null | undefined): number | null {
    if (minutes == null || minutes === '') return null;
    const n = Number(minutes);
    if (!isFinite(n)) return null;
    return Math.round(n * 60000);
  }

  // --- Label lookup ---

  getLabel(key: string): string {
    if (!this.currentGroup?.config) return key;
    const found = this.currentGroup.config.thresholds.find(t => t.key === key);
    return found ? found.label : key;
  }

  // --- REST API ---

  private saveAttribute(deviceId: string, key: string, value: number | string | boolean): Observable<any> {
    const body: any = {};
    body[key] = value;
    return this.ctx.http.post(
      `/api/plugins/telemetry/DEVICE/${deviceId}/attributes/SERVER_SCOPE`, body
    );
  }

  private saveAttributes(deviceId: string, body: { [key: string]: any }): Observable<any> {
    return this.ctx.http.post(
      `/api/plugins/telemetry/DEVICE/${deviceId}/attributes/SERVER_SCOPE`, body
    );
  }

  private buildAlarmConfigBody(
    deviceId: string,
    group: ProfileGroup,
    values: { [key: string]: number | boolean | null },
    delay: AlarmDelay | null,
    digitalStates: { [k: string]: { enabled: boolean | null; condition: boolean | number | null } },
    changedAlarmKeys?: Set<string>
  ): { [key: string]: any } {
    const body: { [key: string]: any } = {};
    group.config.thresholds.forEach(t => {
      const v = values[t.key];
      if (v == null || v === ('' as any)) return;
      const num = Number(v);
      if (!isFinite(num)) return;
      if (changedAlarmKeys && !changedAlarmKeys.has(t.key)) return;
      const hRaw = values[this.cfService.hysteresisKey(t)];
      const hysteresis = hRaw == null || hRaw === ('' as any) ? null : Number(hRaw);
      body[t.key] = num;
      body[`alarmConfig_${t.key}`] = this.cfService.buildThresholdPayload(deviceId, t, num, delay, hysteresis);
    });
    (group.config.digitals || []).forEach(d => {
      const state = digitalStates?.[d.key];
      if (state && (typeof state.enabled === 'boolean' || state.condition != null)) {
        if (changedAlarmKeys && !changedAlarmKeys.has(d.key)) return;
        body[`alarmConfig_${d.key}`] = this.cfService.buildDigitalPayload(deviceId, d);
      }
    });
    return body;
  }

  private loadCustomers() {
    this.loading = true;
    const customers$: Observable<any[]> = this.isTenantAdmin
      ? this.ctx.http.get<PageData<any>>('/api/customers?pageSize=1000&page=0').pipe(
          map(res => res.data || [])
        )
      : forkJoin({
          self: this.ctx.http.get<any>(`/api/customer/${this.ctx.currentUser.customerId}`),
          descendants: this.ctx.http.get<PageData<any>>('/api/user/customers?pageSize=1000&page=0')
        }).pipe(
          map(({ self, descendants }) => [self, ...(descendants?.data || [])])
        );

    customers$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (customers) => {
        this.customerNameById.clear();
        const ids: string[] = [];
        for (const c of customers) {
          const id = c?.id?.id;
          if (!id) continue;
          this.customerNameById.set(id, c.title || 'Unnamed');
          ids.push(id);
        }
        this.allCustomerIds = ids;
        this.loadDevices();
      },
      error: (err) => {
        console.error('[AlarmEditor] Failed to load customers:', err);
        this.loading = false;
        this.ctx.detectChanges();
      }
    });
  }

  private loadDevices() {
    const previousProfileName = this.currentGroup?.profileName ?? null;
    this.loading = true;
    this.profileGroups = [];

    const ids = this.allCustomerIds;
    if (ids.length === 0) {
      this.loading = false;
      this.ctx.detectChanges();
      return;
    }

    forkJoin(
      ids.map(cid =>
        this.ctx.http.get<PageData<DeviceInfo>>(
          `/api/customer/${cid}/deviceInfos?pageSize=1000&page=0`
        )
      )
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (pages) => {
        const devices: DeviceInfo[] = [];
        pages.forEach(p => {
          const rows = p?.data || [];
          devices.push(...rows);
        });
        this.loadAttributesAndGroup(devices, previousProfileName);
      },
      error: (err) => {
        console.error('[AlarmEditor] Failed to load devices:', err);
        this.loading = false;
        this.ctx.detectChanges();
      }
    });
  }

  private loadAttributesAndGroup(devices: DeviceInfo[], preferredProfileName: string | null = null) {
    if (devices.length === 0) {
      this.loading = false;
      this.ctx.detectChanges();
      return;
    }

    // Collect unique profile IDs
    const profileIds = new Set<string>();
    devices.forEach(d => {
      const pid = d.deviceProfileId?.id;
      if (pid) profileIds.add(pid);
    });

    // Fetch attributes + profile names + alarm CFs in parallel
    const attrRequests = devices.map(d =>
      this.ctx.http.get<AttributeData[]>(
        `/api/plugins/telemetry/DEVICE/${d.id.id}/values/attributes/SERVER_SCOPE`
      )
    );

    const profileInfoRequests = Array.from(profileIds).map(pid =>
      this.ctx.http.get<any>(`/api/deviceProfileInfo/${pid}`)
    );

    // const cfsByDevice$ = this.cfService.getForDevices(devices.map(d => d.id.id));

    forkJoin([
      forkJoin(attrRequests),
      profileInfoRequests.length > 0 ? forkJoin(profileInfoRequests) : of([])
    ]).pipe(takeUntil(this.destroy$)).subscribe({
      next: ([allAttrs, profileInfos]: [AttributeData[][], any[]]) => {
        // Build profile name lookup
        const profileNameMap = new Map<string, string>();
        const pidArray = Array.from(profileIds);
        if (Array.isArray(profileInfos)) {
          profileInfos.forEach((info, idx) => {
            profileNameMap.set(pidArray[idx], info.name || 'Unknown');
          });
        }

        // Group devices by profile
        const profileMap = new Map<string, {
          profileName: string;
          config: ProfileAlarmConfig | null;
          devices: { info: DeviceInfo; allAttrs: AttributeData[] }[];
        }>();

        devices.forEach((device, i) => {
          const profileId = device.deviceProfileId?.id;
          if (!profileId) return;

          if (!profileMap.has(profileId)) {
            const profileName = profileNameMap.get(profileId) || device.type || 'Unknown';
            // Look up config by profile name (case-insensitive match)
            const configEntry = this.findConfig(profileName);
            profileMap.set(profileId, {
              profileName,
              config: configEntry,
              devices: []
            });
          }

          profileMap.get(profileId).devices.push({ info: device, allAttrs: allAttrs[i] || [] });
        });

        // Build ProfileGroup array
        const groups: ProfileGroup[] = [];
        profileMap.forEach((data, profileId) => {
          if (!data.config) {
            console.warn(`[AlarmEditor] No config found for profile "${data.profileName}", skipping`);
            return;
          }

          const config = data.config;
          // Offline settings still live on SERVER_SCOPE attributes
          const attrKeys = ['offlineAlarmEnabled', 'inactivityTimeout'];
          (config.digitals || []).forEach(d => {
            attrKeys.push(d.enabledAttributeKey, d.conditionAttributeKey);
          });

          groups.push({
            profileId,
            profileName: data.profileName,
            config,
            devices: data.devices.map(d => {
              const attributes: { [key: string]: number | string | boolean | null } = {};
              attrKeys.forEach(key => {
                const attr = d.allAttrs.find(a => a.key === key);
                attributes[key] = attr?.value ?? null;
              });
              const deviceCfs = new Map<string, any>();
              const cfAlarmKeys = new Set<string>();
              d.allAttrs.forEach(a => {
                if (typeof a.key === 'string' && a.key.startsWith('alarmConfig_') && a.value) {
                  const payload: any = a.value;
                  if (payload?.name) deviceCfs.set(payload.name, payload);
                  cfAlarmKeys.add(a.key.substring('alarmConfig_'.length));
                }
              });
              config.thresholds.forEach(t => {
                const cf = deviceCfs.get(t.alarmName);
                attributes[t.key] = this.cfService.extractThresholdValue(cf, t);
                attributes[this.cfService.hysteresisKey(t)] = this.cfService.extractHysteresis(cf, t);
              });
              const delay = this.cfService.extractDelay(deviceCfs, config.thresholds);
              attributes['alarmDelay'] = this.cfService.formatDelayLabel(delay);
              attributes['alarmDelayValue'] = delay?.value ?? null;
              attributes['alarmDelayUnit'] = delay?.unit ?? null;

              const emailAttr = d.allAttrs.find(a => a.key === 'alarmEmailList');
              const emailRaw = emailAttr?.value || '';
              const alarmEmailList = typeof emailRaw === 'string' && emailRaw.length > 0
                ? emailRaw.split(',').map((e: string) => e.trim()).filter((e: string) => e.length > 0)
                : [];

              const smsAttr = d.allAttrs.find(a => a.key === 'alarmSmsList');
              const smsRaw = smsAttr?.value || '';
              const alarmSmsList = typeof smsRaw === 'string' && smsRaw.length > 0
                ? smsRaw.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
                : [];

              const customerId = d.info.customerId?.id || null;
              const customerName = (d.info as any).ownerName
                || (customerId ? this.customerNameById.get(customerId) : null)
                || '';
              const alarmsEnabledRaw = d.allAttrs.find(a => a.key === 'alarmsEnabled')?.value;
              const alarmsEnabled =
                alarmsEnabledRaw === false || alarmsEnabledRaw === 'false' ? false
                : alarmsEnabledRaw === true || alarmsEnabledRaw === 'true' ? true
                : null;
              return {
                deviceId: d.info.id.id,
                entityId: { entityType: EntityType.DEVICE, id: d.info.id.id } as EntityId,
                deviceName: d.info.label || d.info.name,
                deviceProfileName: data.profileName,
                customerId,
                customerName,
                selected: false,
                alarmsEnabled,
                attributes,
                alarmEmailList,
                alarmSmsList,
                cfAlarmKeys
              };
            })
          });
        });

        groups.sort((a, b) => a.profileName.localeCompare(b.profileName));

        this.profileGroups = groups;
        this.filteredProfileGroups = groups;
        const restoredIdx = preferredProfileName
          ? groups.findIndex(g => g.profileName === preferredProfileName)
          : -1;
        this.selectedProfileIndex = restoredIdx >= 0 ? restoredIdx : 0;
        this.profileSearch = groups[this.selectedProfileIndex] || '';
        this.loading = false;
        this.ctx.detectChanges();
      },
      error: (err) => {
        console.error('[AlarmEditor] Failed to load data:', err);
        this.loading = false;
        this.ctx.detectChanges();
      }
    });
  }

  private findConfig(profileName: string): ProfileAlarmConfig | null {
    if (ALARM_CONFIG[profileName]) {
      return ALARM_CONFIG[profileName];
    }
    const lower = profileName.toLowerCase();
    for (const key of Object.keys(ALARM_CONFIG)) {
      if (key.toLowerCase() === lower) {
        return ALARM_CONFIG[key];
      }
    }
    return null;
  }
}
