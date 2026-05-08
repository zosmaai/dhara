import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createSession,
  type BranchEntry,
  type ModelRef,
  type Session,
  type SessionEntry,
  type SessionMeta,
} from "./session.js";

/**
 * Thrown when a requested session does not exist on disk.
 */
export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}

/**
 * Summary metadata for a persisted session, returned by {@link SessionManager.list}.
 */
export interface SessionSummary {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  cwd: string;
  entryCount: number;
  fileSize: number;
}

/**
 * A {@link Session} that automatically persists to disk on every mutation.
 * The {@link save} method can also be invoked explicitly.
 */
export interface PersistedSession extends Session {
  save(): void;
}

/**
 * Configuration for creating a {@link SessionManager}.
 */
export interface SessionManagerConfig {
  /**
   * Directory where session JSONL files are stored.
   * Defaults to `~/.dhara/sessions`.
   */
  storageDir?: string;
}

/**
 * Manages the lifecycle of file-backed sessions.
 *
 * - **Create** new sessions with {@link create}
 * - **Load** existing sessions with {@link load}
 * - **List** all persisted sessions with {@link list}
 * - **Delete** sessions with {@link delete}
 *
 * Sessions are persisted as JSONL files at `{storageDir}/{sessionId}.jsonl`.
 * Writes are atomic (temp file + rename) to prevent corruption.
 */
export class SessionManager {
  readonly storageDir: string;

  constructor(config: SessionManagerConfig = {}) {
    this.storageDir = config.storageDir ?? join(homedir(), ".dhara", "sessions");
  }

  /**
   * Create a new session, persist it immediately, and return a
   * {@link PersistedSession} that auto-saves on every `append` or `fork`.
   */
  create(config: {
    cwd: string;
    model?: ModelRef;
    tags?: string[];
  }): PersistedSession {
    this.ensureStorageDir();
    const session = createSession(config);
    const persisted = this.wrap(session);
    persisted.save();
    return persisted;
  }

  /**
   * Load a previously persisted session from disk.
   * The returned {@link PersistedSession} auto-saves on every mutation.
   *
   * @throws {SessionNotFoundError} when the session file does not exist.
   */
  load(sessionId: string): PersistedSession {
    const filePath = this.filePath(sessionId);

    if (!this.fileExists(filePath)) {
      throw new SessionNotFoundError(sessionId);
    }

    const data = readFileSync(filePath, "utf-8");
    const session = createSession({ cwd: "" });
    session.import(data);
    return this.wrap(session);
  }

  /**
   * List all persisted sessions with metadata.
   * Returns an empty array when the storage directory does not exist.
   */
  list(): SessionSummary[] {
    if (!this.dirExists(this.storageDir)) {
      return [];
    }

    const files = readdirSync(this.storageDir).filter(
      (file) => file.endsWith(".jsonl") && !file.startsWith("."),
    );

    return files
      .map((file) => this.summarize(join(this.storageDir, file)))
      .filter((summary): summary is SessionSummary => summary !== undefined)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Delete a persisted session from disk.
   *
   * @throws {SessionNotFoundError} when the session file does not exist.
   */
  delete(sessionId: string): void {
    const filePath = this.filePath(sessionId);

    if (!this.fileExists(filePath)) {
      throw new SessionNotFoundError(sessionId);
    }

    rmSync(filePath, { force: true });
  }

  /**
   * Wrap a plain {@link Session} in a {@link PersistedSession} that
   * auto-saves to disk after every `append` or `fork`.
   */
  private wrap(session: Session): PersistedSession {
    const save = (): void => {
      this.saveSession(session);
    };

    return {
      get meta() {
        return session.meta;
      },
      append(
        partial: Omit<SessionEntry, "type" | "id" | "parentId" | "timestamp">,
        parentId?: string,
      ): SessionEntry {
        const entry = session.append(partial, parentId);
        save();
        return entry;
      },
      fork(parentId: string, label?: string): BranchEntry {
        const branch = session.fork(parentId, label);
        save();
        return branch;
      },
      getEntry(id: string) {
        return session.getEntry(id);
      },
      getPath(branchId?: string) {
        return session.getPath(branchId);
      },
      getHead() {
        return session.getHead();
      },
      export() {
        return session.export();
      },
      import(data: string) {
        session.import(data);
        save();
      },
      save,
    };
  }

  /**
   * Atomically persist a session to disk.
   * Writes to a temporary file then renames to the target path.
   */
  private saveSession(session: Session): void {
    const sessionId = session.meta.sessionId;
    const data = session.export();
    const tempPath = join(this.storageDir, `.tmp-${sessionId}.jsonl`);
    const finalPath = this.filePath(sessionId);

    writeFileSync(tempPath, data, "utf-8");
    renameSync(tempPath, finalPath);
  }

  /**
   * Build a {@link SessionSummary} from a JSONL file path.
   * Returns `undefined` if the file is empty or corrupted.
   */
  private summarize(filePath: string): SessionSummary | undefined {
    try {
      const stats = statSync(filePath);
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      if (lines.length === 0) {
        return undefined;
      }

      const meta = JSON.parse(lines[0]) as SessionMeta;
      return {
        sessionId: meta.sessionId,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        cwd: meta.cwd,
        entryCount: lines.length - 1,
        fileSize: stats.size,
      };
    } catch {
      return undefined;
    }
  }

  private filePath(sessionId: string): string {
    return join(this.storageDir, `${sessionId}.jsonl`);
  }

  private ensureStorageDir(): void {
    mkdirSync(this.storageDir, { recursive: true });
  }

  private fileExists(filePath: string): boolean {
    try {
      statSync(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private dirExists(dirPath: string): boolean {
    try {
      const stats = statSync(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}
