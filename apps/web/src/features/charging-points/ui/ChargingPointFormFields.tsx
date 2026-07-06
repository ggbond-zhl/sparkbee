import { Controller, type UseFormReturn } from "react-hook-form";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ChargingPointCreateFormInput,
  ChargingPointCreateFormValues,
} from "@/features/charging-points/model/chargingPointCreateForm";

interface ChargingPointFormFieldsProps {
  form: UseFormReturn<
    ChargingPointCreateFormInput,
    undefined,
    ChargingPointCreateFormValues
  >;
  idPrefix: string;
  configurationLocked?: boolean;
}

export function ChargingPointFormFields({
  configurationLocked = false,
  form,
  idPrefix,
}: ChargingPointFormFieldsProps) {
  const fieldErrors = form.formState.errors;

  return (
    <FieldGroup className="md:grid md:grid-cols-2">
      <Field className="md:col-span-2" data-invalid={Boolean(fieldErrors.name)}>
        <FieldLabel htmlFor={`${idPrefix}-name`}>名称</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          aria-invalid={Boolean(fieldErrors.name)}
          placeholder="例如 1 号测试桩"
          {...form.register("name")}
        />
        <FieldError errors={[fieldErrors.name]} />
      </Field>
      <Field
        data-disabled={configurationLocked || undefined}
        data-invalid={Boolean(fieldErrors.identity)}
      >
        <FieldLabel htmlFor={`${idPrefix}-identity`}>桩身份</FieldLabel>
        <Input
          id={`${idPrefix}-identity`}
          aria-invalid={Boolean(fieldErrors.identity)}
          aria-readonly={configurationLocked}
          placeholder="例如 CP_001"
          readOnly={configurationLocked}
          {...form.register("identity")}
        />
        <FieldError errors={[fieldErrors.identity]} />
      </Field>
      <Field
        data-disabled={configurationLocked || undefined}
        data-invalid={Boolean(fieldErrors.protocol)}
      >
        <FieldLabel htmlFor={`${idPrefix}-protocol`}>协议版本</FieldLabel>
        <Controller
          control={form.control}
          name="protocol"
          render={({ field }) => (
            <Select
              disabled={configurationLocked}
              value={field.value}
              onValueChange={field.onChange}
            >
              <SelectTrigger
                id={`${idPrefix}-protocol`}
                ref={field.ref}
                aria-invalid={Boolean(fieldErrors.protocol)}
                className="w-full"
                onBlur={field.onBlur}
              >
                <SelectValue placeholder="选择协议版本" />
              </SelectTrigger>
              <SelectContent
                data-dialog-select-content
                position="popper"
                className="z-[100]"
              >
                <SelectGroup>
                  <SelectItem value="OCPP16J">OCPP 1.6J</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        />
        <FieldError errors={[fieldErrors.protocol]} />
      </Field>
      <Field
        className="md:col-span-2"
        data-disabled={configurationLocked || undefined}
        data-invalid={Boolean(fieldErrors.centralSystemUrl)}
      >
        <FieldLabel htmlFor={`${idPrefix}-csms`}>CSMS 地址</FieldLabel>
        <Input
          id={`${idPrefix}-csms`}
          aria-invalid={Boolean(fieldErrors.centralSystemUrl)}
          aria-readonly={configurationLocked}
          placeholder="ws://localhost:9000/ocpp"
          readOnly={configurationLocked}
          {...form.register("centralSystemUrl")}
        />
        <FieldDescription>
          填写基础 WebSocket 地址，不包含最终桩身份路径。
        </FieldDescription>
        <FieldError errors={[fieldErrors.centralSystemUrl]} />
      </Field>
      <Field
        data-disabled={configurationLocked || undefined}
        data-invalid={Boolean(fieldErrors.vendor)}
      >
        <FieldLabel htmlFor={`${idPrefix}-vendor`}>厂商</FieldLabel>
        <Input
          id={`${idPrefix}-vendor`}
          aria-invalid={Boolean(fieldErrors.vendor)}
          aria-readonly={configurationLocked}
          placeholder="例如 SparkBee"
          readOnly={configurationLocked}
          {...form.register("vendor")}
        />
        <FieldError errors={[fieldErrors.vendor]} />
      </Field>
      <Field
        data-disabled={configurationLocked || undefined}
        data-invalid={Boolean(fieldErrors.model)}
      >
        <FieldLabel htmlFor={`${idPrefix}-model`}>型号</FieldLabel>
        <Input
          id={`${idPrefix}-model`}
          aria-invalid={Boolean(fieldErrors.model)}
          aria-readonly={configurationLocked}
          placeholder="例如 Simulator"
          readOnly={configurationLocked}
          {...form.register("model")}
        />
        <FieldError errors={[fieldErrors.model]} />
      </Field>
      <Field data-disabled={configurationLocked || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-firmware`}>固件版本</FieldLabel>
        <Input
          id={`${idPrefix}-firmware`}
          aria-readonly={configurationLocked}
          placeholder="可选"
          readOnly={configurationLocked}
          {...form.register("firmwareVersion")}
        />
      </Field>
      <Field data-disabled={configurationLocked || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-serial`}>序列号</FieldLabel>
        <Input
          id={`${idPrefix}-serial`}
          aria-readonly={configurationLocked}
          placeholder="可选"
          readOnly={configurationLocked}
          {...form.register("serialNumber")}
        />
      </Field>
      <Field className="md:col-span-2">
        <FieldLabel htmlFor={`${idPrefix}-description`}>说明</FieldLabel>
        <Textarea
          id={`${idPrefix}-description`}
          placeholder="可选"
          {...form.register("description")}
        />
      </Field>
    </FieldGroup>
  );
}
