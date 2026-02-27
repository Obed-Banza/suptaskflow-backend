import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::card.card', ({ strapi }) => {
  const syncLabels = async (cardId: number, desiredLabelIds: number[]) => {
    const cardWithLabels = await strapi.entityService.findOne('api::card.card', cardId, {
      populate: { labels: true },
    } as any);

    const currentLabels = (cardWithLabels as any)?.labels ?? [];
    const currentLabelIds: number[] = Array.isArray(currentLabels)
      ? currentLabels.map((l: any) => l?.id).filter((v: any) => typeof v === 'number')
      : [];

    const desired = new Set(desiredLabelIds);
    const current = new Set(currentLabelIds);

    const toConnect = desiredLabelIds.filter((id) => !current.has(id));
    const toDisconnect = currentLabelIds.filter((id) => !desired.has(id));

    // IMPORTANT: Dans ton modèle, card.labels est "mappedBy" (côté inverse),
    // donc on DOIT écrire la relation depuis label.cards (côté owner).
    for (const labelId of toConnect) {
      await strapi.entityService.update('api::label.label', labelId, {
        data: { cards: { connect: [cardId] } },
      } as any);
    }
    for (const labelId of toDisconnect) {
      await strapi.entityService.update('api::label.label', labelId, {
        data: { cards: { disconnect: [cardId] } },
      } as any);
    }
  };

  return {
    async create(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.unauthorized('Vous devez être connecté');
    }

    const body = (ctx.request.body || {}) as { data?: Record<string, unknown> };
    const data = (body.data || {}) as Record<string, unknown>;

    const { list: rawList, labels: rawLabels, ...rest } = data;

    let listId: number | null = null;

    // Résoudre la liste depuis id ou documentId
    if (typeof rawList === 'number') {
      listId = rawList;
    } else if (typeof rawList === 'string') {
      const maybeNumeric = Number(rawList);
      if (!Number.isNaN(maybeNumeric)) {
        listId = maybeNumeric;
      } else {
        const found = await strapi.entityService.findMany('api::list.list', {
          filters: { documentId: rawList },
          limit: 1,
        } as any);
        if (Array.isArray(found) && found[0]?.id) {
          listId = found[0].id as number;
        }
      }
    } else if (rawList && typeof rawList === 'object' && (rawList as any).documentId) {
      const docId = (rawList as any).documentId as string;
      const found = await strapi.entityService.findMany('api::list.list', {
        filters: { documentId: docId },
        limit: 1,
      } as any);
      if (Array.isArray(found) && found[0]?.id) {
        listId = found[0].id as number;
      }
    }

    const createData: Record<string, unknown> = {
      ...rest,
      order: typeof rest.order === 'number' ? rest.order : 0,
      // Pour une relation manyToOne, on assigne directement l'id numérique de la liste
      list: listId,
      users_permissions_user: userId,
    };

    const created = await strapi.entityService.create('api::card.card', { data: createData } as any);

    // Labels: si le frontend en a envoyé, on synchronise via Label (owner side)
    if (Array.isArray(rawLabels)) {
      const desiredLabelIds = rawLabels.filter((v) => typeof v === 'number') as number[];
      await syncLabels((created as any).id as number, desiredLabelIds);
    }

    return { data: created, meta: {} };
  },

  async update(ctx) {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.unauthorized('Vous devez être connecté');
    }

    const paramId = ctx.params?.id;
    if (!paramId) {
      return ctx.badRequest('Identifiant de la carte manquant');
    }

    // Strapi v5 peut utiliser soit le documentId (string), soit l'id numérique dans l'URL.
    // On gère les deux cas : d'abord on tente par documentId, sinon on retombe sur l'id numérique.
    let cardId: number | null = null;

    // 1) Essayer comme documentId
    const byDoc = await strapi.entityService.findMany('api::card.card', {
      filters: { documentId: paramId },
      limit: 1,
    } as any);
    if (Array.isArray(byDoc) && byDoc[0]?.id) {
      cardId = byDoc[0].id as number;
    } else {
      // 2) Sinon, essayer comme id numérique
      const maybeNumeric = Number(paramId);
      if (!Number.isNaN(maybeNumeric)) {
        try {
          const byId = await strapi.entityService.findOne('api::card.card', maybeNumeric, {} as any);
          if (byId?.id) {
            cardId = byId.id as number;
          }
        } catch {
          // ignore, on traitera l'absence juste après
        }
      }
    }

    if (!cardId) {
      return ctx.notFound('Carte introuvable');
    }

    const body = (ctx.request.body || {}) as { data?: Record<string, unknown> };
    const data = (body.data || {}) as Record<string, unknown>;

    const { list: rawList, labels: rawLabels, ...rest } = data;

    const updateData: Record<string, unknown> = {
      ...rest,
    };

    // Changement de colonne (manyToOne : on assigne directement l'id de la liste)
    if (rawList !== undefined) {
      let listId: number | null = null;

      if (typeof rawList === 'number') {
        listId = rawList;
      } else if (typeof rawList === 'string') {
        const maybeNumeric = Number(rawList);
        if (!Number.isNaN(maybeNumeric)) {
          listId = maybeNumeric;
        } else {
          const found = await strapi.entityService.findMany('api::list.list', {
            filters: { documentId: rawList },
            limit: 1,
          } as any);
          if (Array.isArray(found) && found[0]?.id) {
            listId = found[0].id as number;
          }
        }
      } else if (rawList && typeof rawList === 'object' && (rawList as any).documentId) {
        const docId = (rawList as any).documentId as string;
        const found = await strapi.entityService.findMany('api::list.list', {
          filters: { documentId: docId },
          limit: 1,
        } as any);
        if (Array.isArray(found) && found[0]?.id) {
          listId = found[0].id as number;
        }
      }

      if (listId !== null) {
        updateData.list = listId;
      }
    }

    const updated = await strapi.entityService.update('api::card.card', cardId, {
      data: updateData,
    } as any);

    // Labels: si le frontend envoie rawLabels, on sync via Label (owner side)
    if (Array.isArray(rawLabels)) {
      const desiredLabelIds = rawLabels.filter((v) => typeof v === 'number') as number[];
      await syncLabels(cardId, desiredLabelIds);
    }

    // Fetch the updated card with populated relations to return a complete response
    try {
      const fullUpdated: any = await strapi.entityService.findOne('api::card.card', cardId, {
        populate: { list: true, labels: true },
      } as any);
      
      // Normalize the response to match REST API format
      const normalized = {
        id: fullUpdated?.id,
        documentId: fullUpdated?.documentId,
        title: fullUpdated?.title,
        description: fullUpdated?.description,
        order: fullUpdated?.order,
        dueDate: fullUpdated?.dueDate,
        createdAt: fullUpdated?.createdAt,
        updatedAt: fullUpdated?.updatedAt,
        publishedAt: fullUpdated?.publishedAt,
        locale: fullUpdated?.locale,
        list: fullUpdated?.list ? {
          id: fullUpdated.list?.id,
          documentId: fullUpdated.list?.documentId,
          title: fullUpdated.list?.title,
        } : null,
        labels: Array.isArray(fullUpdated?.labels) ? fullUpdated.labels.map((l: any) => ({
          id: l.id,
          name: l.name,
          color: l.color,
          documentId: l.documentId,
        })) : [],
      };
      
      return { data: normalized, meta: {} };
    } catch (e) {
      console.error('Error fetching updated card with relations:', e);
      return { data: updated, meta: {} };
    }
  },
  };
});