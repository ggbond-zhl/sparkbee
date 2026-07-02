import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Controller } from "react-hook-form";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { createChargingPoint } from "@/features/charging-points/api/chargingPoints";
import {
  chargingPointCreateFormDefaultValues,
  chargingPointCreateFormSchema,
  type ChargingPointCreateFormInput,
  type ChargingPointCreateFormValues,
} from "@/features/charging-points/model/chargingPointCreateForm";

export function ChargingPointCreateDialog() {
  const [open, setOpen] = useState(false);
  const [protocolSelectOpen, setProtocolSelectOpen] = useState(false);
  const ignoreNextDialogOutsideInteractionRef = useRef(false);
  const queryClient = useQueryClient();
  const form = useForm<
    ChargingPointCreateFormInput,
    undefined,
    ChargingPointCreateFormValues
  >({
    resolver: standardSchemaResolver(chargingPointCreateFormSchema),
    defaultValues: chargingPointCreateFormDefaultValues,
  });
  const createMutation = useMutation({
    mutationFn: createChargingPoint,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["charging-points"] });
      form.reset(chargingPointCreateFormDefaultValues);
      setOpen(false);
    },
  });
  const fieldErrors = form.formState.errors;
  const createError =
    createMutation.error instanceof Error ? createMutation.error.message : null;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      ignoreNextDialogOutsideInteractionRef.current = false;
      form.reset(chargingPointCreateFormDefaultValues);
      createMutation.reset();
    }
  }

  function handleProtocolSelectOpenChange(nextOpen: boolean) {
    setProtocolSelectOpen(nextOpen);
    if (nextOpen) {
      ignoreNextDialogOutsideInteractionRef.current = true;
    }
  }

  function preventDialogCloseAfterProtocolSelectInteraction(event: {
    preventDefault(): void;
  }) {
    if (!ignoreNextDialogOutsideInteractionRef.current) {
      return;
    }

    event.preventDefault();
    window.setTimeout(() => {
      ignoreNextDialogOutsideInteractionRef.current = false;
    }, 0);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <PlusIcon data-icon="inline-start" />
          新增
        </Button>
      </DialogTrigger>
      <DialogContent
        onFocusOutside={preventDialogCloseAfterProtocolSelectInteraction}
        onInteractOutside={preventDialogCloseAfterProtocolSelectInteraction}
        onPointerDownOutside={preventDialogCloseAfterProtocolSelectInteraction}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
        >
          <DialogHeader>
            <DialogTitle>新增充电桩</DialogTitle>
          </DialogHeader>
          <FieldGroup className="md:grid md:grid-cols-2">
            <Field
              className="md:col-span-2"
              data-invalid={Boolean(fieldErrors.name)}
            >
              <FieldLabel htmlFor="charging-point-create-name">名称</FieldLabel>
              <Input
                id="charging-point-create-name"
                aria-invalid={Boolean(fieldErrors.name)}
                placeholder="例如 1 号测试桩"
                {...form.register("name")}
              />
              <FieldError errors={[fieldErrors.name]} />
            </Field>
            <Field data-invalid={Boolean(fieldErrors.identity)}>
              <FieldLabel htmlFor="charging-point-create-identity">
                桩身份
              </FieldLabel>
              <Input
                id="charging-point-create-identity"
                aria-invalid={Boolean(fieldErrors.identity)}
                placeholder="例如 CP_001"
                {...form.register("identity")}
              />
              <FieldError errors={[fieldErrors.identity]} />
            </Field>
            <Field data-invalid={Boolean(fieldErrors.protocol)}>
              <FieldLabel htmlFor="charging-point-create-protocol">
                协议版本
              </FieldLabel>
              <Controller
                control={form.control}
                name="protocol"
                render={({ field }) => (
                  <Select
                    open={protocolSelectOpen}
                    value={field.value}
                    onOpenChange={handleProtocolSelectOpenChange}
                    onValueChange={(value) => {
                      ignoreNextDialogOutsideInteractionRef.current = false;
                      field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="charging-point-create-protocol"
                      ref={field.ref}
                      aria-invalid={Boolean(fieldErrors.protocol)}
                      className="w-full"
                      onBlur={field.onBlur}
                    >
                      <SelectValue placeholder="选择协议版本" />
                    </SelectTrigger>
                    <SelectContent>
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
              data-invalid={Boolean(fieldErrors.centralSystemUrl)}
            >
              <FieldLabel htmlFor="charging-point-create-csms">
                CSMS 地址
              </FieldLabel>
              <Input
                id="charging-point-create-csms"
                aria-invalid={Boolean(fieldErrors.centralSystemUrl)}
                placeholder="ws://localhost:9000/ocpp"
                {...form.register("centralSystemUrl")}
              />
              <FieldDescription>
                填写基础 WebSocket 地址，不包含最终桩身份路径。
              </FieldDescription>
              <FieldError errors={[fieldErrors.centralSystemUrl]} />
            </Field>
            <Field data-invalid={Boolean(fieldErrors.vendor)}>
              <FieldLabel htmlFor="charging-point-create-vendor">
                厂商
              </FieldLabel>
              <Input
                id="charging-point-create-vendor"
                aria-invalid={Boolean(fieldErrors.vendor)}
                placeholder="例如 SparkBee"
                {...form.register("vendor")}
              />
              <FieldError errors={[fieldErrors.vendor]} />
            </Field>
            <Field data-invalid={Boolean(fieldErrors.model)}>
              <FieldLabel htmlFor="charging-point-create-model">型号</FieldLabel>
              <Input
                id="charging-point-create-model"
                aria-invalid={Boolean(fieldErrors.model)}
                placeholder="例如 Simulator"
                {...form.register("model")}
              />
              <FieldError errors={[fieldErrors.model]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="charging-point-create-firmware">
                固件版本
              </FieldLabel>
              <Input
                id="charging-point-create-firmware"
                placeholder="可选"
                {...form.register("firmwareVersion")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="charging-point-create-serial">
                序列号
              </FieldLabel>
              <Input
                id="charging-point-create-serial"
                placeholder="可选"
                {...form.register("serialNumber")}
              />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="charging-point-create-description">
                说明
              </FieldLabel>
              <Textarea
                id="charging-point-create-description"
                placeholder="可选"
                {...form.register("description")}
              />
            </Field>
          </FieldGroup>
          {createError && (
            <div role="alert" className="text-sm text-destructive">
              {createError}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button
                disabled={createMutation.isPending}
                type="button"
                variant="outline"
              >
                取消
              </Button>
            </DialogClose>
            <Button disabled={createMutation.isPending} type="submit">
              {createMutation.isPending ? "创建中" : "确认"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
