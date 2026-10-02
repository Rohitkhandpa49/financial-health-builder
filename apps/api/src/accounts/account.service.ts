import type {
  AccountListResponse,
  AccountListQuery,
  AccountResponse,
  CreateAccountRequest,
  UpdateAccountRequest,
} from "../../../../packages/contracts/src/accounts/accounts.js";
import type { AuthenticatedRequestContext } from "../auth/auth.middleware.js";
import { assertResourceOwnedByAuthenticatedUser } from "../authorization/ownership.js";
import { HttpError } from "../http/errors.js";
import type { AccountRecord, AccountRepository } from "./account.repository.js";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;

function toAccountResponse(account: AccountRecord, userId: string): AccountResponse {
  const authenticatedUser: AuthenticatedRequestContext = Object.freeze({ userId });
  assertResourceOwnedByAuthenticatedUser(authenticatedUser, account);

  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    openingBalance: account.openingBalance,
    archived: account.archived,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

function notFound(): HttpError {
  return new HttpError({
    statusCode: 404,
    code: "NOT_FOUND",
    message: "The requested resource was not found.",
  });
}

export class AccountService {
  constructor(private readonly accounts: AccountRepository) {}

  async create(userId: string, input: CreateAccountRequest): Promise<AccountResponse> {
    const account = await this.accounts.createForUser(userId, input);
    return toAccountResponse(account, userId);
  }

  async list(userId: string, query: AccountListQuery): Promise<AccountListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const result = await this.accounts.listForUser(userId, {
      page,
      pageSize,
      archived: query.archived ?? false,
    });

    return {
      accounts: result.accounts.map((account) => toAccountResponse(account, userId)),
      pagination: {
        page,
        pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / pageSize),
      },
    };
  }

  async get(accountId: string, userId: string): Promise<AccountResponse> {
    const account = await this.accounts.findByIdForUser(accountId, userId);
    if (!account) {
      throw notFound();
    }

    return toAccountResponse(account, userId);
  }

  async updateName(accountId: string, userId: string, input: UpdateAccountRequest): Promise<AccountResponse> {
    const account = await this.accounts.updateNameForUser(accountId, userId, input.name);
    if (!account) {
      throw notFound();
    }

    return toAccountResponse(account, userId);
  }

  async archive(accountId: string, userId: string): Promise<AccountResponse> {
    const account = await this.accounts.archiveForUser(accountId, userId);
    if (!account) {
      throw notFound();
    }

    return toAccountResponse(account, userId);
  }
}