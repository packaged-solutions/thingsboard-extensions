import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HaccpReportComponent } from './haccp-report.component';


@NgModule({
  declarations: [HaccpReportComponent],
  imports: [CommonModule, SharedModule],
  exports: [HaccpReportComponent]
})
export class HaccpReportWidgetModule {}
