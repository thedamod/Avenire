const generateMetadata = async (...args: Parameters<
  typeof import("../../../dashboard/chats/[slug]/page").generateMetadata
>) => {
  const { generateMetadata: dashboardGenerateMetadata } = await import(
    "../../../dashboard/chats/[slug]/page"
  );
  return dashboardGenerateMetadata(...args);
};

export { generateMetadata };

export default async function WorkspaceChatSlugPage(
  props: {
    params: Promise<{ slug: string }>;
  }
) {
  const { default: DashboardChatPage } = await import(
    "../../../dashboard/chats/[slug]/page"
  );
  return DashboardChatPage(props);
}
