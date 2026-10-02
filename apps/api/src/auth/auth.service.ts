import type { AuthLoginRequest, AuthRegisterRequest } from "../../../../packages/contracts/src/auth/auth.js";
import { InvalidCredentialsError } from "./auth.errors.js";
import type { AuthUserRepository, PublicAuthUser } from "./auth.repository.js";
import type { PasswordHasher } from "./password-hasher.js";

export interface AuthenticationServicePort {
  register(input: AuthRegisterRequest): Promise<PublicAuthUser>;
  login(input: AuthLoginRequest): Promise<PublicAuthUser>;
  getCurrentUser(userId: string): Promise<PublicAuthUser | null>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class AuthenticationService implements AuthenticationServicePort {
  constructor(
    private readonly users: AuthUserRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async register(input: AuthRegisterRequest): Promise<PublicAuthUser> {
    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.users.createUser({
      name: input.name.trim(),
      email: normalizeEmail(input.email),
      passwordHash,
    });

    return { id: user.id, name: user.name, email: user.email };
  }

  async login(input: AuthLoginRequest): Promise<PublicAuthUser> {
    const user = await this.users.findUserByEmail(normalizeEmail(input.email));

    if (!user) {
      await this.passwordHasher.hash(input.password);
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await this.passwordHasher.verify(user.passwordHash, input.password);
    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    return { id: user.id, name: user.name, email: user.email };
  }

  getCurrentUser(userId: string): Promise<PublicAuthUser | null> {
    return this.users.findUserById(userId);
  }
}