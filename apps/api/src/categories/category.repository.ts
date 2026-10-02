import type {
  Category as PrismaCategory,
  PrismaClient,
} from "../../../../database/prisma/generated/client/client.js";
import type {
  CategoryListQuery,
  CategoryType,
  CreateCategoryRequest,
} from "../../../../packages/contracts/src/categories/categories.js";

export interface CategoryRecord {
  id: string;
  userId: string | null;
  name: string;
  type: CategoryType;
  systemDefined: boolean;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryListResult {
  categories: CategoryRecord[];
  totalItems: number;
}

export interface CategoryRepository {
  createForUser(userId: string, input: CreateCategoryRequest): Promise<CategoryRecord>;
  listForUser(userId: string, query: Required<Omit<CategoryListQuery, 'type'>> & Pick<CategoryListQuery, 'type'>): Promise<CategoryListResult>;
  findByIdForUserOrSystem(categoryId: string, userId: string): Promise<CategoryRecord | null>;
  updateNameForUser(categoryId: string, userId: string, name: string): Promise<CategoryRecord | null>;
  archiveForUser(categoryId: string, userId: string): Promise<CategoryRecord | null>;
}

const categorySelect = {
  id: true,
  userId: true,
  name: true,
  type: true,
  systemDefined: true,
  archived: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toCategoryRecord(category: PrismaCategory): CategoryRecord {
  return {
    id: category.id,
    userId: category.userId,
    name: category.name,
    type: category.type,
    systemDefined: category.systemDefined,
    archived: category.archived,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

function isRecordNotFoundError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2025";
}

export function createPrismaCategoryRepository(prisma: PrismaClient): CategoryRepository {
  return {
    async createForUser(userId, input) {
      const category = await prisma.category.create({
        data: {
          userId,
          systemDefined: false,
          name: input.name,
          type: input.type,
        },
        select: categorySelect,
      });

      return toCategoryRecord(category);
    },

    async listForUser(userId, query: Required<Omit<CategoryListQuery, 'type'>> & Pick<CategoryListQuery, 'type'>) {
      const typeFilter = query.type !== undefined ? { type: query.type } : {};
      const where = {
        OR: [
          { userId, archived: query.archived, ...typeFilter },
          { userId: null, systemDefined: true, archived: query.archived, ...typeFilter },
        ],
      };

      const [categories, totalItems] = await Promise.all([
        prisma.category.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: categorySelect,
        }),
        prisma.category.count({ where }),
      ]);

      return {
        categories: categories.map(toCategoryRecord),
        totalItems,
      };
    },

    async findByIdForUserOrSystem(categoryId, userId) {
      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          OR: [{ userId }, { userId: null, systemDefined: true }],
        },
        select: categorySelect,
      });

      return category ? toCategoryRecord(category) : null;
    },

    async updateNameForUser(categoryId, userId, name) {
      try {
        const category = await prisma.category.update({
          where: { id: categoryId, userId, systemDefined: false, archived: false },
          data: { name },
          select: categorySelect,
        });

        return toCategoryRecord(category);
      } catch (error) {
        if (isRecordNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },

    async archiveForUser(categoryId, userId) {
      try {
        const category = await prisma.category.update({
          where: { id: categoryId, userId, systemDefined: false },
          data: { archived: true },
          select: categorySelect,
        });

        return toCategoryRecord(category);
      } catch (error) {
        if (isRecordNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },
  };
}
