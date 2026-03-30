export interface HouseholdDisplayContext {
  self: {
    id: string;
    name: string;
  };
  partner: {
    id: string;
    name: string;
  } | null;
}

const DEFAULT_SELF_NAME = "Titular principal";
const DEFAULT_PARTNER_NAME = "Outro titular";

export function createFallbackHouseholdDisplayContext(): HouseholdDisplayContext {
  return {
    self: {
      id: "",
      name: DEFAULT_SELF_NAME,
    },
    partner: null,
  };
}

export function getSelfDisplayName(context: HouseholdDisplayContext) {
  return context.self.name || DEFAULT_SELF_NAME;
}

export function getPartnerDisplayName(context: HouseholdDisplayContext) {
  return context.partner?.name || DEFAULT_PARTNER_NAME;
}

export function getOwnershipDisplayLabel(
  ownership: "mine" | "partner" | "joint",
  userId: string | undefined,
  context: HouseholdDisplayContext
) {
  if (ownership === "joint") {
    return "Conjunto";
  }

  if (userId && userId === context.self.id) {
    return getSelfDisplayName(context);
  }

  return getPartnerDisplayName(context);
}
