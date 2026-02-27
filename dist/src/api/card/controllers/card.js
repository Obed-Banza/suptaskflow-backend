"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const strapi_1 = require("@strapi/strapi");
exports.default = strapi_1.factories.createCoreController('api::card.card', ({ strapi }) => {
    const syncLabels = async (cardId, desiredLabelIds) => {
        var _a;
        const cardWithLabels = await strapi.entityService.findOne('api::card.card', cardId, {
            populate: { labels: true },
        });
        const currentLabels = (_a = cardWithLabels === null || cardWithLabels === void 0 ? void 0 : cardWithLabels.labels) !== null && _a !== void 0 ? _a : [];
        const currentLabelIds = Array.isArray(currentLabels)
            ? currentLabels.map((l) => l === null || l === void 0 ? void 0 : l.id).filter((v) => typeof v === 'number')
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
            });
        }
        for (const labelId of toDisconnect) {
            await strapi.entityService.update('api::label.label', labelId, {
                data: { cards: { disconnect: [cardId] } },
            });
        }
    };
    return {
        async create(ctx) {
            var _a, _b, _c;
            const userId = (_a = ctx.state.user) === null || _a === void 0 ? void 0 : _a.id;
            if (!userId) {
                return ctx.unauthorized('Vous devez être connecté');
            }
            const body = (ctx.request.body || {});
            const data = (body.data || {});
            const { list: rawList, labels: rawLabels, ...rest } = data;
            let listId = null;
            // Résoudre la liste depuis id ou documentId
            if (typeof rawList === 'number') {
                listId = rawList;
            }
            else if (typeof rawList === 'string') {
                const maybeNumeric = Number(rawList);
                if (!Number.isNaN(maybeNumeric)) {
                    listId = maybeNumeric;
                }
                else {
                    const found = await strapi.entityService.findMany('api::list.list', {
                        filters: { documentId: rawList },
                        limit: 1,
                    });
                    if (Array.isArray(found) && ((_b = found[0]) === null || _b === void 0 ? void 0 : _b.id)) {
                        listId = found[0].id;
                    }
                }
            }
            else if (rawList && typeof rawList === 'object' && rawList.documentId) {
                const docId = rawList.documentId;
                const found = await strapi.entityService.findMany('api::list.list', {
                    filters: { documentId: docId },
                    limit: 1,
                });
                if (Array.isArray(found) && ((_c = found[0]) === null || _c === void 0 ? void 0 : _c.id)) {
                    listId = found[0].id;
                }
            }
            const createData = {
                ...rest,
                order: typeof rest.order === 'number' ? rest.order : 0,
                // Pour une relation manyToOne, on assigne directement l'id numérique de la liste
                list: listId,
                users_permissions_user: userId,
            };
            const created = await strapi.entityService.create('api::card.card', { data: createData });
            // Labels: si le frontend en a envoyé, on synchronise via Label (owner side)
            if (Array.isArray(rawLabels)) {
                const desiredLabelIds = rawLabels.filter((v) => typeof v === 'number');
                await syncLabels(created.id, desiredLabelIds);
            }
            return { data: created, meta: {} };
        },
        async update(ctx) {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            const userId = (_a = ctx.state.user) === null || _a === void 0 ? void 0 : _a.id;
            if (!userId) {
                return ctx.unauthorized('Vous devez être connecté');
            }
            const paramId = (_b = ctx.params) === null || _b === void 0 ? void 0 : _b.id;
            if (!paramId) {
                return ctx.badRequest('Identifiant de la carte manquant');
            }
            // Strapi v5 peut utiliser soit le documentId (string), soit l'id numérique dans l'URL.
            // On gère les deux cas : d'abord on tente par documentId, sinon on retombe sur l'id numérique.
            let cardId = null;
            // 1) Essayer comme documentId
            const byDoc = await strapi.entityService.findMany('api::card.card', {
                filters: { documentId: paramId },
                limit: 1,
            });
            if (Array.isArray(byDoc) && ((_c = byDoc[0]) === null || _c === void 0 ? void 0 : _c.id)) {
                cardId = byDoc[0].id;
            }
            else {
                // 2) Sinon, essayer comme id numérique
                const maybeNumeric = Number(paramId);
                if (!Number.isNaN(maybeNumeric)) {
                    try {
                        const byId = await strapi.entityService.findOne('api::card.card', maybeNumeric, {});
                        if (byId === null || byId === void 0 ? void 0 : byId.id) {
                            cardId = byId.id;
                        }
                    }
                    catch {
                        // ignore, on traitera l'absence juste après
                    }
                }
            }
            if (!cardId) {
                return ctx.notFound('Carte introuvable');
            }
            const body = (ctx.request.body || {});
            const data = (body.data || {});
            const { list: rawList, labels: rawLabels, ...rest } = data;
            const updateData = {
                ...rest,
            };
            // Changement de colonne (manyToOne : on assigne directement l'id de la liste)
            if (rawList !== undefined) {
                let listId = null;
                if (typeof rawList === 'number') {
                    listId = rawList;
                }
                else if (typeof rawList === 'string') {
                    const maybeNumeric = Number(rawList);
                    if (!Number.isNaN(maybeNumeric)) {
                        listId = maybeNumeric;
                    }
                    else {
                        const found = await strapi.entityService.findMany('api::list.list', {
                            filters: { documentId: rawList },
                            limit: 1,
                        });
                        if (Array.isArray(found) && ((_d = found[0]) === null || _d === void 0 ? void 0 : _d.id)) {
                            listId = found[0].id;
                        }
                    }
                }
                else if (rawList && typeof rawList === 'object' && rawList.documentId) {
                    const docId = rawList.documentId;
                    const found = await strapi.entityService.findMany('api::list.list', {
                        filters: { documentId: docId },
                        limit: 1,
                    });
                    if (Array.isArray(found) && ((_e = found[0]) === null || _e === void 0 ? void 0 : _e.id)) {
                        listId = found[0].id;
                    }
                }
                if (listId !== null) {
                    updateData.list = listId;
                }
            }
            const updated = await strapi.entityService.update('api::card.card', cardId, {
                data: updateData,
            });
            // Labels: si le frontend envoie rawLabels, on sync via Label (owner side)
            if (Array.isArray(rawLabels)) {
                const desiredLabelIds = rawLabels.filter((v) => typeof v === 'number');
                await syncLabels(cardId, desiredLabelIds);
            }
            // Fetch the updated card with populated relations to return a complete response
            try {
                const fullUpdated = await strapi.entityService.findOne('api::card.card', cardId, {
                    populate: { list: true, labels: true },
                });
                // Normalize the response to match REST API format
                const normalized = {
                    id: fullUpdated === null || fullUpdated === void 0 ? void 0 : fullUpdated.id,
                    documentId: fullUpdated === null || fullUpdated === void 0 ? void 0 : fullUpdated.documentId,
                    title: fullUpdated === null || fullUpdated === void 0 ? void 0 : fullUpdated.title,
                    description: fullUpdated === null || fullUpdated === void 0 ? void 0 : fullUpdated.description,
                    order: fullUpdated === null || fullUpdated === void 0 ? void 0 : fullUpdated.order,
                    dueDate: fullUpdated === null || fullUpdated === void 0 ? void 0 : fullUpdated.dueDate,
                    createdAt: fullUpdated === null || fullUpdated === void 0 ? void 0 : fullUpdated.createdAt,
                    updatedAt: fullUpdated === null || fullUpdated === void 0 ? void 0 : fullUpdated.updatedAt,
                    publishedAt: fullUpdated === null || fullUpdated === void 0 ? void 0 : fullUpdated.publishedAt,
                    locale: fullUpdated === null || fullUpdated === void 0 ? void 0 : fullUpdated.locale,
                    list: (fullUpdated === null || fullUpdated === void 0 ? void 0 : fullUpdated.list) ? {
                        id: (_f = fullUpdated.list) === null || _f === void 0 ? void 0 : _f.id,
                        documentId: (_g = fullUpdated.list) === null || _g === void 0 ? void 0 : _g.documentId,
                        title: (_h = fullUpdated.list) === null || _h === void 0 ? void 0 : _h.title,
                    } : null,
                    labels: Array.isArray(fullUpdated === null || fullUpdated === void 0 ? void 0 : fullUpdated.labels) ? fullUpdated.labels.map((l) => ({
                        id: l.id,
                        name: l.name,
                        color: l.color,
                        documentId: l.documentId,
                    })) : [],
                };
                return { data: normalized, meta: {} };
            }
            catch (e) {
                console.error('Error fetching updated card with relations:', e);
                return { data: updated, meta: {} };
            }
        },
    };
});
