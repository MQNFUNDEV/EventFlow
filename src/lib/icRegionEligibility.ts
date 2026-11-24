export type IcRegionRule = {
  enabled: boolean
  allowed_codes: string[]
}

export const DEFAULT_IC_REGION_RULE: IcRegionRule = {
  enabled: false,
  allowed_codes: ['01', '23'],
}

export function getNormalisedIcForRegionCheck(value: string | null | undefined): string | null {
  const input = (value ?? '').trim()
  if (/^\d{6}-\d{2}-\d{4}$/.test(input)) return input.replaceAll('-', '')
  if (/^\d{12}$/.test(input)) return input
  return null
}

export function isIcRegionEligible(value: string | null | undefined, allowedCodes: string[]): boolean {
  const normalised = getNormalisedIcForRegionCheck(value)
  if (!normalised) return false
  return allowedCodes.includes(normalised.slice(6, 8))
}
