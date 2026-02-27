module.exports = async (policyContext, config, { strapi }) => {
  const { id } = policyContext.params;
  const userId = policyContext.state.user.id;

  if (!id) {
    return true; // Pour les créations
  }

  try {
    const board = await strapi.entityService.findOne(
      'api::board.board',
      id,
      { populate: ['owner'] }   
    );

    if (!board) {
      return false;
    }

    // Vérifie si l'utilisateur est le propriétaire
    return board.owner.id === userId;
  } catch (error) {
    return false;
  }
};