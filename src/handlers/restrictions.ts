// Admin CRUD for content and taxonomy restrictions
//
// Route context shape (from emdash PluginRouteHandler):
//   ctx.input   — parsed JSON body (for POST/PUT/PATCH/DELETE)
//   ctx.request — original Request object (body already consumed)
//   ctx.storage — plugin-scoped storage collections

export async function restrictionsHandler(ctx: any) {
  const method = ctx.request.method;
  const url = new URL(ctx.request.url);

  // ─── GET: List restrictions ──────────────────────────────────
  if (method === "GET") {
    const type = url.searchParams.get("type") || "content";
    const collection = url.searchParams.get("collection");

    if (type === "taxonomy") {
      const taxonomyName = url.searchParams.get("taxonomy");
      const result = await ctx.storage.taxonomyRestrictions.query(
        taxonomyName ? { where: { taxonomyName } } : {},
      );
      return { items: result.items };
    }

    // Content restrictions
    const result = await ctx.storage.restrictions.query(
      collection ? { where: { collectionSlug: collection } } : {},
    );
    return { items: result.items };
  }

  // ─── POST: Create/update restriction ─────────────────────────
  if (method === "POST") {
    const body = ctx.input || {};
    const { type } = body;

    if (type === "taxonomy") {
      const { taxonomyName, termId, productIds } = body;
      if (!taxonomyName || !termId) return { error: "taxonomyName and termId required" };
      const key = `${taxonomyName}:${termId}`;
      await ctx.storage.taxonomyRestrictions.put(key, {
        taxonomyName,
        termId,
        productIds: productIds || [],
        createdAt: new Date().toISOString(),
      });
      return { ok: true };
    }

    // Content restriction
    const { contentId, collectionSlug, productIds } = body;
    if (!contentId || !collectionSlug) return { error: "contentId and collectionSlug required" };
    const key = `${collectionSlug}:${contentId}`;
    await ctx.storage.restrictions.put(key, {
      contentId,
      collectionSlug,
      productIds: productIds || [],
      createdAt: new Date().toISOString(),
    });
    return { ok: true };
  }

  // ─── DELETE: Remove restriction ──────────────────────────────
  if (method === "DELETE") {
    const body = ctx.input || {};
    if (body.type === "taxonomy") {
      const key = `${body.taxonomyName}:${body.termId}`;
      await ctx.storage.taxonomyRestrictions.delete(key);
      return { ok: true };
    }
    const key = `${body.collectionSlug}:${body.contentId}`;
    await ctx.storage.restrictions.delete(key);
    return { ok: true };
  }

  return { error: "Method not allowed" };
}
