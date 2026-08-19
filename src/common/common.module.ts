// FILE: src/common/common.module.ts
import { Global, Module } from '@nestjs/common';
import { TaskAccessService } from './task-access.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [TaskAccessService, StorageService],
  exports: [TaskAccessService, StorageService],
})
export class CommonModule {}
