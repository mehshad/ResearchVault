/**
 * The storage layer, as the rest of the server sees it.
 *
 * DatabaseStorage is the only implementation and it is the contract: IStorage
 * is its instance type. There used to be a hand-written interface here and an
 * in-memory MemStorage beside it, both claiming to describe the same thing.
 * The interface listed 203 methods, MemStorage implemented 67 of them, and
 * DatabaseStorage had about a hundred the interface never mentioned -- and
 * none of it was caught, because all three files opened with @ts-nocheck.
 * That is how a route came to call storage.getPmoApplication, which the
 * interface declared and the database class never had.
 *
 * With the class as the type, a method exists for callers exactly when it
 * exists in the code that runs. A second implementation, if one is ever
 * wanted for tests, should implement `IStorage` and let the compiler say
 * what it is missing.
 */
import { DatabaseStorage } from "./databaseStorage";

export type IStorage = DatabaseStorage;

export const storage: IStorage = new DatabaseStorage();

export { GrantSdrLifecycleStorageError, type GrantSdrLifecycleStorageErrorCode } from "./databaseStorage";
