import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { createChargingPoint } from "@/features/charging-points/api/chargingPoints";
import {
  chargingPointCreateFormDefaultValues,
  chargingPointCreateFormSchema,
  type ChargingPointCreateFormInput,
  type ChargingPointCreateFormValues,
} from "@/features/charging-points/model/chargingPointCreateForm";
import { ChargingPointFormFields } from "@/features/charging-points/ui/ChargingPointFormFields";

export function ChargingPointCreateDialog() {
  const [open, setOpen] = useState(false);
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
      toast.success("充电桩已新增");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "充电桩创建失败");
    },
  });
  const createError =
    createMutation.error instanceof Error ? createMutation.error.message : null;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      form.reset(chargingPointCreateFormDefaultValues);
      createMutation.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <PlusIcon data-icon="inline-start" />
          新增
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) =>
            createMutation.mutate(values),
          )}
        >
          <DialogHeader>
            <DialogTitle>新增充电桩</DialogTitle>
          </DialogHeader>
          <ChargingPointFormFields
            form={form}
            idPrefix="charging-point-create"
          />
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
