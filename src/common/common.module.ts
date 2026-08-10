// FILE: src/common/common.module.ts
import { Global, Module } from '@nestjs/common';
import { TaskAccessService } from './task-access.service';

@Global()
@Module({
  providers: [TaskAccessService],
  exports: [TaskAccessService],
})
export class CommonModule {}
