# QA Audit Standards — MANDATORY

## Evidence Requirements
- Every finding requires: exact file:line, verbatim code quote, reproduction steps
- Never fabricate findings. If uncertain, mark as SUSPECTED — NEEDS VERIFICATION
- Report what you checked and found clean, not just problems

## Anti-Gaming Rules
- Do NOT use sleep, wait, pause, or any delay commands
- Do NOT run health-check scripts as a substitute for reading code
- Do NOT report npm audit results as "bugs found"
- Do NOT fabricate bugs to fill a report

## DeFi-Specific Requirements
- For financial operations: verify no rounding exploits, check overflow, confirm authorization
- Check invariants: user cannot withdraw > staked, total staked = sum of users
- Verify fee payment cannot be bypassed
- Check for reentrancy-like patterns in contract interactions

## Verification Proof
- For each file reviewed: list all exported functions with one-line descriptions
- For each finding: provide exact reproduction steps
- Answer comprehension questions for critical files
