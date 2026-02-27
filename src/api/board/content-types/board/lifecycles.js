module.exports = {
  async beforeDelete(event) {
    const { where } = event.params;
    
    // Récupère le board avec ses lists
    const board = await strapi.entityService.findOne(
      'api::board.board',
      where.id,
      { populate: ['lists'] }
    );

    if (board && board.lists) {
      // Supprime toutes les lists (et leurs cards grâce au lifecycle de list)
      for (const list of board.lists) {
        await strapi.entityService.delete('api::list.list', list.id);
      }
    }
  },
};