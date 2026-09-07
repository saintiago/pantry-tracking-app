export const inventoryErrors: Record<string, { es: string; it: string }> = {
  'Inventory revision requires recovery': {
    es: 'Hay que reparar el inventario antes de guardar este cambio.',
    it: 'Occorre riparare l’inventario prima di salvare questa modifica.',
  },
  'Inventory quantity requires recovery': {
    es: 'Hay una cantidad que debe corregirse en el inventario.',
    it: 'Una quantità nell’inventario deve essere corretta.',
  },
  'Inventory threshold requires recovery': {
    es: 'Hay un umbral que debe corregirse en el inventario.',
    it: 'Una soglia nell’inventario deve essere corretta.',
  },
  'Inventory group identity requires recovery': {
    es: 'Hay un grupo del inventario que debe corregirse.',
    it: 'Un gruppo dell’inventario deve essere corretto.',
  },
  'Inventory changed concurrently. Refresh and try again.': {
    es: 'El inventario ha cambiado. Actualiza la página e inténtalo de nuevo.',
    it: 'L’inventario è cambiato. Aggiorna la pagina e riprova.',
  },
  'Stock unit must be compatible with the group unit. Reassign the item to another group.': {
    es: 'La unidad debe ser compatible con la del grupo. Reasigna el producto a otro grupo.',
    it: 'L’unità deve essere compatibile con quella del gruppo. Assegna il prodotto a un altro gruppo.',
  },
  'Inventory total must be finite': {
    es: 'La cantidad total del inventario es demasiado grande.',
    it: 'La quantità totale dell’inventario è troppo grande.',
  },
  'Inventory item already exists': {
    es: 'El producto ya existe en el inventario.',
    it: 'Il prodotto esiste già nell’inventario.',
  },
  'Inventory group not found': {
    es: 'Grupo del inventario no encontrado.',
    it: 'Gruppo dell’inventario non trovato.',
  },
  'Threshold unit must be compatible with the stock unit': {
    es: 'La unidad del umbral debe ser compatible con la unidad de las existencias.',
    it: 'L’unità della soglia deve essere compatibile con quella delle scorte.',
  },
};
