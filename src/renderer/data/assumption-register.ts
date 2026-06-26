/**
 * AssumptionRegister — Lifecycle State Machine (RC3)
 * 
 * Guarantees no method executes in an invalid state.
 * 
 * States: UNINITIALIZED → SURFACED → (optional RESOLVED)
 * 
 * Invariant AR-003: Every stateful class MUST implement explicit state machine.
 * No method may execute in an invalid state.
 */

import {
  type ModuleInput,
  type Assumption,
  type AssumptionResolution,
  type ResolvedAssumption,
  type ResolvedAssumptionSet,
  surfaceAssumptions,
  resolveAssumption,
} from './assumptions';

type RegisterState = 'UNINITIALIZED' | 'SURFACED' | 'RESOLVED';

export class AssumptionRegister {
  private state: RegisterState = 'UNINITIALIZED';
  private currentAssumptions: Assumption[] = [];
  private resolvedAssumptions: ResolvedAssumption[] = [];

  surfaceAssumptions(modules: ModuleInput[]): void {
    // validateModuleInputs throws if invalid (RC1)
    const set = surfaceAssumptions(modules);
    this.currentAssumptions = set.assumptions;
    this.state = 'SURFACED';
  }

  resolveAssumption(id: string, resolution: AssumptionResolution): void {
    this.assertState('SURFACED', 'resolveAssumption');
    const assumption = this.currentAssumptions.find((a) => a.id === id);
    if (!assumption) {
      throw new Error(`ASSUMPTION_NOT_FOUND: no assumption with id "${id}"`);
    }
    this.resolvedAssumptions.push(resolveAssumption(assumption, resolution));

    // Transition to RESOLVED when all assumptions are resolved
    if (this.resolvedAssumptions.length === this.currentAssumptions.length) {
      this.state = 'RESOLVED';
    }
  }

  getResolvedAssumptionSet(): ResolvedAssumptionSet {
    // ASSERT: calling before surfaceAssumptions is a lifecycle violation
    this.assertState('SURFACED', 'getResolvedAssumptionSet');
    return {
      assumptions: this.resolvedAssumptions,
      unresolvedCount: this.currentAssumptions.length - this.resolvedAssumptions.length,
      guardsRequired: this.resolvedAssumptions.filter((a) => a.requiresGuard),
    };
  }

  getState(): RegisterState {
    return this.state;
  }

  private assertState(required: RegisterState, caller: string): void {
    if (this.state === 'UNINITIALIZED') {
      throw new Error(
        `REGISTER_UNINITIALIZED: "${caller}" called before surfaceAssumptions — ` +
        `call surfaceAssumptions first to initialize the register`,
      );
    }
    if (this.state !== required && this.state !== 'RESOLVED') {
      throw new Error(
        `REGISTER_STATE_INVALID: "${caller}" requires state "${required}" ` +
        `but current state is "${this.state}"`,
      );
    }
  }
}

// ── Solver Pattern Registry — Invariant Entries ──

export const SOLVER_INVARIANTS = [
  // AR-001
  'ASSERT input-validation: every entry point accepting collection input MUST validate non-empty, no duplicate identifiers, all enum values case-exact. Throw named error constants — never return silently on invalid input.',
  // AR-002
  'ASSERT discriminated-union: every discriminated union resolution type MUST use structural enforcement at type level. Required fields in conditional branches are compile-time required, not runtime checked. The corrected branch always requires correctedDescription.',
  // AR-003
  'ASSERT lifecycle-state-machine: every stateful class with lifecycle phases MUST implement explicit state machine with named states. No method may execute in invalid state — throw UNINITIALIZED or STATE_INVALID with caller name before any logic runs.',
];

/**
 * Merge Solver invariants into the global Invariant Registry.
 * Called once at app initialization.
 */
export function registerSolverInvariants(existingRegistry: string[]): string[] {
  const merged = [...existingRegistry];
  for (const inv of SOLVER_INVARIANTS) {
    if (!merged.some((e) => e.includes(inv.slice(0, 40)))) {
      merged.push(inv);
    }
  }
  return merged;
}
