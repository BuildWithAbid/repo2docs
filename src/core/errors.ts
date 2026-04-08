export class Repo2DocsError extends Error {
  public readonly code: string;

  public constructor(message: string, code = "REPO2DOCS_ERROR") {
    super(message);
    this.name = "Repo2DocsError";
    this.code = code;
  }
}

