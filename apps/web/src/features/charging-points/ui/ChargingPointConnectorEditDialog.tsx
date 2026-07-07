import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation } from "@tanstack/react-query";
import type { ConnectorResponse } from "@spark-bee/contracts";
import { SaveIcon } from "lucide-react";
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
import { updateConnector } from "@/features/charging-points/api/chargingPoints";
import {
  connectorManagementFormSchema,
  type ConnectorManagementFormInput,
  type ConnectorManagementFormValues,
} from "@/features/charging-points/model/connectorManagementForm";
import { ChargingPointConnectorFormFields } from "@/features/charging-points/ui/ChargingPointConnectorFormFields";
import { connectorToFormValues } from "@/features/charging-points/ui/ChargingPointConnectorManagementDialog";

interface ChargingPointConnectorEditDialogProps {
  chargingPointId: string;
  configurationLocked?: boolean;
  configurationLockedReason?: string;
  connector: ConnectorResponse;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSaved?(connector: ConnectorResponse): void | Promise<void>;
}

export function ChargingPointConnectorEditDialog({
  chargingPointId,
  configurationLocked = false,
  configurationLockedReason,
  connector,
  onOpenChange,
  onSaved,
  open,
}: ChargingPointConnectorEditDialogProps) {
  const formValues = useMemo(() => connectorToFormValues(connector), [connector]);
  const form = useForm<
    ConnectorManagementFormInput,
    undefined,
    ConnectorManagementFormValues
  >({
    resolver: standardSchemaResolver(connectorManagementFormSchema),
    values: formValues,
  });
  const updateMutation = useMutation({
    mutationFn: (values: ConnectorManagementFormValues) =>
      updateConnector(chargingPointId, connector.id, values),
    onSuccess: async (savedConnector) => {
      form.reset(connectorToFormValues(savedConnector));
      await onSaved?.(savedConnector);
      onOpenChange(false);
      toast.success("枪口已保存");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "枪口更新失败");
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
            <DialogTitle>编辑枪口 {connector.connectorId}</DialogTitle>
            {configurationLockedReason && (
              <DialogDescription>
                {configurationLockedReason}
              </DialogDescription>
            )}
          </DialogHeader>
          <ChargingPointConnectorFormFields
            connectorIdReadOnly
            form={form}
            idPrefix={`connector-edit-${connector.id}`}
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
            <Button
              disabled={configurationLocked || updateMutation.isPending}
              type="submit"
            >
              <SaveIcon data-icon="inline-start" />
              {updateMutation.isPending ? "保存中" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
