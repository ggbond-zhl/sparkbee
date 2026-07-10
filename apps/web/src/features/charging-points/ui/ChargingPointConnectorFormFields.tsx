import { useState } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";

import {
  Field,
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
import type {
  ConnectorManagementFormInput,
  ConnectorManagementFormValues,
} from "@/features/charging-points/model/connectorManagementForm";
import {
  CONNECTOR_FORMAT_OPTIONS,
  CONNECTOR_POWER_TYPE_OPTIONS,
  CONNECTOR_TYPE_OPTIONS,
} from "@/features/charging-points/model/connectorDisplay";

interface ChargingPointConnectorFormFieldsProps {
  connectorIdReadOnly: boolean;
  form: UseFormReturn<
    ConnectorManagementFormInput,
    undefined,
    ConnectorManagementFormValues
  >;
  idPrefix: string;
}

export function ChargingPointConnectorFormFields({
  connectorIdReadOnly,
  form,
  idPrefix,
}: ChargingPointConnectorFormFieldsProps) {
  const [typeSelectOpen, setTypeSelectOpen] = useState(false);
  const [formatSelectOpen, setFormatSelectOpen] = useState(false);
  const [powerTypeSelectOpen, setPowerTypeSelectOpen] = useState(false);
  const formErrors = form.formState.errors;

  return (
    <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field data-invalid={Boolean(formErrors.connectorId)}>
        <FieldLabel htmlFor={`${idPrefix}-id`}>枪口编号</FieldLabel>
        <Input
          id={`${idPrefix}-id`}
          aria-invalid={Boolean(formErrors.connectorId)}
          aria-readonly={connectorIdReadOnly}
          inputMode="numeric"
          readOnly={connectorIdReadOnly}
          type="number"
          {...form.register("connectorId")}
        />
        <FieldError errors={[formErrors.connectorId]} />
      </Field>
      <Field data-invalid={Boolean(formErrors.type)}>
        <FieldLabel htmlFor={`${idPrefix}-type`}>类型</FieldLabel>
        <Controller
          control={form.control}
          name="type"
          render={({ field }) => (
            <Select
              open={typeSelectOpen}
              value={field.value}
              onOpenChange={setTypeSelectOpen}
              onValueChange={field.onChange}
            >
              <SelectTrigger
                id={`${idPrefix}-type`}
                ref={field.ref}
                aria-invalid={Boolean(formErrors.type)}
                className="w-full"
                onBlur={field.onBlur}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                data-dialog-select-content
                position="popper"
                className="z-[100]"
              >
                <SelectGroup>
                  {CONNECTOR_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        />
        <FieldError errors={[formErrors.type]} />
      </Field>
      <Field data-invalid={Boolean(formErrors.format)}>
        <FieldLabel htmlFor={`${idPrefix}-format`}>形态</FieldLabel>
        <Controller
          control={form.control}
          name="format"
          render={({ field }) => (
            <Select
              open={formatSelectOpen}
              value={field.value}
              onOpenChange={setFormatSelectOpen}
              onValueChange={field.onChange}
            >
              <SelectTrigger
                id={`${idPrefix}-format`}
                ref={field.ref}
                aria-invalid={Boolean(formErrors.format)}
                className="w-full"
                onBlur={field.onBlur}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                data-dialog-select-content
                position="popper"
                className="z-[100]"
              >
                <SelectGroup>
                  {CONNECTOR_FORMAT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        />
        <FieldError errors={[formErrors.format]} />
      </Field>
      <Field data-invalid={Boolean(formErrors.powerType)}>
        <FieldLabel htmlFor={`${idPrefix}-power-type`}>供电</FieldLabel>
        <Controller
          control={form.control}
          name="powerType"
          render={({ field }) => (
            <Select
              open={powerTypeSelectOpen}
              value={field.value}
              onOpenChange={setPowerTypeSelectOpen}
              onValueChange={field.onChange}
            >
              <SelectTrigger
                id={`${idPrefix}-power-type`}
                ref={field.ref}
                aria-invalid={Boolean(formErrors.powerType)}
                className="w-full"
                onBlur={field.onBlur}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                data-dialog-select-content
                position="popper"
                className="z-[100]"
              >
                <SelectGroup>
                  {CONNECTOR_POWER_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        />
        <FieldError errors={[formErrors.powerType]} />
      </Field>
      <Field data-invalid={Boolean(formErrors.maxVoltage)}>
        <FieldLabel htmlFor={`${idPrefix}-max-voltage`}>电压 V</FieldLabel>
        <Input
          id={`${idPrefix}-max-voltage`}
          aria-invalid={Boolean(formErrors.maxVoltage)}
          inputMode="numeric"
          type="number"
          {...form.register("maxVoltage")}
        />
        <FieldError errors={[formErrors.maxVoltage]} />
      </Field>
      <Field data-invalid={Boolean(formErrors.maxCurrent)}>
        <FieldLabel htmlFor={`${idPrefix}-max-current`}>电流 A</FieldLabel>
        <Input
          id={`${idPrefix}-max-current`}
          aria-invalid={Boolean(formErrors.maxCurrent)}
          inputMode="numeric"
          type="number"
          {...form.register("maxCurrent")}
        />
        <FieldError errors={[formErrors.maxCurrent]} />
      </Field>
    </FieldGroup>
  );
}
