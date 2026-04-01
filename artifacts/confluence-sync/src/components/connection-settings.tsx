import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Server, Save } from "lucide-react";

import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const settingsSchema = z.object({
  talkdeskAccountName: z.string().min(1, "Account name is required"),
  talkdeskRegion: z.enum(["US", "EU", "CA", "AU"]),
  confluenceSpaceKey: z.string().min(1, "Space key is required"),
});

type SettingsValues = z.infer<typeof settingsSchema>;

export function ConnectionSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useGetSettings({
    query: {
      queryKey: getGetSettingsQueryKey(),
    }
  });

  const updateSettings = useUpdateSettings();

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      talkdeskAccountName: "",
      talkdeskRegion: "US",
      confluenceSpaceKey: "AHC",
    },
  });

  // Init form when data loads
  const initialized = useRef(false);
  useEffect(() => {
    if (settings && !initialized.current) {
      initialized.current = true;
      form.reset({
        talkdeskAccountName: settings.talkdeskAccountName,
        talkdeskRegion: settings.talkdeskRegion as any,
        confluenceSpaceKey: settings.confluenceSpaceKey,
      });
    }
  }, [settings, form]);

  const onSubmit = (data: SettingsValues) => {
    updateSettings.mutate(
      { data },
      {
        onSuccess: (updatedData) => {
          queryClient.setQueryData(getGetSettingsQueryKey(), updatedData);
          toast({
            title: "Settings saved",
            description: "Connection settings have been updated.",
          });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to save connection settings.",
            variant: "destructive",
          });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="talkdeskAccountName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Talkdesk Account Name</FormLabel>
                    <FormControl>
                      <Input placeholder="mycompany" {...field} />
                    </FormControl>
                    <FormDescription>
                      Your Talkdesk account slug (e.g. "mycompany").
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="talkdeskRegion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Region</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a region" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="US">US - United States</SelectItem>
                        <SelectItem value="EU">EU - Europe</SelectItem>
                        <SelectItem value="CA">CA - Canada</SelectItem>
                        <SelectItem value="AU">AU - Australia</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Data residency region for Talkdesk.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confluenceSpaceKey"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Confluence Space Key</FormLabel>
                    <FormControl>
                      <Input placeholder="AHC" {...field} />
                    </FormControl>
                    <FormDescription>
                      The key of the Confluence space to sync from.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateSettings.isPending}>
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
