/** Coordinates the in-memory user list used by the sample API. */
export class UserService {
  private readonly users = ["ada", "grace"];

  public listUsers(): string[] {
    return [...this.users];
  }

  public createUser(name: string): string {
    this.users.push(name);
    return name;
  }
}

const service = new UserService();

export function listUsers(): string[] {
  return service.listUsers();
}

export function createUser(name: string): string {
  return service.createUser(name);
}

