import { Settings as SettingsIcon, Workflow } from "lucide-react";

import { ConnectionSettings } from "@/components/connection-settings";
import { FolderMappings } from "@/components/folder-mappings";
import { Button } from "@/components/ui/button";

export default function Settings() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center">
      <div className="w-full h-16 border-b bg-card flex items-center px-6 sticky top-0 z-10">
        <div className="flex items-center gap-2 max-w-6xl mx-auto w-full">
          <div className="bg-primary/10 p-2 rounded-md">
            <Workflow className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Talkdesk Knowledge Sync</h1>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" className="text-primary font-semibold">Settings</Button>
            <a href={`${import.meta.env.BASE_URL}sync`}>
              <Button variant="ghost" size="sm">Sync</Button>
            </a>
          </div>
        </div>
      </div>

      <main className="max-w-6xl w-full px-6 py-8 space-y-8 pb-24">
        <section className="space-y-4">
          <div className="flex flex-col space-y-1">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-muted-foreground" />
              Connection Settings
            </h2>
            <p className="text-sm text-muted-foreground">
              Configure your Talkdesk and Confluence connection parameters.
            </p>
          </div>
          <ConnectionSettings />
        </section>

        <section className="space-y-4">
          <div className="flex flex-col space-y-1">
            <h2 className="text-xl font-semibold">Folder Mappings</h2>
            <p className="text-sm text-muted-foreground">
              Map Confluence spaces to Talkdesk Knowledge Segments.
            </p>
          </div>
          <FolderMappings />
        </section>
      </main>
    </div>
  );
}
