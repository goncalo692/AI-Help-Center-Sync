import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Info } from "lucide-react";

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
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const settingsSchema = z.object({
  talkdeskAccountName: z.string().min(1, "Account name is required"),
  talkdeskRegion: z.enum(["US", "EU", "CA", "AU"]),
  confluenceSpaceKey: z.string().min(1, "Space key is required"),
  syncIntervalMinutes: z.number().min(1).max(60),
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
      syncIntervalMinutes: 5,
    },
  });

  // Init form when data loads
  const initialized = useRef(false);
  useEffect(() => {
    if (settings && !initialized.current) {
      initialized.current = true;
      form.reset({
        talkdeskAccountName: settings.talkdeskAccountName,
        talkdeskRegion: (["US", "EU", "CA", "AU"].includes(settings.talkdeskRegion) ? settings.talkdeskRegion : "US") as SettingsValues["talkdeskRegion"],
        confluenceSpaceKey: settings.confluenceSpaceKey,
        syncIntervalMinutes: settings.syncIntervalMinutes ?? 5,
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

              <FormField
                control={form.control}
                name="syncIntervalMinutes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <div className="flex items-center gap-2">
                      <FormLabel>Sync Interval</FormLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p>How often the sync engine checks Confluence for changes and pushes updates to Talkdesk. Lower values mean fresher knowledge but more API calls.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <FormControl>
                      <div className="flex items-center gap-4">
                        <Slider
                          min={1}
                          max={60}
                          step={1}
                          value={[field.value]}
                          onValueChange={([v]) => field.onChange(v)}
                          className="flex-1"
                        />
                        <span className="text-sm font-medium tabular-nums w-20 text-right">
                          {field.value} {field.value === 1 ? "minute" : "minutes"}
                        </span>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Min 1 minute, max 60 minutes. Default is 5 minutes.
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
