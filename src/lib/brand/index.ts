export const appBrand = {
  appName: process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Salon SaaS",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "soporte@salonsaas.cl",
  primaryColor: "#0f766e",
  logoLabel: "S",
} as const;