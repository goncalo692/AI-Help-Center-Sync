import { Settings as SettingsIcon } from "lucide-react";

import { ConnectionSettings } from "@/components/connection-settings";
import { FolderMappings } from "@/components/folder-mappings";
import { SidebarLayout } from "@/components/sidebar-layout";

export default function Settings() {
  return (
    <SidebarLayout>
      <div className="w-full space-y-8 pb-12">
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
      </div>
    </SidebarLayout>
  );
}
