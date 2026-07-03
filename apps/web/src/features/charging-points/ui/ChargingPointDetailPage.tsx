import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ChargingPointDetailPage() {
  return (
    <section className="flex min-h-[calc(100svh-7rem)] items-center justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>充电桩详情</CardTitle>
          <CardDescription>详情能力正在准备中</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline">
            <Link to="/charging-points">
              <ArrowLeftIcon data-icon="inline-start" />
              返回列表
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
