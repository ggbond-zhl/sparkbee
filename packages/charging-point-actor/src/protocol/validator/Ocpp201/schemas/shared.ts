import { z } from 'zod';

// OCPP 2.0.1 shared helpers are generated inline per message file.
export const DateTimeStringSchema = z.string().datetime({ offset: true });
