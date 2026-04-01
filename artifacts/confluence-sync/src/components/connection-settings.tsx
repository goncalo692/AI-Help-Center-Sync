import { useEffect, useRef, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Info, Upload, CheckCircle2, XCircle, FileKey } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const settingsSchema = z.object({
  talkdeskAccountName: z.string().min(1, "Account name is required"),
  talkdeskRegion: z.enum(["US", "EU", "CA", "AU"]),
  confluenceSpaceKey: z.string().min(1, "Space key is required"),
  syncIntervalMinutes: z.number().min(1).max(60),
});

type SettingsValues = z.infer<typeof settingsSchema>;

function validateCredentialsJson(text: string): { valid: boolean; error?: string; clientId?: string } {
  try {
    const parsed = JSON.parse(text);
    if (!parsed.id) return { valid: false, error: "Missing 'id' field" };
    if (!parsed.private_key) return { valid: false, error: "Missing 'private_key' field" };
    if (!parsed.key_id) return { valid: false, error: "Missing 'key_id' field" };
    return { valid: true, clientId: parsed.id };
  } catch {
    return { valid: false, error: "Invalid JSON format" };
  }
}

export function ConnectionSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [credentialsJson, setCredentialsJson] = useState<string>("");
  const [credentialsValidation, setCredentialsValidation] = useState<{ valid: boolean; error?: string; clientId?: string } | null>(null);
  const [pendingCredentials, setPendingCredentials] = useState<string | null>(null);

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

  const handleCredentialsChange = useCallback((text: string) => {
    setCredentialsJson(text);
    if (text.trim() === "") {
      setCredentialsValidation(null);
      setPendingCredentials(null);
    } else {
      const result = validateCredentialsJson(text);
      setCredentialsValidation(result);
      if (result.valid) {
        setPendingCredentials(text);
      } else {
        setPendingCredentials(null);
      }
    }
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      handleCredentialsChange(text);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [handleCredentialsChange]);

  const onSubmit = (data: SettingsValues) => {
    const payload: any = { ...data };
    if (pendingCredentials) {
      payload.talkdeskCredentialsJson = pendingCredentials;
    }

    updateSettings.mutate(
      { data: payload },
      {
        onSuccess: (updatedData) => {
          queryClient.setQueryData(getGetSettingsQueryKey(), updatedData);
          setCredentialsJson("");
          setCredentialsValidation(null);
          setPendingCredentials(null);
          toast({
            title: "Settings saved",
            description: pendingCredentials
              ? "Settings and credentials have been updated."
              : "Connection settings have been updated.",
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

              <div className="md:col-span-2 space-y-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Talkdesk API Credentials</label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <p>Upload or paste the OAuth credentials JSON from Talkdesk. It must contain id, private_key, and key_id fields.</p>
                    </TooltipContent>
                  </Tooltip>
                  {settings?.hasCredentials && !pendingCredentials && (
                    <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
                      <CheckCircle2 className="w-3 h-3" />
                      Configured
                    </Badge>
                  )}
                  {pendingCredentials && (
                    <Badge variant="outline" className="gap-1 text-blue-600 border-blue-200 bg-blue-50">
                      <FileKey className="w-3 h-3" />
                      New credentials ready
                    </Badge>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload JSON File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>

                <Textarea
                  placeholder='Or paste credentials JSON here...'
                  value={credentialsJson}
                  onChange={(e) => handleCredentialsChange(e.target.value)}
                  rows={4}
                  className="font-mono text-xs"
                />

                {credentialsValidation && !credentialsValidation.valid && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <XCircle className="w-4 h-4" />
                    {credentialsValidation.error}
                  </div>
                )}
                {credentialsValidation?.valid && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="w-4 h-4" />
                    Valid credentials (Client ID: {credentialsValidation.clientId?.slice(0, 8)}...)
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Credentials are stored securely in the database. Only the client ID prefix is shown for verification.
                </p>
              </div>

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
