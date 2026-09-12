/**
 * The Dungeon — flavour layer for the agent portal.
 *
 * The three council models get names with personality, because "gpt-6-astra
 * abstained: 402" is true but nobody remembers it, while "Sir Astra is out of
 * mana" sticks. The real model id is always displayed next to the alias, so the
 * screen stays legible to anyone who has to actually debug it.
 *
 * Names are chosen to match each model's real temperament, which is the joke:
 * GPT commits hard, Opus qualifies everything, DeepSeek just never sleeps.
 */

export type DenizenStatus = "answered" | "abstained" | "unknown";

export type Denizen = {
  seat: string;
  /** The funny one. */
  alias: string;
  /** Mock-heroic subtitle. */
  title: string;
  /** One line on why this name fits the model. */
  flavour: string;
  sigil: string;
  /** Tailwind accent, used for the cell border and glow. */
  accent: string;
};

export const DENIZENS: Record<string, Denizen> = {
  gpt: {
    seat: "gpt",
    alias: "Sir Astra the Overconfident",
    title: "Knight of Bold Assertions",
    flavour: "Never met a claim he wouldn't commit to. Usually right. Not always.",
    sigil: "⚔",
    accent: "emerald",
  },
  opus: {
    seat: "opus",
    alias: "Brother Opus",
    title: "Keeper of Caveats",
    flavour: "Will give you the answer, plus four things that could go wrong with it.",
    sigil: "✒",
    accent: "violet",
  },
  deepseek: {
    seat: "deepseek",
    alias: "Grubflash the Tireless",
    title: "Goblin of the Night Shift",
    flavour: "Unrationed and therefore always awake. Thinks out loud, constantly.",
    sigil: "🜲",
    accent: "amber",
  },
};

/** Any seat someone adds later still gets a cell rather than crashing the room. */
export function denizenFor(seat: string): Denizen {
  return (
    DENIZENS[seat] ?? {
      seat,
      alias: `The Unnamed (${seat})`,
      title: "Prisoner of Unknown Origin",
      flavour: "Wandered in without paperwork.",
      sigil: "?",
      accent: "zinc",
    }
  );
}

/**
 * Translates an abstention reason into dungeon-speak.
 *
 * The mapping is deliberately not lossy: the original reason is still rendered
 * underneath, because "out of mana" is funny right up until you need to know it
 * meant a 402 and not a broken key.
 */
export function dungeonReason(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("quota")) return "Out of mana until the next moon";
  if (r.includes("not permitted") || r.includes("forbidden")) {
    return "Barred from the chamber by the Warden";
  }
  if (r.includes("unauthorized") || r.includes("rejected")) {
    return "Turned away at the gate";
  }
  if (r.includes("no parseable") || r.includes("malformed")) {
    return "Spoke, but only in tongues";
  }
  if (r.includes("timeout") || r.includes("transient")) {
    return "Lost in the corridors";
  }
  if (r.includes("no key")) return "Never issued a key";
  return "Silent for reasons of its own";
}

/** Vocabulary, kept in one place so the theme stays consistent. */
export const LEXICON = {
  council: "The Tribunal",
  consensus: "Sworn Testimony",
  dissent: "The Squabble",
  human: "the Warden",
  run: "Expedition",
  receipt: "Spoils",
  guardrail: "the Wards",
  chronicle: "The Chronicle",
} as const;

/** Confidence, as a title rather than a number. */
export function confidenceRank(confidence: number): string {
  if (confidence >= 0.9) return "Certain";
  if (confidence >= 0.7) return "Fairly sure";
  if (confidence >= 0.4) return "Hedging";
  if (confidence > 0) return "Guessing";
  return "Mute";
}
