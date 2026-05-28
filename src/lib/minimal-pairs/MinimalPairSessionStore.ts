import type { MinimalPairCard } from "@/lib/minimal-pairs/MinimalPair";

let sessionMinimalPairCards: MinimalPairCard[] = [];

export function listSessionMinimalPairCards() {
  return [...sessionMinimalPairCards];
}

export function saveSessionMinimalPairCard(card: MinimalPairCard) {
  sessionMinimalPairCards = [
    ...sessionMinimalPairCards.filter((entry) => entry.id !== card.id),
    card,
  ];
}

export function deleteSessionMinimalPairCard(id: string) {
  sessionMinimalPairCards = sessionMinimalPairCards.filter((entry) => entry.id !== id);
}

export function clearSessionMinimalPairCards() {
  sessionMinimalPairCards = [];
}
