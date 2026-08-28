declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    SANDBOX_WORKER_URL?: string;
    SANDBOX_CONTROL_TOKEN?: string;
  }
}
