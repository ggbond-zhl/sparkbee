import type { AuthSession } from "../services/auth.service";
import type { Services } from "../services/index";

export interface AppBindings {
  Variables: {
    auth: AuthSession;
    services: Services;
  };
}
