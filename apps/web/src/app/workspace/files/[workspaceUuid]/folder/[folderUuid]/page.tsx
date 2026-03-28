const generateMetadata = async (...args: Parameters<
  typeof import("../../../../../dashboard/files/[workspaceUuid]/folder/[folderUuid]/page").generateMetadata
>) => {
  const { generateMetadata: dashboardGenerateMetadata } = await import(
    "../../../../../dashboard/files/[workspaceUuid]/folder/[folderUuid]/page"
  );
  return dashboardGenerateMetadata(...args);
};

export { generateMetadata };

export default async function WorkspaceFolderPage(
  props: {
    params: Promise<{ folderUuid: string; workspaceUuid: string }>;
  }
) {
  const { default: DashboardWorkspaceFolderPage } = await import(
    "../../../../../dashboard/files/[workspaceUuid]/folder/[folderUuid]/page"
  );
  return DashboardWorkspaceFolderPage(props);
}
