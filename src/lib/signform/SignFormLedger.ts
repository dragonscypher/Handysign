export type SignFormSlotStatus = "observed" | "weak" | "missing" | "unknown";

export interface SignFormSlot {
  name: SignFormSlotName;
  valueLabel: string;
  evidenceScore: number;
  status: SignFormSlotStatus;
  explanation: string;
  landmarksUsed: string[];
  userEditable: boolean;
}

export interface SignFormSlots {
  handshape: SignFormSlot;
  palmOrientation: SignFormSlot;
  location: SignFormSlot;
  movement: SignFormSlot;
  timing: SignFormSlot;
  mouthCue: SignFormSlot;
  facialCue: SignFormSlot;
  visibility: SignFormSlot;
}

export type SignFormSlotName = keyof SignFormSlots;
export type SignFormNotes = Partial<Record<SignFormSlotName, string>>;

export interface SignFormPrivacy {
  landmarkOnly: true;
  rawVideoStored: false;
  pixelDataStored: false;
}

export interface SignFormLedger {
  id: string;
  createdAt: string;
  sourceReceiptId?: string;
  candidateId?: string;
  candidateLabel?: string;
  slots: SignFormSlots;
  confidence: number;
  missingSlots: SignFormSlotName[];
  warnings: string[];
  privacy: SignFormPrivacy;
}

export const SIGN_FORM_SLOT_ORDER: SignFormSlotName[] = [
  "handshape",
  "palmOrientation",
  "location",
  "movement",
  "timing",
  "mouthCue",
  "facialCue",
  "visibility",
];

export function signFormSlotTitle(name: SignFormSlotName) {
  switch (name) {
    case "handshape":
      return "Handshape";
    case "palmOrientation":
      return "Palm / orientation";
    case "location":
      return "Location / body zone";
    case "movement":
      return "Movement path";
    case "timing":
      return "Timing / hold";
    case "mouthCue":
      return "Mouth cue";
    case "facialCue":
      return "Facial / non-manual cue";
    case "visibility":
      return "Visibility / occlusion";
    default:
      return name;
  }
}

export function signFormSlotBadge(status: SignFormSlotStatus) {
  switch (status) {
    case "observed":
      return "Observed";
    case "weak":
      return "Weak";
    case "missing":
      return "Missing";
    case "unknown":
    default:
      return "Unknown";
  }
}

export function listWeakOrMissingSignFormSlots(
  ledger: SignFormLedger | null | undefined,
  limit = SIGN_FORM_SLOT_ORDER.length,
) {
  if (!ledger) {
    return [];
  }

  return SIGN_FORM_SLOT_ORDER.map((name) => ledger.slots[name])
    .filter((slot) => slot.status === "missing" || slot.status === "weak")
    .sort((left, right) => left.evidenceScore - right.evidenceScore)
    .slice(0, limit);
}
