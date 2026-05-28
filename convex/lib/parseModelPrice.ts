export type ModelPricing = {
  inputPerMtok: number;
  outputPerMtok: number;
};

export function parseModelPrice(price: string): ModelPricing {
  if (price === "Free") {
    return { inputPerMtok: 0, outputPerMtok: 0 };
  }
  const [inputStr, outputStr] = price.split("_");
  const inputPerMtok = Number(inputStr);
  const outputPerMtok = Number(outputStr);
  if (Number.isNaN(inputPerMtok) || Number.isNaN(outputPerMtok)) {
    return { inputPerMtok: 0, outputPerMtok: 0 };
  }
  return { inputPerMtok, outputPerMtok };
}

export function computeCostUsd({
  inputTokens,
  outputTokens,
  pricing,
}: {
  inputTokens: number;
  outputTokens: number;
  pricing: ModelPricing;
}): number {
  return (
    (inputTokens * pricing.inputPerMtok +
      outputTokens * pricing.outputPerMtok) /
    1_000_000
  );
}
