import type { PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { DomainError } from '@dms/core/errors';

export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new DomainError('VALIDATION', 'Validation failed', undefined, r.error.issues);
    }
    return r.data;
  }
}
