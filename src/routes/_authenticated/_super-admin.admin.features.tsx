import { createFileRoute } from "@tanstack/react-router";
import { FeatureManager } from "@/components/admin/features/feature-manager";
import { DynamicFeatureControl } from "@/components/admin/features/dynamic-feature-control";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/features")({
  staticData: { breadcrumb: "Features" },
  head: () => ({ meta: [{ title: "Super Admin — Feature Management" }, { name: "robots", content: "noindex" }] }),
  component: FeaturesPage,
});

function FeaturesPage() {
  return (
    <main className="p-6">
      <Tabs defaultValue="dynamic" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dynamic">Dynamic Control</TabsTrigger>
          <TabsTrigger value="matrix">Plan Matrix</TabsTrigger>
        </TabsList>
        <TabsContent value="dynamic"><DynamicFeatureControl /></TabsContent>
        <TabsContent value="matrix"><FeatureManager /></TabsContent>
      </Tabs>
    </main>
  );
}
