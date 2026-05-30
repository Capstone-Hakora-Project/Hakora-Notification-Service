import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

function safeStringify(value: unknown, maxLen = 400): string {
  if (value == null) return String(value);
  try {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(value, (_key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
        const ctor = (val as object).constructor?.name;
        if (ctor === 'Socket' || ctor === 'HTTPParser' || ctor === 'ServerResponse') {
          return `[${ctor}]`;
        }
      }
      return val;
    });
    return json.length > maxLen ? `${json.slice(0, maxLen)}…` : json;
  } catch {
    return '[Unserializable]';
  }
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'rpc') {
      return next.handle();
    }

    const handler = context.getHandler().name;
    const data = context.switchToRpc().getData();
    this.logger.log(`[${handler}] Request: ${safeStringify(data)}`);

    const startedAt = Date.now();
    return next.handle().pipe(
      tap({
        next: (value) => {
          this.logger.log(
            `[${handler}] Response (${Date.now() - startedAt}ms): ${safeStringify(value)}`,
          );
        },
        error: (error) => {
          this.logger.error(
            `[${handler}] Error (${Date.now() - startedAt}ms): ${error?.message ?? error}`,
          );
        },
      }),
    );
  }
}
