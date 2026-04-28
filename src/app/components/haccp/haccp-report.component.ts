import { Component, OnInit, Input, ViewChild } from '@angular/core';
import { WidgetContext } from '@app/modules/home/models/widget-component.models';
import { IWidgetSubscription } from '@app/core/api/widget-api.models';
import { HaccpReportModel } from './haccp-report-model';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import {ActivatedRoute, Params} from '@angular/router';
import {take} from 'rxjs';
import {TbUnit} from "@shared/models/unit.models";

interface ReportVisuals {
  columnWidth: string| null;
  rowHeight: string | null;
  verticalBorder: boolean;
}

@Component({
  selector: 'tb-haccp-report',
  templateUrl: './haccp-report.component.html',
  styleUrls: ['./haccp-report.component.scss']
})
export class HaccpReportComponent implements OnInit {
  @Input()
  ctx: WidgetContext;
  private reportStart?: number;
  private reportEnd?: number;
  private subscription: IWidgetSubscription;
  private model: HaccpReportModel;
  dataSource = new MatTableDataSource();
  dynamicColumns: Array<string>;
  private unit?: TbUnit;
  private timeParams?: Array<string>;
  private okColour: string;
  private dangerColour: string;
  private offlineColour: string;
  private offlineText: string;
  private offlineWindow: number;
  reportVisuals : ReportVisuals | null;
  emptyData = new MatTableDataSource([{ empty: 'row' }]);
  emptyMessage: string;
  private route: ActivatedRoute;

  @ViewChild('paginator') paginator: MatPaginator;
  private firstReport = true;
  private lastDataFingerprint: string | null = null;
  private lastRowsFingerprint: string | null = null;
  private lastColumnsFingerprint: string | null = null;

  constructor(route: ActivatedRoute) {
    this.route = route;
    this.model = new HaccpReportModel();
  }

  ngOnInit() {

    this.ctx.$scope.haccpTableWidget = this;
    this.subscription = this.ctx.defaultSubscription;
    this.unit = this.ctx.widgetConfig.units ?? '°C';

    if (this.ctx.widgetConfig.noDataDisplayMessage !== undefined &&
      this.ctx.widgetConfig.noDataDisplayMessage.length > 1) {
      this.emptyMessage = this.ctx.widgetConfig.noDataDisplayMessage;
    } else {
      this.emptyMessage = 'No data to display';
    }

    const times = this.ctx.settings?.times ? this.ctx.settings.times : ['09:00', '12:00', '17:00'];
    const columnWidth = this.ctx.settings?.reportVisuals?.columnWidth ?? null;
    const rowHeight = this.ctx.settings?.reportVisuals?.rowHeight ?? '28px';
    const verticalBorder = this.ctx.settings?.reportVisuals?.verticalBorder ?? false;
    this.reportVisuals = {columnWidth, rowHeight, verticalBorder};
    this.timeParams = times;
    this.offlineColour = this.ctx.settings?.offlineSettings?.offlineColour ?? '#D3D3D3';
    this.offlineText = this.ctx.settings?.offlineSettings?.offlineText ?? 'N/A';
    this.offlineWindow = this.ctx.settings?.offlineSettings?.offlineWindow ?? 30;
    this.okColour = this.ctx.settings?.thresholds?.okColour ?? '#1EB478';
    this.dangerColour = this.ctx.settings?.thresholds?.dangerColour ?? '#964646';
    // console.log('offlineColour', this.offlineColour);
    // console.log('this.ctx.settings', this.ctx.settings);
    // console.log('reportVisuals', this.reportVisuals);
    // console.log('unit', this.unit);
    // console.log('this', this);
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
  }

  getReport() {
    const report = this.model.buildHaccpReport(this.subscription.data, this.timeParams, this.offlineWindow);

    // console.log('Debug: report', report);

    const columnNames = ['Date', ...this.model.getDeviceNames(report.devices)];
    const columnsFingerprint = columnNames.join('|');
    if (columnsFingerprint !== this.lastColumnsFingerprint) {
      this.dynamicColumns = columnNames;
      this.lastColumnsFingerprint = columnsFingerprint;
    }

    try {
      const rows = this.model.mapToRows(
        report.devices,
        this.unit,
        this.timeParams,
        this.okColour,
        this.dangerColour,
        this.offlineColour,
        this.offlineText
      );

      const reportBoundRows = this.model.filterOnReportBounds(
          this.reportStart,
          this.reportEnd,
          rows
      );

      // Bail out early if the rendered rows are identical to last render. In
      // realtime mode TB ticks every minute, but HACCP rows only change when a
      // slot's "closest reading" actually changes — so most ticks are no-ops.
      const rowsFingerprint = this.computeRowsFingerprint(reportBoundRows);
      if (!this.firstReport && rowsFingerprint === this.lastRowsFingerprint) {
        return;
      }
      this.lastRowsFingerprint = rowsFingerprint;

      // rows for custom download (only refreshed when content changed)
      this.ctx.settings.downloadRows = rows;

      // Mutate instead of replacing so the paginator keeps its binding and the
      // user's page-size / current-page selection isn't reset on every update.
      // Explicitly snapshot & restore paginator state around the mutation as a
      // safety net.
      const priorPageIndex = this.dataSource.paginator?.pageIndex;
      const priorPageSize = this.dataSource.paginator?.pageSize;

      this.dataSource.data = reportBoundRows;

      if (this.firstReport) {
        this.firstReport = false;
        if (!this.dataSource.paginator) {
          this.dataSource.paginator = this.paginator;
        }
        let myParam;
        this.route.queryParams
            .pipe(take(1))
            .subscribe((value: Params) => {
              myParam = value.pageSize;
            });
        if (this.dataSource.paginator) {
          this.dataSource.paginator.pageSize = myParam ? parseInt(myParam) : 10;
        }
      } else if (this.dataSource.paginator) {
        if (priorPageSize != null) {
          this.dataSource.paginator.pageSize = priorPageSize;
        }
        if (priorPageIndex != null) {
          const maxIndex = Math.max(0, Math.ceil(reportBoundRows.length / this.dataSource.paginator.pageSize) - 1);
          this.dataSource.paginator.pageIndex = Math.min(priorPageIndex, maxIndex);
        }
      }

    } catch (e) {
      console.log('Caught exception while building rows for HACCP report:', e);
      return false;
    }
  }

  // Called when the new data is available from the widget subscription.
  // Latest data can be accessed from the defaultSubscription object of widget context (ctx).
  onDataUpdated() {
    const reportTimeWindow = this.ctx.timeWindow;
    this.reportStart = reportTimeWindow.minTime;
    this.reportEnd =  reportTimeWindow.maxTime;

    // In realtime mode TB fires onDataUpdated on every subscription tick, even
    // when nothing that affects the rendered rows has changed. Skip the full
    // rebuild when the time window and the per-datasource sample count + last
    // timestamp are identical to the previous tick.
    const fingerprint = this.computeDataFingerprint();
    if (fingerprint === this.lastDataFingerprint) {
      return;
    }
    this.lastDataFingerprint = fingerprint;

    this.getReport();
  }

  private computeDataFingerprint(): string {
    const parts: string[] = [String(this.reportStart), String(this.reportEnd)];
    const datasources = this.subscription?.data || [];
    for (const ds of datasources) {
      const data = ds?.data || [];
      parts.push(String(data.length));
      if (data.length > 0) {
        parts.push(String(data[data.length - 1]?.[0] ?? ''));
      }
    }
    return parts.join('|');
  }

  private computeRowsFingerprint(rows: any[]): string {
    const parts: string[] = [];
    for (const r of rows) {
      const cells: string[] = [r.time];
      for (const k of Object.keys(r)) {
        if (k === 'time') continue;
        const cell = r[k];
        cells.push(`${cell?.value ?? ''}|${cell?.colour ?? ''}|${cell?.isOffline ? '1' : '0'}`);
      }
      parts.push(cells.join(','));
    }
    return parts.join(';');
  }

  // The first function that is called when the widget is ready for initialization.
  // It should be used to prepare widget DOM, process widget settings and handle initial subscription information.
  onInit() {
  }

  onResize() {
    this.ctx.detectChanges();
  }

  onEditModeChanged() {
    this.ctx.detectChanges()
  }

  onMobileModeChanged() {
  }

  onDestroy() {
  }
}
