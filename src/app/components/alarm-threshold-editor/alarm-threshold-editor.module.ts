import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '@shared/public-api';
import { AlarmThresholdEditorComponent } from './alarm-threshold-editor.component';

@NgModule({
  declarations: [AlarmThresholdEditorComponent],
  imports: [CommonModule, SharedModule, FormsModule],
  exports: [AlarmThresholdEditorComponent]
})
export class AlarmThresholdEditorModule {}
