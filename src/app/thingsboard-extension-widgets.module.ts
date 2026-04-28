///
/// Copyright © 2023 ThingsBoard, Inc.
///

import { NgModule } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import addCustomWidgetLocale from './locale/custom-widget-locale.constant';
import { CommonModule } from '@angular/common';
import { ExamplesModule } from './components/examples/examples.module';
import { HaccpReportWidgetModule } from './components/haccp/haccp-report-widget.module';
import { AlarmThresholdEditorModule } from './components/alarm-threshold-editor/alarm-threshold-editor.module';
import { addLibraryStyles } from './scss/lib-styles';

@NgModule({
  declarations: [],
  imports: [
    CommonModule
  ],
  exports: [
    ExamplesModule,
    HaccpReportWidgetModule,
    AlarmThresholdEditorModule
  ]
})
export class ThingsboardExtensionWidgetsModule {

  constructor(translate: TranslateService) {
    addCustomWidgetLocale(translate);
    addLibraryStyles('tb-extension-css');
  }

}
