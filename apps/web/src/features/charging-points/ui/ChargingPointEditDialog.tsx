import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ChargingPointSummaryResponse } from "@spark-bee/contracts";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
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

interface ChargingPointEditDialogProps {
  item: ChargingPointSummaryResponse;
  open: boolean;
  onOpenChange(open: boolean): void;
}

function createEditFormValues(
  item: ChargingPointSummaryResponse,
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
  item,
  onOpenChange,
  open,
}: ChargingPointEditDialogProps) {
  const [protocolSelectOpen, setProtocolSelectOpen] = useState(false);
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["charging-points"] });
      setProtocolSelectOpen(false);
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
      setProtocolSelectOpen(false);
      form.reset(formValues);
      updateMutation.reset();
    }
  }

  function closeProtocolSelectBeforeDialog(event: { preventDefault(): void }) {
    if (!protocolSelectOpen) {
      return;
    }

    event.preventDefault();
    setProtocolSelectOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        onEscapeKeyDown={closeProtocolSelectBeforeDialog}
        onInteractOutside={closeProtocolSelectBeforeDialog}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))}
        >
          <DialogHeader>
            <DialogTitle>编辑充电桩</DialogTitle>
          </DialogHeader>
          <ChargingPointFormFields
            form={form}
            idPrefix="charging-point-edit"
            protocolSelectOpen={protocolSelectOpen}
            onProtocolSelectOpenChange={setProtocolSelectOpen}
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
