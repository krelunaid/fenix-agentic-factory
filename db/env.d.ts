declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    SANDBOX_WORKER_URL?: string;
    SANDBOX_CONTROL_TOKEN?: string;
    AI_WORKER_URL?: string;
    AI_CONTROL_TOKEN?: string;
    VISUAL_WORKER_URL?: string;
    VISUAL_CONTROL_TOKEN?: string;
    CREDENTIALS_MASTER_KEY?: string;
  }
}
