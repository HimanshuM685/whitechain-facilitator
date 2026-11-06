/**
 * On-chain tag for every settlement this facilitator broadcasts.
 *
 * EVM transactions have no "note" field, so the tag rides as a calldata
 * suffix: bytes appended after the ABI-encoded arguments of
 * transferWithAuthorization. Solidity ignores trailing calldata, so the
 * transfer executes exactly the same, but the bytes stay in the transaction
 * input forever and anyone can read them back (explorer "input data", or
 * `cast tx <hash> input`). Same idea as the Algorand facilitator's
 * transaction note (`x402-payment-v2-<timestamp>`); ours is `x402-payment-v1-<timestamp>`.
 */

import { concat, hexToString, stringToHex, type Hex } from "viem";

export const NOTE_PREFIX = "x402-payment-v1-";
const NOTE_PATTERN = /x402-payment-v1-\d{13}$/;

/** The note for a settlement broadcast at `now` (ms since epoch). */
export const settlementNote = (now: number = Date.now()): string => `${NOTE_PREFIX}${now}`;

/** Appends the note after any suffix the x402 library already supplied. */
export function withNote(existing: Hex | undefined, note: string): Hex {
  const ours = stringToHex(note);
  return existing && existing !== "0x" ? concat([existing, ours]) : ours;
}

/** Reads the note back out of a transaction's input data; null if it has none. */
export function decodeNote(input: Hex): string | null {
  const bytes = NOTE_PREFIX.length + 13;
  if ((input.length - 2) / 2 < bytes) return null;
  const tail = `0x${input.slice(-bytes * 2)}` as Hex;
  const text = hexToString(tail);
  return NOTE_PATTERN.test(text) ? text : null;
}
