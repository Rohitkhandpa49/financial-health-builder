import type {
  CategoryListQuery,
  CategoryListResponse,
  CategoryResponse,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "../../../../packages/contracts/src/categories/categories.js";
import { HttpError } from "../http/errors.js";
import type { CategoryRecord, CategoryRepository } from "./category.repository.js";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;

function toCategoryResponse(record: CategoryRecord): CategoryResponse {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    systemDefined: record.systemDefined,
    archived: record.archived,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function notFound(): HttpError {
  return new HttpError({
    statusCode: 404,
    code: "NOT_FOUND",
    message: "The requested resource was not found.",
  });
}

function forbidden(): HttpError {
  return new HttpError({
    statusCode: 403,
    code: "FORBIDDEN",
    message: "System categories cannot be modified.",
  });
}

export class CategoryService {
  constructor(private readonly categories: CategoryRepository) {}

  async create(userId: string, input: CreateCategoryRequest): Promise<CategoryResponse> {
    const category = await this.categories.createForUser(userId, input);
    return toCategoryResponse(category);
  }

  async list(userId: string, query: CategoryListQuery): Promise<CategoryListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const result = await this.categories.listForUser(userId, {
      page,
      pageSize,
      archived: query.archived ?? false,
      type: query.type,
    });

    return {
      categories: result.categories.map(toCategoryResponse),
      pagination: {
        page,
        pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / pageSize),
      },
    };
  }

  async get(categoryId: string, userId: string): Promise<CategoryResponse> {
    const category = await this.categories.findByIdForUserOrSystem(categoryId, userId);
    if (!category) {
      throw notFound();
    }

    return toCategoryResponse(category);
  }

  async update(categoryId: string, userId: string, input: UpdateCategoryRequest): Promise<CategoryResponse> {
    const category = await this.categories.updateNameForUser(categoryId, userId, input.name);
    if (!category) {
      const existing = await this.categories.findByIdForUserOrSystem(categoryId, userId);
      if (existing && existing.systemDefined) {
        throw forbidden();
      }

      throw notFound();
    }

    return toCategoryResponse(category);
  }

  async archive(categoryId: string, userId: string): Promise<CategoryResponse> {
    const category = await this.categories.archiveForUser(categoryId, userId);
    if (!category) {
      const existing = await this.categories.findByIdForUserOrSystem(categoryId, userId);
      if (existing && existing.systemDefined) {
        throw forbidden();
      }

      throw notFound();
    }

    return toCategoryResponse(category);
  }
}
