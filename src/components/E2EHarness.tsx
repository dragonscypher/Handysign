"use client";

import { useEffect } from "react";
import { buildConfusionPair } from "@/lib/features/ChannelDeltaAnalyzer";
import { localDataStore } from "@/lib/privacy/LocalDataStore";
import { buildMotionReceipt } from "@/lib/receipts/MotionReceiptBuilder";
import { DEMO_PROTOTYPES } from "@/lib/recognition/demoCatalog";
import { candidateRecognizer } from "@/lib/recognition/CandidateRecognizer";
import { prototypeStore } from "@/lib/recognition/PrototypeStore";
import {
  createE2EConfusionTwinSnapshot,
  createE2EEncodedSequence,
} from "@/lib/testing/e2eFixtures";
import { signRepairE2EEnabled } from "@/lib/testing/e2eFlags";
import { UncertaintyEngine } from "@/lib/uncertainty/UncertaintyEngine";

declare global {
  interface Window {
    __signRepairE2E?: {
      clearAll: () => Promise<void>;
      exportData: () => Promise<unknown>;
      seedConsent: () => Promise<void>;
      seedPersonalSign: (label?: string) => Promise<void>;
      seedWeakPersonalSign: (label?: string) => Promise<void>;
      seedStalePersonalSign: (label?: string) => Promise<void>;
      seedConfusionPair: () => Promise<void>;
      seedReceipt: () => Promise<void>;
    };
  }
}

export default function E2EHarness() {
  useEffect(() => {
    if (!signRepairE2EEnabled()) {
      return;
    }

    window.__signRepairE2E = {
      clearAll: async () => {
        await prototypeStore.clearAll();
      },
      exportData: async () => prototypeStore.export(),
      seedConsent: async () => {
        await localDataStore.setSetting("consentAccepted", true);
      },
      seedPersonalSign: async (label = "family-hello") => {
        await localDataStore.setSetting("consentAccepted", true);
        await prototypeStore.addExample(label, createE2EEncodedSequence(), true);
      },
      seedWeakPersonalSign: async (label = "watch-sign") => {
        await localDataStore.setSetting("consentAccepted", true);
        await prototypeStore.addExample(label, createE2EEncodedSequence(), true, {
          signFormNotes: {},
        });
      },
      seedStalePersonalSign: async (label = "stale-sign") => {
        await localDataStore.setSetting("consentAccepted", true);
        await prototypeStore.addExample(label, createE2EEncodedSequence(), true);
        await prototypeStore.addExample(label, createE2EEncodedSequence(), true);
        await prototypeStore.addExample(label, createE2EEncodedSequence(), true);
        const record = await localDataStore.findPersonalSignByLabel(label);

        if (!record) {
          return;
        }

        await localDataStore.upsertPersonalSign({
          ...record,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        });
      },
      seedConfusionPair: async () => {
        await localDataStore.setSetting("consentAccepted", true);
        const sequence = createE2EEncodedSequence();
        const hello = DEMO_PROTOTYPES.find((candidate) => candidate.label === "hello");
        const thankYou = DEMO_PROTOTYPES.find(
          (candidate) => candidate.label === "thank-you",
        );

        if (!hello || !thankYou) {
          return;
        }

        await prototypeStore.saveConfusionPair(
          buildConfusionPair(sequence, hello, thankYou, "repair-confirmation"),
        );
      },
      seedReceipt: async () => {
        await localDataStore.setSetting("consentAccepted", true);
        const snapshot = createE2EConfusionTwinSnapshot();
        const sequence = createE2EEncodedSequence("confusion-twin");
        const recognition = candidateRecognizer.recognize(sequence, {
          candidates: DEMO_PROTOTYPES,
          topK: 3,
        });
        const decision = new UncertaintyEngine().evaluate(recognition, sequence.quality);

        await prototypeStore.saveReceipt(
          buildMotionReceipt({
            landmarkBuffer: snapshot.buffer,
            encodedSequence: sequence,
            recognition,
            decision,
            source: "e2e",
          }),
        );
      },
    };

    return () => {
      delete window.__signRepairE2E;
    };
  }, []);

  return null;
}
