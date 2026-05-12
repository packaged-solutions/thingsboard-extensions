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
  CustomerOption,
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
  styleUrls: ['./alarm-threshold-editor.component.scss'],
  standalone: false
})
export class AlarmThresholdEditorComponent implements OnInit, OnDestroy {

  @Input() ctx: WidgetContext;

  isTenantAdmin = false;
  customers: CustomerOption[] = [];
  filteredCustomers: CustomerOption[] = [];
  customerSearch: string | CustomerOption = '';
  selectedCustomerId: string | null = null;
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
    digitals: { [digitalKey: string]: { condition: boolean | number | null } };
    deletes: Set<string>;
    reenables: Set<string>;
    original: {
      values: { [key: string]: number | boolean | null };
      delayValue: number | null;
      delayUnit: DelayUnit;
      digitals: { [digitalKey: string]: { condition: boolean | number | null } };
    };
  } = {
    values: {}, emails: '', sms: '', delayValue: null, delayUnit: 'MINUTES', digitals: {},
    deletes: new Set<string>(), reenables: new Set<string>(),
    original: { values: {}, delayValue: null, delayUnit: 'MINUTES', digitals: {} }
  };
  readonly delayUnits: DelayUnit[] = ['SECONDS', 'MINUTES', 'HOURS'];

  private readonly pageSizeStorageKey = 'alarmThresholdEditor.pageSize';
  private readonly customerStorageKey = 'alarmThresholdEditor.customerId';
  private readonly profileStorageKey = 'alarmThresholdEditor.profileName';
  private readonly allowedPageSizes = [10, 20, 30];
  page = 0;
  pageSize = this.readStoredPageSize();

  private destroy$ = new Subject<void>();
  private readonly defaultLowBatteryThreshold = 20;
  private cfService!: AlarmCalculatedFieldService;
  private customerNameById = new Map<string, string>();

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
      rows.sort((a, b) => {
        const av = this.sortValue(a, key);
        const bv = this.sortValue(b, key);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return dirMul * this.compareValues(av, bv);
      });
    }
    return rows;
  }

  get pagedDevices(): DeviceThresholdRow[] {
    const rows = this.processedDevices;
    const start = this.page * this.pageSize;
    return rows.slice(start, start + this.pageSize);
  }

  private sortValue(row: DeviceThresholdRow, key: string): any {
    if (key === 'device') return row.deviceName;
    if (key === 'customer') return row.customerName;
    if (key === 'emails') return row.alarmEmailList.length;
    if (key === 'sms') return row.alarmSmsList.length;
    return row.attributes[key];
  }

  private compareValues(av: any, bv: any): number {
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

  // --- Customer selection ---

  onCustomerAutoSelected(event: any) {
    const customer: CustomerOption = event.option.value;
    if (customer?.id && customer.id !== this.selectedCustomerId) {
      this.selectCustomer(customer.id);
    }
  }

  onCustomerInputFocus() {
    this.filteredCustomers = this.customers;
  }

  displayCustomer = (c: CustomerOption | string): string => {
    if (!c) return '';
    if (typeof c === 'string') return c;
    return c.name || '';
  }

  filterCustomers() {
    const term = typeof this.customerSearch === 'string' ? this.customerSearch.toLowerCase() : '';
    this.filteredCustomers = this.customers.filter(c =>
      c.name.toLowerCase().includes(term)
    );
  }

  private selectCustomer(customerId: string) {
    this.selectedCustomerId = customerId;
    const found = this.customers.find(c => c.id === customerId);
    if (found) this.customerSearch = found;
    this.persistSelectedCustomer(customerId);
    this.profileGroups = [];
    this.filteredProfileGroups = [];
    this.profileSearch = '';
    this.selectedProfileIndex = 0;
    this.page = 0;
    this.allSelected = false;
    this.loadDeviceInfosForCustomer(customerId);
  }

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
    const group = this.profileGroups[index];
    if (group) {
      this.persistSelectedProfile(group.profileName);
      if (!group.attributesLoaded) {
        this.loadAttributesForGroup(group);
      }
    }
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

  private persistSelectedCustomer(id: string | null): void {
    try {
      if (id) localStorage.setItem(this.customerStorageKey, id);
      else localStorage.removeItem(this.customerStorageKey);
    } catch { /* ignore storage errors */ }
  }

  private readStoredCustomerId(): string | null {
    try {
      return localStorage.getItem(this.customerStorageKey);
    } catch { return null; }
  }

  private persistSelectedProfile(name: string | null): void {
    try {
      if (name) localStorage.setItem(this.profileStorageKey, name);
      else localStorage.removeItem(this.profileStorageKey);
    } catch { /* ignore storage errors */ }
  }

  private readStoredProfileName(): string | null {
    try {
      return localStorage.getItem(this.profileStorageKey);
    } catch { return null; }
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
    if (this.selectedCustomerId) {
      this.loadDeviceInfosForCustomer(this.selectedCustomerId);
    } else {
      this.loadCustomers();
    }
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

    const digitals: { [k: string]: { condition: boolean | number | null } } = {};
    (group.config.digitals || []).forEach(dig => {
      digitals[dig.key] = { condition: null };
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
      deletes: new Set<string>(),
      reenables: new Set<string>(),
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

    const digitals: { [k: string]: { condition: boolean | number | null } } = {};
    (group.config.digitals || []).forEach(dig => {
      const conditionRaw = device.attributes[dig.conditionAttributeKey];
      digitals[dig.key] = {
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
      deletes: new Set<string>(),
      reenables: new Set<string>(),
      original: {
        values: { ...values },
        delayValue: initialDelayValue,
        delayUnit: initialDelayUnit,
        digitals: Object.keys(digitals).reduce((acc, k) => {
          acc[k] = { condition: digitals[k].condition };
          return acc;
        }, {} as { [k: string]: { condition: boolean | number | null } })
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
      this.editForm.digitals[key] = { condition: null };
    }
  }

  canDeleteRule(key: string): boolean {
    return !this.bulkEdit && !!this.editingDevice?.cfAlarmKeys.has(key);
  }

  isDisabledRule(key: string): boolean {
    return !this.bulkEdit && !!this.editingDevice?.disabledAlarmKeys.has(key);
  }

  canShowRuleToggle(key: string): boolean {
    return this.canDeleteRule(key) || this.isDisabledRule(key);
  }

  isPendingDelete(key: string): boolean {
    return this.editForm.deletes.has(key);
  }

  isPendingReenable(key: string): boolean {
    return this.editForm.reenables.has(key);
  }

  // Inputs are locked when the row is "off" (will be off after save, or already off
  // and not being re-enabled). Re-enabling unlocks so the user can revise the value.
  areInputsLocked(key: string): boolean {
    return this.isPendingDelete(key) || (this.isDisabledRule(key) && !this.isPendingReenable(key));
  }

  toggleDelete(key: string): void {
    if (this.editForm.deletes.has(key)) {
      this.editForm.deletes.delete(key);
    } else {
      this.editForm.deletes.add(key);
    }
  }

  toggleReenable(key: string): void {
    if (this.editForm.reenables.has(key)) {
      this.editForm.reenables.delete(key);
    } else {
      this.editForm.reenables.add(key);
    }
  }

  toggleRuleState(key: string): void {
    if (this.isDisabledRule(key)) {
      this.toggleReenable(key);
    } else {
      this.toggleDelete(key);
    }
  }

  // Icon convention: glyph shows the action that *clicking* will perform.
  ruleToggleIcon(key: string): string {
    if (this.isDisabledRule(key)) {
      return this.isPendingReenable(key) ? 'notifications_off' : 'notifications_active';
    }
    return this.isPendingDelete(key) ? 'notifications_active' : 'notifications_off';
  }

  ruleToggleTooltip(key: string): string {
    if (this.isDisabledRule(key)) {
      return this.isPendingReenable(key) ? 'Cancel re-enable' : 'Re-enable alarm rule (value preserved)';
    }
    return this.isPendingDelete(key) ? 'Keep alarm rule' : 'Disable alarm rule (value preserved)';
  }

  thresholdMessageState(t: ThresholdConfig): 'pending-delete' | 'pending-reenable' | 'disabled' | 'error' | 'preview' {
    if (this.isPendingDelete(t.key)) return 'pending-delete';
    if (this.isPendingReenable(t.key)) return 'pending-reenable';
    if (this.isDisabledRule(t.key)) return 'disabled';
    if (this.thresholdPairError(t, this.editForm.values)) return 'error';
    return 'preview';
  }

  digitalMessageState(d: DigitalConfig): 'pending-delete' | 'pending-reenable' | 'disabled' | 'none' {
    if (this.isPendingDelete(d.key)) return 'pending-delete';
    if (this.isPendingReenable(d.key)) return 'pending-reenable';
    if (this.isDisabledRule(d.key)) return 'disabled';
    return 'none';
  }

  saveEditDevice() {
    const group = this.currentGroup;
    const device = this.editingDevice;
    if (!group || !device) return;

    const deletes = this.editForm.deletes;
    const reenables = this.editForm.reenables;
    const isInactive = (key: string) => device.disabledAlarmKeys.has(key) && !reenables.has(key);
    const thresholdsToApply: ThresholdConfig[] = group.config.thresholds.filter(t => {
      if (deletes.has(t.key)) return false;
      if (isInactive(t.key)) return false;
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

    const digitalsToApply = (group.config.digitals || []).filter(d => {
      if (this.editForm.deletes.has(d.key)) return false;
      if (isInactive(d.key)) return false;
      const state = this.editForm.digitals[d.key];
      return state && state.condition != null;
    });

    if (
      thresholdsToApply.length === 0 && deletes.size === 0 && !applyEmails && !applySms && !applyOfflineEnabled
      && !applyOfflineTimeout && digitalsToApply.length === 0
    ) {
      this.closeEdit();
      return;
    }

    this.saving = true;

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
        digitalsToApply.forEach(dig => {
          const state = this.editForm.digitals[dig.key];
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
          if (deletes.has(t.key)) return;
          if (isInactive(t.key)) return;
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
          if (deletes.has(d.key)) return;
          if (isInactive(d.key)) return;
          const before = original.digitals[d.key] || { condition: null };
          const after = this.editForm.digitals[d.key] || { condition: null };
          const stateChanged = before.condition !== after.condition;
          const hasState = after.condition != null;
          if (stateChanged || (hasState && !hasExistingCf(d.key))) {
            changedAlarmKeys.add(d.key);
          }
        });
        const alarmConfigBody = this.buildAlarmConfigBody(
          device.deviceId, group, this.editForm.values, delay, this.editForm.digitals, changedAlarmKeys, deletes
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
        digitalsToApply.forEach(dig => {
          const state = this.editForm.digitals[dig.key];
          if (state.condition != null) {
            device.attributes[dig.conditionAttributeKey] = state.condition as boolean | number;
          }
        });
        changedAlarmKeys.forEach(k => {
          device.cfAlarmKeys.add(k);
          device.disabledAlarmKeys.delete(k);
        });
        deletes.forEach(k => {
          device.cfAlarmKeys.delete(k);
          // Disable preserves cf<Key>/condition attribute, so the rule is now disabled
          // (re-enableable) rather than gone.
          device.disabledAlarmKeys.add(k);
        });
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

    const digitalsToApply = (group.config.digitals || []).filter(d => {
      const state = this.editForm.digitals?.[d.key];
      return state && state.condition != null;
    });

    if (
      thresholdsToApply.length === 0 && !applyEmails && !applySms && !applyOfflineEnabled
      && !applyOfflineTimeout && digitalsToApply.length === 0
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
          digitalsToApply.forEach(dig => {
            const state = this.editForm.digitals[dig.key];
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
          digitalsToApply.forEach(dig => {
            const state = this.editForm.digitals[dig.key];
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
    return device.attributes[dig.conditionAttributeKey] != null;
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

  private isHighOp(op: ThresholdConfig['operation']): boolean {
    return op === 'GREATER' || op === 'GREATER_OR_EQUAL';
  }

  private isLowOp(op: ThresholdConfig['operation']): boolean {
    return op === 'LESS' || op === 'LESS_OR_EQUAL';
  }

  private findPairedThreshold(t: ThresholdConfig): ThresholdConfig | null {
    if (!this.currentGroup) return null;
    const wantLow = this.isHighOp(t.operation);
    const wantHigh = this.isLowOp(t.operation);
    if (!wantLow && !wantHigh) return null;
    return this.currentGroup.config.thresholds.find(o =>
      o !== t
      && o.telemetryKey === t.telemetryKey
      && (wantLow ? this.isLowOp(o.operation) : this.isHighOp(o.operation))
    ) || null;
  }

  thresholdPairError(t: ThresholdConfig, values: { [key: string]: number | boolean | null }): string {
    const pair = this.findPairedThreshold(t);
    if (!pair) return '';
    const v = values[t.key];
    const pv = values[pair.key];
    if (v == null || v === ('' as any) || pv == null || pv === ('' as any)) return '';
    const a = Number(v), b = Number(pv);
    if (!isFinite(a) || !isFinite(b)) return '';
    const isHigh = this.isHighOp(t.operation);
    const high = isHigh ? a : b;
    const low = isHigh ? b : a;
    if (low >= high) {
      const unit = t.unit ? ` ${t.unit}` : '';
      return `Low (${low}${unit}) must be less than High (${high}${unit})`;
    }
    return '';
  }

  hasThresholdErrors(): boolean {
    if (!this.currentGroup) return false;
    return this.currentGroup.config.thresholds
      .some(t => this.thresholdPairError(t, this.editForm.values) !== '');
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

  digitalSummary(device: DeviceThresholdRow, dig: DigitalConfig): string {
    const conditionRaw = device.attributes[dig.conditionAttributeKey];
    if (conditionRaw == null) return '—';
    return `=${String(conditionRaw)}`;
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
    digitalStates: { [k: string]: { condition: boolean | number | null } },
    changedAlarmKeys?: Set<string>,
    deletes?: Set<string>
  ): { [key: string]: any } {
    const body: { [key: string]: any } = {};
    group.config.thresholds.forEach(t => {
      if (deletes?.has(t.key)) {
        // Sentinel consumed by the "Make Calculated Fields From Attribute" rule chain's
        // delete branch — it DELETEs the CF and sweeps alarmConfig_/alarmConfigRef_,
        // leaving cf<Key>/cf<Key>Clear intact so the value is preserved for re-enable.
        body[`alarmConfig_${t.key}`] = { _delete: true, name: t.alarmName };
        return;
      }
      const v = values[t.key];
      if (v == null || v === ('' as any)) return;
      const num = Number(v);
      if (!isFinite(num)) return;
      if (changedAlarmKeys && !changedAlarmKeys.has(t.key)) return;
      const hRaw = values[this.cfService.hysteresisKey(t)];
      const hysteresis = hRaw == null || hRaw === ('' as any) ? null : Number(hRaw);
      const isHigh = t.operation === 'GREATER' || t.operation === 'GREATER_OR_EQUAL';
      const clearVal = hysteresis != null && isFinite(hysteresis) && hysteresis > 0
        ? (isHigh ? num - hysteresis : num + hysteresis)
        : num;
      body[this.cfService.cfKey(t)] = num;
      body[this.cfService.cfClearKey(t)] = clearVal;
      body[t.key] = this.cfService.sentinelForOperation(t.operation);
      body[`alarmConfig_${t.key}`] = this.cfService.buildThresholdPayload(deviceId, t, num, delay, hysteresis);
    });
    (group.config.digitals || []).forEach(d => {
      if (deletes?.has(d.key)) {
        body[`alarmConfig_${d.key}`] = { _delete: true, name: d.alarmName };
        return;
      }
      const state = digitalStates?.[d.key];
      if (state && state.condition != null) {
        if (changedAlarmKeys && !changedAlarmKeys.has(d.key)) return;
        body[`alarmConfig_${d.key}`] = this.cfService.buildDigitalPayload(deviceId, d);
        // Sentinel: same role as the numeric sentinel for thresholds. Suppresses any
        // profile-level digital alarm rule that reads this attribute. Our own CF no
        // longer references it.
        body[d.enabledAttributeKey] = false;
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
      next: (rawCustomers) => {
        this.customerNameById.clear();
        const options: CustomerOption[] = [];
        for (const c of rawCustomers) {
          const id = c?.id?.id;
          if (!id) continue;
          const name = c.title || 'Unnamed';
          const parentCustomerId = c?.parentCustomerId?.id || null;
          this.customerNameById.set(id, name);
          options.push({ id, name, parentCustomerId });
        }
        options.sort((a, b) => a.name.localeCompare(b.name));
        this.customers = options;
        this.filteredCustomers = options;

        if (options.length === 0) {
          this.loading = false;
          this.ctx.detectChanges();
          return;
        }

        const stored = this.readStoredCustomerId();
        const initial = (stored && options.some(o => o.id === stored)) ? stored : options[0].id;
        this.selectCustomer(initial);
      },
      error: (err) => {
        console.error('[AlarmEditor] Failed to load customers:', err);
        this.loading = false;
        this.ctx.detectChanges();
      }
    });
  }

  private loadDeviceInfosForCustomer(customerId: string) {
    this.loading = true;
    this.profileGroups = [];
    this.filteredProfileGroups = [];

    this.fetchDeviceInfosForCustomer(customerId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (devices) => {
        this.profileGroups = this.buildSkeletonGroups(devices);
        this.filteredProfileGroups = this.profileGroups;

        if (this.profileGroups.length === 0) {
          this.loading = false;
          this.profileSearch = '';
          this.ctx.detectChanges();
          return;
        }

        const preferred = this.readStoredProfileName();
        const idx = preferred
          ? this.profileGroups.findIndex(g => g.profileName === preferred)
          : -1;
        this.selectProfileIndex(idx >= 0 ? idx : 0);
      },
      error: (err) => {
        console.error('[AlarmEditor] Failed to load devices:', err);
        this.loading = false;
        this.ctx.detectChanges();
      }
    });
  }

  private fetchDeviceInfosForCustomer(customerId: string): Observable<DeviceInfo[]> {
    // A customer may be a parent in a hierarchy (e.g. "Network Rail" → "NR South East" → leaves).
    // Devices live on the leaves, so we must fetch deviceInfos for the whole subtree.
    const subtreeIds = this.collectCustomerSubtreeIds(customerId);
    if (subtreeIds.length === 0) return of([]);
    return forkJoin(
      subtreeIds.map(cid => this.fetchDeviceInfosForSingleCustomer(cid))
    ).pipe(map(pages => pages.flat()));
  }

  private fetchDeviceInfosForSingleCustomer(customerId: string): Observable<DeviceInfo[]> {
    const PAGE = 1024;
    const fetchPage = (page: number, acc: DeviceInfo[]): Observable<DeviceInfo[]> =>
      this.ctx.http.get<PageData<DeviceInfo>>(
        `/api/customer/${customerId}/deviceInfos?pageSize=${PAGE}&page=${page}`
      ).pipe(
        switchMap(res => {
          const all = acc.concat(res?.data || []);
          return res?.hasNext ? fetchPage(page + 1, all) : of(all);
        })
      );
    return fetchPage(0, []);
  }

  private collectCustomerSubtreeIds(rootId: string): string[] {
    const childrenByParent = new Map<string, string[]>();
    for (const c of this.customers) {
      if (!c.parentCustomerId) continue;
      const arr = childrenByParent.get(c.parentCustomerId) || [];
      arr.push(c.id);
      childrenByParent.set(c.parentCustomerId, arr);
    }
    const result: string[] = [];
    const queue: string[] = [rootId];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      result.push(cur);
      const children = childrenByParent.get(cur) || [];
      queue.push(...children);
    }
    return result;
  }

  private buildLatestValueKeys(config: ProfileAlarmConfig): string[] {
    const keys = new Set<string>([
      'offlineAlarmEnabled',
      'inactivityTimeout',
      'alarmDelay',
      'alarmEmailList',
      'alarmSmsList'
    ]);
    config.thresholds.forEach(t => {
      keys.add(this.cfService.cfKey(t));
      keys.add(this.cfService.cfClearKey(t));
      keys.add(`alarmConfig_${t.key}`);
    });
    (config.digitals || []).forEach(d => {
      keys.add(d.conditionAttributeKey);
      keys.add(`alarmConfig_${d.key}`);
    });
    return Array.from(keys);
  }

  private fetchAttributesViaEntityQuery(deviceIds: string[], config: ProfileAlarmConfig): Observable<Map<string, AttributeData[]>> {
    if (deviceIds.length === 0) return of(new Map());
    const keys = this.buildLatestValueKeys(config);
    const PAGE_SIZE = 1024;

    const entityFilter = { type: 'entityList', entityType: 'DEVICE', entityList: deviceIds };

    const fetchPage = (page: number, acc: any[]): Observable<any[]> => {
      const body = {
        entityFilter,
        pageLink: {
          pageSize: PAGE_SIZE,
          page,
          sortOrder: { key: { type: 'ENTITY_FIELD', key: 'createdTime' }, direction: 'DESC' }
        },
        latestValues: keys.map(k => ({ type: 'SERVER_ATTRIBUTE', key: k }))
      };
      return this.ctx.http.post<PageData<any>>('/api/entitiesQuery/find', body).pipe(
        switchMap(res => {
          const all = acc.concat(res?.data || []);
          return res?.hasNext ? fetchPage(page + 1, all) : of(all);
        })
      );
    };

    return fetchPage(0, []).pipe(
      map(rows => {
        const byId = new Map<string, AttributeData[]>();
        for (const row of rows) {
          const id = row?.entityId?.id;
          if (!id) continue;
          const sa = row.latest?.SERVER_ATTRIBUTE || {};
          const attrs: AttributeData[] = [];
          for (const [k, v] of Object.entries<any>(sa)) {
            const raw = v?.value;
            if (raw === undefined || raw === null || raw === '') continue;
            let value: any = raw;
            if (raw === 'true') value = true;
            else if (raw === 'false') value = false;
            else if (k.startsWith('alarmConfig_') && typeof raw === 'string' && raw.startsWith('{')) {
              try { value = JSON.parse(raw); } catch { /* keep raw string */ }
            }
            attrs.push({ key: k, value, lastUpdateTs: v.ts });
          }
          byId.set(id, attrs);
        }
        return byId;
      })
    );
  }

  private buildSkeletonGroups(devices: DeviceInfo[]): ProfileGroup[] {
    const profileMap = new Map<string, {
      profileName: string;
      config: ProfileAlarmConfig | null;
      devices: DeviceInfo[];
    }>();

    devices.forEach(device => {
      const profileId = device.deviceProfileId?.id;
      if (!profileId) return;
      if (!profileMap.has(profileId)) {
        const profileName = device.type || 'Unknown';
        profileMap.set(profileId, {
          profileName,
          config: this.findConfig(profileName),
          devices: []
        });
      }
      profileMap.get(profileId).devices.push(device);
    });

    const groups: ProfileGroup[] = [];
    profileMap.forEach((data, profileId) => {
      if (!data.config) {
        console.warn(`[AlarmEditor] No config found for profile "${data.profileName}", skipping`);
        return;
      }
      groups.push({
        profileId,
        profileName: data.profileName,
        config: data.config,
        devices: data.devices.map(d => this.makeSkeletonRow(d, data.profileName)),
        attributesLoaded: false
      });
    });

    groups.sort((a, b) => a.profileName.localeCompare(b.profileName));
    return groups;
  }

  private makeSkeletonRow(device: DeviceInfo, profileName: string): DeviceThresholdRow {
    const customerId = device.customerId?.id || null;
    const customerName = (device as any).ownerName
      || (customerId ? this.customerNameById.get(customerId) : null)
      || '';
    return {
      deviceId: device.id.id,
      entityId: { entityType: EntityType.DEVICE, id: device.id.id } as EntityId,
      deviceName: device.label || device.name,
      deviceProfileName: profileName,
      customerId,
      customerName,
      selected: false,
      attributes: {},
      alarmEmailList: [],
      alarmSmsList: [],
      cfAlarmKeys: new Set<string>(),
      disabledAlarmKeys: new Set<string>()
    };
  }

  private loadAttributesForGroup(group: ProfileGroup) {
    if (group.devices.length === 0) {
      group.attributesLoaded = true;
      return;
    }
    this.loading = true;
    const deviceIds = group.devices.map(d => d.deviceId);

    this.fetchAttributesViaEntityQuery(deviceIds, group.config).pipe(takeUntil(this.destroy$)).subscribe({
      next: (attrsByDevice) => {
        group.devices.forEach(row => {
          const attrs = attrsByDevice.get(row.deviceId) || [];
          this.populateRowFromAttrs(row, attrs, group);
        });
        group.attributesLoaded = true;
        this.loading = false;
        this.ctx.detectChanges();
      },
      error: (err) => {
        console.error('[AlarmEditor] Failed to load attributes:', err);
        this.loading = false;
        this.ctx.detectChanges();
      }
    });
  }

  private populateRowFromAttrs(row: DeviceThresholdRow, allAttrs: AttributeData[], group: ProfileGroup) {
    const config = group.config;
    const attributes: { [key: string]: number | string | boolean | null } = {};

    const attrKeys = ['offlineAlarmEnabled', 'inactivityTimeout'];
    (config.digitals || []).forEach(d => {
      attrKeys.push(d.conditionAttributeKey);
    });
    attrKeys.forEach(key => {
      const attr = allAttrs.find(a => a.key === key);
      attributes[key] = attr?.value ?? null;
    });

    const deviceCfs = new Map<string, any>();
    const cfAlarmKeys = new Set<string>();
    allAttrs.forEach(a => {
      if (typeof a.key === 'string' && a.key.startsWith('alarmConfig_') && a.value) {
        const payload: any = a.value;
        // Lingering disable sentinel — the rule chain is supposed to sweep
        // alarmConfig_<key> after deleting the CF, but if it hasn't yet (or
        // failed) we must not treat this as an active rule.
        if (payload?._delete === true) return;
        if (payload?.name) deviceCfs.set(payload.name, payload);
        cfAlarmKeys.add(a.key.substring('alarmConfig_'.length));
      }
    });

    config.thresholds.forEach(t => {
      const cf = deviceCfs.get(t.alarmName);
      const cfAttrVal = allAttrs.find(a => a.key === this.cfService.cfKey(t))?.value;
      const fromAttr = cfAttrVal != null && cfAttrVal !== '' ? Number(cfAttrVal) : null;
      const value: number | null = fromAttr != null && isFinite(fromAttr)
        ? fromAttr
        : this.cfService.extractThresholdValue(cf, t);
      attributes[t.key] = value;
      const clearAttrVal = allAttrs.find(a => a.key === this.cfService.cfClearKey(t))?.value;
      const liveClear = clearAttrVal != null && clearAttrVal !== '' ? Number(clearAttrVal) : null;
      let hysteresis: number | null;
      if (value != null && liveClear != null && isFinite(liveClear)) {
        const isHigh = t.operation === 'GREATER' || t.operation === 'GREATER_OR_EQUAL';
        const diff = isHigh ? value - liveClear : liveClear - value;
        hysteresis = diff > 0 ? diff : null;
      } else {
        hysteresis = this.cfService.extractHysteresis(cf, t, value);
      }
      attributes[this.cfService.hysteresisKey(t)] = hysteresis;
    });

    const delay = this.cfService.extractDelay(deviceCfs, config.thresholds);
    attributes['alarmDelay'] = this.cfService.formatDelayLabel(delay);
    attributes['alarmDelayValue'] = delay?.value ?? null;
    attributes['alarmDelayUnit'] = delay?.unit ?? null;

    const emailAttr = allAttrs.find(a => a.key === 'alarmEmailList');
    const emailRaw = emailAttr?.value || '';
    row.alarmEmailList = typeof emailRaw === 'string' && emailRaw.length > 0
      ? emailRaw.split(',').map((e: string) => e.trim()).filter((e: string) => e.length > 0)
      : [];

    const smsAttr = allAttrs.find(a => a.key === 'alarmSmsList');
    const smsRaw = smsAttr?.value || '';
    row.alarmSmsList = typeof smsRaw === 'string' && smsRaw.length > 0
      ? smsRaw.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      : [];

    const disabledAlarmKeys = new Set<string>();
    config.thresholds.forEach(t => {
      if (!cfAlarmKeys.has(t.key) && attributes[t.key] != null) {
        disabledAlarmKeys.add(t.key);
      }
    });
    (config.digitals || []).forEach(d => {
      if (cfAlarmKeys.has(d.key)) return;
      if (attributes[d.conditionAttributeKey] != null) {
        disabledAlarmKeys.add(d.key);
      }
    });

    row.attributes = attributes;
    row.cfAlarmKeys = cfAlarmKeys;
    row.disabledAlarmKeys = disabledAlarmKeys;
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
