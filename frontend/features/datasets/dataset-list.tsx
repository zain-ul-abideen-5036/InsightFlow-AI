"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, MoreHorizontal, Trash2, Upload } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api, ClientApiError, queryKeys } from "@/lib/api-client";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import type { Dataset, DatasetStatus, Page } from "@/types/api";

const STATUS_LABEL: Record<DatasetStatus, { label: string; variant: "success" | "info" | "warning" | "danger" | "neutral" }> = {
  uploading: { label: "Uploading", variant: "info" },
  profiling: { label: "Reading", variant: "info" },
  ready: { label: "Needs review", variant: "warning" },
  confirmed: { label: "Analysed", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
};

export function DatasetList({
  workspaceId,
  initialData,
}: {
  workspaceId: string;
  initialData: Page<Dataset>;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = React.useState<Dataset | null>(null);

  const { data } = useQuery({
    queryKey: queryKeys.datasets(workspaceId),
    queryFn: () => api.datasets(workspaceId),
    initialData,
  });

  const remove = useMutation({
    mutationFn: (datasetId: string) => api.deleteDataset(workspaceId, datasetId),
    onSuccess: (_result, datasetId) => {
      const name = data?.items.find((item) => item.id === datasetId)?.name;
      toast({
        title: "Dataset deleted",
        description: name ? `"${name}" and its analyses have been removed.` : undefined,
        tone: "success",
      });
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.overview(workspaceId) });
    },
    onError: (error: ClientApiError) => {
      toast({ title: "Could not delete", description: error.message, tone: "error" });
    },
  });

  const datasets = data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Datasets</h1>
          <p className="text-md text-muted-foreground">
            The business data you have uploaded, and what we detected in each file.
          </p>
        </div>
        <Button asChild>
          <Link href="/datasets/new">
            <Upload aria-hidden="true" />
            Upload data
          </Link>
        </Button>
      </header>

      {datasets.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No datasets yet"
          description="Upload a CSV or Excel export of your orders or sales. InsightFlow works out what each column means, then tells you what changed and why it might have."
          action={
            <Button asChild>
              <Link href="/datasets/new">
                <Upload aria-hidden="true" />
                Upload your first dataset
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table caption="Uploaded datasets">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead numeric>Rows</TableHead>
                <TableHead numeric>Columns</TableHead>
                <TableHead numeric>Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.map((dataset) => {
                const status = STATUS_LABEL[dataset.status];
                return (
                  <TableRow key={dataset.id}>
                    <TableCell>
                      <Link
                        href={`/datasets/${dataset.id}`}
                        className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {dataset.name}
                      </Link>
                      {dataset.is_demo ? (
                        <Badge variant="info" className="ml-2">
                          Sample
                        </Badge>
                      ) : null}
                      <p className="mt-0.5 text-2xs text-muted-foreground">
                        {dataset.original_filename}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell numeric>{dataset.row_count.toLocaleString()}</TableCell>
                    <TableCell numeric>{dataset.column_count}</TableCell>
                    <TableCell numeric>{formatBytes(dataset.file_size_bytes)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatRelativeTime(dataset.created_at)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${dataset.name}`}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/datasets/${dataset.id}`}>Open</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            destructive
                            onClick={() => setPendingDelete(dataset)}
                          >
                            <Trash2 aria-hidden="true" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(pendingDelete)} onOpenChange={() => setPendingDelete(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete this dataset?</DialogTitle>
            <DialogDescription>
              {pendingDelete ? (
                <>
                  <span className="font-medium text-foreground">{pendingDelete.name}</span> and
                  every analysis, insight, and anomaly derived from it will be permanently
                  removed. Reports already generated will keep their figures.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              loadingText="Deleting…"
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
            >
              Delete dataset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
