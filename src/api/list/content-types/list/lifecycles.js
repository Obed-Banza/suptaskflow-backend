module.exports = {
  async beforeDelete(event) {
    const { where } = event.params;
    
    const list = await strapi.entityService.findOne(
      'api::list.list',
      where.id,
      { populate: ['cards'] }
    );

    if (list && list.cards) {
      for (const card of list.cards) {
        await strapi.entityService.delete('api::card.card', card.id);
      }
    }
  },
};