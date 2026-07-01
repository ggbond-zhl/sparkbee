import { z } from "zod/v4";

export const chargingPointListSearchFormSchema = z.object({
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符"),
});

export type ChargingPointListSearchFormValues = z.infer<
  typeof chargingPointListSearchFormSchema
>;
