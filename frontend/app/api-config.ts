export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || (DEMO_MODE ? "" : "http://127.0.0.1:8000")).replace(/\/+$/, "");
export const publicAsset = (path: string) => `${BASE_PATH}/${path.replace(/^\//, "")}`;
