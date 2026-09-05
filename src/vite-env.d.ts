/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_LICENSE_PRICE_NGN?: string;
  readonly VITE_LICENSE_PRICE_USD?: string;
  readonly VITE_TRIAL_DAYS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
