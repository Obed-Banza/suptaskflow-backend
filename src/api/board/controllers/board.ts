import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::board.board', ({ strapi }) => ({
  async find(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.unauthorized('Vous devez être connecté');
    }

    const query = ctx.query as Record<string, unknown>;
    ctx.query = {
      ...query,
      populate: {
        users_permissions_users: { fields: ['id'] },
      },
    };

    const { data, meta } = await super.find(ctx);
    const list = Array.isArray(data) ? data : [];
    const filtered = list.filter((board: Record<string, unknown>) => {
      const users = (board.users_permissions_users || []) as Array<{ id?: number }>;
      return Array.isArray(users) && users.some((u) => u && u.id === userId);
    });
    const safe = filtered.map((board: Record<string, unknown>) => {
      const { users_permissions_users: _u, ...rest } = board;
      return rest;
    });
    return { data: safe, meta: { ...meta, pagination: { ...(meta?.pagination as object), total: safe.length } } };
  },

  async findOne(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.unauthorized('Vous devez être connecté');
    }

    const query = ctx.query as Record<string, unknown>;
    const existingPopulate = (query?.populate && typeof query.populate === 'object') ? query.populate : {};

    // On ne laisse Strapi peupler que les owners du board
    ctx.query = {
      ...query,
      populate: {
        ...(existingPopulate as object),
        users_permissions_users: { fields: ['id'] },
      },
    };

    // 1) Récupérer le board brut
    const result = await super.findOne(ctx);
    if (!result?.data) {
      return result;
    }

    const data = result.data as any;
    const owners = (data.users_permissions_users || []) as Array<{ id?: number }>;
    const hasAccess = Array.isArray(owners) && owners.some((u) => u && u.id === userId);
    if (!hasAccess) {
      return ctx.forbidden("Vous n'avez pas accès à ce tableau");
    }

    const { users_permissions_users: _owners, ...safeData } = data;
    const boardId = data.id as number;

    // 2) Récupérer toutes les listes du board (sans cartes)
    const rawLists = await strapi.entityService.findMany('api::list.list', {
      filters: { board: { $eq: boardId } },
      sort: { order: 'asc' },
    } as any);

    // 3) Récupérer toutes les cartes du board (avec list + labels)
    const rawCards = await strapi.entityService.findMany('api::card.card', {
      filters: { list: { board: { $eq: boardId } } },
      populate: { list: true, labels: true },
    } as any);

    // 4) Normaliser les cartes
    const normalizedCards = Array.isArray(rawCards)
      ? rawCards.map((c: any) => {
          const labels = Array.isArray(c.labels)
            ? c.labels.map((l: any) => ({
                id: l.id,
                name: l.name,
                color: l.color,
              }))
            : [];

          return {
            id: c.id,
            documentId: c.documentId,
            title: c.title,
            description: c.description,
            order: c.order ?? 0,
            dueDate: c.dueDate,
            listId: c.list?.id ?? null,
            labels,
          };
        })
      : [];

    // 5) Grouper les cartes par id de liste (VÉRITÉ = card.listId)
    const cardsByListId: Record<number, any[]> = {};
    for (const card of normalizedCards) {
      if (!card.listId) continue;
      if (!cardsByListId[card.listId]) {
        cardsByListId[card.listId] = [];
      }
      cardsByListId[card.listId].push(card);
    }

    // 6) Normaliser les listes + y injecter les cartes groupées
    const normalizedLists = Array.isArray(rawLists)
      ? rawLists
          .map((l: any) => {
            const listCards = (cardsByListId[l.id] || []).sort(
              (a, b) => (a.order ?? 0) - (b.order ?? 0)
            );

            return {
              id: l.id,
              documentId: l.documentId,
              title: l.title,
              order: l.order ?? 0,
              cards: listCards,
            };
          })
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : [];

    // 7) Retourner le board avec des listes/cartes cohérentes
    return {
      ...result,
      data: {
        ...safeData,
        lists: normalizedLists,
      },
    };
  },

  async create(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.unauthorized('Vous devez être connecté');
    }

    ctx.request.body = ctx.request.body || {};
    const bodyData = (ctx.request.body as { data?: Record<string, unknown> }).data || {};
    (ctx.request.body as { data?: Record<string, unknown> }).data = {
      ...bodyData,
      users_permissions_users: [userId],
    };

    return super.create(ctx);
  },
}));
