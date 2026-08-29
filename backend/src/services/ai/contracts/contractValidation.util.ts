// Content Studio Phase 3A: small, dependency-free runtime validation
// primitives shared by every contract in this directory. This project
// has no schema-validation library installed anywhere (every existing
// validator in backend/src/validators is hand-rolled) and brief
// section 8 explicitly says not to add a major dependency
// unnecessarily — these helpers follow that same established
// convention rather than introducing Zod/Yup/etc.
//
// Every future AI provider response must pass through one of these
// before a business service ever reads a field from it — "do not
// trust a future AI response simply because TypeScript says it has a
// type" (brief section 8).

export class ContractValidationError extends Error {
  constructor(
    message: string,
    public readonly contractName: string
  ) {
    super(message);
    this.name = "ContractValidationError";
  }
}

export function asObject(raw: unknown, contractName: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ContractValidationError(`${contractName}: expected an object.`, contractName);
  }
  return raw as Record<string, unknown>;
}

export function requireString(obj: Record<string, unknown>, field: string, contractName: string): string {
  const value = obj[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ContractValidationError(`${contractName}.${field}: expected a non-empty string.`, contractName);
  }
  return value;
}

export function optionalString(obj: Record<string, unknown>, field: string, contractName: string): string | null {
  const value = obj[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ContractValidationError(`${contractName}.${field}: expected a string or null.`, contractName);
  }
  return value;
}

export function requireStringArray(obj: Record<string, unknown>, field: string, contractName: string): string[] {
  const value = obj[field];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new ContractValidationError(`${contractName}.${field}: expected an array of strings.`, contractName);
  }
  return value as string[];
}

export function requireEnum<T extends string>(obj: Record<string, unknown>, field: string, allowed: readonly T[], contractName: string): T {
  const value = obj[field];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ContractValidationError(`${contractName}.${field}: expected one of ${allowed.join(", ")}.`, contractName);
  }
  return value as T;
}

export function requireBoolean(obj: Record<string, unknown>, field: string, contractName: string): boolean {
  const value = obj[field];
  if (typeof value !== "boolean") {
    throw new ContractValidationError(`${contractName}.${field}: expected a boolean.`, contractName);
  }
  return value;
}

export function requireNumber(obj: Record<string, unknown>, field: string, contractName: string): number {
  const value = obj[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ContractValidationError(`${contractName}.${field}: expected a finite number.`, contractName);
  }
  return value;
}

export function requireArrayOf<T>(obj: Record<string, unknown>, field: string, itemValidator: (item: unknown, index: number) => T, contractName: string): T[] {
  const value = obj[field];
  if (!Array.isArray(value)) {
    throw new ContractValidationError(`${contractName}.${field}: expected an array.`, contractName);
  }
  return value.map((item, index) => itemValidator(item, index));
}
