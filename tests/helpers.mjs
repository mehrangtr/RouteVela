export class FakeClock {
  constructor(now = 1_000) { this.time = now; }
  now() { return this.time; }
  advance(amount) { this.time += amount; }
}

// Test-only identities; never use this as a production randomness implementation.
export class FakeRandom {
  constructor(id = '00000000-0000-4000-8000-000000000001') { this.id = id; }
  uuid() { return this.id; }
}

export class MemoryUsers {
  #users = new Map();
  async findById(id) { return this.#users.get(id) ?? null; }
  async insert(user) {
    if (this.#users.has(user.id)) return false;
    this.#users.set(user.id, Object.freeze({ ...user }));
    return true;
  }
}

export function value(result) {
  if (!result.ok) throw new Error(`Unexpected failure: ${result.error.code}`);
  return result.value;
}
