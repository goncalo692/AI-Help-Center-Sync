import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, FolderSync } from "lucide-react";

import {
  useListFolderMappings,
  useCreateFolderMapping,
  useDeleteFolderMapping,
  useGetConfluenceFolders,
  getListFolderMappingsQueryKey,
  getGetConfluenceFoldersQueryKey
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Empty } from "@/components/ui/empty";

const mappingSchema = z.object({
  confluenceFolderId: z.string().min(1, "Please select a Confluence folder"),
  knowledgeSegmentName: z.string().min(1, "Segment name is required"),
});

type MappingValues = z.infer<typeof mappingSchema>;

export function FolderMappings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data: mappings, isLoading: isMappingsLoading } = useListFolderMappings({
    query: {
      queryKey: getListFolderMappingsQueryKey(),
    }
  });

  const { data: confluenceFolders, isLoading: isFoldersLoading } = useGetConfluenceFolders({
    query: {
      queryKey: getGetConfluenceFoldersQueryKey(),
    }
  });

  const createMapping = useCreateFolderMapping();
  const deleteMapping = useDeleteFolderMapping();

  const form = useForm<MappingValues>({
    resolver: zodResolver(mappingSchema),
    defaultValues: {
      confluenceFolderId: "",
      knowledgeSegmentName: "",
    },
  });

  const onSubmit = (data: MappingValues) => {
    // Find folder name from the id
    const folder = confluenceFolders?.find(f => f.id === data.confluenceFolderId);
    if (!folder) return;

    createMapping.mutate(
      {
        data: {
          confluenceFolderId: data.confluenceFolderId,
          confluenceFolderName: folder.title,
          knowledgeSegmentName: data.knowledgeSegmentName,
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFolderMappingsQueryKey() });
          toast({
            title: "Mapping added",
            description: "New folder mapping created successfully.",
          });
          form.reset();
          setIsAddOpen(false);
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to create mapping.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteMapping.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFolderMappingsQueryKey() });
          toast({
            title: "Mapping deleted",
            description: "Folder mapping removed.",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to delete mapping.",
            variant: "destructive",
          });
        },
      }
    );
  };

  if (isMappingsLoading) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b flex justify-between items-center">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-10 w-24" />
          </div>
          <div className="p-4 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b bg-muted/20 flex justify-between items-center">
        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Active Mappings</h3>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Mapping
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Folder Mapping</DialogTitle>
              <DialogDescription>
                Map a Confluence folder to a new or existing Talkdesk Knowledge Segment.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="confluenceFolderId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confluence Folder</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isFoldersLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isFoldersLoading ? "Loading folders..." : "Select folder"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {confluenceFolders?.map((folder) => (
                            <SelectItem key={folder.id} value={folder.id}>
                              {folder.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="knowledgeSegmentName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Talkdesk Segment Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Technical Support" {...field} />
                      </FormControl>
                      <FormDescription>
                        Documents will be synced to this segment.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter className="pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMapping.isPending}>
                    Save Mapping
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {!mappings || mappings.length === 0 ? (
        <Empty
          icon={FolderSync}
          title="No mappings configured"
          description="Add a folder mapping to start syncing Confluence content to Talkdesk."
          className="py-12"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/10 hover:bg-muted/10">
              <TableHead>Confluence Folder</TableHead>
              <TableHead>Knowledge Segment</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((mapping) => (
              <TableRow key={mapping.id}>
                <TableCell className="font-medium">
                  {mapping.confluenceFolderName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {mapping.knowledgeSegmentName}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(mapping.id)}
                    disabled={deleteMapping.isPending}
                    title="Remove mapping"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
