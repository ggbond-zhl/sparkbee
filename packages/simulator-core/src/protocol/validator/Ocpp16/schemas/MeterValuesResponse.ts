import { z } from 'zod';

export const MeterValuesResponseSchema = z.record(z.string(), z.unknown());
export type MeterValuesResponse = z.infer<typeof MeterValuesResponseSchema>;
