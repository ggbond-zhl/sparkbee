import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ChargingPointDetailResponse,
  ChargingPointSummaryResponse,
} from "@spark-bee/contracts";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateChargingPoint } from "@/features/charging-points/api/chargingPoints";
import {
  chargingPointCreateFormSchema,
  type ChargingPointCreateFormInput,
  type ChargingPointCreateFormValues,
} from "@/features/charging-points/model/chargingPointCreateForm";
import { ChargingPointFormFields } from "@/features/charging-points/ui/ChargingPointFormFields";

type EditableChargingPoint = Pick<
  ChargingPointSummaryResponse,
  | "id"
  | "name"
  | "description"
  | "identity"
  | "protocol"
  | "centralSystemUrl"
  | "vendor"
  | "model"
  | "firmwareVersion"
  | "serialNumber"
>;

interface ChargingPointEditDialogProps {
  configurationLocked?: boolean;
  configurationLockedReason?: string;
  item: EditableChargingPoint;
  open: boolean;
  onSaved?(item: ChargingPointDetailResponse): void | Promise<void>;
  onOpenChange(open: boolean): void;
}

function createEditFormValues(
  item: EditableChargingPoint,
): ChargingPointCreateFormInput {
  return {
    name: item.name,
    description: item.description ?? "",
    identity: item.identity,
    protocol: item.protocol,
    centralSystemUrl: item.centralSystemUrl,
    vendor: item.vendor,
    model: item.model,
    firmwareVersion: item.firmwareVersion ?? "",
    serialNumber: item.serialNumber ?? "",
  };
}

export function ChargingPointEditDialog({
  configurationLocked = false,
  configurationLockedReason,
  item,
  onSaved,
  onOpenChange,
  open,
}: ChargingPointEditDialogProps) {
  const queryClient = useQueryClient();
  const formValues = useMemo(() => createEditFormValues(item), [item]);
  const form = useForm<
    ChargingPointCreateFormInput,
    undefined,
    ChargingPointCreateFormValues
  >({
    resolver: standardSchemaResolver(chargingPointCreateFormSchema),
    values: formValues,
  });
  const updateMutation = useMutation({
    mutationFn: (values: ChargingPointCreateFormValues) =>
      updateChargingPoint(item.id, values),
    onSuccess: async (updatedItem) => {
      await queryClient.invalidateQueries({ queryKey: ["charging-points"] });
      await onSaved?.(updatedItem);
      onOpenChange(false);
      toast.success("充电桩已保存");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "充电桩更新失败");
    },
  });
  const updateError =
    updateMutation.error instanceof Error ? updateMutation.error.message : null;

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      form.reset(formValues);
      updateMutation.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) =>
            updateMutation.mutate(values),
          )}
        >
          <DialogHeader>
            <DialogTitle>编辑充电桩</DialogTitle>
            {configurationLockedReason && (
              <DialogDescription>
                {configurationLockedReason}
              </DialogDescription>
            )}
          </DialogHeader>
          <ChargingPointFormFields
            configurationLocked={configurationLocked}
            form={form}
            idPrefix="charging-point-edit"
          />
          {updateError && (
            <div role="alert" className="text-sm text-destructive">
              {updateError}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button
                disabled={updateMutation.isPending}
                type="button"
                variant="outline"
              >
                取消
              </Button>
            </DialogClose>
            <Button disabled={updateMutation.isPending} type="submit">
              {updateMutation.isPending ? "保存中" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
