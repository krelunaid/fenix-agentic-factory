declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    SANDBOX_WORKER_URL?: string;
    SANDBOX_CONTROL_TOKEN?: string;
    AI_WORKER_URL?: string;
    AI_CONTROL_TOKEN?: string;
  }
}
