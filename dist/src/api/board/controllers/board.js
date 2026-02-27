"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const strapi_1 = require("@strapi/strapi");
exports.default = strapi_1.factories.createCoreController('api::board.board', ({ strapi }) => ({
    async find(ctx) {
        var _a;
        const userId = (_a = ctx.state.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            return ctx.unauthorized('Vous devez être connecté');
        }
        const query = ctx.query;
        ctx.query = {
            ...query,
            populate: {
                users_permissions_users: { fields: ['id'] },
            },
        };
        const { data, meta } = await super.find(ctx);
        const list = Array.isArray(data) ? data : [];
        const filtered = list.filter((board) => {
            const users = (board.users_permissions_users || []);
            return Array.isArray(users) && users.some((u) => u && u.id === userId);
        });
        const safe = filtered.map((board) => {
            const { users_permissions_users: _u, ...rest } = board;
            return rest;
        });
        return { data: safe, meta: { ...meta, pagination: { ...meta === null || meta === void 0 ? void 0 : meta.pagination, total: safe.length } } };
    },
    async findOne(ctx) {
        var _a;
        const userId = (_a = ctx.state.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            return ctx.unauthorized('Vous devez être connecté');
        }
        const query = ctx.query;
        const existingPopulate = ((query === null || query === void 0 ? void 0 : query.populate) && typeof query.populate === 'object') ? query.populate : {};
        // On ne laisse Strapi peupler que les owners du board
        ctx.query = {
            ...query,
            populate: {
                ...existingPopulate,
                users_permissions_users: { fields: ['id'] },
            },
        };
        // 1) Récupérer le board brut
        const result = await super.findOne(ctx);
        if (!(result === null || result === void 0 ? void 0 : result.data)) {
            return result;
        }
        const data = result.data;
        const owners = (data.users_permissions_users || []);
        const hasAccess = Array.isArray(owners) && owners.some((u) => u && u.id === userId);
        if (!hasAccess) {
            return ctx.forbidden("Vous n'avez pas accès à ce tableau");
        }
        const { users_permissions_users: _owners, ...safeData } = data;
        const boardId = data.id;
        // 2) Récupérer toutes les listes du board (sans cartes)
        const rawLists = await strapi.entityService.findMany('api::list.list', {
            filters: { board: { $eq: boardId } },
            sort: { order: 'asc' },
        });
        // 3) Récupérer toutes les cartes du board (avec list + labels)
        const rawCards = await strapi.entityService.findMany('api::card.card', {
            filters: { list: { board: { $eq: boardId } } },
            populate: { list: true, labels: true },
        });
        // 4) Normaliser les cartes
        const normalizedCards = Array.isArray(rawCards)
            ? rawCards.map((c) => {
                var _a, _b, _c;
                const labels = Array.isArray(c.labels)
                    ? c.labels.map((l) => ({
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
                    order: (_a = c.order) !== null && _a !== void 0 ? _a : 0,
                    dueDate: c.dueDate,
                    listId: (_c = (_b = c.list) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : null,
                    labels,
                };
            })
            : [];
        // 5) Grouper les cartes par id de liste (VÉRITÉ = card.listId)
        const cardsByListId = {};
        for (const card of normalizedCards) {
            if (!card.listId)
                continue;
            if (!cardsByListId[card.listId]) {
                cardsByListId[card.listId] = [];
            }
            cardsByListId[card.listId].push(card);
        }
        // 6) Normaliser les listes + y injecter les cartes groupées
        const normalizedLists = Array.isArray(rawLists)
            ? rawLists
                .map((l) => {
                var _a;
                const listCards = (cardsByListId[l.id] || []).sort((a, b) => { var _a, _b; return ((_a = a.order) !== null && _a !== void 0 ? _a : 0) - ((_b = b.order) !== null && _b !== void 0 ? _b : 0); });
                return {
                    id: l.id,
                    documentId: l.documentId,
                    title: l.title,
                    order: (_a = l.order) !== null && _a !== void 0 ? _a : 0,
                    cards: listCards,
                };
            })
                .sort((a, b) => { var _a, _b; return ((_a = a.order) !== null && _a !== void 0 ? _a : 0) - ((_b = b.order) !== null && _b !== void 0 ? _b : 0); })
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
        var _a;
        const userId = (_a = ctx.state.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            return ctx.unauthorized('Vous devez être connecté');
        }
        ctx.request.body = ctx.request.body || {};
        const bodyData = ctx.request.body.data || {};
        ctx.request.body.data = {
            ...bodyData,
            users_permissions_users: [userId],
        };
        return super.create(ctx);
    },
}));
