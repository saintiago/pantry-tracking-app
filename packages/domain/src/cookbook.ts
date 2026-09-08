export interface Cookbook {
  cookbookId: string;
  name: string;
  description: string;
  imageId?: string;
  recipeIds: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}
